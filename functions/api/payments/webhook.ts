// ============================================================================
// POST /api/payments/webhook — Production Razorpay Webhook Handler (Cloudflare Edge)
// - Verifies X-Razorpay-Signature HMAC-SHA256 on EXACT raw body using
//   env.RAZORPAY_WEBHOOK_SECRET (server-side only).
// - Enforces strict idempotency via payment_webhook_events(event_id PK).
// - Handles ALL required Razorpay lifecycle events:
//     payment.captured, payment.failed, order.paid,
//     refund.created, refund.processed, transfer.processed
// - Reconciles cleanly across Flow 1 (platform_payments) and
//   Flow 2 (seller_payment_transfers + store_orders) without mixing accounts.
// ============================================================================

import { PagesContext, errorJson, json, sanitizeText } from '../_shared';
import { verifyEdgeRazorpayWebhookSignature } from './_razorpay';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from './platform/create-order';

interface RazorpayWebhookPayload {
  event?: string;
  event_id?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    order?: { entity?: { id?: string; amount?: number; status?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
    transfer?: { entity?: { id?: string; source?: string; status?: string } };
  };
}

const SUPPORTED_EVENTS = new Set([
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.created',
  'refund.processed',
  'transfer.processed',
]);

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const webhookSecret = (env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return errorJson(
      'Integration Required: RAZORPAY_WEBHOOK_SECRET is not configured in Cloudflare Pages Secrets.',
      503
    );
  }

  const signature = (request.headers.get('X-Razorpay-Signature') || '').trim();
  if (!signature) {
    return errorJson('Missing X-Razorpay-Signature header.', 401);
  }

  // SECURITY: Read exact raw request body bytes as string before JSON.parse
  const rawBody = await request.text();
  const sigValid = await verifyEdgeRazorpayWebhookSignature(env, rawBody, signature);
  if (!sigValid) {
    return errorJson('Invalid Razorpay webhook HMAC-SHA256 signature.', 401);
  }

