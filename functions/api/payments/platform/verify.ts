// ============================================================================
// POST /api/payments/platform/verify
// Flow 1 Server-Side Signature Verification (HMAC-SHA256)
// Verifies signature against env.RAZORPAY_KEY_SECRET and binds to server-created
// platform_payments row before marking paid and activating subscription.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../_shared';
import { verifyEdgeRazorpayPaymentSignature } from '../_razorpay';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from './create-order';

interface PlatformPaymentRow {
  id: number;
  website_id: string | null;
  owner_id: string;
  purpose: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: 'one_time' | 'monthly' | 'yearly';
  base_amount_inr: number;
  setup_fee_inr: number;
  gst_amount_inr: number;
  amount_inr: number;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  signature_verified: number;
  status: string;
  subscription_id: number | null;
  notes_json?: string;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    websiteId?: string;
    tenantId?: string | number;
    publishWebsite?: boolean;
  }>(request);

  if (!body) return errorJson('Invalid JSON payload.', 400);

  const orderId = sanitizeText(body.razorpay_order_id || body.razorpayOrderId || '', 120);
  const paymentId = sanitizeText(body.razorpay_payment_id || body.razorpayPaymentId || '', 120);
  const signature = sanitizeText(body.razorpay_signature || body.razorpaySignature || '', 128);

  if (!orderId || !paymentId || !signature) {
    return errorJson(
      'razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.',
      400
    );
  }

  // 1. Verify server-created platform payment record exists and belongs to this user
  const existing = await env.DB.prepare(
    'SELECT * FROM platform_payments WHERE razorpay_order_id = ? LIMIT 1'
  )
    .bind(orderId)
    .first<PlatformPaymentRow>();

  if (!existing) {
    return errorJson('Platform payment order record not found.', 404);
  }

  const isOwner =
    existing.owner_id === auth.user.id || existing.owner_id === auth.user.authSubject;
  if (!isOwner && !auth.user.isSuperAdmin) {
    return errorJson('Forbidden: you cannot verify another customer’s payment order.', 403);
  }

  // 2. Cryptographic HMAC-SHA256 verification on Cloudflare Edge using env.RAZORPAY_KEY_SECRET
  const validSig = await verifyEdgeRazorpayPaymentSignature(env, {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  if (!validSig) {
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'platform_payment_signature_failed',
      targetType: 'platform_payments',
      targetId: String(existing.id),
      details: { razorpayOrderId: orderId, razorpayPaymentId: paymentId },
    });
    return errorJson('Payment verification failed: invalid Razorpay HMAC-SHA256 signature.', 400);
  }

  // 3. Idempotent replay check
  if (existing.status === 'paid' && existing.signature_verified === 1) {
    let replayNotes: Record<string, any> = {};
    try {
      replayNotes = JSON.parse(existing.notes_json || '{}');
    } catch {}
    return json({
      verified: true,
      idempotentReplay: true,
      orderState: replayNotes.orderState || 'ACTIVE',
      deliveryStatus: replayNotes.deliveryStatus || 'DELIVERY_READY',
      payment: existing,
    });
  }

  // 4. Parse existing order notes & record immediate payment verification state
  let notes: Record<string, any> = {};
  try {
    notes = JSON.parse(existing.notes_json || '{}');
  } catch {}

  notes.orderState = 'PROVISIONING';
  notes.deliveryStatus = 'PROVISIONING';
  notes.lastAttemptAt = new Date().toISOString();
  notes.deliveryAttempts = (notes.deliveryAttempts || 0) + 1;

  // Immediately secure verified payment in D1 so customer money is NEVER lost if provisioning fails
  await env.DB.prepare(
    `UPDATE platform_payments
     SET status = 'paid',
         signature_verified = 1,
         razorpay_payment_id = ?,
         razorpay_signature = ?,
         paid_at = COALESCE(paid_at, datetime('now')),
         notes_json = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(paymentId, signature, JSON.stringify(notes), existing.id)
    .run();

  // 5. Automatic Website Delivery & Tenant Provisioning Engine
  let targetWebsiteId = existing.website_id;
  let targetSlug = '';
  let subscriptionId = existing.subscription_id;
  let provisioningError: string | null = null;

  try {
    const payloadWebsiteRef = sanitizeText(body.websiteId || (body.tenantId ? String(body.tenantId) : ''), 120);

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
          resolvedRow.owner_id === auth.user.id ||
          resolvedRow.owner_id === auth.user.authSubject ||
          auth.user.isSuperAdmin;
        if (canAccess) {
          targetWebsiteId = resolvedRow.website_id;
          targetSlug = resolvedRow.public_slug;
        }
      }
    }

    if (!targetWebsiteId) {
      // If payment was initiated before creating website, link latest customer draft website
      const latestDraft = await env.DB.prepare(
        `SELECT website_id, public_slug FROM customer_website_publications
         WHERE owner_id = ? OR owner_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .first<{ website_id: string; public_slug: string }>();
      if (latestDraft) {
        targetWebsiteId = latestDraft.website_id;
        targetSlug = latestDraft.public_slug;
      }
    }

    const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.has(existing.plan_code);
    const isOneTime =
      existing.billing_cycle === 'one_time' ||
      existing.purpose === 'website_purchase' ||
      isWebsitePackage;

    if (targetWebsiteId && existing.plan_code) {
      if (isOneTime) {
        // One-time website purchases never expire: current_period_end is NULL
        const subRes = await env.DB.prepare(
          `INSERT INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, ?, 'one_time', 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), NULL, datetime('now'), datetime('now'))`
        )
          .bind(
            targetWebsiteId,
            existing.owner_id,
            existing.plan_code,
            existing.base_amount_inr,
            existing.gst_amount_inr,
            existing.amount_inr,
            existing.setup_fee_inr,
            paymentId
          )
          .run();
        subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
      } else {
        // Recurring monthly/yearly SaaS subscriptions maintain their period expiration
        const durationExpr = existing.billing_cycle === 'yearly' ? '+365 days' : '+30 days';
        const subRes = await env.DB.prepare(
          `INSERT INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
        )
          .bind(
            targetWebsiteId,
            existing.owner_id,
            existing.plan_code,
            existing.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
            existing.base_amount_inr,
            existing.gst_amount_inr,
            existing.amount_inr,
            existing.setup_fee_inr,
            paymentId,
            durationExpr
          )
          .run();
        subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
      }

      // If client requested publish or website was waiting for payment activation
      if (body.publishWebsite) {
        if (!isWebsitePackage && !auth.user.isSuperAdmin) {
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
        const pub = await env.DB.prepare('SELECT public_slug FROM customer_website_publications WHERE website_id = ? LIMIT 1')
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
    provisioningError = provErr instanceof Error ? provErr.message : 'Website provisioning failed.';
    notes.orderState = 'DELIVERY_FAILED';
    notes.deliveryStatus = 'DELIVERY_FAILED';
    notes.provisioningError = provisioningError;

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'delivery_provisioning_failed',
      targetType: 'platform_payments',
      targetId: String(existing.id),
      details: { error: provisioningError, orderId, paymentId },
    });
  }

  // 6. Update platform_payments with final subscription, website link, and delivery state
  await env.DB.prepare(
    `UPDATE platform_payments
     SET website_id = COALESCE(?, website_id),
         subscription_id = COALESCE(?, subscription_id),
         notes_json = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(targetWebsiteId, subscriptionId, JSON.stringify(notes), existing.id)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'razorpay', 'payment.verified_checkout', 'platform_subscription', ?, 1, ?, datetime('now'))`
  )
    .bind(
      `checkout:${paymentId}`,
      orderId,
      JSON.stringify({ platformPaymentId: existing.id, orderId, paymentId, amountInr: existing.amount_inr })
    )
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: auth.user.platformRole,
    action: provisioningError ? 'platform_payment_paid_provisioning_failed' : 'platform_payment_verified',
    targetType: 'platform_payments',
    targetId: String(existing.id),
    details: {
      planCode: existing.plan_code,
      amountInr: existing.amount_inr,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      subscriptionId,
      deliveryStatus: notes.deliveryStatus,
      orderState: notes.orderState,
    },
  });

  const updated = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
    .bind(existing.id)
    .first();

  return json({
    verified: true,
    idempotentReplay: false,
    orderState: notes.orderState,
    deliveryStatus: notes.deliveryStatus,
    subscriptionId,
    websiteId: targetWebsiteId,
    websiteUrl: notes.websiteUrl,
    provisioningError,
    payment: updated,
  });
}
