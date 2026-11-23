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

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
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
  const validStatuses = ['ready_for_pickup', 'out_for_delivery', 'delivered', 'returned'];
  if (!validStatuses.includes(nextStatus)) {
    return jsonResponse({ error: 'Invalid delivery status.' }, 400);
  }

  try {
    await env.DB.prepare(
      `UPDATE store_orders SET order_status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(nextStatus, orderId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'update_delivery_status',
      targetType: 'order',
      targetId: String(orderId),
      details: { status: nextStatus },
    });

    return jsonResponse({ success: true, status: nextStatus });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update order status.' }, 500);
  }
}
