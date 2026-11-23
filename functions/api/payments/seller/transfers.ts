// ============================================================================
// GET & PATCH /api/payments/seller/transfers
// Shop Owner Settlement Reports & Cashfree Split Settlement Ledger
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

  // Cashfree Split Settlement activation status check
  // True only when explicit Cashfree Easy Split credentials and merchant activation exist
  const cashfreeSplitActive = Boolean(
    (env.CASHFREE_SPLIT_ENABLED || '').trim().toLowerCase() === 'true'
  );

  // Super Admin global seller onboarding & settlement report
  if (!websiteId) {
    if (!auth.user.isSuperAdmin) {
      return errorJson('websiteId query parameter is required.', 400);
    }
    const [accounts, settlements] = await Promise.all([
      env.DB.prepare(
        `SELECT spa.*, p.business_name, p.public_slug
         FROM seller_payout_accounts spa
         LEFT JOIN customer_website_publications p ON p.website_id = spa.website_id
         ORDER BY spa.updated_at DESC LIMIT 200`
      ).all(),
      env.DB.prepare(
        'SELECT * FROM cashfree_seller_settlements ORDER BY created_at DESC LIMIT 200'
      ).all(),
    ]);
    return json({
      paymentGateway: 'Cashfree Payments',
      splitSettlementActive: cashfreeSplitActive,
      sellerAccounts: accounts.results || [],
      settlements: settlements.results || [],
    });
  }

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const [account, settlementsRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1')
      .bind(websiteId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      'SELECT * FROM cashfree_seller_settlements WHERE website_id = ? ORDER BY created_at DESC LIMIT 100'
    )
      .bind(websiteId)
      .all<{
        gross_amount_inr: number;
        platform_fee_inr: number;
        seller_payable_inr: number;
        settlement_status: string;
      }>(),
  ]);

  const rows = settlementsRes.results || [];
  const summary = {
    totalTransactions: rows.length,
    totalGrossInr: rows.reduce((s, r) => s + Number(r.gross_amount_inr || 0), 0),
    totalPlatformFeeInr: rows.reduce((s, r) => s + Number(r.platform_fee_inr || 0), 0),
    totalSellerPayableInr: rows.reduce((s, r) => s + Number(r.seller_payable_inr || 0), 0),
    settledCount: rows.filter((r) => r.settlement_status === 'settled').length,
    pendingActivationCount: rows.filter((r) => r.settlement_status === 'pending_activation').length,
  };

  return json({
    paymentGateway: 'Cashfree Payments',
    splitSettlementActive: cashfreeSplitActive,
    settlementStatus: cashfreeSplitActive ? 'active' : 'pending_activation',
    activationRequirements: [
      'Cashfree Easy Split feature approval on merchant account',
      'Merchant Sub-account / Vendor registration with verified Bank Account + IFSC',
      'Cashfree Split Settlement Addendum verification',
    ],
    pendingNotice:
      'Cashfree Split Settlement is pending activation on this merchant account. All storefront payments are segregated and recorded in the D1 reconciliation ledger.',
    payoutAccount: account || null,
    summary,
    settlements: rows,
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
    notes?: string;
  }>(request);

  if (!body || !body.websiteId) {
    return errorJson('websiteId is required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const kycStatus = body.kycStatus || 'under_review';

  await env.DB.prepare(
    `UPDATE seller_payout_accounts
     SET kyc_status = ?,
         notes = ?,
         updated_at = datetime('now')
     WHERE website_id = ?`
  )
    .bind(kycStatus, sanitizeText(body.notes || '', 500), websiteId)
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: auth.user.platformRole,
    action: 'seller_settlement_account_updated',
    targetType: 'seller_payout_accounts',
    targetId: websiteId,
    details: { kycStatus, notes: body.notes },
  });

  return json({ ok: true, websiteId, kycStatus });
}
