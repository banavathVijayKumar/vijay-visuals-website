// ============================================================================
// GET & POST /api/platform/payments — Dual Money-Flow Payment Architecture
// Flow 1: Business Owner -> Vijay Visuals (SaaS subscriptions / domain fees)
// Flow 2: Store Customer -> Seller Business (Cashfree split / Direct / COD)
// Cashfree is the sole online gateway. Historical Razorpay records are retained
// but no Razorpay request can mark an order paid or activate a subscription.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  json,
  parseJsonBody,
  readBoundedText,
  sanitizeText,
} from '../_shared';
import { getTrimmedEnvVar } from '../payments/_cashfree';

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

  const cashfreeConfigured = Boolean(
    getTrimmedEnvVar(env, 'CASHFREE_CLIENT_ID') && getTrimmedEnvVar(env, 'CASHFREE_CLIENT_SECRET')
  );
  const isProduction = (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase() === 'production';

  return json({
    flow1PlatformBilling: {
      provider: 'cashfree',
      recipient: 'Vijay Visuals',
      gatewayConfigured: cashfreeConfigured,
      mode: !cashfreeConfigured ? 'setup_required' : isProduction ? 'production' : 'sandbox',
    },
    flow2SellerStorePayouts: {
      provider: 'cashfree_split',
      recipient: access.website.business_name,
      routeEnabled: false,
      settlementStatus: 'pending_activation',
      payoutAccount: payout || {
        website_id: websiteId,
        provider: 'cashfree_split',
        kyc_status: 'not_submitted',
        settlement_mode: 'cashfree_split',
        notes: 'Seller payout ledger active. Live splits activate upon Cashfree Easy Split addendum execution.',
      },
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rawText = await readBoundedText(request);
  if (rawText === null) return errorJson('JSON payload is too large.', 413);
  let body: Record<string, unknown>;
  try {
    body = rawText.trim() ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    return errorJson('Invalid JSON payload.', 400);
  }

  const action = String(body.action || '');

  // -------------------------------------------------------------------------
  // 1. Retired Razorpay webhook. Records remain in payment_webhook_events; no
  //    new Razorpay event may change paid status or subscription entitlement.
  // -------------------------------------------------------------------------
  if (action === 'razorpay_webhook' || request.headers.has('X-Razorpay-Signature')) {
    return errorJson(
      'Razorpay payments are decommissioned. Use the Cashfree webhook at POST /api/webhooks/cashfree.',
      410
    );
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
       VALUES (?, ?, 'cashfree_split', ?, ?, ?, ?, ?, ?, 'Submitted for KYC verification. Online settlement activates only after Cashfree split KYC approval.', datetime('now'), datetime('now'))
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

  // Legacy actions create_razorpay_order and verify_razorpay_payment have been decommissioned.
  return errorJson(
    'Legacy Razorpay payment actions are decommissioned. Please use POST /api/payments/cashfree/create-order and POST /api/payments/cashfree/verify.',
    410
  );
}
