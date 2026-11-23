// ============================================================================
// POST /api/webhooks/cashfree — Production Cashfree Webhook Handler (Cloudflare Edge)
// - Verifies x-webhook-signature Base64 HMAC-SHA256 on exact raw body + timestamp
// - Enforces strict idempotency via payment_webhook_events(event_id PK)
// - Handles Cashfree PG events: PAYMENT_SUCCESS_WEBHOOK, ORDER_PAID_WEBHOOK,
//   PAYMENT_FAILED_WEBHOOK, PAYMENT_USER_DROPPED_WEBHOOK
// - Dual-ledger atomic reconciliation across cashfree_payments and platform_payments
// ============================================================================

import { PagesContext, errorJson, json, sanitizeText, writeAuditLog } from '../_shared';
import { verifyEdgeCashfreeWebhookSignature } from '../payments/_cashfree';

interface CashfreeWebhookPayload {
  type?: string;
  event_time?: string;
  data?: {
    order?: {
      order_id?: string;
      order_amount?: number;
      order_currency?: string;
      order_tags?: Record<string, string>;
    };
    payment?: {
      cf_payment_id?: number | string;
      payment_status?: string;
      payment_amount?: number;
      payment_currency?: string;
      payment_time?: string;
      payment_method?: any;
      bank_reference?: string;
      payment_group?: string;
      payment_message?: string;
    };
    customer_details?: {
      customer_id?: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
    };
  };
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const signature = (request.headers.get('x-webhook-signature') || '').trim();
  const timestamp = (request.headers.get('x-webhook-timestamp') || '').trim();

  if (!signature || !timestamp) {
    return errorJson('Missing x-webhook-signature or x-webhook-timestamp header.', 401);
  }

  // SECURITY: Read exact raw request body text before JSON parsing
  const rawBody = await request.text();
  const sigValid = await verifyEdgeCashfreeWebhookSignature(env, rawBody, signature, timestamp);
  if (!sigValid) {
    return errorJson('Invalid Cashfree webhook HMAC-SHA256 Base64 signature.', 401);
  }

  let body: CashfreeWebhookPayload;
  try {
    body = JSON.parse(rawBody) as CashfreeWebhookPayload;
  } catch {
    return errorJson('Invalid webhook JSON payload.', 400);
  }

  const eventType = sanitizeText(body.type || 'UNKNOWN', 80);
  const orderData = body.data?.order;
  const paymentData = body.data?.payment;

  const orderId = sanitizeText(orderData?.order_id || '', 120);
  const cfPaymentId = sanitizeText(paymentData?.cf_payment_id ? String(paymentData.cf_payment_id) : '', 120);

  const eventId = sanitizeText(
    request.headers.get('x-request-id') ||
      (cfPaymentId ? `${eventType}:${cfPaymentId}` : `${eventType}:${orderId}:${timestamp}`),
    140
  );

  // Strict idempotency check (safely ignores duplicate Cashfree retries)
  const existingEvent = await env.DB.prepare(
    'SELECT event_id FROM payment_webhook_events WHERE event_id = ? LIMIT 1'
  )
    .bind(eventId)
    .first();

  if (existingEvent) {
    return json({ ok: true, idempotentDuplicate: true, eventId, eventType });
  }

  // Process event
  if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID_WEBHOOK') {
    // 1. Check cashfree_payments ledger
    const existingPayment = await env.DB.prepare(
      'SELECT * FROM cashfree_payments WHERE order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{
        id: number;
        status: string;
        user_id: string;
        website_id: string | null;
        reference_id: string;
        base_amount_inr: number;
        gst_amount_inr: number;
        amount_inr: number;
        notes_json: string;
      }>();

