// ============================================================================
// POST /api/payments/cashfree/create-order
// Flow 1: Platform Website / Subscription Purchases via Cashfree Payment Gateway
// - Server-side authoritative amount calculated strictly from Cloudflare D1 subscription_plans
// - Generates secure paymentSessionId from Cashfree PG API (2023-08-01)
// - Records in cashfree_payments and mirrors in platform_payments for full compatibility
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../_auth';
import {
  PagesContext,
  checkRateLimit,  rateLimitResponse,
  errorJson,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../../_shared';
import { ALLOWED_WEBSITE_PACKAGE_CODES, LEGACY_SAAS_PLAN_CODES } from '../platform/create-order';
import { createEdgeCashfreeOrder, getEdgeCashfreeStatus } from '../_cashfree';

interface PlanRow {
  code: string;
  name: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
  setup_fee_inr: number;
  gst_percent: number;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rl = await checkRateLimit(env, `cf_platform_order:${auth.user.id}`, 20, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many payment order attempts. Please wait a few minutes.')

  const cfStatus = getEdgeCashfreeStatus(env);
  if (!cfStatus.configured) {
    return json(
      {
        status: 'setup_required',
        error: cfStatus.message,
      },
      503
    );
  }

  const body = await parseJsonBody<{
    planCode?: string;
    billingCycle?: 'monthly' | 'yearly';
    websiteId?: string;
    tenantId?: string | number;
    purpose?: 'platform_subscription' | 'website_purchase' | 'domain_service' | 'addon';
    returnUrl?: string;
    customerPhone?: string;
    customerName?: string;
  }>(request);

  if (!body || !body.planCode) {
    return errorJson('planCode is required to create a Cashfree payment order.', 400);
  }

  const planCode = sanitizeText(body.planCode, 40).toLowerCase();
  const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  let purpose =
    body.purpose === 'website_purchase' ||
    body.purpose === 'domain_service' ||
    body.purpose === 'addon'
      ? body.purpose
      : 'platform_subscription';

  const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.has(planCode);
  const isLegacySaas = LEGACY_SAAS_PLAN_CODES.has(planCode);

  if (purpose === 'website_purchase' && !isWebsitePackage) {
    return errorJson(
      `Plan "${planCode}" cannot be purchased as a website package. Please select an authorized website package.`,
      400
    );
  }

  let websiteId: string | null = null;
  const rawWebsiteId = sanitizeText(body.websiteId || (body.tenantId ? String(body.tenantId) : ''), 120);
  if (rawWebsiteId) {
    const access = await requireWebsiteAccess(env, auth.user, rawWebsiteId, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;
    websiteId = access.website.website_id;
  }

  if (isLegacySaas && (websiteId || purpose === 'website_purchase')) {
    return errorJson(
      `Legacy plan "${planCode}" cannot be attached to a business website purchase.`,
      400
    );
  }

  const effectivePurpose = isWebsitePackage ? 'website_purchase' : purpose;
  const effectiveBillingCycle = isWebsitePackage ? 'one_time' : billingCycle;

  // Authoritative server-side pricing lookup from Cloudflare D1
  const plan = await env.DB.prepare(
    'SELECT code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent FROM subscription_plans WHERE code = ? AND is_active = 1 LIMIT 1'
  )
    .bind(planCode)
    .first<PlanRow>();

  if (!plan) {
    return errorJson(`Unknown or inactive planCode "${planCode}".`, 404);
  }

  const baseAmountInr = effectiveBillingCycle === 'yearly' ? plan.yearly_price_inr : plan.monthly_price_inr;
  const setupFeeInr = plan.setup_fee_inr;
  const taxableSubtotal = baseAmountInr + setupFeeInr;
  const gstAmountInr = Math.round((taxableSubtotal * plan.gst_percent) / 100);
  const totalAmountInr = taxableSubtotal + gstAmountInr;

  if (totalAmountInr <= 0) {
    return errorJson('Invalid package pricing calculated.', 400);
  }

  const uniqueSuffix = randomHex(4);
  const orderId = `vv_cf_${Date.now().toString(36)}_${uniqueSuffix}`;
  const customReturnUrl = body.returnUrl ? sanitizeText(body.returnUrl, 500) : undefined;

  try {
    const created = await createEdgeCashfreeOrder(env, {
      orderId,
      amountInr: totalAmountInr,
      currency: 'INR',
      customerDetails: {
        customerId: auth.user.id,
        customerName: sanitizeText(body.customerName || auth.user.fullName || auth.user.email || 'Customer', 100),
        customerEmail: auth.user.email || 'vk66278@gmail.com',
        customerPhone: sanitizeText(body.customerPhone || '9381362201', 20),
      },
      orderMeta: {
        returnUrl: customReturnUrl,
      },
      orderNote: `${plan.name} Package Purchase`,
      orderTags: {
        website_id: websiteId || '',
        plan_code: plan.code,
        user_id: auth.user.id,
      },
      request: context.request,
    });

    const notesObj = {
      orderState: 'PAYMENT_PENDING',
      deliveryStatus: 'PAYMENT_PENDING',
      provisioningError: null,
      deliveryAttempts: 0,
      gstPercent: plan.gst_percent,
      recipient: 'Vijay Visuals',
      buyerEmail: auth.user.email,
      buyerName: auth.user.fullName || auth.user.email,
      planCode: plan.code,
      planName: plan.name,
      websiteId: websiteId || '',
      gateway: 'cashfree',
      paymentSessionId: created.paymentSessionId,
    };

    // 1. Insert into cashfree_payments ledger
    await env.DB.prepare(
      `INSERT INTO cashfree_payments (
        order_id, cf_order_id, payment_session_id, entity_type, reference_id,
        website_id, user_id, user_email, user_phone, base_amount_inr,
        gst_amount_inr, amount_inr, currency, environment, status,
        notes_json, raw_response_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'platform_package', ?,
        ?, ?, ?, ?, ?,
        ?, ?, 'INR', ?, 'CREATED',
        ?, ?, datetime('now'), datetime('now')
      )`
    )
      .bind(
        orderId,
        created.order.cf_order_id ? String(created.order.cf_order_id) : null,
        created.paymentSessionId,
        plan.code,
        websiteId,
        auth.user.id,
        auth.user.email,
        body.customerPhone || null,
        baseAmountInr,
        gstAmountInr,
        totalAmountInr,
        created.mode,
        JSON.stringify(notesObj),
        JSON.stringify(created.order)
      )
      .run();

    // 2. Dual-ledger recording into platform_payments for backwards compatibility with Admin/History
    await env.DB.prepare(
      `INSERT OR IGNORE INTO platform_payments (
        website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
        base_amount_inr, setup_fee_inr, gst_amount_inr, amount_inr, currency,
        razorpay_mode, razorpay_order_id, razorpay_payment_id, signature_verified,
        status, subscription_id, notes_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'INR',
        ?, ?, NULL, 0,
        'created', NULL, ?, datetime('now'), datetime('now')
      )`
    )
      .bind(
        websiteId,
        auth.user.id,
        effectivePurpose,
        plan.code,
        plan.name,
        effectiveBillingCycle,
        baseAmountInr,
        setupFeeInr,
        gstAmountInr,
        totalAmountInr,
        created.mode === 'production' ? 'live' : 'test',
        `cf_${orderId}`,
        JSON.stringify(notesObj)
      )
      .run();

    return json(
      {
        orderId,
        cfOrderId: created.order.cf_order_id,
        paymentSessionId: created.paymentSessionId,
        environment: created.mode,
        currency: 'INR',
        invoiceBreakdown: {
          planCode: plan.code,
          planName: plan.name,
          billingCycle: effectiveBillingCycle,
          baseAmountInr,
          setupFeeInr,
          gstPercent: plan.gst_percent,
          gstAmountInr,
          totalAmountInr,
        },
        order: created.order,
      },
      201
    );
  } catch (err) {
    return errorJson(
      err instanceof Error ? err.message : 'Unable to create Cashfree order.',
      502
    );
  }
}
