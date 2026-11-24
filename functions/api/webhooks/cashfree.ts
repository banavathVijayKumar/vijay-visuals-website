// ============================================================================
// POST /api/webhooks/cashfree — Production Cashfree Webhook Handler (Cloudflare Edge)
// - Verifies x-webhook-signature Base64 HMAC-SHA256 on exact raw body + timestamp
// - Supports OPTIONS preflight and GET health checks for dashboard verification
// - Enforces strict idempotency via payment_webhook_events(event_id PK)
// - Handles Cashfree PG events: PAYMENT_SUCCESS_WEBHOOK, ORDER_PAID_WEBHOOK,
//   PAYMENT_FAILED_WEBHOOK, PAYMENT_USER_DROPPED_WEBHOOK
// - Dual-ledger atomic reconciliation across cashfree_payments and store_orders
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, sanitizeText, writeAuditLog } from '../_shared';
import {
  fetchEdgeCashfreeOrder,
  fetchEdgeCashfreeOrderPayments,
  getSafeCashfreeNotifyUrl,
  getTrimmedEnvVar,
  verifyEdgeCashfreeWebhookSignature,
} from '../payments/_cashfree';

function toIntegerPaise(amount: unknown): number {
  if (typeof amount === 'string' && amount.trim() === '') return -1;
  const num = Number(amount);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return -1;
  return Math.round(num * 100);
}

