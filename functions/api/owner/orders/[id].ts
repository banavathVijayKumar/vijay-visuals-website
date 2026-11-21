// ============================================================================
// PATCH /api/owner/orders/:id — Business Owner Updates Order & Payment Status
// Strictly verifies ownership via the order's parent website_id (403 otherwise).
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../_shared';
import {
  isMissingTableError,
  mapOrderRowToUi,
  requireTenantOwnerAccess,
} from '../../_tenantAccess';

const UI_TO_DB_ORDER_STATUS: Record<string, string> = {
  placed: 'placed',
  confirmed: 'confirmed',
  preparing: 'confirmed',
  ready_for_pickup: 'packed',
  packed: 'packed',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
  return_requested: 'return_requested',
  returned: 'returned',
};

const UI_TO_DB_PAYMENT_STATUS: Record<string, string> = {
  pending: 'pending',
  cod_due: 'pending',
  pending_verification: 'pending',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
};

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonResponse({ error: 'Invalid order ID.' }, 400);
  }

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  let existing: Record<string, any> | null = null;
  try {
    existing = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Orders require D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load order.' }, 500);
  }

  if (!existing) {
    return jsonResponse({ error: 'Order not found.' }, 404);
  }

  const access = await requireTenantOwnerAccess(env, auth.user, String(existing.website_id), [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    status?: string;
    paymentStatus?: string;
    action?: string;
    reason?: string;
    rejectionReason?: string;
    refundNotes?: string;
  }>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  // Handle Action Shortcuts (Accept, Reject, Refund)
  let requestedStatus = body.status;
  let requestedPaymentStatus = body.paymentStatus;
  let nextReturnReason = String(existing.return_reason || '');

  if (body.action === 'reject') {
    requestedStatus = 'cancelled';
    nextReturnReason = body.rejectionReason || body.reason || 'Order rejected by business owner';
  } else if (body.action === 'accept') {
    requestedStatus = 'confirmed';
  } else if (body.action === 'refund') {
    requestedPaymentStatus = 'refunded';
    nextReturnReason = body.refundNotes || body.reason || 'Payment refunded by business owner';
  }

  if (body.rejectionReason) {
    nextReturnReason = body.rejectionReason;
  }

  const nextOrderStatus = requestedStatus
    ? UI_TO_DB_ORDER_STATUS[String(requestedStatus)] || null
    : String(existing.order_status);
  if (!nextOrderStatus) {
    return jsonResponse({ error: 'Unsupported order status.' }, 400);
  }

  const nextPaymentStatus = requestedPaymentStatus
    ? UI_TO_DB_PAYMENT_STATUS[String(requestedPaymentStatus)] || null
    : String(existing.payment_status);
  if (!nextPaymentStatus) {
    return jsonResponse({ error: 'Unsupported payment status.' }, 400);
  }

  // CRITICAL SECURITY ENFORCEMENT: Financial immutability
  // total_inr, subtotal_inr, gst_inr, discount_inr, items_json CANNOT be modified.
  await env.DB.prepare(
    `UPDATE store_orders
     SET order_status = ?, payment_status = ?, return_reason = ?, updated_at = datetime('now')
     WHERE id = ? AND website_id = ?`
  )
    .bind(nextOrderStatus, nextPaymentStatus, nextReturnReason, orderId, existing.website_id)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
    .bind(orderId)
    .first<Record<string, any>>();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: body.action === 'refund' ? 'order_refunded' : body.action === 'reject' ? 'order_rejected' : 'order_status_updated',
    targetType: 'order',
    targetId: String(orderId),
    details: {
      websiteId: existing.website_id,
      orderStatus: nextOrderStatus,
      paymentStatus: nextPaymentStatus,
      returnReason: nextReturnReason,
      action: body.action || null,
    },
  });

  return jsonResponse({
    order: updated ? mapOrderRowToUi(updated, Number(access.row.rowid || 0)) : null,
  });
}
