// ============================================================================
// GET & POST /api/platform/payments — Dual Money-Flow Payment Architecture
// Flow 1: Business Owner -> Vijay Visuals (SaaS subscriptions / domain fees)
// Flow 2: Store Customer -> Seller Business (Razorpay Route / Direct / COD)
// SECURITY: NEVER marks paid from frontend status alone. Requires server-side
// HMAC-SHA256 verification and idempotent webhook event recording.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  hmacSha256Hex,
  json,
  parseJsonBody,
  safeEqual,
  sanitizeText,
} from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  if (!websiteId) return errorJson('websiteId query parameter is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const payout = await env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1')
    .bind(websiteId)
    .first();

  const razorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const isLiveKey = Boolean(env.RAZORPAY_KEY_ID?.startsWith('rzp_live_'));
  const liveApproved = env.RAZORPAY_LIVE_APPROVED === 'true';

  return json({
    flow1PlatformBilling: {
      recipient: 'Vijay Visuals',
      gatewayConfigured: razorpayConfigured,
      mode: !razorpayConfigured ? 'setup_required' : isLiveKey && liveApproved ? 'live' : 'test',
      liveApprovalRequired: isLiveKey && !liveApproved,
    },
    flow2SellerStorePayouts: {
      recipient: access.website.business_name,
      routeEnabled: env.RAZORPAY_ROUTE_ENABLED === 'true',
      payoutAccount: payout || {
        website_id: websiteId,
        kyc_status: 'not_configured',
        settlement_mode: 'cod_only',
        notes: 'Configure seller payout details and complete Razorpay Route KYC to enable automated online store settlements.',
      },
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rawText = await request.text();
  let body: Record<string, unknown>;
  try {
    body = rawText.trim() ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    return errorJson('Invalid JSON payload.', 400);
  }

  const action = String(body.action || '');

  // -------------------------------------------------------------------------
  // 1. Server-to-server Razorpay Webhook (verified via X-Razorpay-Signature)
  // -------------------------------------------------------------------------
  if (action === 'razorpay_webhook' || request.headers.has('X-Razorpay-Signature')) {
    const secret = (env.RAZORPAY_WEBHOOK_SECRET || '').trim();
    const signature = (request.headers.get('X-Razorpay-Signature') || '').trim();
    if (!secret) {
      return errorJson('Integration Required: RAZORPAY_WEBHOOK_SECRET is not configured.', 503);
    }
    if (!signature) {
      return errorJson('Missing X-Razorpay-Signature header.', 401);
    }

    const expectedSig = await hmacSha256Hex(secret, rawText);
    if (!safeEqual(signature, expectedSig)) {
      return errorJson('Invalid webhook HMAC-SHA256 signature.', 401);
    }

    const eventId = sanitizeText(body.event_id || body.id || `${body.event || 'evt'}:${expectedSig.slice(0, 16)}`, 120);
    const eventType = sanitizeText(body.event || 'payment.captured', 80);
    const flowType =
      body.flowType === 'platform_subscription' || body.flowType === 'domain_service'
        ? body.flowType
        : 'seller_order';
    const referenceId = sanitizeText(body.referenceId || '', 120);

    // Idempotency check
    const already = await env.DB.prepare('SELECT event_id FROM payment_webhook_events WHERE event_id = ? LIMIT 1')
      .bind(eventId)
      .first();
    if (already) {
      return json({ ok: true, idempotentDuplicate: true, eventId });
    }

    await env.DB.prepare(
      `INSERT INTO payment_webhook_events (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
       VALUES (?, 'razorpay', ?, ?, ?, 1, ?, datetime('now'))`
    )
      .bind(eventId, eventType, flowType, referenceId, rawText.slice(0, 8000))
      .run();

    if (eventType === 'payment.captured' && flowType === 'seller_order' && referenceId) {
      await env.DB.prepare(
        `UPDATE store_orders SET payment_status = 'paid', order_status = 'confirmed', updated_at = datetime('now')
         WHERE order_number = ? OR gateway_order_id = ?`
      )
        .bind(referenceId, referenceId)
        .run();
    } else if (eventType === 'payment.captured' && flowType === 'platform_subscription' && referenceId) {
      await env.DB.prepare(
        `UPDATE tenant_subscriptions SET status = 'active', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(Number(referenceId))
        .run();
    }

    return json({ ok: true, processed: true, eventId, eventType });
  }

  // All remaining payment actions require an authenticated Supabase user
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const websiteId = sanitizeText(body.websiteId || '', 120);
  if (!websiteId) return errorJson('websiteId is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  // -------------------------------------------------------------------------
  // 2. Configure Seller Payout Account (Flow 2 separation)
  // -------------------------------------------------------------------------
  if (action === 'configure_seller_payout') {
    const holder = sanitizeText(body.accountHolderName || '', 120);
    const ifsc = sanitizeText(body.bankIfsc || '', 16).toUpperCase();
    const last4 = sanitizeText(body.bankAccountLast4 || '', 4).replace(/\D/g, '');
    const upiId = sanitizeText(body.upiId || '', 80);
    const mode =
      body.settlementMode === 'direct_seller_account' || body.settlementMode === 'manual_upi_verification'
        ? body.settlementMode
        : 'cod_only';
    const kycStatus = holder && (ifsc || upiId) ? 'pending_kyc' : 'not_configured';

    await env.DB.prepare(
      `INSERT INTO seller_payout_accounts
        (website_id, owner_id, provider, account_holder_name, bank_ifsc, bank_account_last4, upi_id,
         kyc_status, settlement_mode, notes, created_at, updated_at)
       VALUES (?, ?, 'razorpay_route', ?, ?, ?, ?, ?, ?, 'Submitted for KYC verification. Online settlement activates only after gateway KYC approval.', datetime('now'), datetime('now'))
       ON CONFLICT(website_id) DO UPDATE SET
         account_holder_name = excluded.account_holder_name,
         bank_ifsc = excluded.bank_ifsc,
         bank_account_last4 = excluded.bank_account_last4,
         upi_id = excluded.upi_id,
         kyc_status = excluded.kyc_status,
         settlement_mode = excluded.settlement_mode,
         updated_at = datetime('now')`
    )
      .bind(websiteId, access.website.owner_id, holder, ifsc, last4, upiId, kycStatus, mode)
      .run();

    const saved = await env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE website_id = ?')
      .bind(websiteId)
      .first();
    return json({ payoutAccount: saved });
  }

  // -------------------------------------------------------------------------
  // 3. Create Razorpay Order (Blocks unconfigured, unapproved live keys, AND
  //    strictly blocks unrouted seller_order payments into Vijay Visuals account!)
  // -------------------------------------------------------------------------
  if (action === 'create_razorpay_order') {
    const keyId = (env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keyId || !keySecret) {
      return json(
        {
          status: 'setup_required',
          error:
            'Integration Required: Configure RAZORPAY_KEY_ID (start with rzp_test_*) and RAZORPAY_KEY_SECRET in Cloudflare Pages Secrets.',
        },
        503
      );
    }
    if (keyId.startsWith('rzp_live_') && env.RAZORPAY_LIVE_APPROVED !== 'true') {
      return errorJson(
        'Live Razorpay keys are locked until owner testing is completed and RAZORPAY_LIVE_APPROVED="true" is explicitly approved.',
        403
      );
    }

    const flowType = sanitizeText(body.flowType || 'platform_subscription', 40);
    if (flowType === 'seller_order') {
      return errorJson(
        'Shop owner customer orders must use POST /api/payments/seller/create-order with a verified Razorpay Route Linked Account so customer funds never settle into Vijay Visuals’ personal account.',
        403
      );
    }

    const amountInr = Math.round(Number(body.amountInr || 0));
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return errorJson('amountInr must be a positive integer.', 400);
    }

    const receipt = sanitizeText(body.receipt || `vv_${Date.now()}`, 40);
    const basicAuth = btoa(`${keyId}:${keySecret}`);

    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInr * 100,
        currency: 'INR',
        receipt,
        notes: {
          website_id: websiteId,
          flow_type: flowType,
        },
      }),
    });

    if (!rzRes.ok) {
      const errText = await rzRes.text();
      return errorJson(`Razorpay order creation failed (${rzRes.status}): ${errText.slice(0, 200)}`, 502);
    }

    const orderData = (await rzRes.json()) as Record<string, unknown>;
    return json({
      mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
      keyId, // Public Razorpay Key ID only (never expose secret)
      order: orderData,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Server-Side Razorpay Payment Signature Verification (HMAC-SHA256)
  // -------------------------------------------------------------------------
  if (action === 'verify_razorpay_payment') {
    const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keySecret) {
      return errorJson('Integration Required: RAZORPAY_KEY_SECRET is not configured.', 503);
    }

    const razorpayOrderId = sanitizeText(body.razorpayOrderId || '', 120);
    const razorpayPaymentId = sanitizeText(body.razorpayPaymentId || '', 120);
    const razorpaySignature = sanitizeText(body.razorpaySignature || '', 128);
    const flowType =
      body.flowType === 'platform_subscription' || body.flowType === 'domain_service'
        ? body.flowType
        : 'seller_order';
    const referenceId = sanitizeText(body.referenceId || '', 120);

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return errorJson('razorpayOrderId, razorpayPaymentId, and razorpaySignature are all required.', 400);
    }

    const expectedSig = await hmacSha256Hex(keySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
    if (!safeEqual(razorpaySignature, expectedSig)) {
      return errorJson('Payment verification failed: invalid cryptographic HMAC-SHA256 signature.', 400);
    }

    const eventId = `verify:${razorpayPaymentId}`;
    const existing = await env.DB.prepare('SELECT event_id FROM payment_webhook_events WHERE event_id = ? LIMIT 1')
      .bind(eventId)
      .first();

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO payment_webhook_events (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
         VALUES (?, 'razorpay', 'payment.verified', ?, ?, 1, ?, datetime('now'))`
      )
        .bind(
          eventId,
          flowType,
          referenceId,
          JSON.stringify({ razorpayOrderId, razorpayPaymentId, websiteId })
        )
        .run();

      if (flowType === 'seller_order' && referenceId) {
        await env.DB.prepare(
          `UPDATE store_orders
           SET payment_status = 'paid', order_status = 'confirmed',
               gateway_order_id = ?, gateway_payment_id = ?, updated_at = datetime('now')
           WHERE website_id = ? AND (order_number = ? OR id = ?)`
        )
          .bind(razorpayOrderId, razorpayPaymentId, websiteId, referenceId, Number(referenceId) || -1)
          .run();
      } else if (flowType === 'platform_subscription' && referenceId) {
        await env.DB.prepare(
          `UPDATE tenant_subscriptions
           SET status = 'active', gateway_subscription_id = ?, updated_at = datetime('now')
           WHERE website_id = ? AND id = ?`
        )
          .bind(razorpayPaymentId, websiteId, Number(referenceId) || -1)
          .run();
      }
    }

    return json({
      verified: true,
      idempotentReplay: Boolean(existing),
      paymentId: razorpayPaymentId,
      flowType,
      referenceId,
    });
  }

  return errorJson('Unsupported payment action.', 400);
}
