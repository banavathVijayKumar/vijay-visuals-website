// ============================================================================
// POST /api/webhooks/cashfree — Production Cashfree Webhook Handler (Cloudflare Edge)
// - Requires a dedicated CASHFREE_WEBHOOK_SECRET; CASHFREE_CLIENT_SECRET is never
//   accepted as a webhook signing-secret fallback
// - Verifies x-webhook-signature Base64 HMAC-SHA256 on exact raw body + timestamp
// - Supports OPTIONS preflight and GET health checks for dashboard verification
// - Enforces strict idempotency via payment_webhook_events(event_id PK)
// - Handles Cashfree PG events: PAYMENT_SUCCESS_WEBHOOK, ORDER_PAID_WEBHOOK,
//   PAYMENT_FAILED_WEBHOOK, PAYMENT_USER_DROPPED_WEBHOOK and explicit
//   CANCELLED / EXPIRED terminal states
// - Success events are honoured only after authoritative provider verification
// - Dual-ledger atomic reconciliation across cashfree_payments and store_orders
// ============================================================================

import {
  PagesContext,
  errorJson,
  handleOptions,
  json,
  readBoundedText,
  sanitizeText,
  writeAuditLog,
} from '../_shared';
import { PLATFORM_CONTACT } from '../_platformContact';
import {
  customerApprovalBlockedResponse,
  finalizeCashfreePlatformRefund,
  provisionLifetimeEntitlement,
} from '../_tenantAccess';
import { FREE_START_PLAN_CODE, isAuthorizedWebsitePackageCode } from '../_planTiers';
import {
  sendTransactionalEmail,
  buildPaymentReceiptEmailHtml,
  buildStorePaymentReceiptEmailHtml,
  buildStorePaymentWhatsAppText,
  resolveVerifiedTenantSender,
} from '../_email';
import { sendWhatsAppNotification } from '../_whatsapp';
import { resolveTenantPublicUrl } from '../_tenantUrl';
import {
  checkCashfreeWebhookTimestampFreshness,
  fetchEdgeCashfreeOrder,
  fetchEdgeCashfreeOrderPayments,
  getSafeCashfreeNotifyUrl,
  getTrimmedEnvVar,
  verifyEdgeCashfreeWebhookSignature,
} from '../payments/_cashfree';
import {
  buildCashfreeRefundWebhookEventId,
  buildCashfreeWebhookEventId,
  cashfreeNotificationIdempotencyKey,
  cashfreeSettlementIdempotencyKey,
  normalizeCashfreePaymentId,
  normalizeCashfreeRefundId,
  parseCashfreeJsonPreservingLargeIds,
} from '../payments/_cashfreeIdentity';
import { autoAssignPaidOrder } from '../delivery/_autoAssignment';
import type { EdgeCashfreePaymentEntity } from '../payments/_cashfree';

const NON_SUCCESS_PAYMENT_STATUSES = new Set([
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'USER_DROPPED',
  'REFUNDED',
  'ABANDONED',
]);

const CANCELLED_EVENT_TYPES = new Set([
  'CANCELLED',
  'CANCELLED_WEBHOOK',
  'ORDER_CANCELLED',
  'ORDER_CANCELLED_WEBHOOK',
  'PAYMENT_CANCELLED',
  'PAYMENT_CANCELLED_WEBHOOK',
]);

const EXPIRED_EVENT_TYPES = new Set([
  'EXPIRED',
  'EXPIRED_WEBHOOK',
  'ORDER_EXPIRED',
  'ORDER_EXPIRED_WEBHOOK',
  'PAYMENT_EXPIRED',
  'PAYMENT_EXPIRED_WEBHOOK',
]);

