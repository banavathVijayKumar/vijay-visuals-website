// ============================================================================
// PATCH /api/delivery/orders/:id/status — Update Delivery Order Milestone
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { checkAssignedDeliveryAccess } from '../../_assignmentAccess';
import { dispatchLifecycleNotification } from '../../../_lifecycleNotifications';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

const UI_TO_DB_ORDER_STATUS: Record<string, string> = {
  ready_for_pickup: 'packed',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  returned: 'returned',
};

const UI_TO_ASSIGNMENT_STATUS: Record<string, string> = {
  ready_for_pickup: 'assigned',
  out_for_delivery: 'in_transit',
  delivered: 'delivered',
  returned: 'returned',
};

const UI_TO_NOTIFICATION_EVENT: Record<string, string> = {
  ready_for_pickup: 'order_ready_for_pickup',
  out_for_delivery: 'order_out_for_delivery',
  delivered: 'order_delivered',
  returned: 'order_returned',
};

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const orderId = Number(params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return jsonResponse({ error: 'Invalid order ID.' }, 400);
  }

  const body = await parseJsonBody<{ status?: string }>(request);
  const nextStatus = sanitizeText(body?.status, 30);
  const validStatuses = ['ready_for_pickup', 'out_for_delivery', 'delivered', 'returned'];
  // store_orders.order_status has a D1 CHECK that does not include
  // ready_for_pickup. Persist the DB-compatible equivalent while keeping the
  // UI milestone in the response and audit log.
  if (!validStatuses.includes(nextStatus)) {
    return jsonResponse({ error: 'Invalid delivery status.' }, 400);
  }

  try {
    const existingOrder = await env.DB.prepare(
      `SELECT id, website_id, payment_method, payment_status, order_status,
              customer_email, customer_phone, customer_user_id
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<{
        id: number;
        website_id: string;
        payment_method: string;
        payment_status: string;
        order_status: string;
        customer_email?: string;
        customer_phone?: string;
        customer_user_id?: string;
      }>();

    if (!existingOrder) {
      return jsonResponse({ error: 'Order not found.' }, 404);
    }

    const access = await checkAssignedDeliveryAccess(
      env,
      auth.user,
      String(existingOrder.website_id || ''),
      orderId
    );
    if (!access.authorized) {
      return jsonResponse(
        { error: 'Only the assigned delivery partner or business owner can update this order.' },
        403
      );
    }

    // UNPAID ORDER FULFILLMENT PROTECTION:
    // If payment_method is cashfree_online and payment_status is not paid,
    // block transitions to ready_for_pickup, out_for_delivery, and delivered with HTTP 409.
    const RESTRICTED_FULFILLMENT_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'delivered'];
    if (
      existingOrder.payment_method === 'cashfree_online' &&
      existingOrder.payment_status !== 'paid' &&
      RESTRICTED_FULFILLMENT_STATUSES.includes(nextStatus)
    ) {
      return jsonResponse(
        {
          error: `Cannot transition unpaid online order to "${nextStatus}". Payment must be verified before fulfillment.`,
        },
        409
      );
    }

    await env.DB.prepare(
      `UPDATE store_orders SET order_status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(UI_TO_DB_ORDER_STATUS[nextStatus], orderId)
      .run();

    if (access.assignmentId) {
      const endState = nextStatus === 'delivered' || nextStatus === 'returned';
      await env.DB.prepare(
        `UPDATE delivery_assignments
         SET status = ?, ${endState ? 'last_lat = NULL, last_lng = NULL,' : ''} updated_at = datetime('now')
         WHERE id = ? AND order_id = ?`
      )
        .bind(UI_TO_ASSIGNMENT_STATUS[nextStatus], access.assignmentId, orderId)
        .run();
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'update_delivery_status',
      targetType: 'order',
      targetId: String(orderId),
      details: {
        status: nextStatus,
        assignmentId: access.assignmentId,
        partnerId: access.partnerId,
      },
    });

    await dispatchLifecycleNotification(env, {
      websiteId: String(existingOrder.website_id || ''),
      eventType: UI_TO_NOTIFICATION_EVENT[nextStatus],
      subject: `Order #${orderId} — ${nextStatus}`,
      message: `Delivery milestone for order #${orderId}: ${nextStatus}.`,
      recipientUserId: String(existingOrder.customer_user_id || '') || null,
      recipientContact: String(existingOrder.customer_email || existingOrder.customer_phone || ''),
    });

    return jsonResponse({ success: true, status: nextStatus });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update order status.' }, 500);
  }
}
