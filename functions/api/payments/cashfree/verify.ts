// ============================================================================
// POST /api/payments/cashfree/verify
// Flow 1 Cashfree Payment Verification & Automatic Subscription Provisioning
// - Verifies order status directly with Cashfree PG API (https://sandbox.cashfree.com/pg
//   or https://api.cashfree.com/pg) via server-to-server TLS call.
// - Secures payment record in cashfree_payments & mirrors in platform_payments.
// - Idempotent: repeated calls safely return existing subscription state.
// - Activates tenant subscription and website publishing if eligible.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  errorJson,
  json,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';
import {
  customerApprovalBlockedResponse,
  provisionLifetimeEntitlement,
} from '../../_tenantAccess';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from '../platform/create-order';
import {
  fetchEdgeCashfreeOrder,
  fetchEdgeCashfreeOrderPayments,
  getEdgeCashfreeStatus,
} from '../_cashfree';
import { cashfreeSettlementIdempotencyKey, normalizeCashfreePaymentId } from '../_cashfreeIdentity';
import { autoAssignPaidOrder } from '../../delivery/_autoAssignment';

interface CashfreePaymentRow {
  id: number;
  order_id: string;
  cf_order_id: string | null;
  payment_session_id: string | null;
  entity_type: string;
  reference_id: string;
  website_id: string | null;
  user_id: string;
  user_email: string | null;
  user_phone: string | null;
  base_amount_inr: number;
  gst_amount_inr: number;
  amount_inr: number;
  currency: string;
  environment: string;
  status: string;
  cf_payment_id: string | null;
  payment_method: string | null;
  payment_time: string | null;
  bank_reference: string | null;
  notes_json: string;
}

interface VerifyPaymentBody {
  orderId?: string;
  order_id?: string;
  websiteId?: string;
  tenantId?: string | number;
  publishWebsite?: boolean;
}

function toIntegerPaise(amount: unknown): number {
  if (typeof amount === 'string' && amount.trim() === '') return -1;
  const num = Number(amount);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return -1;
  return Math.round(num * 100);
}

/**
 * A PAID row is normally final, but a payment captured before provisioning
 * completed must remain recoverable. notes_json is the durable state marker;
 * no schema change is required.
 */
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

const SAFE_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/;

function normalizeStatus(value: unknown, fallback = 'UNKNOWN'): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || fallback;
}

/**
 * Maps provider state to the CHECK-constrained ledger status columns.
 * `platform_payments.status` only accepts created|paid|failed|refunded, so an
 * unpaid Cashfree order must stay `created` there while the Cashfree ledger
 * may safely track PENDING/FAILED/CANCELLED/REFUNDED.
 */
function mapUnpaidStatus(orderStatus: unknown, payments: unknown) {
  const providerStatus = normalizeStatus(orderStatus);
  const paymentStatuses = Array.isArray(payments)
    ? payments.map((p: any) => normalizeStatus(p?.payment_status, ''))
    : [];

  if (providerStatus === 'REFUNDED') {
    return {
      providerStatus,
      cashfreeStatus: 'REFUNDED' as const,
      platformStatus: 'refunded' as const,
      message: `Payment status is ${providerStatus}. It is refunded and was never verified as a new payment.`,
    };
  }

  const expired =
    providerStatus === 'EXPIRED' || paymentStatuses.some((s) => s === 'EXPIRED');
  if (
    expired ||
    providerStatus === 'FAILED' ||
    providerStatus === 'CANCELLED' ||
    paymentStatuses.some((s) => s === 'FAILED' || s === 'CANCELLED' || s === 'USER_DROPPED')
  ) {
    // The Cashfree ledger CHECK does not allow EXPIRED. Store the explicit
    // provider state in the message/raw response while using the non-paid
    // CANCELLED terminal state in the ledger.
    const cashfreeStatus =
      expired ||
      providerStatus === 'CANCELLED' ||
      paymentStatuses.some((s) => s === 'CANCELLED' || s === 'USER_DROPPED')
        ? ('CANCELLED' as const)
        : ('FAILED' as const);
    const message = expired
      ? `Payment status is ${providerStatus}. It expired and was never completed.`
      : `Payment status is ${providerStatus}. It was not completed successfully.`;
    return {
      providerStatus,
      cashfreeStatus,
      platformStatus: 'failed' as const,
      message,
    };
  }

  return {
    providerStatus,
    cashfreeStatus: 'PENDING' as const,
    platformStatus: 'created' as const,
    message: `Payment status is ${providerStatus}. It has not been completed.`,
  };
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    return await handleVerification(context);
  } catch {
    // Never leak stack traces or provider secrets through a Cloudflare 1101 page.
    return errorJson('Cashfree verification could not be completed safely.', 500, {
      code: 'CASHFREE_VERIFY_EXCEPTION',
    });
  }
}

