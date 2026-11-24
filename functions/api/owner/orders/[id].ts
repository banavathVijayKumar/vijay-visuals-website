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

  // UNPAID ONLINE ORDER FULFILLMENT RESTRICTION
  const RESTRICTED_FULFILLMENT_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'delivered'];
  if (
    existing.payment_method === 'cashfree_online' &&
    existing.payment_status !== 'paid' &&
    nextPaymentStatus !== 'paid' &&
    RESTRICTED_FULFILLMENT_STATUSES.includes(nextOrderStatus)
  ) {
    return jsonResponse(
      {
        error: `Cannot transition unpaid online order to "${nextOrderStatus}". Payment must be verified before fulfillment.`,
      },
      409
    );
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

  // INVENTORY SAFETY: Idempotent stock restoration on order cancellation or rejection
  const RESTORABLE_ORDER_STATUSES = ['placed', 'confirmed', 'preparing', 'packed', 'ready_for_pickup'];
  const isTransitioningToCancelled =
    nextOrderStatus === 'cancelled' &&
    RESTORABLE_ORDER_STATUSES.includes(String(existing.order_status));

  if (isTransitioningToCancelled) {
    try {
      const parsedItems = JSON.parse(existing.items_json || '[]');
      if (Array.isArray(parsedItems)) {
        for (const item of parsedItems) {
          const pId = Number(item.productId || item.id);
          const pQty = Math.max(0, Math.round(Number(item.qty || item.quantity || 0)));
          if (pId > 0 && pQty > 0) {
            await env.DB.prepare(
              `UPDATE store_products
               SET stock_qty = stock_qty + ?, updated_at = datetime('now')
               WHERE id = ? AND website_id = ?`
            )
              .bind(pQty, pId, existing.website_id)
              .run();

            try {
              await env.DB.prepare(
                `INSERT INTO stock_movements (website_id, product_id, delta_qty, movement_type, reference_note, actor_id, created_at)
                 VALUES (?, ?, ?, 'cancellation_restored', ?, ?, datetime('now'))`
              )
                .bind(
                  existing.website_id,
                  pId,
                  pQty,
                  `Restored from cancelled order #${existing.order_number || orderId}`,
                  auth.user.id
                )
                .run();
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore inventory on order cancellation:', err);
    }
  }

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
