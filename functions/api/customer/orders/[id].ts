// ============================================================================
// PATCH /api/customer/orders/:id — Customer Cancel or Request Return
// Strictly verifies the order belongs to the authenticated customer.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';
import { isMissingTableError } from '../../_tenantAccess';
import { releaseReservedStock, reservationLines } from '../../_stockReservation';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export function customerCancelAllowed(order: Record<string, any>): boolean {
  if (['paid', 'refunded'].includes(String(order.payment_status))) return false;
  return ['placed', 'confirmed'].includes(String(order.order_status));
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
  if (!env.DB) return jsonResponse({ error: 'Database storage is not configured.' }, 503);

  const body = await parseJsonBody<{ action?: string; reason?: string }>(request);
  const action = String(body?.action || '').toLowerCase();
  if (action !== 'cancel' && action !== 'return') {
    return jsonResponse({ error: 'Action must be "cancel" or "return".' }, 400);
  }

  try {
    const order = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<Record<string, any>>();
    if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

    const ownsOrder =
      order.customer_user_id === auth.user.id ||
      order.customer_user_id === auth.user.authSubject ||
      (order.customer_email &&
        String(order.customer_email).toLowerCase() === auth.user.email.toLowerCase());
    if (!ownsOrder && !auth.user.isSuperAdmin) {
      return jsonResponse({ error: 'Forbidden: you cannot modify another customer\'s order.' }, 403);
    }

    if (action === 'cancel') {
      if (['paid', 'refunded'].includes(String(order.payment_status))) {
        return jsonResponse(
          {
            error:
              'Paid or refunded orders cannot be cancelled here. Contact support for a verified refund.',
            code: 'PAID_ORDER_CANCEL_BLOCKED',
          },
          409
        );
      }
      if (!customerCancelAllowed(order)) {
        return jsonResponse({ error: 'Only newly placed or confirmed orders can be cancelled.' }, 400);
      }

      const cancelRes = await env.DB.prepare(
        `UPDATE store_orders
         SET order_status = 'cancelled', updated_at = datetime('now')
         WHERE id = ? AND order_status IN ('placed', 'confirmed')
           AND payment_status NOT IN ('paid', 'refunded')`
      )
        .bind(orderId)
        .run();
      if (Number(cancelRes?.meta?.changes || 0) < 1) {
        return jsonResponse(
          { error: 'Order status changed. Reload and try again.', code: 'ORDER_STATE_CHANGED' },
          409
        );
      }

      let parsedItems: any[] = [];
      try {
        const rawItems = JSON.parse(String(order.items_json || '[]'));
        if (Array.isArray(rawItems)) parsedItems = rawItems;
      } catch {}
      const restoredLines = reservationLines(
        parsedItems.map((item) => ({
          productId: Number(item?.productId || item?.id),
          quantity: Math.max(0, Math.round(Number(item?.qty || item?.quantity || 0))),
          name: String(item?.name || ''),
        }))
      );
      const restored = await releaseReservedStock(env, {
        websiteId: String(order.website_id || ''),
        orderNumber: String(order.order_number || orderId),
        lines: restoredLines,
        actorId: auth.user.id,
      });

      await writeAuditLog(env, {
        actorId: auth.user.id,
        actorRole: 'end_customer',
        action: 'CUSTOMER_ORDER_CANCELLED',
        targetType: 'order',
        targetId: String(orderId),
        details: {
          orderNumber: String(order.order_number || orderId),
          restoredProductLines: restored,
          paymentStatus: String(order.payment_status || ''),
        },
      });
      return jsonResponse({ ok: true, status: 'cancelled', stockRestored: restored });
    }

    if (String(order.order_status) !== 'delivered') {
      return jsonResponse({ error: 'Return requests are only available for delivered orders.' }, 400);
    }
    const reason = sanitizeText(body?.reason, 300) || 'Customer requested return';
    await env.DB.prepare(
      `UPDATE store_orders SET order_status = 'return_requested', return_reason = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(reason, orderId)
      .run();

    return jsonResponse({ ok: true, status: 'return_requested' });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Orders require D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to update order.' }, 500);
  }
}
