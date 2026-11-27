// ============================================================================
// PATCH /api/delivery/orders/:id/status — Update Delivery Order Milestone
//
// Milestones are monotonic. `delivered` is terminal and can only be reached by
// the verified secure-POD writer, never by a generic status request.
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
import { maskContactForLog } from '../../../_pii';
import {
  isBackwardAssignmentTransition,
  isBackwardDeliveryTransition,
  toAssignmentStatus,
  toDbOrderStatus,
} from '../../_deliveryStatus';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

const VALID_MILESTONES = ['accepted', 'ready_for_pickup', 'out_for_delivery', 'returned'];

const UI_TO_NOTIFICATION_EVENT: Record<string, string> = {
  accepted: 'order_accepted',
  ready_for_pickup: 'order_ready_for_pickup',
  out_for_delivery: 'order_out_for_delivery',
  returned: 'order_returned',
};

function conflict(message: string): Response {
  return jsonResponse({ error: message, code: 'DELIVERY_STATE_CHANGED' }, 409);
}

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
  if (nextStatus === 'delivered') {
    return jsonResponse(
      {
        error: 'Delivered status can only be recorded through secure proof of delivery.',
        code: 'SECURE_POD_REQUIRED',
        replacement: '/api/delivery/orders/:id/secure-pod',
      },
      410
    );
  }
  if (!VALID_MILESTONES.includes(nextStatus)) {
    return jsonResponse({ error: 'Invalid delivery status.' }, 400);
  }

  try {
    const existingOrder = await env.DB.prepare(
      `SELECT id, website_id, payment_method, payment_status, order_status,
              customer_email, customer_phone, customer_user_id
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<Record<string, any>>();

    if (!existingOrder) return jsonResponse({ error: 'Order not found.' }, 404);

    const currentOrderStatus = String(existingOrder.order_status || '');
    if (isBackwardDeliveryTransition(currentOrderStatus, nextStatus)) {
      return conflict(`Cannot move delivery backwards from "${currentOrderStatus}" to "${nextStatus}".`);
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

    // UNPAID ORDER FULFILLMENT PROTECTION
    if (
      String(existingOrder.payment_method) === 'cashfree_online' &&
      String(existingOrder.payment_status) !== 'paid' &&
      ['accepted', 'ready_for_pickup', 'out_for_delivery'].includes(nextStatus)
    ) {
      return jsonResponse(
        {
          error: `Cannot transition unpaid online order to "${nextStatus}". Payment must be verified before fulfillment.`,
        },
        409
      );
    }

    const nextDbStatus = toDbOrderStatus(nextStatus);
    const orderWrite = await env.DB.prepare(
      `UPDATE store_orders SET order_status = ?, updated_at = datetime('now')
       WHERE id = ? AND website_id = ? AND order_status = ?
         AND order_status NOT IN ('delivered', 'returned', 'cancelled')`
    )
      .bind(nextDbStatus, orderId, String(existingOrder.website_id || ''), currentOrderStatus)
      .run();
    if (!orderWrite.meta?.changes) {
      return conflict('Order state changed concurrently. Refresh and retry.');
    }

    if (access.assignmentId && access.assignment) {
      const currentAssignmentStatus = String(access.assignment.status || '');
      // Compare assignment ranks in assignment vocabulary; UI milestones such
      // as out_for_delivery are stored as in_transit on the assignment row.
      if (isBackwardAssignmentTransition(currentAssignmentStatus, toAssignmentStatus(nextStatus))) {
        // Restore the order so both records remain on the same milestone.
        await env.DB.prepare(
          `UPDATE store_orders SET order_status = ?, updated_at = datetime('now')
           WHERE id = ? AND website_id = ? AND order_status = ?`
        )
          .bind(
            currentOrderStatus,
            orderId,
            String(existingOrder.website_id || ''),
            nextDbStatus
          )
          .run();
        return conflict('Delivery assignment cannot move backwards.');
      }

      const endState = nextStatus === 'returned';
      const assignmentWrite = await env.DB.prepare(
        `UPDATE delivery_assignments
         SET status = ?, ${endState ? 'last_lat = NULL, last_lng = NULL,' : ''} updated_at = datetime('now')
         WHERE id = ? AND order_id = ? AND website_id = ? AND status = ?
           AND status NOT IN ('delivered', 'returned', 'cancelled')`
      )
        .bind(
          toAssignmentStatus(nextStatus),
          access.assignmentId,
          orderId,
          String(existingOrder.website_id || ''),
          currentAssignmentStatus
        )
        .run();

      if (!assignmentWrite.meta?.changes) {
        await env.DB.prepare(
          `UPDATE store_orders SET order_status = ?, updated_at = datetime('now')
           WHERE id = ? AND website_id = ? AND order_status = ?`
        )
          .bind(currentOrderStatus, orderId, String(existingOrder.website_id || ''), nextDbStatus)
          .run();
        return conflict('Delivery assignment changed concurrently. Refresh and retry.');
      }
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
      recipientContact: maskContactForLog(
        String(existingOrder.customer_email || existingOrder.customer_phone || '')
      ),
    });

    return jsonResponse({ success: true, status: nextStatus });
  } catch {
    return jsonResponse({ error: 'Failed to update order status.' }, 500);
  }
}
