// ============================================================================
// POST /api/payments/platform/create-order
// Flow 1: Platform Website / Subscription Purchases -> Vijay Visuals Account
// - Authoritative amount calculated strictly from Cloudflare D1 subscription_plans
//   (NEVER trusts client-supplied amountInr!)
// - Returns public RAZORPAY_KEY_ID ONLY to open Razorpay Checkout on frontend
// - NEVER exposes RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../../_shared';
import { createEdgeRazorpayOrder, getEdgeRazorpayStatus } from '../_razorpay';

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

  const rl = await checkRateLimit(env, `rzp_platform_order:${auth.user.id}`, 20, 3600);
  if (!rl.allowed) {
    return errorJson('Too many payment order attempts. Please wait a few minutes.', 429);
  }

  const rzpStatus = getEdgeRazorpayStatus(env);
  if (!rzpStatus.configured) {
    return json(
      {
        status: rzpStatus.mode === 'live_locked' ? 'live_locked' : 'setup_required',
        error: rzpStatus.message,
      },
      rzpStatus.mode === 'live_locked' ? 403 : 503
    );
  }

  const body = await parseJsonBody<{
    planCode?: string;
    billingCycle?: 'monthly' | 'yearly';
    websiteId?: string;
    tenantId?: string | number;
    purpose?: 'platform_subscription' | 'website_purchase' | 'domain_service' | 'addon';
  }>(request);

  if (!body || !body.planCode) {
    return errorJson('planCode is required to create a platform payment order.', 400);
  }

  const planCode = sanitizeText(body.planCode, 40).toLowerCase();
  const billingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const purpose =
    body.purpose === 'website_purchase' ||
    body.purpose === 'domain_service' ||
    body.purpose === 'addon'
      ? body.purpose
      : 'platform_subscription';

  // Optional website/tenant ownership check when attaching purchase to a specific website
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

  // Authoritative server-side pricing lookup from Cloudflare D1 (never trust client price)
  const plan = await env.DB.prepare(
    'SELECT code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent FROM subscription_plans WHERE code = ? AND is_active = 1 LIMIT 1'
  )
    .bind(planCode)
    .first<PlanRow>();

  if (!plan) {
    return errorJson(`Unknown or inactive planCode "${planCode}".`, 404);
  }

  const baseAmountInr = billingCycle === 'yearly' ? plan.yearly_price_inr : plan.monthly_price_inr;
  const setupFeeInr = plan.setup_fee_inr;
  const taxableSubtotal = baseAmountInr + setupFeeInr;
  const gstAmountInr = Math.round((taxableSubtotal * plan.gst_percent) / 100);
  const totalAmountInr = taxableSubtotal + gstAmountInr;

  if (totalAmountInr <= 0) {
    return errorJson('Computed plan total must be greater than ₹0.', 400);
  }

  const receipt = `vvp_${Date.now().toString(36)}_${randomHex(3)}`;

  try {
    const created = await createEdgeRazorpayOrder(env, {
      amountInr: totalAmountInr,
      currency: 'INR',
      receipt,
      notes: {
        flow_type: 'platform_payment',
        purpose,
        plan_code: plan.code,
        billing_cycle: billingCycle,
        owner_id: auth.user.id,
        website_id: websiteId || '',
      },
    });

    const insertRes = await env.DB.prepare(
      `INSERT INTO platform_payments
        (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
         base_amount_inr, setup_fee_inr, gst_amount_inr, amount_inr, currency,
         razorpay_mode, razorpay_order_id, signature_verified, status, receipt, notes_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 0, 'created', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        auth.user.id,
        purpose,
        plan.code,
        plan.name,
        billingCycle,
        baseAmountInr,
        setupFeeInr,
        gstAmountInr,
        totalAmountInr,
        created.mode,
        created.order.id,
        receipt,
        JSON.stringify({
          gstPercent: plan.gst_percent,
          recipient: 'Vijay Visuals',
          buyerEmail: auth.user.email,
        })
      )
      .run();

    const paymentRow = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
      .bind(Number(insertRes.meta?.last_row_id || 0))
      .first();

    return json(
      {
        keyId: created.keyId, // Public RAZORPAY_KEY_ID only for Razorpay Checkout modal
        mode: created.mode,
        recipient: 'Vijay Visuals',
        razorpayOrder: created.order,
        invoiceBreakdown: {
          planName: plan.name,
          billingCycle,
          baseAmountInr,
          setupFeeInr,
          gstPercent: plan.gst_percent,
          gstAmountInr,
          totalAmountInr,
        },
        payment: paymentRow,
      },
      201
    );
  } catch (err) {
    return errorJson(
      err instanceof Error ? err.message : 'Unable to create Razorpay platform order.',
      502
    );
  }
}
