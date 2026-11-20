// ============================================================================
// GET /api/payments/platform/history
// Returns authenticated customer's own platform payments (or all for Super Admin)
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, json } from '../../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const res = auth.user.isSuperAdmin
    ? await env.DB.prepare(
        `SELECT id, website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
                base_amount_inr, setup_fee_inr, gst_amount_inr, amount_inr, currency,
                razorpay_mode, razorpay_order_id, razorpay_payment_id, signature_verified,
                status, subscription_id, refund_id, receipt, paid_at, created_at
         FROM platform_payments
         ORDER BY created_at DESC LIMIT 200`
      ).all()
    : await env.DB.prepare(
        `SELECT id, website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
                base_amount_inr, setup_fee_inr, gst_amount_inr, amount_inr, currency,
                razorpay_mode, razorpay_order_id, razorpay_payment_id, signature_verified,
                status, subscription_id, refund_id, receipt, paid_at, created_at
         FROM platform_payments
         WHERE owner_id = ? OR owner_id = ?
         ORDER BY created_at DESC LIMIT 100`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .all();

  return json({ payments: res.results || [] });
}
