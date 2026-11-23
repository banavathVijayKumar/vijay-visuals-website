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
import { ALLOWED_WEBSITE_PACKAGE_CODES } from '../platform/create-order';
import {
  fetchEdgeCashfreeOrder,
  fetchEdgeCashfreeOrderPayments,
  getEdgeCashfreeStatus,
} from '../_cashfree';

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

export async function onRequestPost(context: PagesContext): Promise<Response> {
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

  // 2. Idempotent check
  if (existing.status === 'PAID') {
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

  const successfulPayment = cfPayments.find((p) => p.payment_status === 'SUCCESS');
  const isPaid = cfOrder.order_status === 'PAID' || Boolean(successfulPayment);

  if (!isPaid) {
    const failedPayment = cfPayments.find(
      (p) => p.payment_status === 'FAILED' || p.payment_status === 'CANCELLED'
    );
    const newStatus = failedPayment ? 'FAILED' : 'PENDING';

    await env.DB.prepare(
      `UPDATE cashfree_payments
       SET status = ?,
           raw_response_json = ?,
           updated_at = datetime('now')
       WHERE order_id = ?`
    )
      .bind(newStatus, JSON.stringify({ cfOrder, cfPayments }), orderId)
      .run();

    await env.DB.prepare(
      `UPDATE platform_payments
       SET status = ?,
           updated_at = datetime('now')
       WHERE razorpay_order_id = ?`
    )
      .bind(newStatus.toLowerCase(), `cf_${orderId}`)
      .run();

    return json({
      verified: false,
      status: cfOrder.order_status,
      message: `Payment status is ${cfOrder.order_status}. It has not been completed.`,
      order: cfOrder,
      payments: cfPayments,
    });
  }

  // 4. Payment is verified PAID! Extract payment metadata
  const cfPaymentId = successfulPayment
    ? String(successfulPayment.cf_payment_id)
    : String(cfOrder.cf_order_id || Date.now());
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

  // Update cashfree_payments
  await env.DB.prepare(
    `UPDATE cashfree_payments
     SET status = 'PAID',
         cf_payment_id = ?,
         payment_method = ?,
         bank_reference = ?,
         payment_time = ?,
         notes_json = ?,
         raw_response_json = ?,
         updated_at = datetime('now')
     WHERE order_id = ?`
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
  if (existing.entity_type === 'storefront_order') {
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

    if (storeOrder) {
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
          settlement_status, settlement_mode, notes_json, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, 0, ?, 'INR',
          'pending_activation', 'cashfree_split_pending', ?, datetime('now'), datetime('now')
        )`
      )
        .bind(
          storeOrder.website_id,
          storeOrder.owner_id,
          storeOrder.id,
          storeOrder.order_number,
          storeOrder.total_inr,
          storeOrder.total_inr,
          JSON.stringify({ cfPaymentId, notice: 'Pending Cashfree Split Settlement activation.' })
        )
        .run();
    }

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
      // One-time website purchases never expire: current_period_end is NULL
      const subRes = await env.DB.prepare(
        `INSERT INTO tenant_subscriptions
          (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
           total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
           current_period_start, current_period_end, created_at, updated_at)
         VALUES (?, ?, ?, 'one_time', 'active', ?, ?, ?, 0, 'cashfree', ?, datetime('now'), NULL, datetime('now'), datetime('now'))`
      )
        .bind(
          targetWebsiteId,
          existing.user_id,
          existing.reference_id,
          existing.base_amount_inr,
          existing.gst_amount_inr,
          existing.amount_inr,
          cfPaymentId
        )
        .run();
      subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;

      if (body?.publishWebsite) {
        if (!isWebsitePackage && !authUser.isSuperAdmin) {
          throw new Error('Cannot publish website with a non-website subscription tier.');
        }
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
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'cashfree', 'payment.verified_checkout', 'platform_package', ?, 1, ?, datetime('now'))`
  )
    .bind(
      `checkout:${cfPaymentId}`,
      orderId,
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
    orderState: notes.orderState,
    deliveryStatus: notes.deliveryStatus,
  });
}
