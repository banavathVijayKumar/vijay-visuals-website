// ============================================================================
// GET & PATCH /api/payments/seller/transfers
// Shop Owner Settlement Reports, Merchant Onboarding KYC Status &
// Super Admin Razorpay Route Linked Account Approval (Strictly Audited)
// ============================================================================

import { requireAdmin, requireUser, requireWebsiteAccess } from '../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  const routeEnabled = (env.RAZORPAY_ROUTE_ENABLED || '').trim().toLowerCase() === 'true';

  // Super Admin global seller onboarding & settlement report
  if (!websiteId) {
    if (!auth.user.isSuperAdmin) {
      return errorJson('websiteId query parameter is required.', 400);
    }
    const [accounts, transfers] = await Promise.all([
      env.DB.prepare(
        `SELECT spa.*, p.business_name, p.public_slug
         FROM seller_payout_accounts spa
         LEFT JOIN customer_website_publications p ON p.website_id = spa.website_id
         ORDER BY spa.updated_at DESC LIMIT 200`
      ).all(),
      env.DB.prepare(
        'SELECT * FROM seller_payment_transfers ORDER BY created_at DESC LIMIT 200'
      ).all(),
    ]);
    return json({
      routeEnabled,
      sellerAccounts: accounts.results || [],
      transfers: transfers.results || [],
    });
  }

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const [account, transfersRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1')
      .bind(websiteId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT * FROM seller_payment_transfers WHERE website_id = ? ORDER BY created_at DESC LIMIT 100'
    )
      .bind(websiteId)
      .all<{ gross_amount_inr: number; platform_fee_inr: number; seller_net_amount_inr: number; status: string }>(),
  ]);

  const rows = transfersRes.results || [];
  const summary = {
    totalTransfers: rows.length,
    totalGrossInr: rows.reduce((s, r) => s + Number(r.gross_amount_inr || 0), 0),
    totalPlatformFeeInr: rows.reduce((s, r) => s + Number(r.platform_fee_inr || 0), 0),
    totalSellerNetInr: rows.reduce((s, r) => s + Number(r.seller_net_amount_inr || 0), 0),
    settledCount: rows.filter((r) => r.status === 'settled').length,
  };

  return json({
    routeEnabled,
    liveShopPaymentsReady: Boolean(
      routeEnabled &&
        account &&
        account.kyc_status === 'verified' &&
        /^acc_[A-Za-z0-9]+$/.test(String(account.linked_account_id || ''))
    ),
    pendingRequirements: !routeEnabled
      ? 'RAZORPAY_ROUTE_ENABLED is not active yet. Enable Razorpay Route on your merchant account and complete seller Linked Account KYC before turning on automated online store settlements.'
      : !account || account.kyc_status !== 'verified'
        ? 'Seller merchant KYC approval and Razorpay Linked Account ID (acc_*) verification are pending.'
        : null,
    payoutAccount: account || null,
    summary,
    transfers: rows,
  });
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    kycStatus?: 'pending_kyc' | 'under_review' | 'verified' | 'rejected';
    linkedAccountId?: string;
    platformCommissionPercent?: number;
    notes?: string;
  }>(request);

  if (!body || !body.websiteId || !body.kycStatus) {
    return errorJson('websiteId and kycStatus are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const kycStatus = ['pending_kyc', 'under_review', 'verified', 'rejected'].includes(body.kycStatus)
    ? body.kycStatus
    : 'under_review';
  const linkedAccountId = sanitizeText(body.linkedAccountId || '', 64);

  if (kycStatus === 'verified' && !/^acc_[A-Za-z0-9]+$/.test(linkedAccountId)) {
    return errorJson(
      'Cannot mark seller KYC as verified without a valid Razorpay Route Linked Account ID (acc_*).',
      400
    );
  }

  const commission = Math.max(0, Math.min(25, Number(body.platformCommissionPercent || 0)));
  const notes = sanitizeText(body.notes || '', 300);

  const existing = await env.DB.prepare('SELECT website_id FROM seller_payout_accounts WHERE website_id = ?')
    .bind(websiteId)
    .first();
  if (!existing) return errorJson('Seller payout account record not found for this website.', 404);

  await env.DB.prepare(
    `UPDATE seller_payout_accounts
     SET kyc_status = ?, linked_account_id = ?, platform_commission_percent = ?, notes = ?, updated_at = datetime('now')
     WHERE website_id = ?`
  )
    .bind(kycStatus, linkedAccountId, commission, notes, websiteId)
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: 'super_admin',
    action: `seller_kyc_${kycStatus}`,
    targetType: 'seller_payout_accounts',
    targetId: websiteId,
    details: { kycStatus, linkedAccountId, platformCommissionPercent: commission, notes },
  });

  const updated = await env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE website_id = ?')
    .bind(websiteId)
    .first();
  return json({ payoutAccount: updated });
}
