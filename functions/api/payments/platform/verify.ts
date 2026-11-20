// ============================================================================
// POST /api/payments/platform/verify
// Flow 1 Server-Side Signature Verification (HMAC-SHA256)
// Verifies signature against env.RAZORPAY_KEY_SECRET and binds to server-created
// platform_payments row before marking paid and activating subscription.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../_shared';
import { verifyEdgeRazorpayPaymentSignature } from '../_razorpay';

interface PlatformPaymentRow {
  id: number;
  website_id: string | null;
  owner_id: string;
  purpose: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: 'one_time' | 'monthly' | 'yearly';
  base_amount_inr: number;
  setup_fee_inr: number;
  gst_amount_inr: number;
  amount_inr: number;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  signature_verified: number;
  status: string;
  subscription_id: number | null;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  }>(request);

  if (!body) return errorJson('Invalid JSON payload.', 400);

  const orderId = sanitizeText(body.razorpay_order_id || body.razorpayOrderId || '', 120);
  const paymentId = sanitizeText(body.razorpay_payment_id || body.razorpayPaymentId || '', 120);
  const signature = sanitizeText(body.razorpay_signature || body.razorpaySignature || '', 128);

  if (!orderId || !paymentId || !signature) {
    return errorJson(
      'razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.',
      400
    );
  }

  // 1. Verify server-created platform payment record exists and belongs to this user
  const existing = await env.DB.prepare(
    'SELECT * FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1'
  )
    .bind(orderId)
    .first<PlatformPaymentRow>();

  if (!existing) {
    return errorJson('Platform payment order record not found.', 404);
  }

  const isOwner =
    existing.owner_id === auth.user.id || existing.owner_id === auth.user.authSubject;
  if (!isOwner && !auth.user.isSuperAdmin) {
    return errorJson('Forbidden: you cannot verify another customer’s payment order.', 403);
  }

  // 2. Cryptographic HMAC-SHA256 verification on Cloudflare Edge using env.RAZORPAY_KEY_SECRET
  const validSig = await verifyEdgeRazorpayPaymentSignature(env, {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  if (!validSig) {
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'platform_payment_signature_failed',
      targetType: 'platform_payments',
      targetId: String(existing.id),
      details: { razorpayOrderId: orderId, razorpayPaymentId: paymentId },
    });
    return errorJson('Payment verification failed: invalid Razorpay HMAC-SHA256 signature.', 400);
  }

  // 3. Idempotent replay check
  if (existing.status === 'paid' && existing.signature_verified === 1) {
    return json({ verified: true, idempotentReplay: true, payment: existing });
  }

  // 4. Activate subscription when linked to a website
  let subscriptionId = existing.subscription_id;
  if (existing.website_id && existing.plan_code) {
    const durationExpr = existing.billing_cycle === 'yearly' ? '+365 days' : '+30 days';
    const subRes = await env.DB.prepare(
      `INSERT INTO tenant_subscriptions
        (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
         total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
         current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
    )
      .bind(
        existing.website_id,
        existing.owner_id,
        existing.plan_code,
        existing.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
        existing.base_amount_inr,
        existing.gst_amount_inr,
        existing.amount_inr,
        existing.setup_fee_inr,
        paymentId,
        durationExpr
      )
      .run();
    subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
  }

  // 5. Mark payment paid ONLY after signature verification succeeds
  await env.DB.prepare(
    `UPDATE platform_payments
     SET status = 'paid',
         signature_verified = 1,
         razorpay_payment_id = ?,
         razorpay_signature = ?,
         subscription_id = COALESCE(?, subscription_id),
         paid_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(paymentId, signature, subscriptionId, existing.id)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'razorpay', 'payment.verified_checkout', 'platform_subscription', ?, 1, ?, datetime('now'))`
  )
    .bind(
      `checkout:${paymentId}`,
      orderId,
      JSON.stringify({ platformPaymentId: existing.id, orderId, paymentId, amountInr: existing.amount_inr })
    )
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: auth.user.platformRole,
    action: 'platform_payment_verified',
    targetType: 'platform_payments',
    targetId: String(existing.id),
    details: {
      planCode: existing.plan_code,
      amountInr: existing.amount_inr,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      subscriptionId,
    },
  });

  const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
    .bind(existing.id)
    .first();

  return json({
    verified: true,
    idempotentReplay: false,
    subscriptionId,
    payment: updated,
  });
}
