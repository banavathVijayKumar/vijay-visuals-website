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
import { checkAssignedDeliveryAccess } from '../../_assignmentAccess';
import { dispatchLifecycleNotification } from '../../../_lifecycleNotifications';

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
      `SELECT id, website_id, payment_method, payment_status,
              customer_email, customer_phone, customer_user_id
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<{
        id: number;
        website_id: string;
        payment_method: string;
        payment_status: string;
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
       SET order_status = 'delivered'${paymentUpdate}, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(orderId)
      .run();

    if (access.assignmentId) {
      await env.DB.prepare(
        `UPDATE delivery_assignments
         SET status = 'delivered',
             proof_of_delivery_note = ?,
             proof_of_delivery_url = ?,
             cod_collected = ?,
             last_lat = NULL,
             last_lng = NULL,
             updated_at = datetime('now')
         WHERE id = ? AND order_id = ?`
      )
        .bind(
          `Verified by ${recipientName || 'Recipient'} (${podCode})`,
          '',
          codCollected ? 1 : 0,
          access.assignmentId,
          orderId
        )
        .run();
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'record_pod',
      targetType: 'order',
      targetId: String(orderId),
      details: {
        recipientName,
        podCode,
        codCollected,
        assignmentId: access.assignmentId,
        partnerId: access.partnerId,
      },
    });

    await dispatchLifecycleNotification(env, {
      websiteId: String(existingOrder.website_id || ''),
      eventType: 'proof_of_delivery_recorded',
      subject: `Proof of delivery #${orderId}`,
      message: `Order #${orderId} delivered. POD reference ${podCode || 'recorded'}${codCollected ? '; COD collected.' : '.'}`,
      recipientUserId: String(existingOrder.customer_user_id || '') || null,
      recipientContact: String(existingOrder.customer_email || existingOrder.customer_phone || ''),
    });
    await dispatchLifecycleNotification(env, {
      websiteId: String(existingOrder.website_id || ''),
      eventType: 'order_delivered',
      subject: `Order #${orderId} delivered`,
      message: `Order #${orderId} was marked delivered with proof of delivery.`,
      recipientUserId: String(existingOrder.customer_user_id || '') || null,
      recipientContact: String(existingOrder.customer_email || existingOrder.customer_phone || ''),
    });

    return jsonResponse({ success: true, status: 'delivered', podCode });
  } catch (err) {
    return jsonResponse({ error: 'Failed to record proof of delivery.' }, 500);
  }
}
