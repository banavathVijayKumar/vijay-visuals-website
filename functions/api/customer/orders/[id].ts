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
} from '../../_shared';
import { isMissingTableError } from '../../_tenantAccess';

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
      if (!['placed', 'confirmed'].includes(String(order.order_status))) {
        return jsonResponse({ error: 'Only newly placed or confirmed orders can be cancelled.' }, 400);
      }
      await env.DB.prepare(
        `UPDATE store_orders SET order_status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(orderId)
        .run();
      return jsonResponse({ ok: true, status: 'cancelled' });
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