function normalizeWebhookState(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Explicit terminal states are recognised before any success handling. */
function terminalWebhookState(
  eventType: string,
  body: CashfreeWebhookPayload
): 'CANCELLED' | 'EXPIRED' | null {
  const event = normalizeWebhookState(eventType);
  if (EXPIRED_EVENT_TYPES.has(event)) return 'EXPIRED';
  if (CANCELLED_EVENT_TYPES.has(event)) return 'CANCELLED';

  const reportedStates = [
    normalizeWebhookState(body.data?.order?.order_status),
    normalizeWebhookState(body.data?.payment?.payment_status),
  ];
  if (reportedStates.includes('EXPIRED')) return 'EXPIRED';
  if (reportedStates.includes('CANCELLED')) return 'CANCELLED';
  return null;
}

function toIntegerPaise(amount: unknown): number {
  if (typeof amount === 'string' && amount.trim() === '') return -1;
  const num = Number(amount);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return -1;
  return Math.round(num * 100);
}

function approvedPaymentTemplate(env: PagesContext['env']): { name: string; language: string } | null {
  const name = sanitizeText(env.WHATSAPP_PAYMENT_TEMPLATE_NAME, 512);
  const language = sanitizeText(env.WHATSAPP_PAYMENT_TEMPLATE_LANGUAGE, 16);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  if (!/^[A-Za-z]{2}(?:[-_][A-Za-z0-9]{2,4})?$/.test(language)) return null;
  return { name, language };
}

function retryablePaidProvisioning(rawNotes: unknown): boolean {
  let notes: Record<string, any> = {};
  try {
    notes = JSON.parse(String(rawNotes || '{}'));
  } catch {}
  const orderState = String(notes.orderState || '').toUpperCase();
  const deliveryStatus = String(notes.deliveryStatus || '').toUpperCase();
  return (
    orderState === 'PROVISIONING' ||
    orderState === 'DELIVERY_FAILED' ||
    deliveryStatus === 'DELIVERY_FAILED'
  );
}

interface CashfreeWebhookPayload {
  type?: string;
  event?: string;
  event_time?: string;
  data?: {
    order?: {
      order_id?: string;
      order_status?: string;
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
    refund?: {
      cf_refund_id?: number | string;
      cf_payment_id?: number | string;
      refund_id?: string;
      order_id?: string;
      refund_amount?: number;
      refund_currency?: string;
      refund_status?: string;
      refund_arn?: string;
      refund_note?: string;
      status_description?: string;
    };
    auto_refund?: {
      cf_refund_id?: number | string;
      cf_payment_id?: number | string;
      refund_id?: string;
      order_id?: string;
      refund_amount?: number;
      refund_currency?: string;
      refund_status?: string;
      refund_reason?: string;
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
  const hasDedicatedWebhookSecret = Boolean(
    getTrimmedEnvVar(context.env, 'CASHFREE_WEBHOOK_SECRET')
  );
  return json({
    ok: true,
    status: hasDedicatedWebhookSecret ? 'active' : 'setup_required',
    gateway: 'Cashfree Payment Gateway',
    apiVersion: '2023-08-01',
    endpoint,
    webhookSecretConfigured: hasDedicatedWebhookSecret,
    message: hasDedicatedWebhookSecret
      ? 'Cashfree webhook endpoint is ready and accepting signed requests.'
      : 'CASHFREE_WEBHOOK_SECRET is not configured; webhook POST requests are rejected.',
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const signature = (request.headers.get('x-webhook-signature') || '').trim();
  const timestamp = (request.headers.get('x-webhook-timestamp') || '').trim();
  const rawBody = await readBoundedText(request);
  if (rawBody === null) return errorJson('Webhook payload is too large.', 413);

  // 1. Strict Cryptographic Signature Check (Enforced for ALL POST requests)
  // Per security requirements: Never bypass HMAC verification based on "TEST", synthetic IDs, or email.
  if (!signature || !timestamp) {
    return errorJson('Missing x-webhook-signature or x-webhook-timestamp header.', 401);
  }

  // Reject malformed or stale/future timestamps before any business logic.
  // The exact original header string is still used for HMAC verification below.
  const timestampCheck = checkCashfreeWebhookTimestampFreshness(timestamp);
  if (!timestampCheck.ok) {
    const reason =
      timestampCheck.reason === 'stale'
        ? 'stale'
        : timestampCheck.reason === 'future'
          ? 'outside the allowed future tolerance'
          : 'malformed';
    return errorJson(`Invalid Cashfree webhook timestamp: ${reason}.`, 401);
  }

  // A dedicated webhook signing secret is mandatory. CASHFREE_CLIENT_SECRET
  // must never be accepted as a substitute for webhook verification.
  const hasDedicatedWebhookSecret = Boolean(getTrimmedEnvVar(env, 'CASHFREE_WEBHOOK_SECRET'));

  if (!hasDedicatedWebhookSecret) {
    return errorJson('CASHFREE_WEBHOOK_SECRET is not configured in Cloudflare Pages environment variables.', 500);
  }

  const sigValid = await verifyEdgeCashfreeWebhookSignature(env, rawBody, signature, timestamp);
  if (!sigValid) {
    return errorJson('Invalid Cashfree webhook HMAC-SHA256 signature.', 401);
  }

  // Parse a lossless copy for business logic. The ORIGINAL rawBody remains the
  // only input to HMAC verification and is stored verbatim in the event ledger.
  let body: CashfreeWebhookPayload;
  try {
    body = parseCashfreeJsonPreservingLargeIds<CashfreeWebhookPayload>(rawBody);
  } catch {
    return errorJson('Invalid webhook JSON payload.', 400);
  }

  const eventType = sanitizeText(body.type || body.event || 'UNKNOWN', 80);
  const orderData = body.data?.order;
  const paymentData = body.data?.payment;
  const refundData = body.data?.refund || body.data?.auto_refund;
  const isRefundEvent =
    eventType === 'REFUND_STATUS_WEBHOOK' || eventType === 'AUTO_REFUND_STATUS_WEBHOOK';

  const orderId = sanitizeText(refundData?.order_id || orderData?.order_id || '', 120);
  const rawPaymentId = paymentData?.cf_payment_id ?? refundData?.cf_payment_id;
  let cfPaymentId = normalizeCashfreePaymentId(rawPaymentId);
  if (
    rawPaymentId !== undefined &&
    rawPaymentId !== null &&
    String(rawPaymentId).trim() !== '' &&
    !cfPaymentId
  ) {
    return errorJson('Unsafe Cashfree cf_payment_id; refusing a truncated payment identity.', 400);
  }

  const merchantRefundId = sanitizeText(refundData?.refund_id || '', 120);
  const cfRefundId = normalizeCashfreeRefundId(refundData?.cf_refund_id);
  if (isRefundEvent && !merchantRefundId && !cfRefundId) {
    return errorJson('Refund webhook did not include a refund identity.', 400);
  }

  // Stable across gateway retries: never derived from a per-delivery request ID.
  // Refund events are keyed by refund identity, not payment identity, so multiple
  // refunds on the same order cannot collapse into one ledger event.
  const eventId = isRefundEvent
    ? buildCashfreeRefundWebhookEventId(eventType, merchantRefundId, cfRefundId, orderId)
    : buildCashfreeWebhookEventId(eventType, orderId, cfPaymentId, timestamp);
  // Refund events share a cf_payment_id, so dedupe them by refund identity.
  const webhookLedgerIdentity = isRefundEvent
    ? cfRefundId || merchantRefundId
    : cfPaymentId;

  // Flow type follows the persisted payment record, not the event name.
  let webhookFlowType = 'seller_order';

  // Strict idempotency check (safely ignores duplicate Cashfree retries)
  const existingEvent = await env.DB.prepare(
    `SELECT event_id FROM payment_webhook_events
     WHERE event_id = ?
        OR (provider = 'cashfree' AND event_type = ? AND payment_id_normalized <> '' AND payment_id_normalized = ?)
     LIMIT 1`
  )
    .bind(eventId, eventType, webhookLedgerIdentity)
    .first();

  if (existingEvent) {
    return json({ ok: true, idempotentDuplicate: true, eventId, eventType });
  }

  // Explicit CANCELLED / EXPIRED states are terminal and non-entitling. They are
  // handled before success logic so a mislabelled or conflicting success event
  // can never mark a payment PAID or provision an entitlement.
  if (!isRefundEvent) {
    const terminalState = terminalWebhookState(eventType, body);
    if (terminalState) {
      if (!orderId) {
        return errorJson('Cancellation or expiry webhook did not include an order_id; no ledger was changed.', 400);
      }

      const terminalPayment = await env.DB.prepare(
        'SELECT id, entity_type, notes_json FROM cashfree_payments WHERE order_id = ? LIMIT 1'
      )
        .bind(orderId)
        .first<{ id: number; entity_type: string; notes_json: string }>();

      if (terminalPayment?.entity_type === 'platform_package') {
        webhookFlowType = 'platform_subscription';
      }

      let terminalNotes: Record<string, any> = {};
      try {
        terminalNotes = JSON.parse(terminalPayment?.notes_json || '{}');
      } catch {}
      terminalNotes.terminalWebhookStatus = terminalState;
      terminalNotes.terminalWebhookEvent = eventType;
      terminalNotes.paidViaWebhook = false;
      terminalNotes.orderState = terminalState;
      terminalNotes.deliveryStatus = 'NOT_DELIVERED';

      // EXPIRED is stored explicitly in notes; the ledger CHECK column only
      // accepts CANCELLED as the non-paid terminal state.
      await env.DB.prepare(
        `UPDATE cashfree_payments
         SET status = 'CANCELLED',
             notes_json = ?,
             raw_webhook_json = ?,
             updated_at = datetime('now')
         WHERE order_id = ? AND status NOT IN ('PAID', 'REFUNDED')`
      )
        .bind(JSON.stringify(terminalNotes), rawBody, orderId)
        .run();

      await env.DB.prepare(
        `UPDATE platform_payments
         SET status = 'failed',
             notes_json = ?,
             updated_at = datetime('now')
         WHERE razorpay_order_id = ? AND status NOT IN ('paid', 'refunded')`
      )
        .bind(JSON.stringify(terminalNotes), `cf_${orderId}`)
        .run();

      const terminalStoreOrder = await env.DB.prepare(
        'SELECT id, payment_status FROM store_orders WHERE gateway_order_id = ? LIMIT 1'
      )
        .bind(orderId)
        .first<{ id: number; payment_status: string }>();

      if (terminalStoreOrder && terminalStoreOrder.payment_status !== 'paid') {
        await env.DB.prepare(
          `UPDATE store_orders
           SET payment_status = 'failed',
               order_status = 'cancelled',
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(terminalStoreOrder.id)
          .run();
      }

      return json({
        ok: true,
        eventId,
        eventType,
        orderId,
        cfPaymentId,
        terminalStatus: terminalState,
        ledgerStatus: 'CANCELLED',
        paymentMarkedPaid: false,
      });
    }
  }

  // Process refund events separately. A refund webhook must never be treated
  // as a successful payment, and must never re-provision an entitlement.
  if (isRefundEvent && refundData) {
    if (!orderId) {
      return errorJson('Refund webhook did not include an order_id; no ledger was changed.', 400);
    }

    const providerStatus = String(refundData.refund_status || '').toUpperCase();
    const amountInr = Number(refundData.refund_amount || 0);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return errorJson('Refund webhook did not include a valid refund amount.', 400);
    }
    const refundReason = sanitizeText(
      (refundData as any).refund_note ||
        (refundData as any).refund_reason ||
        'Cashfree refund status update',
      300
    );

    const refundRow = merchantRefundId
      ? await env.DB.prepare(
          'SELECT id, platform_payment_id, status, amount_inr FROM refunds WHERE razorpay_refund_id = ? LIMIT 1'
        )
          .bind(merchantRefundId)
          .first<{ id: number; platform_payment_id: number | null; status: string; amount_inr: number }>()
      : null;

    const linkedPayment = await env.DB.prepare(
      `SELECT id, subscription_id, razorpay_payment_id, status, refund_id, amount_inr
       FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1`
    )
      .bind(`cf_${orderId}`)
      .first<{
        id: number;
        subscription_id: number | null;
        razorpay_payment_id: string | null;
        status: string;
        refund_id: string | null;
        amount_inr: number;
      }>();

    if (linkedPayment || refundRow?.platform_payment_id) {
      webhookFlowType = 'platform_subscription';
    }

    const paymentId = Number(linkedPayment?.id || refundRow?.platform_payment_id || 0);

    // A signed refund webhook is not permission to revoke access. Finalize only
    // when the merchant refund id is known locally, the payment can be linked,
    // and the reported amount matches the captured amount. Fail closed so the
    // gateway can retry after an operator reconciles the ledger.
    const capturedAmountInr = Number(linkedPayment?.amount_inr || refundRow?.amount_inr || 0);
    const amountMatchesCaptured =
      capturedAmountInr > 0 && Math.abs(amountInr - capturedAmountInr) <= 0.01;

    if (providerStatus === 'SUCCESS') {
      if (!merchantRefundId || !refundRow) {
        return errorJson(
          'Refund webhook requires a known merchant refund_id; no ledger or entitlement was changed.',
          400
        );
      }
      if (!paymentId) {
        return errorJson(
          'Refund webhook could not be linked to a captured payment; no ledger or entitlement was changed.',
          409
        );
      }
      if (!amountMatchesCaptured) {
        return errorJson(
          'Refund amount does not match the captured payment; no ledger or entitlement was changed.',
          409
        );
      }
    }

    const refundFinalized = providerStatus === 'SUCCESS' && paymentId > 0;

    if (refundFinalized) {
      await finalizeCashfreePlatformRefund(env, {
        paymentId,
        orderId,
        merchantRefundId,
        cfRefundId,
        amountInr,
        reason: refundReason,
        providerStatus,
        actorId: 'cashfree_webhook',
        rawWebhookJson: rawBody,
      });
    } else if (['CANCELLED', 'REJECTED', 'ONHOLD'].includes(providerStatus)) {
      if (merchantRefundId) {
        await env.DB.prepare(
          `UPDATE refunds SET status = 'failed', updated_at = datetime('now')
           WHERE razorpay_refund_id = ? AND status <> 'processed'`
        )
          .bind(merchantRefundId)
          .run();
      }
      // A failed refund leaves the original successful payment untouched.
    } else if (merchantRefundId) {
      await env.DB.prepare(
        `UPDATE refunds SET status = 'created', updated_at = datetime('now')
         WHERE razorpay_refund_id = ? AND status NOT IN ('processed', 'failed')`
      )
        .bind(merchantRefundId)
        .run();
    }

    // Same durable event ledger as payment webhooks, keyed by refund identity.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO payment_webhook_events
        (event_id, provider, event_type, flow_type, reference_id, signature_verified,
         payment_id_normalized, payload_json, processed_at)
       VALUES (?, 'cashfree', ?, ?, ?, 1, ?, ?, datetime('now'))`
    )
      .bind(
        eventId,
        eventType,
        webhookFlowType,
        orderId,
        webhookLedgerIdentity,
        rawBody
      )
      .run();

    await writeAuditLog(env, {
      actorId: 'cashfree_webhook',
      actorRole: 'system',
      action: `cashfree_${eventType.toLowerCase()}`,
      targetType: 'refunds',
      targetId: merchantRefundId || cfRefundId || orderId,
      details: {
        eventId,
        eventType,
        orderId,
        cfPaymentId,
        merchantRefundId,
        cfRefundId,
        refundAmountInr: amountInr,
        providerStatus,
        refundFinalized,
      },
    });

    return json({
      ok: true,
      eventId,
      eventType,
      orderId,
      cfPaymentId,
      cfRefundId,
      merchantRefundId,
      refundStatus: providerStatus,
      refundFinalized,
    });
  } else if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID_WEBHOOK') {
    if (!orderId) {
      return errorJson('Missing order_id in Cashfree payment webhook payload.', 400);
    }

    // A signed success event name and payload are not payment proof. Every
    // success branch must confirm a real SUCCESS payment from Cashfree's
    // authoritative order-payments API before writing a PAID ledger state.
    const reportedPaymentStatus = normalizeWebhookState(paymentData?.payment_status);
    const reportedOrderStatus = normalizeWebhookState(orderData?.order_status);
    if (
      NON_SUCCESS_PAYMENT_STATUSES.has(reportedPaymentStatus) ||
      NON_SUCCESS_PAYMENT_STATUSES.has(reportedOrderStatus)
    ) {
      return errorJson(
        'Success webhook conflicts with a non-success payment status; no ledger was marked paid.',
        409
      );
    }

    let providerVerifiedPayment: EdgeCashfreePaymentEntity | null = null;
    try {
      const providerPayments = await fetchEdgeCashfreeOrderPayments(env, orderId);
      providerVerifiedPayment =
        providerPayments.find(
          (p) =>
            normalizeWebhookState(p.payment_status) === 'SUCCESS' &&
            p.cf_payment_id != null &&
            String(p.cf_payment_id).trim() !== ''
        ) || null;
    } catch (providerErr) {
      console.error(
        'Cashfree provider confirmation failed for success webhook:',
        providerErr instanceof Error ? providerErr.message : String(providerErr)
      );
      return errorJson(
        'Unable to confirm success with Cashfree provider payments; no ledger was marked paid.',
        502
      );
    }

    if (!providerVerifiedPayment) {
      return errorJson(
        'Cashfree provider payments did not confirm a successful payment; no ledger was marked paid.',
        409
      );
    }

    const providerPaymentId = normalizeCashfreePaymentId(providerVerifiedPayment.cf_payment_id);
    if (!providerPaymentId) {
      return errorJson(
        'Authoritative provider payment ID is unsafe or truncated; no ledger was marked paid.',
        400
      );
    }
    if (cfPaymentId && cfPaymentId !== providerPaymentId) {
      return errorJson(
        'Webhook payment ID does not match the authoritative Cashfree payment ID; no ledger was marked paid.',
        409
      );
    }
    cfPaymentId = providerPaymentId;

    // 1. Retrieve authoritative records from Preview D1
    const existingPayment = await env.DB.prepare(
      'SELECT * FROM cashfree_payments WHERE order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{
        id: number;
        status: string;
        user_id: string;
        user_email?: string | null;
        user_phone?: string | null;
        website_id: string | null;
        entity_type: string;
        reference_id: string;
        base_amount_inr: number;
        gst_amount_inr: number;
        amount_inr: number;
        notes_json: string;
      }>();

    if (existingPayment?.entity_type === 'platform_package') {
      // payment_webhook_events.flow_type only accepts platform_subscription,
      // seller_order or domain_service (migration 0003). Keep the payment's
      // entity_type unchanged while using the ledger-compatible flow label.
      webhookFlowType = 'platform_subscription';
    }

    const storeOrder = await env.DB.prepare(
      'SELECT id, website_id, owner_id, order_number, customer_name, customer_email, customer_phone, total_inr, payment_status FROM store_orders WHERE gateway_order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{
        id: number;
        website_id: string;
        owner_id: string;
        order_number: string;
        customer_name?: string | null;
        customer_email?: string | null;
        customer_phone?: string | null;
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
        `INSERT OR IGNORE INTO payment_webhook_events
          (event_id, provider, event_type, flow_type, reference_id, signature_verified,
           payment_id_normalized, payload_json, processed_at)
         VALUES (?, 'cashfree', ?, 'seller_order', ?, 1, ?, ?, datetime('now'))`
      )
        .bind(eventId, eventType, orderId, cfPaymentId, rawBody)
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

    // Prefer the provider-confirmed payment values over signed payload values.
    let receivedOrderAmount =
      providerVerifiedPayment?.payment_amount ?? orderData?.order_amount;
    let receivedPaymentAmount =
      providerVerifiedPayment?.payment_amount ?? paymentData?.payment_amount;
    let receivedCurrency = String(
      providerVerifiedPayment?.payment_currency ||
        paymentData?.payment_currency ||
        orderData?.order_currency ||
        ''
    )
      .trim()
      .toUpperCase();

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
      const retryPaidProvisioning =
        existingPayment.status === 'PAID' && retryablePaidProvisioning(existingPayment.notes_json);
      // REFUNDED is terminal: a delayed success webhook must not re-mark the
      // payment PAID or re-provision an entitlement after a refund.
      if (
        existingPayment.status === 'REFUNDED'
          ? false
          : existingPayment.status !== 'PAID' || retryPaidProvisioning
      ) {
        const paymentMethod = paymentData?.payment_group || 'cashfree_pg';
        const bankRef = paymentData?.bank_reference || null;
        const paymentTime = paymentData?.payment_time || new Date().toISOString();

        let notes: Record<string, any> = {};
        try {
          notes = JSON.parse(existingPayment.notes_json || '{}');
        } catch {}

        notes.orderState = retryPaidProvisioning ? 'PROVISIONING' : 'ACTIVE';
        notes.deliveryStatus = retryPaidProvisioning ? 'PROVISIONING' : 'DELIVERY_READY';
        notes.gateway = 'cashfree';
        notes.cfPaymentId = cfPaymentId;
        notes.paidViaWebhook = true;
        notes.provisioningError = null;
        if (!retryPaidProvisioning) notes.deliveredAt = new Date().toISOString();

        // Atomic claim: only the delivery that wins this conditional update may
        // provision entitlements. A concurrent duplicate sees zero changes and
        // is treated as an idempotent retry instead of a second fulfilment.
        const paidTransition = retryPaidProvisioning
          ? { meta: { changes: 1 } }
          : await env.DB.prepare(
              `UPDATE cashfree_payments
               SET status = 'PAID',
                   cf_payment_id = ?,
                   payment_method = ?,
                   bank_reference = ?,
                   payment_time = ?,
                   notes_json = ?,
                   raw_webhook_json = ?,
                   updated_at = datetime('now')
               WHERE order_id = ? AND status <> 'PAID'`
            )
              .bind(cfPaymentId, paymentMethod, bankRef, paymentTime, JSON.stringify(notes), rawBody, orderId)
              .run();

        if (paidTransition.meta?.changes === 0) {
          return json(
            { ok: true, idempotentDuplicate: true, eventId, eventType, orderId, cfPaymentId },
            200
          );
        }

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

        // Provision entitlement BEFORE publishing. A payment never publishes
        // a website until its entitlement has been persisted successfully.
        try {
          if (existingPayment.entity_type === 'platform_package' && existingPayment.website_id) {
            const planCode = String(existingPayment.reference_id || '').toLowerCase();
            const isWebsitePackage = isAuthorizedWebsitePackageCode(planCode);
            const linkedPayment = await env.DB.prepare(
              'SELECT id, billing_cycle FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1'
            )
              .bind(`cf_${orderId}`)
              .first<{ id: number; billing_cycle: string }>();

            if (isWebsitePackage) {
              const provision = await provisionLifetimeEntitlement(env, {
                websiteId: existingPayment.website_id,
                ownerId: existingPayment.user_id,
                planCode,
                entitlementType:
                  planCode === FREE_START_PLAN_CODE ? 'free_start' : 'one_time_purchase',
                source: 'cashfree_webhook',
                sourceReference: cfPaymentId || '',
                paymentId: linkedPayment?.id,
              });
              if (!provision.ok) {
                console.error('Lifetime entitlement provisioning failed in webhook:', provision.error);
                throw new Error('Lifetime entitlement provisioning failed for this payment.');
              }
            } else {
              const cycle = linkedPayment?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
              const durationExpr = cycle === 'yearly' ? '+365 days' : '+30 days';
              await env.DB.prepare(
                `INSERT INTO tenant_subscriptions
                  (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
                   total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
                   current_period_start, current_period_end, created_at, updated_at)
                 SELECT ?, ?, ?, ?, 'active', ?, ?, ?, 0, 'cashfree', ?,
                        datetime('now'), datetime('now', ?), datetime('now'), datetime('now')
                 WHERE ? <> ''
                   AND NOT EXISTS (
                     SELECT 1 FROM tenant_subscriptions
                     WHERE gateway_subscription_id = ? AND gateway_subscription_id <> ''
                   )`
              )
                .bind(
                  existingPayment.website_id,
                  existingPayment.user_id,
                  planCode,
                  cycle,
                  existingPayment.base_amount_inr,
                  existingPayment.gst_amount_inr,
                  existingPayment.amount_inr,
                  cfPaymentId,
                  durationExpr,
                  cfPaymentId,
                  cfPaymentId
                )
                .run();
            }

            const approvalBlocked = await customerApprovalBlockedResponse(
              env,
              existingPayment.website_id
            );
            if (approvalBlocked) {
              // Payment is verified and entitlement is active, but newly requested
              // work still needs customer acceptance before the site goes live.
              console.warn('Cashfree webhook kept website unpublished pending customer approval.');
            } else {
              await env.DB.prepare(
                `UPDATE customer_website_publications
                 SET status = 'published',
                     published_at = CASE WHEN published_at IS NULL OR published_at = '' THEN datetime('now') ELSE published_at END,
                     updated_at = datetime('now')
                 WHERE website_id = ?`
              )
                .bind(existingPayment.website_id)
                .run();
            }
          }

          // Clear any previous failure marker so a later retry is not repeated.
          notes.orderState = 'ACTIVE';
          notes.deliveryStatus = 'DELIVERY_READY';
          notes.provisioningError = null;
          notes.deliveredAt = new Date().toISOString();
          await env.DB.prepare(
            `UPDATE cashfree_payments
             SET notes_json = ?, updated_at = datetime('now')
             WHERE order_id = ?`
          )
            .bind(JSON.stringify(notes), orderId)
            .run();
        } catch (provErr) {
          const provMessage =
            provErr instanceof Error ? provErr.message : 'Website provisioning failed.';
          notes.orderState = 'DELIVERY_FAILED';
          notes.deliveryStatus = 'DELIVERY_FAILED';
          notes.provisioningError = provMessage;
          await env.DB.prepare(
            `UPDATE cashfree_payments
             SET notes_json = ?, updated_at = datetime('now')
             WHERE order_id = ?`
          )
            .bind(JSON.stringify(notes), orderId)
            .run();
          await writeAuditLog(env, {
            actorId: 'cashfree_webhook',
            actorRole: 'system',
            action: 'cashfree_webhook_provisioning_failed',
            targetType: 'cashfree_payments',
            targetId: String(existingPayment.id),
            details: { error: provMessage, orderId, cfPaymentId },
          });
          throw provErr;
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
          settlement_status, settlement_mode, notes_json, idempotency_key,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, 'INR',
          'pending_activation', 'cashfree_split_pending', ?, ?, datetime('now'), datetime('now')
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
          }),
          cashfreeSettlementIdempotencyKey(orderId, cfPaymentId)
        )
        .run();

      // Paid storefront order automation. The unique order_id constraint and
      // OR IGNORE insert make repeated webhook/verify calls safe.
      await autoAssignPaidOrder(env, Number(storeOrder.id));
    }

    // 6. Verified payment notifications. Storefront orders and platform package
    // payments are separate flows with separate branding, links, and sender identity.
    const customerEmail =
      existingPayment?.user_email || storeOrder?.customer_email || body.data?.customer_details?.customer_email || '';
    const customerPhone =
      existingPayment?.user_phone || storeOrder?.customer_phone || body.data?.customer_details?.customer_phone || '';
    const customerName = storeOrder?.customer_name || body.data?.customer_details?.customer_name || 'Customer';
    const formattedPaid = `₹${(paymentPaise / 100).toLocaleString('en-IN')}`;
    const isStoreOrderPayment = Boolean(storeOrder);

    let storeName = 'Your Store';
    let storeUrl = '';
    let storeOrderNumber = orderId;
    if (storeOrder) {
      storeOrderNumber = storeOrder.order_number || orderId;
      const publication = await env.DB.prepare(
        `SELECT website_id, public_slug, business_name
         FROM customer_website_publications
         WHERE website_id = ?
         LIMIT 1`
      )
        .bind(storeOrder.website_id)
        .first<{ website_id: string; public_slug: string; business_name: string }>();
      storeName = sanitizeText(publication?.business_name || '', 80) || 'Your Store';
      storeUrl = publication
        ? (await resolveTenantPublicUrl(env, publication)).url
        : '';
    }
    const verifiedTenantSender = storeOrder
      ? await resolveVerifiedTenantSender(env, storeOrder.website_id)
      : null;

    if (customerEmail && customerEmail.includes('@')) {
      try {
        const orderPaymentAmount = storeOrder ? `₹${Number(storeOrder.total_inr || 0).toLocaleString('en-IN')}` : formattedPaid;
        const paymentReceiptHtml = isStoreOrderPayment
          ? buildStorePaymentReceiptEmailHtml({
              customerName,
              orderNumber: storeOrderNumber,
              paymentId: cfPaymentId,
              amountFormatted: orderPaymentAmount,
              paymentTime: paymentData?.payment_time || new Date().toISOString(),
              storeName,
              storeUrl,
            })
          : buildPaymentReceiptEmailHtml({
              customerName,
              orderNumber: orderId,
              paymentId: cfPaymentId,
              amountFormatted: formattedPaid,
              paymentTime: paymentData?.payment_time || new Date().toISOString(),
              dashboardUrl: 'https://vijay-visuals-site.pages.dev/dashboard',
            });
        await sendTransactionalEmail(env, {
          to: customerEmail,
          subject: isStoreOrderPayment
            ? `Payment Confirmed: Order #${storeOrderNumber}`
            : `Payment Confirmed: Order #${orderId}`,
          html: paymentReceiptHtml,
          text: isStoreOrderPayment
            ? `Payment confirmed for ${storeName} order #${storeOrderNumber}. Amount: ${orderPaymentAmount}. Payment ID: ${cfPaymentId}.`
            : `Payment confirmed for Order #${orderId}. Amount: ${formattedPaid}. Payment ID: ${cfPaymentId}.`,
          eventType: 'payment_confirmed',
          websiteId: storeOrder?.website_id || existingPayment?.website_id || null,
          audience: isStoreOrderPayment ? 'customer' : 'platform',
          tenantBrandName: isStoreOrderPayment ? storeName : undefined,
          verifiedSenderEmail: isStoreOrderPayment ? verifiedTenantSender?.email : undefined,
          verifiedSenderDomain: isStoreOrderPayment ? verifiedTenantSender?.domain : undefined,
          idempotencyKey: cashfreeNotificationIdempotencyKey('em', orderId, cfPaymentId),
        });
      } catch (notifyErr) {
        console.error('Failed to dispatch payment confirmed email:', notifyErr);
      }
    }

    if (customerPhone) {
      try {
        const waText = isStoreOrderPayment
          ? buildStorePaymentWhatsAppText({
              storeName,
              customerName,
              orderNumber: storeOrderNumber,
              amountFormatted: `₹${Number(storeOrder?.total_inr || 0).toLocaleString('en-IN')}`,
              paymentId: cfPaymentId,
              storeUrl,
            })
          : [
              `🌟 *VIJAY VISUALS — Payment Confirmed* 🌟`,
              ``,
              `Dear ${customerName},`,
              `Your payment of *${formattedPaid}* for Order *#${orderId}* has been verified successfully.`,
              ``,
              `💳 *Transaction ID:* ${cfPaymentId}`,
              `📋 *Status:* Confirmed & Scheduled for Development`,
              `⏱ *Timeline:* 3–5 Business Days`,
              `🔍 *Track Order:* https://vijay-visuals-site.pages.dev/dashboard`,
              ``,
              `Thank you for choosing Vijay Visuals!`,
              `Official Mobile: ${PLATFORM_CONTACT.phone}`,
            ].join('\n');

        const paymentTemplate = approvedPaymentTemplate(env);
        const receiptLink = isStoreOrderPayment
          ? storeUrl
          : 'https://vijay-visuals-site.pages.dev/dashboard';
        await sendWhatsAppNotification(env, {
          toPhone: customerPhone,
          messageText: waText,
          // Business-initiated receipts must use an approved template. A missing
          // template is recorded as setup_required instead of a free-form send.
          requireApprovedTemplate: true,
          templateName: paymentTemplate?.name,
          templateLanguage: paymentTemplate?.language,
          templateComponents: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: sanitizeText(customerName, 80) },
                { type: 'text', text: sanitizeText(formattedPaid, 60) },
                { type: 'text', text: sanitizeText(storeOrderNumber, 120) },
                { type: 'text', text: sanitizeText(cfPaymentId, 120) },
                { type: 'text', text: sanitizeText(receiptLink, 300) },
              ],
            },
          ],
          eventType: isStoreOrderPayment ? 'store_order_payment_confirmed' : 'payment_confirmed',
          websiteId: storeOrder?.website_id || existingPayment?.website_id || null,
          idempotencyKey: cashfreeNotificationIdempotencyKey('wa', orderId, cfPaymentId),
          auditIdempotencyKey: `${cashfreeNotificationIdempotencyKey('wa', orderId, cfPaymentId)}:setup_required`,
        });
      } catch (notifyErr) {
        console.error('Failed to dispatch payment confirmed WhatsApp:', notifyErr);
      }
    }
  } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
    if (!orderId) {
      return errorJson('Failure webhook did not include an order_id; no ledger was changed.', 400);
    }
    // Record failed state. A terminal refund is never overwritten by a late
    // payment-failure callback.
    await env.DB.prepare(
      `UPDATE cashfree_payments
       SET status = 'FAILED',
           raw_webhook_json = ?,
           updated_at = datetime('now')
       WHERE order_id = ? AND status NOT IN ('PAID', 'REFUNDED')`
    )
      .bind(rawBody, orderId)
      .run();

    await env.DB.prepare(
      `UPDATE platform_payments
       SET status = 'failed',
           updated_at = datetime('now')
       WHERE razorpay_order_id = ? AND status NOT IN ('paid', 'refunded')`
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
    `INSERT OR IGNORE INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified,
       payment_id_normalized, payload_json, processed_at)
     VALUES (?, 'cashfree', ?, ?, ?, 1, ?, ?, datetime('now'))`
  )
    .bind(eventId, eventType, webhookFlowType, orderId, cfPaymentId, rawBody)
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