  let body: RazorpayWebhookPayload;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return errorJson('Invalid webhook JSON payload.', 400);
  }

  const eventType = sanitizeText(body.event || 'unknown', 80);
  const paymentEntity = body.payload?.payment?.entity;
  const orderEntity = body.payload?.order?.entity;
  const refundEntity = body.payload?.refund?.entity;
  const transferEntity = body.payload?.transfer?.entity;

  const rzpOrderId = sanitizeText(paymentEntity?.order_id || orderEntity?.id || '', 120);
  const rzpPaymentId = sanitizeText(
    paymentEntity?.id || refundEntity?.payment_id || transferEntity?.source || '',
    120
  );
  const rzpRefundId = sanitizeText(refundEntity?.id || '', 120);

  const eventId = sanitizeText(
    request.headers.get('X-Razorpay-Event-Id') ||
      body.event_id ||
      `${eventType}:${rzpRefundId || rzpPaymentId || rzpOrderId || signature.slice(0, 20)}`,
    120
  );

  // Strict idempotency check (handles Razorpay retries and duplicate deliveries safely)
  const existing = await env.DB.prepare(
    'SELECT event_id FROM payment_webhook_events WHERE event_id = ? LIMIT 1'
  )
    .bind(eventId)
    .first();

  if (existing) {
    return json({ ok: true, idempotentDuplicate: true, eventId, eventType });
  }

  if (!SUPPORTED_EVENTS.has(eventType)) {
    await env.DB.prepare(
      `INSERT INTO payment_webhook_events
        (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
       VALUES (?, 'razorpay', ?, 'platform_subscription', ?, 1, ?, datetime('now'))`
    )
      .bind(eventId, eventType, rzpOrderId || rzpPaymentId, rawBody.slice(0, 8000))
      .run();
    return json({ ok: true, ignoredUnsupportedEvent: true, eventId, eventType });
  }

  // Locate Flow 1 (platform_payments) OR Flow 2 (seller_payment_transfers) without ever mixing them
  type PlatformRow = {
    id: number;
    website_id: string | null;
    owner_id: string;
    purpose: string;
    plan_code: string;
    billing_cycle: string;
    base_amount_inr: number;
    gst_amount_inr: number;
    amount_inr: number;
    setup_fee_inr: number;
    subscription_id: number | null;
    notes_json?: string;
  };

  const platformRow = rzpOrderId
    ? await env.DB.prepare(
        `SELECT id, website_id, owner_id, purpose, plan_code, billing_cycle, base_amount_inr, gst_amount_inr, amount_inr, setup_fee_inr, subscription_id, notes_json
         FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1`
      )
        .bind(rzpOrderId)
        .first<PlatformRow>()
    : rzpPaymentId
      ? await env.DB.prepare(
          `SELECT id, website_id, owner_id, purpose, plan_code, billing_cycle, base_amount_inr, gst_amount_inr, amount_inr, setup_fee_inr, subscription_id, notes_json
           FROM platform_payments WHERE razorpay_payment_id = ? LIMIT 1`
        )
          .bind(rzpPaymentId)
          .first<PlatformRow>()
      : null;

  const sellerRow =
    !platformRow && (rzpOrderId || rzpPaymentId)
      ? await env.DB.prepare(
          'SELECT id, website_id, store_order_id FROM seller_payment_transfers WHERE razorpay_order_id = ? OR razorpay_payment_id = ? LIMIT 1'
        )
          .bind(rzpOrderId || '__none__', rzpPaymentId || '__none__')
          .first<{ id: number; website_id: string; store_order_id: number }>()
      : null;

  const flowType: 'platform_subscription' | 'seller_order' = sellerRow
    ? 'seller_order'
    : 'platform_subscription';

  // Record verified webhook event BEFORE mutating business tables
  await env.DB.prepare(
    `INSERT INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'razorpay', ?, ?, ?, 1, ?, datetime('now'))`
  )
    .bind(eventId, eventType, flowType, rzpOrderId || rzpPaymentId, rawBody.slice(0, 8000))
    .run();

  let reconciledTarget = 'none';

  // 1. payment.captured & order.paid — mark verified paid & activate plan/order
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    if (platformRow) {
      reconciledTarget = `platform_payments:${platformRow.id}`;
      let subscriptionId = platformRow.subscription_id;
      if (platformRow.website_id && platformRow.plan_code && !subscriptionId) {
        const planExists = await env.DB.prepare('SELECT code FROM subscription_plans WHERE code = ? LIMIT 1')
          .bind(platformRow.plan_code)
          .first();
        if (planExists) {
          const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.has(platformRow.plan_code);
          const isOneTime =
            platformRow.billing_cycle === 'one_time' ||
            platformRow.purpose === 'website_purchase' ||
            isWebsitePackage;

          if (isOneTime) {
            // One-time website purchases do not expire: current_period_end is NULL
            const subRes = await env.DB.prepare(
              `INSERT INTO tenant_subscriptions
                (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
                 total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
                 current_period_start, current_period_end, created_at, updated_at)
               VALUES (?, ?, ?, 'one_time', 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), NULL, datetime('now'), datetime('now'))`
            )
              .bind(
                platformRow.website_id,
                platformRow.owner_id,
                platformRow.plan_code,
                platformRow.base_amount_inr,
                platformRow.gst_amount_inr,
                platformRow.amount_inr,
                platformRow.setup_fee_inr,
                rzpPaymentId || rzpOrderId
              )
              .run();
            subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
          } else {
            const durationExpr = platformRow.billing_cycle === 'yearly' ? '+365 days' : '+30 days';
            const subRes = await env.DB.prepare(
              `INSERT INTO tenant_subscriptions
                (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
                 total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
                 current_period_start, current_period_end, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
            )
              .bind(
                platformRow.website_id,
                platformRow.owner_id,
                platformRow.plan_code,
                platformRow.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
                platformRow.base_amount_inr,
                platformRow.gst_amount_inr,
                platformRow.amount_inr,
                platformRow.setup_fee_inr,
                rzpPaymentId || rzpOrderId,
                durationExpr
              )
              .run();
            subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
          }
        }
      }
      let notesObj: Record<string, any> = {};
      try {
        notesObj = JSON.parse(platformRow.notes_json || '{}');
      } catch {}
      notesObj.orderState = 'ACTIVE';
      notesObj.deliveryStatus = 'DELIVERY_READY';
      notesObj.deliveredAt = new Date().toISOString();
      notesObj.provisioningError = null;

      await env.DB.prepare(
        `UPDATE platform_payments
         SET status = 'paid',
             signature_verified = 1,
             razorpay_payment_id = COALESCE(NULLIF(?, ''), razorpay_payment_id),
             subscription_id = COALESCE(?, subscription_id),
             notes_json = ?,
             paid_at = COALESCE(paid_at, datetime('now')),
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(rzpPaymentId, subscriptionId, JSON.stringify(notesObj), platformRow.id)
        .run();
    } else if (sellerRow) {
      reconciledTarget = `seller_payment_transfers:${sellerRow.id}`;
      await env.DB.prepare(
        `UPDATE seller_payment_transfers
         SET status = 'routed', signature_verified = 1,
             razorpay_payment_id = COALESCE(NULLIF(?, ''), razorpay_payment_id),
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(rzpPaymentId, sellerRow.id)
        .run();
      await env.DB.prepare(
        `UPDATE store_orders
         SET payment_status = 'paid', order_status = 'confirmed',
             gateway_payment_id = COALESCE(NULLIF(?, ''), gateway_payment_id),
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(rzpPaymentId, sellerRow.store_order_id)
        .run();
    }
  }
  // 2. payment.failed — mark failed only if not already paid
  else if (eventType === 'payment.failed') {
    if (platformRow) {
      reconciledTarget = `platform_payments:${platformRow.id}`;
      await env.DB.prepare(
        `UPDATE platform_payments SET status = 'failed', updated_at = datetime('now') WHERE id = ? AND status != 'paid'`
      )
        .bind(platformRow.id)
        .run();
    } else if (sellerRow) {
      reconciledTarget = `seller_payment_transfers:${sellerRow.id}`;
      await env.DB.prepare(
        `UPDATE seller_payment_transfers SET status = 'failed', updated_at = datetime('now') WHERE id = ? AND status = 'created'`
      )
        .bind(sellerRow.id)
        .run();
      await env.DB.prepare(
        `UPDATE store_orders SET payment_status = 'failed', updated_at = datetime('now') WHERE id = ? AND payment_status != 'paid'`
      )
        .bind(sellerRow.store_order_id)
        .run();
    }
  }
  // 3. refund.created & refund.processed — record in refunds ledger + update order/payment status
  else if (eventType === 'refund.created' || eventType === 'refund.processed') {
    const refundStatus = eventType === 'refund.processed' ? 'processed' : 'created';
    const refundAmountInr = refundEntity?.amount ? Math.round(Number(refundEntity.amount) / 100) : 0;

    try {
      await env.DB.prepare(
        `INSERT INTO refunds
          (flow_type, website_id, platform_payment_id, store_order_id, razorpay_payment_id, razorpay_refund_id, amount_inr, reason, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Razorpay webhook refund update', ?, datetime('now'), datetime('now'))
         ON CONFLICT(razorpay_refund_id) DO UPDATE SET
           status = excluded.status,
           updated_at = datetime('now')`
      )
        .bind(
          platformRow ? 'platform_payment' : 'seller_order',
          platformRow?.website_id || sellerRow?.website_id || null,
          platformRow?.id || null,
          sellerRow?.store_order_id || null,
          rzpPaymentId,
          rzpRefundId || `rfnd_${eventId}`,
          refundAmountInr,
          refundStatus
        )
        .run();
    } catch {
      // Optional if migration 0005 not yet applied
    }

    if (eventType === 'refund.processed') {
      if (platformRow) {
        reconciledTarget = `platform_payments:${platformRow.id}`;
        await env.DB.prepare(
          `UPDATE platform_payments SET status = 'refunded', refund_id = COALESCE(NULLIF(?, ''), refund_id), updated_at = datetime('now') WHERE id = ?`
        )
          .bind(rzpRefundId, platformRow.id)
          .run();
      } else if (sellerRow) {
        reconciledTarget = `seller_payment_transfers:${sellerRow.id}`;
        await env.DB.prepare(
          `UPDATE seller_payment_transfers SET status = 'reversed', updated_at = datetime('now') WHERE id = ?`
        )
          .bind(sellerRow.id)
          .run();
        await env.DB.prepare(
          `UPDATE store_orders SET payment_status = 'refunded', updated_at = datetime('now') WHERE id = ?`
        )
          .bind(sellerRow.store_order_id)
          .run();
      }
    } else {
      reconciledTarget = platformRow
        ? `refund_created:platform_payments:${platformRow.id}`
        : sellerRow
          ? `refund_created:seller_payment_transfers:${sellerRow.id}`
          : 'refund_created';
    }
  }
  // 4. transfer.processed — mark seller Razorpay Route settlement completed
  else if (eventType === 'transfer.processed' && sellerRow) {
    reconciledTarget = `seller_payment_transfers:${sellerRow.id}`;
    const transferId = sanitizeText(transferEntity?.id || '', 120);
    await env.DB.prepare(
      `UPDATE seller_payment_transfers
       SET status = 'settled', razorpay_transfer_id = COALESCE(NULLIF(?, ''), razorpay_transfer_id), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(transferId, sellerRow.id)
      .run();
  }

  return json({
    ok: true,
    processed: true,
    eventId,
    eventType,
    flowType,
    reconciledTarget,
  });
}
