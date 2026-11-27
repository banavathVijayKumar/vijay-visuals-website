// ============================================================================
// POST /api/payments/platform/:id/refund — Super Admin Platform Refund Endpoint
// - Cashfree is the only active gateway. Historical Razorpay-named columns are
//   schema compatibility fields and never route a payment to Razorpay.
// - Deterministic merchant refund_id + x-idempotency-key make retries safe.
// - Terminal REFUNDED status is written only after Cashfree confirms SUCCESS;
//   pending refunds stay visible in the refunds ledger without rewriting the
//   successful payment as refunded.
// ============================================================================

import { requireAdmin } from '../../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../../_shared';
import { finalizeCashfreePlatformRefund } from '../../../_tenantAccess';
import { createEdgeCashfreeRefund } from '../../_cashfree';
import { buildCashfreeRefundIdentity } from '../../_cashfreeIdentity';

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
      website_id: string | null;
      owner_id: string;
      amount_inr: number;
      razorpay_payment_id: string | null;
      signature_verified: number;
      status: string;
      subscription_id: number | null;
      refund_id: string | null;
    }>();

  if (!row) return errorJson('Platform payment not found.', 404);
  // A refunded row is allowed through so an identical retry can be recognised
  // as an idempotent replay below instead of looking like a brand-new refund.

  const body =
    (await parseJsonBody<{ amountInr?: number | string | null; reason?: string; sequence?: number | string }>(
      request
    )) || {};
  const reason = sanitizeText(body.reason || 'Super Admin initiated refund', 300);
  const requestedAmount =
    body.amountInr === undefined || body.amountInr === null || body.amountInr === ''
      ? row.amount_inr
      : Number(body.amountInr);
  if (
    !Number.isFinite(requestedAmount) ||
    !Number.isInteger(requestedAmount) ||
    requestedAmount < 1 ||
    requestedAmount > row.amount_inr
  ) {
    return errorJson('Refund amount must be a whole rupee amount within the captured payment amount.', 400);
  }
  const refundAmount = requestedAmount;

  const rawSequence = body.sequence === undefined || body.sequence === '' ? 1 : Number(body.sequence);
  if (!Number.isInteger(rawSequence) || rawSequence < 1 || rawSequence > 100) {
    return errorJson('Refund sequence must be a whole number from 1 to 100.', 400);
  }
  const sequence = rawSequence;

  // The shared finalizer treats a terminal refund as full and revokes access.
  // Never let a partial or repeated sequence silently revoke the whole purchase.
  if (requestedAmount !== Number(row.amount_inr) || sequence !== 1) {
    return errorJson(
      'Only one full refund of the captured amount is supported here. Partial or repeat refunds require manual operator handling.',
      400
    );
  }
  const refundAmountInr = refundAmount;

  // Historical column names hold the Cashfree MERCHANT order id with a `cf_`
  // prefix (see cashfree/create-order.ts). Cashfree's refund API must receive
  // the unprefixed merchant order id, not its gateway-generated cf_order_id.
  const persistedOrderRef = String((row as any).razorpay_order_id || '').trim();
  const orderId = persistedOrderRef.startsWith('cf_')
    ? persistedOrderRef.slice(3)
    : persistedOrderRef || `vv_order_${row.id}`;
  const identity = await buildCashfreeRefundIdentity({
    paymentId: row.id,
    orderId,
    amountInr: refundAmountInr,
    sequence,
  });

  const findRefund = () =>
    env.DB!.prepare('SELECT * FROM refunds WHERE razorpay_refund_id = ? LIMIT 1')
      .bind(identity.refundId)
      .first<{ status: string; amount_inr: number; razorpay_refund_id: string }>();

  const existingRefund = await findRefund();
  if (existingRefund?.status === 'processed') {
    const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ?')
      .bind(row.id)
      .first();
    return json({
      refunded: true,
      idempotentReplay: true,
      refund: {
        id: row.refund_id || identity.refundId,
        merchantRefundId: identity.refundId,
        status: 'SUCCESS',
        amount: Number(existingRefund.amount_inr || refundAmountInr),
      },
      payment: updated,
    });
  }

  try {
    const reserve = await env.DB.prepare(
      `INSERT OR IGNORE INTO refunds
       (flow_type, website_id, platform_payment_id, store_order_id,
        razorpay_payment_id, razorpay_refund_id, amount_inr, reason,
        status, requested_by, processed_by, created_at, updated_at)
       VALUES ('platform_payment', ?, ?, NULL, ?, ?, ?, ?, 'requested', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        row.website_id,
        row.id,
        row.razorpay_payment_id || '',
        identity.refundId,
        refundAmountInr,
        reason,
        auth.user.id,
        auth.user.id
      )
      .run();

    if (reserve.meta?.changes === 0) {
      const concurrent = await findRefund();
      if (concurrent?.status === 'processed') {
        const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ?')
          .bind(row.id)
          .first();
        return json({
          refunded: true,
          idempotentReplay: true,
          refund: {
            id: row.refund_id || identity.refundId,
            merchantRefundId: identity.refundId,
            status: 'SUCCESS',
            amount: Number(concurrent.amount_inr || refundAmountInr),
          },
          payment: updated,
        });
      }
      await env.DB.prepare(
        `UPDATE refunds
         SET status = 'requested', processed_by = ?, updated_at = datetime('now')
         WHERE razorpay_refund_id = ?`
      )
        .bind(auth.user.id, identity.refundId)
        .run();
    }

    const refund = await createEdgeCashfreeRefund(env, {
      orderId,
      amountInr: refundAmountInr,
      refundId: identity.refundId,
      idempotencyKey: identity.idempotencyKey,
      reason,
    });
    const providerStatus = String(refund.status || '').toUpperCase();

    if (providerStatus === 'SUCCESS') {
      await finalizeCashfreePlatformRefund(env, {
        paymentId: row.id,
        orderId,
        merchantRefundId: identity.refundId,
        cfRefundId: refund.id,
        amountInr: refundAmountInr,
        reason,
        providerStatus,
        actorId: auth.user.id,
      });

      const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ?')
        .bind(row.id)
        .first();
      return json({ refunded: true, idempotentReplay: false, refund, payment: updated });
    }

    // PENDING/PENDING_APPROVAL/ONHOLD: the refund exists at Cashfree but is not
    // terminal. REFUND_STATUS_WEBHOOK finalizes the ledgers when it succeeds.
    await env.DB.prepare(
      `UPDATE refunds
       SET status = 'created', reason = ?, processed_by = ?, updated_at = datetime('now')
       WHERE razorpay_refund_id = ?`
    )
      .bind(reason, auth.user.id, identity.refundId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: 'super_admin',
      action: 'platform_refund_requested',
      targetType: 'platform_payments',
      targetId: String(row.id),
      details: {
        orderId,
        merchantRefundId: identity.refundId,
        cfRefundId: refund.id,
        amountInr: refundAmountInr,
        providerStatus,
      },
    });

    return json({
      refunded: false,
      refundPending: true,
      idempotentReplay: false,
      refund,
      payment: row,
    });
  } catch (err) {
    await env.DB.prepare(
      `UPDATE refunds
       SET status = 'failed', updated_at = datetime('now')
       WHERE razorpay_refund_id = ?`
    )
      .bind(identity.refundId)
      .run();
    console.error('Cashfree platform refund failed:', err);
    return errorJson('Unable to process the Cashfree refund right now.', 502);
  }
}