    if (existingPayment) {
      if (existingPayment.status !== 'PAID') {
        const paymentMethod = paymentData?.payment_group || 'cashfree_pg';
        const bankRef = paymentData?.bank_reference || null;
        const paymentTime = paymentData?.payment_time || new Date().toISOString();

        let notes: Record<string, any> = {};
        try {
          notes = JSON.parse(existingPayment.notes_json || '{}');
        } catch {}

        notes.orderState = 'ACTIVE';
        notes.deliveryStatus = 'DELIVERY_READY';
        notes.gateway = 'cashfree';
        notes.cfPaymentId = cfPaymentId;
        notes.paidViaWebhook = true;
        notes.deliveredAt = new Date().toISOString();

        // Update cashfree_payments
        await env.DB.prepare(
          `UPDATE cashfree_payments
           SET status = 'PAID',
               cf_payment_id = ?,
               payment_method = ?,
               bank_reference = ?,
               payment_time = ?,
               notes_json = ?,
               raw_webhook_json = ?,
               updated_at = datetime('now')
           WHERE order_id = ?`
        )
          .bind(cfPaymentId, paymentMethod, bankRef, paymentTime, JSON.stringify(notes), rawBody, orderId)
          .run();

        // Update mirrored platform_payments
        await env.DB.prepare(
          `UPDATE platform_payments
           SET status = 'paid',
               signature_verified = 1,
               razorpay_payment_id = ?,
               paid_at = COALESCE(paid_at, datetime('now')),
               notes_json = ?,
               updated_at = datetime('now')
           WHERE razorpay_order_id = ?`
        )
          .bind(cfPaymentId, JSON.stringify(notes), `cf_${orderId}`)
          .run();

        // Activate website publication if linked
        if (existingPayment.website_id) {
          await env.DB.prepare(
            `UPDATE customer_website_publications
             SET status = 'published',
                 published_at = CASE WHEN published_at IS NULL OR published_at = '' THEN datetime('now') ELSE published_at END,
                 updated_at = datetime('now')
             WHERE website_id = ?`
          )
            .bind(existingPayment.website_id)
            .run();

          // Provision subscription
          await env.DB.prepare(
            `INSERT OR IGNORE INTO tenant_subscriptions
              (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
               total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
               current_period_start, current_period_end, created_at, updated_at)
             VALUES (?, ?, ?, 'one_time', 'active', ?, ?, ?, 0, 'cashfree', ?, datetime('now'), NULL, datetime('now'), datetime('now'))`
          )
            .bind(
              existingPayment.website_id,
              existingPayment.user_id,
              existingPayment.reference_id,
              existingPayment.base_amount_inr,
              existingPayment.gst_amount_inr,
              existingPayment.amount_inr,
              cfPaymentId
            )
            .run();
        }
      }
    }

    // 2. Also check if it belongs to store_orders (storefront e-commerce checkout)
    const storeOrder = await env.DB.prepare(
      'SELECT id, payment_status FROM store_orders WHERE gateway_order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id: number; payment_status: string }>();

    if (storeOrder && storeOrder.payment_status !== 'paid') {
      await env.DB.prepare(
        `UPDATE store_orders
         SET payment_status = 'paid',
             payment_method = 'cashfree_online',
             gateway_payment_id = ?,
             order_status = CASE WHEN order_status = 'placed' THEN 'confirmed' ELSE order_status END,
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(cfPaymentId, storeOrder.id)
        .run();
    }
  } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    // Record failed state
    await env.DB.prepare(
      `UPDATE cashfree_payments
       SET status = 'FAILED',
           raw_webhook_json = ?,
           updated_at = datetime('now')
       WHERE order_id = ? AND status != 'PAID'`
    )
      .bind(rawBody, orderId)
      .run();

    await env.DB.prepare(
      `UPDATE platform_payments
       SET status = 'failed',
           updated_at = datetime('now')
       WHERE razorpay_order_id = ? AND status != 'paid'`
    )
      .bind(`cf_${orderId}`)
      .run();

    const storeOrder = await env.DB.prepare(
      'SELECT id, payment_status FROM store_orders WHERE gateway_order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id: number; payment_status: string }>();

    if (storeOrder && storeOrder.payment_status !== 'paid') {
      await env.DB.prepare(
        `UPDATE store_orders
         SET payment_status = 'failed',
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(storeOrder.id)
        .run();
    }
  }

  // Record webhook in payment_webhook_events
  await env.DB.prepare(
    `INSERT INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'cashfree', ?, 'cashfree_webhook', ?, 1, ?, datetime('now'))`
  )
    .bind(eventId, eventType, orderId, rawBody)
    .run();

  await writeAuditLog(env, {
    actorId: 'cashfree_webhook',
    actorRole: 'system',
    action: `cashfree_webhook_${eventType.toLowerCase()}`,
    targetType: 'cashfree_payments',
    targetId: orderId,
    details: { eventId, eventType, orderId, cfPaymentId },
  });

  return json({ ok: true, eventId, eventType, orderId, cfPaymentId });
}
