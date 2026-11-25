// ============================================================================
// POST /api/payments/platform/:id/refund — Super Admin Platform Refund Endpoint
// ============================================================================

import { requireAdmin } from '../../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../../_shared';
import { getPaymentEntitlementId, revokePaymentEntitlement } from '../../../_tenantAccess';
import { createEdgeCashfreeRefund } from '../../_cashfree';

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const paymentId = Number(params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return errorJson('Invalid platform payment ID.', 400);
  }

  const row = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
    .bind(paymentId)
    .first<{
      id: number;
      owner_id: string;
      amount_inr: number;
      razorpay_payment_id: string | null;
      signature_verified: number;
      status: string;
      subscription_id: number | null;
    }>();

  if (!row) return errorJson('Platform payment not found.', 404);
  if (row.status !== 'paid') {
    return errorJson('Only verified paid platform payments can be refunded.', 400);
  }

  const body = (await parseJsonBody<{ amountInr?: number; reason?: string }>(request)) || {};
  const reason = sanitizeText(body.reason || 'Super Admin initiated refund', 300);
  const refundAmount = body.amountInr ? Math.min(row.amount_inr, Math.round(Number(body.amountInr))) : undefined;

  try {
    const refund = await createEdgeCashfreeRefund(env, {
      orderId: (row as any).cf_order_id || (row as any).razorpay_order_id || `vv_order_${row.id}`,
      amountInr: refundAmount,
      reason,
    });

    await env.DB.prepare(
      `UPDATE platform_payments SET status = 'refunded', refund_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(refund.id, row.id)
      .run();

    if (row.subscription_id) {
      await env.DB.prepare(
        `UPDATE tenant_subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(row.subscription_id)
        .run();
    }

    // One-time purchases are lifetime entitlements; revoke them on refund.
    const entitlementId = await getPaymentEntitlementId(env, row.id);
    if (entitlementId) await revokePaymentEntitlement(env, row.id);

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: 'super_admin',
      action: 'platform_payment_refunded',
      targetType: 'platform_payments',
      targetId: String(row.id),
      details: {
        refundId: refund.id,
        amountInr: refundAmount || row.amount_inr,
        reason,
        lifetimeEntitlementId: entitlementId || null,
      },
    });

    const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ?').bind(row.id).first();
    return json({ refunded: true, refund, payment: updated });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : 'Unable to process Razorpay refund.', 502);
  }
}
