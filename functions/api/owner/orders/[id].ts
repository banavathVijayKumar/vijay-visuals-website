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
import { dispatchLifecycleNotification } from '../../_lifecycleNotifications';
import { maskContactForLog, maskPersonName } from '../../_pii';
import { isBackwardDeliveryTransition } from '../../delivery/_deliveryStatus';
import { hasDurableOwnerApproval } from '../../delivery/_riderState';

const UI_TO_DB_ORDER_STATUS: Record<string, string> = {
  placed: 'placed',
  confirmed: 'confirmed',
  preparing: 'confirmed',
  ready_for_pickup: 'packed',
  packed: 'packed',
  out_for_delivery: 'out_for_delivery',
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
    deliveryPartnerId?: number | string | null;
  }>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  // Delivery assignment is persisted in delivery_assignments (the D1 source of
  // truth). Validate the rider before any order write so a failed assignment
  // cannot be reported as successful by the owner UI.
  let deliveryPartnerId: number | null | undefined;
  let deliveryPartnerName = '';
  if (Object.prototype.hasOwnProperty.call(body, 'deliveryPartnerId')) {
    const rawPartnerId = body.deliveryPartnerId;
    if (rawPartnerId === null || rawPartnerId === '' || rawPartnerId === undefined) {
      deliveryPartnerId = null;
    } else {
      const parsedPartnerId = Number(rawPartnerId);
      if (!Number.isInteger(parsedPartnerId) || parsedPartnerId <= 0) {
        return jsonResponse({ error: 'Invalid delivery partner.' }, 400);
      }
      const member = await env.DB.prepare(
        `SELECT id, full_name, email, status, permissions_json, role
         FROM tenant_memberships
         WHERE id = ? AND website_id = ? AND role = 'delivery_partner' AND status = 'active'
         LIMIT 1`
      )
        .bind(parsedPartnerId, String(existing.website_id))
        .first<{ id?: number; full_name?: string; email?: string; status?: string; permissions_json?: string }>();
      if (!member || !hasDurableOwnerApproval(member)) {
        return jsonResponse(
          {
            error:
              'The selected delivery partner is not an approved, active rider for this website.',
          },
          403
        );
      }
      deliveryPartnerId = parsedPartnerId;
      deliveryPartnerName = String(member.full_name || member.email || 'Delivery Partner');
    }
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

  if (String(requestedStatus || '') === 'delivered') {
    return jsonResponse(
      {
        error: 'Delivered status can only be recorded through secure proof of delivery.',
        code: 'SECURE_POD_REQUIRED',
        replacement: '/api/delivery/orders/:id/secure-pod',
      },
      410
    );
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

  // Gateway orders can never be marked paid by a manual owner edit. Only the
  // verified Cashfree webhook/checkout verification may change that status.
  if (
    existing.payment_method === 'cashfree_online' &&
    existing.payment_status !== 'paid' &&
    nextPaymentStatus === 'paid'
  ) {
    return jsonResponse(
      {
        error:
          'Cashfree online orders can only be marked paid after gateway verification. Do not record an unpaid transaction as successful.',
      },
      409
    );
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

  const currentOrderStatus = String(existing.order_status || '');
  if (currentOrderStatus === 'delivered') {
    return jsonResponse(
      {
        error: 'Delivered orders are immutable. Contact support for a return.',
        code: 'DELIVERY_ALREADY_CLOSED',
      },
      410
    );
  }
  if (isBackwardDeliveryTransition(currentOrderStatus, nextOrderStatus)) {
    return jsonResponse(
      {
        error: `Cannot move delivery backwards from "${currentOrderStatus}" to "${nextOrderStatus}".`,
        code: 'DELIVERY_STATE_CHANGED',
      },
      409
    );
  }

  // CRITICAL SECURITY ENFORCEMENT: Financial immutability
  // total_inr, subtotal_inr, gst_inr, discount_inr, items_json CANNOT be modified.
  const orderWrite = await env.DB.prepare(
    `UPDATE store_orders
     SET order_status = ?, payment_status = ?, return_reason = ?, updated_at = datetime('now')
     WHERE id = ? AND website_id = ? AND order_status = ?
       AND order_status NOT IN ('delivered', 'returned')`
  )
    .bind(
      nextOrderStatus,
      nextPaymentStatus,
      nextReturnReason,
      orderId,
      existing.website_id,
      currentOrderStatus
    )
    .run();
  if (!orderWrite.meta?.changes) {
    return jsonResponse(
      {
        error: 'Order state changed concurrently. Reload and retry.',
        code: 'DELIVERY_STATE_CHANGED',
      },
      409
    );
  }

  // GPS is consent-based and transit-only: clear coordinates as soon as the
  // order is no longer deliverable.
  if (['cancelled', 'returned', 'return_requested'].includes(nextOrderStatus)) {
    try {
      await env.DB.prepare(
        `UPDATE delivery_assignments
         SET last_lat = NULL, last_lng = NULL, updated_at = datetime('now')
         WHERE order_id = ? AND website_id = ?`
      )
        .bind(orderId, String(existing.website_id))
        .run();
    } catch {
      // Assignment table is optional; the order write above remains authoritative.
    }
  }

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

  if (deliveryPartnerId !== undefined) {
    if (deliveryPartnerId === null) {
      await env.DB.prepare(
        'DELETE FROM delivery_assignments WHERE order_id = ? AND website_id = ?'
      )
        .bind(orderId, String(existing.website_id))
        .run();
    } else {
      const codAmount =
        String(existing.payment_method || '').toLowerCase() === 'cod'
          ? Math.max(0, Math.round(Number(existing.total_inr || 0)))
          : 0;
      await env.DB.prepare(
        `INSERT INTO delivery_assignments
           (website_id, order_id, delivery_partner_user_id, partner_name, status,
            cod_amount_inr, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'assigned', ?, datetime('now'), datetime('now'))
         ON CONFLICT(order_id) DO UPDATE SET
           website_id = excluded.website_id,
           delivery_partner_user_id = excluded.delivery_partner_user_id,
           partner_name = excluded.partner_name,
           status = 'assigned',
           cod_amount_inr = excluded.cod_amount_inr,
           last_lat = NULL,
           last_lng = NULL,
           updated_at = datetime('now')
         WHERE delivery_assignments.status NOT IN ('delivered', 'returned')`
      )
        .bind(
          String(existing.website_id),
          orderId,
          String(deliveryPartnerId),
          deliveryPartnerName,
          codAmount
        )
        .run();
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
      deliveryPartnerId: deliveryPartnerId === undefined ? null : deliveryPartnerId,
    },
  });

  const ownerEventType =
    body.action === 'reject' || nextOrderStatus === 'cancelled'
      ? 'order_cancelled'
      : body.action === 'accept'
        ? 'order_accepted'
        : 'order_status_updated';
  await dispatchLifecycleNotification(env, {
    websiteId: String(existing.website_id),
    eventType: ownerEventType,
    subject: `Order #${orderId} — ${ownerEventType}`,
    message: `Order #${orderId} is now ${nextOrderStatus}.`,
    recipientUserId: String(existing.customer_user_id || '') || null,
    recipientContact: maskContactForLog(
      String(existing.customer_email || existing.customer_phone || '')
    ),
  });

  if (deliveryPartnerId !== undefined && deliveryPartnerId !== null) {
    await dispatchLifecycleNotification(env, {
      websiteId: String(existing.website_id),
      eventType: 'order_assigned',
      subject: `Delivery assignment #${orderId}`,
      message: `Order #${orderId} assigned to ${maskPersonName(deliveryPartnerName || 'delivery partner')}.`,
      recipientUserId: String(deliveryPartnerId),
    });
  }

  const mappedOrder = updated
    ? (mapOrderRowToUi(updated, Number(access.row.rowid || 0)) as Record<string, any> | null)
    : null;
  if (mappedOrder && deliveryPartnerId !== undefined) {
    mappedOrder.deliveryPartnerId = deliveryPartnerId;
  }

  return jsonResponse({ order: mappedOrder });
}
