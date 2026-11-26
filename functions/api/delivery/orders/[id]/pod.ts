// ============================================================================
// PATCH /api/delivery/orders/:id/pod — Record Proof of Delivery & COD Settlement
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
import { checkDeliveryOrderAccess } from '../../_deliveryAccess';

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

  const body = await parseJsonBody<{
    recipientName?: string;
    podCode?: string;
    codCollected?: boolean;
    status?: string;
  }>(request);

  const recipientName = sanitizeText(body?.recipientName, 120);
  const podCode = sanitizeText(body?.podCode, 60);
  const codCollected = Boolean(body?.codCollected);

  try {
    const existingOrder = await env.DB.prepare(
      'SELECT id, website_id, payment_method, payment_status FROM store_orders WHERE id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id: number; website_id: string; payment_method: string; payment_status: string }>();

    if (!existingOrder) {
      return jsonResponse({ error: 'Order not found.' }, 404);
    }

    const access = await checkDeliveryOrderAccess(env, auth.user, String(existingOrder.website_id || ''));
    if (!access.authorized) {
      return jsonResponse(
        { error: 'Only the assigned delivery partner or business owner can record delivery proof.' },
        403
      );
    }

    if (existingOrder.payment_method === 'cashfree_online' && existingOrder.payment_status !== 'paid') {
      return jsonResponse(
        { error: 'Cannot record proof of delivery for an unpaid online order. Payment must be verified before delivery.' },
        409
      );
    }

    const paymentUpdate = codCollected ? `, payment_status = 'paid'` : '';
    await env.DB.prepare(
      `UPDATE store_orders
       SET order_status = 'delivered'${paymentUpdate}, notes = notes || ? || datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(`\n[POD verified by ${recipientName || 'Recipient'} (${podCode}) at ]`, orderId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'record_pod',
      targetType: 'order',
      targetId: String(orderId),
      details: { recipientName, podCode, codCollected },
    });

    return jsonResponse({ success: true, status: 'delivered', podCode });
  } catch (err) {
    return jsonResponse({ error: 'Failed to record proof of delivery.' }, 500);
  }
}
