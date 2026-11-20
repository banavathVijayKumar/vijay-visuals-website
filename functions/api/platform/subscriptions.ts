// ============================================================================
// GET, POST, PUT /api/platform/subscriptions
// SaaS Plans (Starter -> Enterprise), GST Calculation, Upgrade/Cancel, Admin Edit
// ============================================================================

import { requireAdmin, requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../_shared';

interface PlanRow {
  code: string;
  name: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
  setup_fee_inr: number;
  gst_percent: number;
  max_websites: number;
  max_custom_domains: number;
  max_products: number;
  max_staff: number;
  storage_quota_mb: number;
  monthly_ai_credits: number;
  features_json: string;
  is_active: number;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const plansRes = await env.DB.prepare(
    'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_inr ASC'
  ).all<PlanRow>();

  const plans = (plansRes.results || []).map((p) => ({
    ...p,
    features: (() => {
      try {
        return JSON.parse(p.features_json || '[]');
      } catch {
        return [];
      }
    })(),
    monthlyGstInr: Math.round((p.monthly_price_inr * p.gst_percent) / 100),
    monthlyTotalInr: p.monthly_price_inr + Math.round((p.monthly_price_inr * p.gst_percent) / 100),
    yearlyGstInr: Math.round((p.yearly_price_inr * p.gst_percent) / 100),
    yearlyTotalInr: p.yearly_price_inr + Math.round((p.yearly_price_inr * p.gst_percent) / 100),
  }));

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  let activeSubscription: Record<string, unknown> | null = null;

  if (websiteId && request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;
    const access = await requireWebsiteAccess(env, auth.user, websiteId, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;

    activeSubscription = await env.DB.prepare(
      `SELECT ts.*, sp.name AS plan_name, sp.max_custom_domains, sp.max_products, sp.max_staff, sp.storage_quota_mb, sp.monthly_ai_credits
       FROM tenant_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE ts.website_id = ?
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(websiteId)
      .first<Record<string, unknown>>();
  }

  return json({
    billingSeparationNotice:
      'Vijay Visuals subscription fees (one-time setup + recurring SaaS plan + GST) are billed separately from your customer store sales, which settle to your business account.',
    plans,
    activeSubscription,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    action?: 'subscribe' | 'cancel_at_period_end';
    planCode?: string;
    billingCycle?: 'monthly' | 'yearly';
    mode?: 'trial' | 'invoice_quote';
  }>(request);

  if (!body || !body.websiteId) return errorJson('websiteId is required.', 400);
  const websiteId = sanitizeText(body.websiteId, 120);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, ['business_owner']);
  if (!access.ok) return access.response;

  if (body.action === 'cancel_at_period_end') {
    await env.DB.prepare(
      `UPDATE tenant_subscriptions SET cancel_at_period_end = 1, updated_at = datetime('now')
       WHERE website_id = ? AND status IN ('trial', 'active')`
    )
      .bind(websiteId)
      .run();
    return json({
      cancelledAtPeriodEnd: true,
      message: 'Subscription scheduled for cancellation at the end of the current billing period.',
    });
  }

  const planCode = sanitizeText(body.planCode || 'starter', 40).toLowerCase();
  const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const plan = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ? AND is_active = 1 LIMIT 1')
    .bind(planCode)
    .first<PlanRow>();
  if (!plan) return errorJson('Selected subscription plan does not exist.', 404);

  const recurringBase = billingCycle === 'yearly' ? plan.yearly_price_inr : plan.monthly_price_inr;
  const setupFee = plan.setup_fee_inr;
  const taxableSubtotal = recurringBase + setupFee;
  const gstAmount = Math.round((taxableSubtotal * plan.gst_percent) / 100);
  const totalAmount = taxableSubtotal + gstAmount;

  // Honest status: never activate paid subscription without verified payment; allow trial or Super Admin override
  const status = auth.user.isSuperAdmin ? 'active' : 'trial';
  const durationExpr = billingCycle === 'yearly' ? '+365 days' : '+30 days';

  const insertRes = await env.DB.prepare(
    `INSERT INTO tenant_subscriptions
      (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
       total_amount_inr, setup_fee_inr, payment_gateway, current_period_start, current_period_end, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'razorpay', datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
  )
    .bind(
      websiteId,
      access.website.owner_id,
      plan.code,
      billingCycle,
      status,
      recurringBase,
      gstAmount,
      totalAmount,
      setupFee,
      durationExpr
    )
    .run();

  return json(
    {
      subscriptionId: Number(insertRes.meta?.last_row_id || 0),
      status,
      invoiceBreakdown: {
        planName: plan.name,
        billingCycle,
        oneTimeSetupFeeInr: setupFee,
        recurringPlanFeeInr: recurringBase,
        gstPercent: plan.gst_percent,
        gstAmountInr: gstAmount,
        grandTotalInr: totalAmount,
      },
      paymentRequiredForLiveRenewal: !auth.user.isSuperAdmin,
      message: auth.user.isSuperAdmin
        ? `Super Admin activated ${plan.name} (${billingCycle}) plan.`
        : `Started ${plan.name} (${billingCycle}) in trial mode. Complete verified Razorpay checkout to activate paid billing.`,
    },
    201
  );
}

export async function onRequestPut(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    code?: string;
    monthlyPriceInr?: number;
    yearlyPriceInr?: number;
    setupFeeInr?: number;
    maxCustomDomains?: number;
    maxProducts?: number;
    maxStaff?: number;
    storageQuotaMb?: number;
    monthlyAiCredits?: number;
  }>(request);

  if (!body || !body.code) return errorJson('Plan code is required.', 400);
  const code = sanitizeText(body.code, 40).toLowerCase();

  const existing = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ? LIMIT 1')
    .bind(code)
    .first<PlanRow>();
  if (!existing) return errorJson('Plan code not found.', 404);

  await env.DB.prepare(
    `UPDATE subscription_plans
     SET monthly_price_inr = ?, yearly_price_inr = ?, setup_fee_inr = ?,
         max_custom_domains = ?, max_products = ?, max_staff = ?,
         storage_quota_mb = ?, monthly_ai_credits = ?, updated_at = datetime('now')
     WHERE code = ?`
  )
    .bind(
      body.monthlyPriceInr !== undefined ? Math.max(0, Math.round(Number(body.monthlyPriceInr))) : existing.monthly_price_inr,
      body.yearlyPriceInr !== undefined ? Math.max(0, Math.round(Number(body.yearlyPriceInr))) : existing.yearly_price_inr,
      body.setupFeeInr !== undefined ? Math.max(0, Math.round(Number(body.setupFeeInr))) : existing.setup_fee_inr,
      body.maxCustomDomains !== undefined ? Math.max(1, Math.round(Number(body.maxCustomDomains))) : existing.max_custom_domains,
      body.maxProducts !== undefined ? Math.max(1, Math.round(Number(body.maxProducts))) : existing.max_products,
      body.maxStaff !== undefined ? Math.max(1, Math.round(Number(body.maxStaff))) : existing.max_staff,
      body.storageQuotaMb !== undefined ? Math.max(50, Math.round(Number(body.storageQuotaMb))) : existing.storage_quota_mb,
      body.monthlyAiCredits !== undefined ? Math.max(0, Math.round(Number(body.monthlyAiCredits))) : existing.monthly_ai_credits,
      code
    )
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: 'super_admin',
    action: 'subscription_plan_updated',
    targetType: 'subscription_plans',
    targetId: code,
    details: body as Record<string, unknown>,
  });

  const updated = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ?').bind(code).first();
  return json({ plan: updated });
}
