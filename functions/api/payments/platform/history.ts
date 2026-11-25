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
        `SELECT pp.id, pp.website_id, pp.owner_id, pp.purpose, pp.plan_code, pp.plan_name,
                pp.billing_cycle, pp.base_amount_inr, pp.setup_fee_inr, pp.gst_amount_inr,
                pp.amount_inr, pp.currency, pp.razorpay_mode, pp.razorpay_order_id,
                pp.razorpay_payment_id, pp.signature_verified, pp.status, pp.subscription_id,
                pp.refund_id, pp.receipt, pp.paid_at, pp.created_at, pp.notes_json,
                p.public_slug AS public_slug,
                (SELECT le.status
                 FROM platform_payment_entitlements pe
                 INNER JOIN tenant_lifetime_entitlements le ON le.id = pe.entitlement_id
                 WHERE pe.payment_id = pp.id LIMIT 1) AS entitlement_status
         FROM platform_payments pp
         LEFT JOIN customer_website_publications p ON p.website_id = pp.website_id
         ORDER BY pp.created_at DESC LIMIT 200`
      ).all()
    : await env.DB.prepare(
        `SELECT pp.id, pp.website_id, pp.owner_id, pp.purpose, pp.plan_code, pp.plan_name,
                pp.billing_cycle, pp.base_amount_inr, pp.setup_fee_inr, pp.gst_amount_inr,
                pp.amount_inr, pp.currency, pp.razorpay_mode, pp.razorpay_order_id,
                pp.razorpay_payment_id, pp.signature_verified, pp.status, pp.subscription_id,
                pp.refund_id, pp.receipt, pp.paid_at, pp.created_at, pp.notes_json,
                p.public_slug AS public_slug,
                (SELECT le.status
                 FROM platform_payment_entitlements pe
                 INNER JOIN tenant_lifetime_entitlements le ON le.id = pe.entitlement_id
                 WHERE pe.payment_id = pp.id LIMIT 1) AS entitlement_status
         FROM platform_payments pp
         LEFT JOIN customer_website_publications p ON p.website_id = pp.website_id
         WHERE pp.owner_id = ? OR pp.owner_id = ?
         ORDER BY pp.created_at DESC LIMIT 100`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .all();

  return json({ payments: res.results || [] });
}
