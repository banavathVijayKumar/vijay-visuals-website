// ============================================================================
// GET /api/payments/platform/history
// Returns authenticated customer's own platform payments (or all for Super Admin)
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, json } from '../../_shared';

/** Removes provider/session secrets from stale notes before any API response. */
function publicPaymentNotes(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(raw || '{}')) as Record<string, unknown>;
    const allowed = [
      'orderNumber',
      'receiptNumber',
      'deliveryStatus',
      'refundStatus',
      'buyerName',
      'buyerEmail',
      'buyerPhone',
    ];
    const safe: Record<string, unknown> = {};
    for (const key of allowed) {
      if (parsed[key] !== undefined) safe[key] = parsed[key];
    }
    return safe;
  } catch {
    return {};
  }
}

function publicPaymentRow(row: Record<string, any>): Record<string, unknown> {
  const storedOrder = String(row.razorpay_order_id || '');
  const cashfreeOrderId = storedOrder.startsWith('cf_') ? storedOrder.slice(3) : storedOrder;
  // Legacy Razorpay-named columns are schema compatibility fields. They are
  // never emitted as gateway labels or provider secrets in customer/admin APIs.
  const {
    notes_json: notesJson,
    razorpay_order_id: _legacyOrderId,
    razorpay_payment_id: _legacyPaymentId,
    razorpay_mode: legacyMode,
    ...rest
  } = row;
  return {
    ...rest,
    cashfreeOrderId,
    cashfreePaymentId: String(row.razorpay_payment_id || ''),
    gatewayMode: String(legacyMode || '').toLowerCase() === 'live' ? 'production' : 'sandbox',
    refundStatus: String(row.refund_id || '') ? 'refunded' : null,
    notes: publicPaymentNotes(notesJson),
  };
}

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

  return json({ payments: (res.results || []).map((row: Record<string, any>) => publicPaymentRow(row)) });
}