async function handleVerification(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const parsed = await parseJsonBody<VerifyPaymentBody>(request).catch(() => null);
  const body: VerifyPaymentBody = parsed || {};

  const orderId = sanitizeText(
    body?.orderId || body?.order_id || url.searchParams.get('order_id') || '',
    120
  );

  if (!orderId) {
    return errorJson('orderId is required for Cashfree payment verification.', 400);
  }

  if (!SAFE_ORDER_ID_PATTERN.test(orderId)) {
    return errorJson('Invalid Cashfree order ID format.', 400);
  }

  // 1. Look up existing payment record from Cloudflare D1
  const existing = await env.DB.prepare(
    'SELECT * FROM cashfree_payments WHERE order_id = ? LIMIT 1'
  )
    .bind(orderId)
    .first<CashfreePaymentRow>();

  if (!existing) {
    return errorJson('Cashfree payment order record not found.', 404);
  }

  // Strict ownership check for platform subscription packages; flexible for storefront orders
  const auth = await requireUser(request, env).catch(() => null);
  const authUser = auth && auth.ok ? auth.user : null;

  if (existing.entity_type === 'platform_package') {
    if (!authUser) {
      return auth && !auth.ok ? auth.response : errorJson('Authentication required to verify platform subscriptions.', 401);
    }
    const isOwner =
      existing.user_id === authUser.id ||
      existing.user_id === authUser.authSubject ||
      authUser.isSuperAdmin;

    if (!isOwner) {
      return errorJson('Forbidden: you cannot verify another customer’s platform package.', 403);
    }
  } else if (existing.entity_type === 'storefront_order') {
    if (authUser && existing.user_id && existing.user_id !== 'guest' && existing.user_id !== 'guest_customer') {
      const isOwner =
        existing.user_id === authUser.id ||
        existing.user_id === authUser.authSubject ||
        authUser.isSuperAdmin;
      if (!isOwner) {
        return errorJson('Forbidden: you cannot verify another customer’s storefront order.', 403);
      }
    }
  }

  // A refunded payment must never be re-verified as a new successful payment.
  // Cashfree still reports the original SUCCESS payment, so without this guard
  // a stale checkout callback could overwrite REFUNDED back to PAID. The guard
  // runs after ownership checks so refund state is never exposed to a stranger.
  if (existing.status === 'REFUNDED') {
    return json({
      verified: false,
      paymentCompleted: false,
      entitlementGranted: false,
      refunded: true,
      status: 'REFUNDED',
      orderId: existing.order_id,
      cfPaymentId: existing.cf_payment_id,
      websiteId: existing.website_id,
      payment: existing,
      message: 'This payment was refunded. No new entitlement was granted.',
    });
  }

  // 2. Idempotent check. A PAID row whose durable notes say provisioning is
  // incomplete is retried instead of returning a misleading success replay.
  const retryPaidProvisioning =
    existing.status === 'PAID' && retryablePaidProvisioning(existing.notes_json);
  if (existing.status === 'PAID' && !retryPaidProvisioning) {
    let parsedNotes: Record<string, any> = {};
    try {
      parsedNotes = JSON.parse(existing.notes_json || '{}');
    } catch {}

    return json({
      verified: true,
      idempotentReplay: true,
      status: 'PAID',
      orderId: existing.order_id,
      cfPaymentId: existing.cf_payment_id,
      orderState: parsedNotes.orderState || 'ACTIVE',
      deliveryStatus: parsedNotes.deliveryStatus || 'DELIVERY_READY',
      websiteId: existing.website_id,
      payment: existing,
    });
  }

  // 3. Verify status with Cashfree PG Server via direct server-to-server call
  const cfStatus = getEdgeCashfreeStatus(env);
  if (!cfStatus.configured) {
    return errorJson('Cashfree is not configured in server environment.', 503);
  }

  let cfOrder;
  let cfPayments = [];
  try {
    cfOrder = await fetchEdgeCashfreeOrder(env, orderId);
    cfPayments = await fetchEdgeCashfreeOrderPayments(env, orderId).catch(() => []);
  } catch (apiErr) {
    return errorJson(
      apiErr instanceof Error ? apiErr.message : 'Error communicating with Cashfree PG API.',
      502
    );
  }

  const successfulPayment = cfPayments.find(
    (p) =>
      p.payment_status === 'SUCCESS' &&
      p.cf_payment_id !== undefined &&
      p.cf_payment_id !== null &&
      String(p.cf_payment_id).trim() !== ''
  );
  // A PAID order status alone is not payment proof. Only a real successful
  // payment entity may unlock entitlement, and no synthetic ID is ever written.
  const isPaid = Boolean(successfulPayment);

  if (!isPaid) {
    const statusMap =
      String(cfOrder.order_status || '').toUpperCase() === 'PAID'
        ? {
            providerStatus: 'PAID',
            cashfreeStatus: 'PENDING' as const,
            platformStatus: 'created' as const,
            message:
              'The gateway order is marked paid, but no successful payment record is available yet. It has not been verified as a completed payment.',
          }
        : mapUnpaidStatus(cfOrder.order_status, cfPayments);

    // Keep the Cashfree ledger and the mirror platform ledger within their
    // schema CHECK constraints. An unpaid order must remain non-entitling.
    await env.DB.prepare(
      `UPDATE cashfree_payments
       SET status = ?,
           raw_response_json = ?,
           updated_at = datetime('now')
       WHERE order_id = ?`
    )
      .bind(statusMap.cashfreeStatus, JSON.stringify({ cfOrder, cfPayments }), orderId)
      .run();

    await env.DB.prepare(
      `UPDATE platform_payments
       SET status = ?,
           updated_at = datetime('now')
       WHERE razorpay_order_id = ?`
    )
      .bind(statusMap.platformStatus, `cf_${orderId}`)
      .run();

    return json({
      verified: false,
      paymentCompleted: false,
      entitlementGranted: false,
      status: statusMap.providerStatus,
      message: statusMap.message,
      order: cfOrder,
      payments: cfPayments,
    });
  }

  // 4. CRITICAL FINANCIAL VALIDATION: Authoritative Amount & Currency Verification
  // Rule: Retrieve expected order amount from trusted server-side Preview D1 records.
  // Never trust client-submitted amounts. Reject NaN, Infinity, negative, zero, and malformed values.
  const expectedPaise = toIntegerPaise(existing.amount_inr);
  if (expectedPaise <= 0) {
    return errorJson('Invalid authoritative expected order amount in database.', 500);
  }

  // Validate Currency is strictly INR
  const cfOrderCurrency = String(cfOrder.order_currency || '').trim().toUpperCase();
  if (cfOrderCurrency !== 'INR') {
    return errorJson(`Payment currency mismatch. Expected INR, received ${cfOrderCurrency || 'unspecified'}.`, 400);
  }

  // Validate Cashfree Order Amount in integer paise
  const cfOrderPaise = toIntegerPaise(cfOrder.order_amount);
  if (cfOrderPaise <= 0 || cfOrderPaise !== expectedPaise) {
    return errorJson(
      `Payment order amount mismatch. Expected ₹${(expectedPaise / 100).toFixed(2)}, received ₹${(cfOrderPaise > 0 ? cfOrderPaise / 100 : 0).toFixed(2)}.`,
      400
    );
  }

  // Validate Successful Payment entity (if present)
  if (successfulPayment) {
    const paymentCurrency = String(successfulPayment.payment_currency || '').trim().toUpperCase();
    if (paymentCurrency && paymentCurrency !== 'INR') {
      return errorJson(`Payment currency mismatch. Expected INR, received ${paymentCurrency}.`, 400);
    }
    const paymentPaise = toIntegerPaise(successfulPayment.payment_amount);
    if (paymentPaise <= 0 || paymentPaise !== expectedPaise) {
      return errorJson(
        `Captured payment amount mismatch. Expected ₹${(expectedPaise / 100).toFixed(2)}, received ₹${(paymentPaise > 0 ? paymentPaise / 100 : 0).toFixed(2)}.`,
        400
      );
    }
  }

  // For storefront orders, compare against authoritative store_orders.total_inr
  let storeOrder: {
    id: number;
    website_id: string;
    owner_id: string;
    order_number: string;
    total_inr: number;
    payment_status: string;
  } | null = null;

  if (existing.entity_type === 'storefront_order') {
    storeOrder = await env.DB.prepare(
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

    if (!storeOrder) {
      return errorJson('Associated storefront store_order record not found.', 404);
    }

    const storeOrderPaise = toIntegerPaise(storeOrder.total_inr);
    if (storeOrderPaise <= 0 || storeOrderPaise !== expectedPaise) {
      return errorJson(
        `Storefront order total mismatch. Database store_order total ₹${(storeOrderPaise > 0 ? storeOrderPaise / 100 : 0).toFixed(2)} does not match payment expected ₹${(expectedPaise / 100).toFixed(2)}.`,
        400
      );
    }
  }

  // 5. Payment is verified PAID and Amounts/Currency Validated! Extract payment metadata
  if (!successfulPayment) {
    return errorJson('No verified successful payment was found.', 400);
  }
  const cfPaymentId = normalizeCashfreePaymentId(successfulPayment.cf_payment_id);
  if (!cfPaymentId) {
    return errorJson('Unsafe Cashfree payment ID; refusing a truncated payment identity.', 400);
  }
  const paymentMethod = successfulPayment?.payment_group || 'cashfree_pg';
  const bankRef = successfulPayment?.bank_reference || null;
  const paymentTime = successfulPayment?.payment_time || new Date().toISOString();

  let notes: Record<string, any> = {};
  try {
    notes = JSON.parse(existing.notes_json || '{}');
  } catch {}

  notes.orderState = 'PROVISIONING';
  notes.deliveryStatus = 'PROVISIONING';
  notes.lastAttemptAt = new Date().toISOString();
  notes.deliveryAttempts = (notes.deliveryAttempts || 0) + 1;
  notes.gateway = 'cashfree';
  notes.cfPaymentId = cfPaymentId;

  // Atomic claim: concurrent checkout verifications can both pass the early
  // idempotency read. Only the delivery that wins this conditional update may
  // provision entitlements or publish the website.
  // On a recovery retry the row is already PAID; skip the redundant claim but
  // still re-run provisioning and write the final durable notes below.
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
             raw_response_json = ?,
             updated_at = datetime('now')
         WHERE order_id = ? AND status <> 'PAID'`
      )
        .bind(
          cfPaymentId,
          paymentMethod,
          bankRef,
          paymentTime,
          JSON.stringify(notes),
          JSON.stringify({ cfOrder, cfPayments }),
          orderId
        )
        .run();

  if (paidTransition.meta?.changes === 0) {
    return json({
      verified: true,
      idempotentDuplicate: true,
      orderId,
      status: 'PAID',
      websiteId: existing.website_id,
    });
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

  // If this was a storefront customer order, update store_orders and settlements ledger
  if (existing.entity_type === 'storefront_order' && storeOrder) {
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

      await env.DB.prepare(
        `INSERT OR IGNORE INTO cashfree_seller_settlements (
          website_id, owner_id, store_order_id, order_number,
          gross_amount_inr, platform_fee_inr, seller_payable_inr, currency,
          settlement_status, settlement_mode, notes_json, idempotency_key,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, 0, ?, 'INR',
          'pending_activation', 'cashfree_split_pending', ?, ?, datetime('now'), datetime('now')
        )`
      )
        .bind(
          storeOrder.website_id,
          storeOrder.owner_id,
          storeOrder.id,
          storeOrder.order_number,
          storeOrder.total_inr,
          storeOrder.total_inr,
          JSON.stringify({ cfPaymentId, notice: 'Pending Cashfree Split Settlement activation.' }),
          cashfreeSettlementIdempotencyKey(orderId, cfPaymentId)
        )
        .run();

      // Paid order automation: best-effort, idempotent, and non-fatal. Manual
      // assignment remains available when no eligible rider can be found.
      await autoAssignPaidOrder(env, Number(storeOrder.id));

    return json({
      verified: true,
      idempotentReplay: false,
      status: 'PAID',
      orderId,
      cfPaymentId,
      storeOrderId: storeOrder?.id,
      orderNumber: storeOrder?.order_number,
      entityType: 'storefront_order',
    });
  }

  // 5. Automatic Website Delivery & Tenant Provisioning Engine
  if (!authUser) {
    return errorJson('Authentication required to verify platform subscriptions.', 401);
  }

  let targetWebsiteId = existing.website_id;
  let targetSlug = '';
  let subscriptionId: number | null = null;
  let provisioningError: string | null = null;
  let approvalRequired = false;

  try {
    const payloadWebsiteRef = sanitizeText(
      body?.websiteId || (body?.tenantId ? String(body.tenantId) : ''),
      120
    );

    if (!targetWebsiteId && payloadWebsiteRef) {
      const isNum = /^\d+$/.test(payloadWebsiteRef);
      let resolvedRow: { website_id: string; owner_id: string; public_slug: string } | null = null;
      if (isNum) {
        resolvedRow = await env.DB.prepare(
          'SELECT website_id, owner_id, public_slug FROM customer_website_publications WHERE rowid = ? OR website_id = ? LIMIT 1'
        )
          .bind(Number(payloadWebsiteRef), payloadWebsiteRef)
          .first<{ website_id: string; owner_id: string; public_slug: string }>();
      } else {
        resolvedRow = await env.DB.prepare(
          'SELECT website_id, owner_id, public_slug FROM customer_website_publications WHERE website_id = ? OR public_slug = ? LIMIT 1'
        )
          .bind(payloadWebsiteRef, payloadWebsiteRef.toLowerCase())
          .first<{ website_id: string; owner_id: string; public_slug: string }>();
      }
      if (resolvedRow) {
        const canAccess =
          resolvedRow.owner_id === authUser.id ||
          resolvedRow.owner_id === authUser.authSubject ||
          authUser.isSuperAdmin;
        if (canAccess) {
          targetWebsiteId = resolvedRow.website_id;
          targetSlug = resolvedRow.public_slug;
        }
      }
    }

    if (!targetWebsiteId) {
      const latestDraft = await env.DB.prepare(
        `SELECT website_id, public_slug FROM customer_website_publications
         WHERE owner_id = ? OR owner_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
        .bind(authUser.id, authUser.authSubject)
        .first<{ website_id: string; public_slug: string }>();
      if (latestDraft) {
        targetWebsiteId = latestDraft.website_id;
        targetSlug = latestDraft.public_slug;
      }
    }

    const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.has(existing.reference_id);

    if (targetWebsiteId && existing.reference_id) {
      const linkedPayment = await env.DB.prepare(
        'SELECT id, billing_cycle FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1'
      )
        .bind(`cf_${orderId}`)
        .first<{ id: number; billing_cycle: string }>();

      if (isWebsitePackage) {
        // One-time website packages are lifetime entitlements, not subscriptions.
        const provision = await provisionLifetimeEntitlement(env, {
          websiteId: targetWebsiteId,
          ownerId: existing.user_id,
          planCode: existing.reference_id,
          entitlementType: 'one_time_purchase',
          source: 'cashfree_checkout_verify',
          sourceReference: cfPaymentId || '',
          paymentId: linkedPayment?.id,
        });
        if (!provision.ok) {
          throw new Error('Lifetime entitlement provisioning failed for this payment.');
        }
      } else {
        // Recurring SaaS plans keep a real monthly/yearly period end.
        const cycle = linkedPayment?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
        const durationExpr = cycle === 'yearly' ? '+365 days' : '+30 days';
        const subRes = await env.DB.prepare(
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
            targetWebsiteId,
            existing.user_id,
            existing.reference_id,
            cycle,
            existing.base_amount_inr,
            existing.gst_amount_inr,
            existing.amount_inr,
            cfPaymentId,
            durationExpr,
            cfPaymentId,
            cfPaymentId
          )
          .run();
        subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
      }

      if (body?.publishWebsite) {
        if (!isWebsitePackage && !authUser.isSuperAdmin) {
          throw new Error('Cannot publish website with a non-website subscription tier.');
        }
        const approvalBlocked = await customerApprovalBlockedResponse(env, targetWebsiteId);
        if (approvalBlocked) {
          // Money is captured and the entitlement is already active. Never turn
          // a verified purchase into a client-facing verification error; keep
          // the site unpublished until the customer accepts pending changes.
          approvalRequired = true;
          console.warn('Cashfree checkout kept website unpublished pending customer approval.');
        } else {
          await env.DB.prepare(
            `UPDATE customer_website_publications
             SET status = 'published',
                 published_at = CASE WHEN published_at IS NULL OR published_at = '' THEN datetime('now') ELSE published_at END,
                 updated_at = datetime('now')
             WHERE website_id = ?`
          )
            .bind(targetWebsiteId)
            .run();
        }
      }

      if (!targetSlug) {
        const pub = await env.DB.prepare(
          'SELECT public_slug FROM customer_website_publications WHERE website_id = ? LIMIT 1'
        )
          .bind(targetWebsiteId)
          .first<{ public_slug: string }>();
        targetSlug = pub?.public_slug || '';
      }
    }

    notes.orderState = 'ACTIVE';
    notes.deliveryStatus = 'DELIVERY_READY';
    notes.deliveredAt = new Date().toISOString();
    notes.provisioningError = null;
    notes.websiteSlug = targetSlug;
    notes.websiteUrl = targetSlug ? `/site/${targetSlug}` : '';
  } catch (provErr) {
    provisioningError =
      provErr instanceof Error ? provErr.message : 'Website provisioning failed.';
    notes.orderState = 'DELIVERY_FAILED';
    notes.deliveryStatus = 'DELIVERY_FAILED';
    notes.provisioningError = provisioningError;

    await writeAuditLog(env, {
      actorId: authUser.id,
      actorRole: authUser.platformRole,
      action: 'delivery_provisioning_failed_cashfree',
      targetType: 'cashfree_payments',
      targetId: String(existing.id),
      details: { error: provisioningError, orderId, cfPaymentId },
    });
  }

  notes.approvalRequired = approvalRequired;

  // Final updates
  await env.DB.prepare(
    `UPDATE cashfree_payments
     SET website_id = COALESCE(?, website_id),
         notes_json = ?,
         updated_at = datetime('now')
     WHERE order_id = ?`
  )
    .bind(targetWebsiteId, JSON.stringify(notes), orderId)
    .run();

  await env.DB.prepare(
    `UPDATE platform_payments
     SET website_id = COALESCE(?, website_id),
         subscription_id = COALESCE(?, subscription_id),
         notes_json = ?,
         updated_at = datetime('now')
     WHERE razorpay_order_id = ?`
  )
    .bind(targetWebsiteId, subscriptionId, JSON.stringify(notes), `cf_${orderId}`)
    .run();

  // Webhook event idempotency record
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified,
       payment_id_normalized, payload_json, processed_at)
     VALUES (?, 'cashfree', 'payment.verified_checkout', 'platform_subscription', ?, 1, ?, ?, datetime('now'))`
  )
    .bind(
      `checkout:${cfPaymentId}`,
      orderId,
      cfPaymentId,
      JSON.stringify({ cashfreePaymentId: existing.id, orderId, cfPaymentId, amountInr: existing.amount_inr })
    )
    .run();

  await writeAuditLog(env, {
    actorId: authUser.id,
    actorRole: authUser.platformRole,
    action: provisioningError
      ? 'cashfree_payment_paid_provisioning_failed'
      : 'cashfree_payment_verified',
    targetType: 'cashfree_payments',
    targetId: String(existing.id),
    details: {
      planCode: existing.reference_id,
      amountInr: existing.amount_inr,
      orderId,
      cfPaymentId,
      subscriptionId,
      deliveryStatus: notes.deliveryStatus,
      orderState: notes.orderState,
    },
  });

  return json({
    verified: true,
    idempotentReplay: false,
    status: 'PAID',
    orderId,
    cfPaymentId,
    subscriptionId,
    websiteId: targetWebsiteId,
    websiteUrl: notes.websiteUrl,
    provisioningError,
    approvalRequired,
    orderState: notes.orderState,
    deliveryStatus: notes.deliveryStatus,
  });
}