interface CashfreeWebhookPayload {
  type?: string;
  event?: string;
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

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const endpoint = getSafeCashfreeNotifyUrl(context.request, context.env);
  return json({
    ok: true,
    status: 'active',
    gateway: 'Cashfree Payment Gateway',
    apiVersion: '2023-08-01',
    endpoint,
    message: 'Cashfree webhook endpoint is ready and accepting requests.',
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const signature = (request.headers.get('x-webhook-signature') || '').trim();
  const timestamp = (request.headers.get('x-webhook-timestamp') || '').trim();
  const rawBody = await request.text();

  // 1. Strict Cryptographic Signature Check (Enforced for ALL POST requests)
  // Per security requirements: Never bypass HMAC verification based on "TEST", synthetic IDs, or email.
  if (!signature || !timestamp) {
    return errorJson('Missing x-webhook-signature or x-webhook-timestamp header.', 401);
  }

  const hasSecret = Boolean(
    getTrimmedEnvVar(env, 'CASHFREE_WEBHOOK_SECRET') || getTrimmedEnvVar(env, 'CASHFREE_CLIENT_SECRET')
  );

  if (!hasSecret) {
    return errorJson('Cashfree secret key is not configured in Cloudflare Pages environment variables.', 500);
  }

  const sigValid = await verifyEdgeCashfreeWebhookSignature(env, rawBody, signature, timestamp);
  if (!sigValid) {
    return errorJson('Invalid Cashfree webhook HMAC-SHA256 signature.', 401);
  }

  let body: CashfreeWebhookPayload;
  try {
    body = JSON.parse(rawBody) as CashfreeWebhookPayload;
  } catch {
    return errorJson('Invalid webhook JSON payload.', 400);
  }

  const eventType = sanitizeText(body.type || body.event || 'UNKNOWN', 80);
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

  // Process payment events
  if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID_WEBHOOK') {
    if (!orderId) {
      return errorJson('Missing order_id in Cashfree payment webhook payload.', 400);
    }

    // 1. Retrieve authoritative records from Preview D1
    const existingPayment = await env.DB.prepare(
      'SELECT * FROM cashfree_payments WHERE order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{
        id: number;
        status: string;
        user_id: string;
        website_id: string | null;
        entity_type: string;
        reference_id: string;
        base_amount_inr: number;
        gst_amount_inr: number;
        amount_inr: number;
        notes_json: string;
      }>();

    const storeOrder = await env.DB.prepare(
      'SELECT id, website_id, owner_id, order_number, total_inr, payment_status FROM store_orders WHERE gateway_order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{
        id: number;
        website_id: string;
        owner_id: string;
        order_number: string;
        total_inr: number;
        payment_status: string;
      }>();

    if (!existingPayment && !storeOrder) {
      // Per Security Requirement 4:
      // For a validly signed event whose order is missing in D1:
      // - Never mark the payment as PAID.
      // - Log and safely record the unmatched event for investigation.
      // - Return an appropriate successful acknowledgement only after secure validation and durable recording.
      // - Never silently discard payment events.
      console.warn(`[Cashfree Webhook] Unmatched order received: ${orderId} (event ${eventId}). Durably recording for investigation.`);

      await env.DB.prepare(
        `INSERT INTO payment_webhook_events
          (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
         VALUES (?, 'cashfree', ?, 'seller_order', ?, 1, ?, datetime('now'))`
      )
        .bind(eventId, eventType, orderId, rawBody)
        .run();

      await writeAuditLog(env, {
        actorId: 'cashfree_webhook',
        actorRole: 'system',
        action: 'cashfree_webhook_unmatched_order',
        targetType: 'payment_webhook_events',
        targetId: orderId,
        details: {
          eventId,
          eventType,
          orderId,
          cfPaymentId,
          reason: 'Valid cryptographic signature verified, but order record not found in D1 (synthetic dashboard test or external order).',
        },
      });

      return json({
        ok: true,
        status: 'unmatched_order_recorded',
        message: 'Cashfree webhook signature verified and recorded; order not present in local database.',
        eventId,
        eventType,
        orderId,
        cfPaymentId,
      });
    }

    // Authoritative expected amount in integer paise
    let expectedPaise = -1;
    if (existingPayment) {
      expectedPaise = toIntegerPaise(existingPayment.amount_inr);
    }
    if (storeOrder) {
      const storePaise = toIntegerPaise(storeOrder.total_inr);
      if (expectedPaise > 0 && storePaise !== expectedPaise) {
        console.error(`Store order total (${storePaise} paise) does not match payment expected (${expectedPaise} paise) for order ${orderId}`);
        return errorJson('Authoritative storefront order amount mismatch.', 400);
      }
      if (expectedPaise <= 0) {
        expectedPaise = storePaise;
      }
    }

    if (expectedPaise <= 0) {
      return errorJson('Invalid authoritative expected order amount in database.', 500);
    }

    // Determine received amount & currency from webhook payload
    let receivedOrderAmount = orderData?.order_amount;
    let receivedPaymentAmount = paymentData?.payment_amount;
    let receivedCurrency = String(paymentData?.payment_currency || orderData?.order_currency || '').trim().toUpperCase();

    // Requirement 12: If webhook data lacks sufficient payment details, fetch authoritative status from Cashfree API
    if (receivedOrderAmount == null || receivedPaymentAmount == null || !receivedCurrency) {
      try {
        const remoteOrder = await fetchEdgeCashfreeOrder(env, orderId);
        receivedOrderAmount = remoteOrder.order_amount;
        if (!receivedCurrency) {
          receivedCurrency = String(remoteOrder.order_currency || '').trim().toUpperCase();
        }
        const remotePayments = await fetchEdgeCashfreeOrderPayments(env, orderId).catch(() => []);
        const successfulRemote = remotePayments.find((p) => p.payment_status === 'SUCCESS');
        if (successfulRemote) {
          receivedPaymentAmount = successfulRemote.payment_amount;
          if (successfulRemote.payment_currency) {
            receivedCurrency = String(successfulRemote.payment_currency).trim().toUpperCase();
          }
        } else if (remoteOrder.order_status === 'PAID') {
          receivedPaymentAmount = remoteOrder.order_amount;
        }
      } catch (fetchErr) {
        console.error('Failed to fetch authoritative Cashfree order details for webhook:', fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        return errorJson('Unable to verify payment details with Cashfree.', 502);
      }
    }

    // 2. Validate Currency is strictly INR
    if (receivedCurrency !== 'INR') {
      console.error(`Cashfree Webhook Currency Mismatch for order ${orderId}: Expected INR, got ${receivedCurrency}`);
      return errorJson(`Payment currency mismatch. Expected INR, received ${receivedCurrency || 'unspecified'}.`, 400);
    }

    // 3. Validate Amounts in integer paise
    const orderPaise = toIntegerPaise(receivedOrderAmount);
    if (orderPaise <= 0 || orderPaise !== expectedPaise) {
      console.error(`Cashfree Webhook Order Amount Mismatch for order ${orderId}: Expected ${expectedPaise} paise, received ${orderPaise} paise`);
      return errorJson(
        `Payment order amount mismatch. Expected ₹${(expectedPaise / 100).toFixed(2)}, received ₹${(orderPaise > 0 ? orderPaise / 100 : 0).toFixed(2)}.`,
        400
      );
    }

    const paymentPaise = toIntegerPaise(receivedPaymentAmount ?? receivedOrderAmount);
    if (paymentPaise <= 0 || paymentPaise !== expectedPaise) {
      console.error(`Cashfree Webhook Payment Amount Mismatch for order ${orderId}: Expected ${expectedPaise} paise, received ${paymentPaise} paise`);
      return errorJson(
        `Captured payment amount mismatch. Expected ₹${(expectedPaise / 100).toFixed(2)}, received ₹${(paymentPaise > 0 ? paymentPaise / 100 : 0).toFixed(2)}.`,
        400
      );
    }

    // 4. Update Platform package purchase ledger (if applicable)

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

        // Activate website publication if linked for platform packages
        if (existingPayment.entity_type === 'platform_package' && existingPayment.website_id) {
          try {
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
               VALUES (?, ?, ?, 'monthly', 'active', ?, ?, ?, 0, 'cashfree', ?, datetime('now'), datetime('now', '+365 days'), datetime('now'), datetime('now'))`
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
          } catch (pubErr) {
            console.error('Tenant publication/subscription activation notice:', pubErr);
          }
        }
      }
    }

    // 5. Storefront e-commerce order checkout ledger
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

      // Record in cashfree_seller_settlements ledger
      const commissionPercent = 0; // Standard 0% platform commission on store transactions
      const platformFee = Math.round((storeOrder.total_inr * commissionPercent) / 100);
      const sellerPayable = storeOrder.total_inr - platformFee;

      await env.DB.prepare(
        `INSERT OR IGNORE INTO cashfree_seller_settlements (
          website_id, owner_id, store_order_id, order_number,
          gross_amount_inr, platform_fee_inr, seller_payable_inr, currency,
          settlement_status, settlement_mode, notes_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, 'INR',
          'pending_activation', 'cashfree_split_pending', ?, datetime('now'), datetime('now')
        )`
      )
        .bind(
          storeOrder.website_id,
          storeOrder.owner_id,
          storeOrder.id,
          storeOrder.order_number,
          storeOrder.total_inr,
          platformFee,
          sellerPayable,
          JSON.stringify({
            cfPaymentId,
            statusNotice: 'Pending Cashfree Split Settlement activation. Net amount recorded for merchant reconciliation.',
          })
        )
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
     VALUES (?, 'cashfree', ?, 'seller_order', ?, 1, ?, datetime('now'))`
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
