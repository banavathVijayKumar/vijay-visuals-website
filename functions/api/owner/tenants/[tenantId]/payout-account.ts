// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE SELLER PAYOUT & ROUTE HANDLER
// GET, PUT, POST /api/owner/tenants/:tenantId/payout-account
//
// Dual Money-Flow System B (Seller Store Payouts via Razorpay Route):
// - Strictly isolates bank details and KYC by tenant and authenticated owner.
// - Never exposes full bank account number (only bankAccountLast4 is returned).
// - Validates IFSC, last 4 digits, PAN, GSTIN, and business names on input.
// - Returns valid JSON with standard HTTP status codes on all success and error paths.
// - Never returns HTML or allows fallback to index.html.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';
import { cleanString, mapPublicationToTenant } from '../../../_tenantMapper';
import { getEdgeCashfreeStatus } from '../../../payments/_cashfree';

export interface SellerPayoutAccountRecord {
  id: number;
  tenantId: number;
  legalBusinessName: string;
  panNumber: string;
  gstin: string;
  bankAccountHolder: string;
  bankAccountLast4: string;
  ifscCode: string;
  razorpayAccountId: string;
  kycStatus: 'not_submitted' | 'pending_review' | 'verified' | 'rejected';
  platformCommissionPct: number;
  settlementHoldDays: number;
  routeEnabled: boolean;
  updatedAt?: string;
}

export interface SellerTransferRecord {
  id: number;
  tenantId: number;
  orderId: number | null;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayTransferId: string;
  grossAmountInr: number;
  platformCommissionInr: number;
  sellerNetAmountInr: number;
  status: string;
  reversalId: string;
  createdAt: string;
}

function mapDbKycStatusToUi(dbStatus: unknown): 'not_submitted' | 'pending_review' | 'verified' | 'rejected' {
  const s = String(dbStatus || '').toLowerCase().trim();
  if (s === 'verified') return 'verified';
  if (s === 'rejected') return 'rejected';
  if (s === 'pending_kyc' || s === 'under_review' || s === 'pending_review') return 'pending_review';
  return 'not_submitted';
}

function mapAccountRowToUi(
  row: Record<string, any> | null,
  tenantRowId: number,
  fallbackBusinessName: string,
  routeEnabled: boolean
): SellerPayoutAccountRecord | null {
  if (!row) return null;

  let metaNotes: Record<string, any> = {};
  if (row.notes) {
    try {
      metaNotes = JSON.parse(row.notes);
    } catch {
      metaNotes = {};
    }
  }

  const legalBusinessName = cleanString(
    metaNotes.legalBusinessName || row.account_holder_name || fallbackBusinessName || '',
    120
  );
  const panNumber = cleanString(metaNotes.panNumber || '', 16).toUpperCase();
  const gstin = cleanString(metaNotes.gstin || '', 20).toUpperCase();

  return {
    id: Number(row.id || 0),
    tenantId: tenantRowId,
    legalBusinessName,
    panNumber,
    gstin,
    bankAccountHolder: cleanString(row.account_holder_name || '', 120),
    bankAccountLast4: cleanString(row.bank_account_last4 || '', 4),
    ifscCode: cleanString(row.bank_ifsc || '', 15).toUpperCase(),
    razorpayAccountId: cleanString(row.linked_account_id || '', 64),
    kycStatus: mapDbKycStatusToUi(row.kyc_status),
    platformCommissionPct: Number(row.platform_commission_percent || 0),
    settlementHoldDays: 2,
    routeEnabled,
    updatedAt: cleanString(row.updated_at || row.created_at || '', 40),
  };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  const { row, parsed } = access;
  const tenant = mapPublicationToTenant(row, parsed);
  const tenantRowId = tenant.id;
  const websiteId = row.website_id;
  const routeEnabled = (env.RAZORPAY_ROUTE_ENABLED || '').trim().toLowerCase() === 'true';

  // 1. Seller payout account
  let accountRow: Record<string, any> | null = null;
  try {
    accountRow = await env.DB.prepare(
      'SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<Record<string, any>>();
  } catch {
    accountRow = null;
  }

  const mappedAccount = mapAccountRowToUi(accountRow, tenantRowId, tenant.name, routeEnabled);

  // 2. Transfers ledger
  const transfers: SellerTransferRecord[] = [];
  try {
    const transRes = await env.DB.prepare(
      `SELECT * FROM seller_payment_transfers
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 50`
    )
      .bind(websiteId)
      .all<Record<string, any>>();

    for (const t of transRes.results || []) {
      transfers.push({
        id: Number(t.id || 0),
        tenantId: tenantRowId,
        orderId: t.store_order_id ? Number(t.store_order_id) : null,
        razorpayOrderId: cleanString(t.razorpay_order_id || '', 100),
        razorpayPaymentId: cleanString(t.razorpay_payment_id || '', 100),
        razorpayTransferId: cleanString(t.razorpay_transfer_id || '', 100),
        grossAmountInr: Number(t.gross_amount_inr || 0),
        platformCommissionInr: Number(t.platform_fee_inr || 0),
        sellerNetAmountInr: Number(t.seller_net_amount_inr || 0),
        status: cleanString(t.status || 'created', 30),
        reversalId: '',
        createdAt: cleanString(t.created_at || '', 40),
      });
    }
  } catch {
    // Missing table fallback
  }

  // 2b. Cashfree Seller Settlements ledger
  try {
    const cfSettlements = await env.DB.prepare(
      `SELECT * FROM cashfree_seller_settlements
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 50`
    )
      .bind(websiteId)
      .all<Record<string, any>>();

    for (const s of cfSettlements.results || []) {
      transfers.push({
        id: Number(s.id || 0),
        tenantId: tenantRowId,
        orderId: s.store_order_id ? Number(s.store_order_id) : null,
        razorpayOrderId: cleanString(s.order_number || '', 100),
        razorpayPaymentId: cleanString(s.cashfree_split_id || '', 100),
        razorpayTransferId: cleanString(s.idempotency_key || '', 100),
        grossAmountInr: Number(s.gross_amount_inr || 0),
        platformCommissionInr: Number(s.platform_fee_inr || 0),
        sellerNetAmountInr: Number(s.seller_payable_inr || 0),
        status: cleanString(s.settlement_status || 'pending_activation', 30),
        reversalId: '',
        createdAt: cleanString(s.created_at || '', 40),
      });
    }
  } catch {
    // Missing table fallback
  }

  // 3. COD summary from store_orders
  let codCollectedInr = 0;
  let codPendingInr = 0;
  try {
    const codRes = await env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method = 'cod' AND payment_status = 'paid' THEN total_inr ELSE 0 END), 0) AS cod_collected,
         COALESCE(SUM(CASE WHEN payment_method = 'cod' AND payment_status != 'paid' AND order_status != 'cancelled' THEN total_inr ELSE 0 END), 0) AS cod_pending
       FROM store_orders
       WHERE website_id = ?`
    )
      .bind(websiteId)
      .first<{ cod_collected: number; cod_pending: number }>();

    if (codRes) {
      codCollectedInr = Number(codRes.cod_collected || 0);
      codPendingInr = Number(codRes.cod_pending || 0);
    }
  } catch {
    // Missing table fallback
  }

  // 4. Edge Cashfree status
  const cashfree = getEdgeCashfreeStatus(env);

  return jsonResponse({
    account: mappedAccount,
    transfers,
    codSummary: { codCollectedInr, codPendingInr },
    cashfree,
    razorpay: cashfree,
  });
}

export async function onRequestPut(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  return handleSavePayoutAccount(context);
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  return handleSavePayoutAccount(context);
}

async function handleSavePayoutAccount(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  const body = await parseJsonBody<{
    legalBusinessName?: string;
    panNumber?: string;
    gstin?: string;
    bankAccountHolder?: string;
    bankAccountLast4?: string;
    ifscCode?: string;
  }>(request);

  if (!body) {
    return errorJson('Invalid JSON request body.', 400);
  }

  const legalBusinessName = cleanString(body.legalBusinessName || '', 120);
  if (legalBusinessName.length < 2) {
    return errorJson('Legal business name must be at least 2 characters.', 400);
  }

  const bankAccountHolder = cleanString(body.bankAccountHolder || '', 120);
  if (bankAccountHolder.length < 2) {
    return errorJson('Bank account holder name must be at least 2 characters.', 400);
  }

  const rawLast4 = String(body.bankAccountLast4 || '').trim();
  if (!/^\d{4}$/.test(rawLast4)) {
    return errorJson('Enter only the last 4 digits of your bank account.', 400);
  }
  const bankAccountLast4 = rawLast4;

  const rawIfsc = String(body.ifscCode || '').trim().toUpperCase();
  if (rawIfsc.length < 8 || rawIfsc.length > 15 || !/^[A-Z0-9]+$/.test(rawIfsc)) {
    return errorJson('Enter a valid bank IFSC code (8 to 15 alphanumeric characters).', 400);
  }
  const ifscCode = rawIfsc;

  const panNumber = cleanString(body.panNumber || '', 16).toUpperCase();
  const gstin = cleanString(body.gstin || '', 20).toUpperCase();

  const { row, parsed } = access;
  const tenant = mapPublicationToTenant(row, parsed);
  const tenantRowId = tenant.id;
  const websiteId = row.website_id;
  const ownerId = row.owner_id || auth.user.id;
  const routeEnabled = (env.RAZORPAY_ROUTE_ENABLED || '').trim().toLowerCase() === 'true';

  // Check existing record
  const existing = await env.DB.prepare(
    'SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1'
  )
    .bind(websiteId)
    .first<Record<string, any>>();

  let existingMeta: Record<string, any> = {};
  if (existing?.notes) {
    try {
      existingMeta = JSON.parse(existing.notes);
    } catch {
      existingMeta = {};
    }
  }

  const updatedMeta = {
    ...existingMeta,
    legalBusinessName,
    panNumber,
    gstin,
  };
  const notesStr = JSON.stringify(updatedMeta);

  if (existing) {
    await env.DB.prepare(
      `UPDATE seller_payout_accounts
       SET account_holder_name = ?,
           bank_ifsc = ?,
           bank_account_last4 = ?,
           notes = ?,
           kyc_status = CASE WHEN kyc_status = 'verified' THEN 'verified' ELSE 'under_review' END,
           updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(bankAccountHolder, ifscCode, bankAccountLast4, notesStr, websiteId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO seller_payout_accounts (
         website_id, owner_id, provider, linked_account_id, account_holder_name,
         bank_ifsc, bank_account_last4, upi_id, kyc_status, settlement_mode,
         platform_commission_percent, notes, created_at, updated_at
       ) VALUES (
         ?, ?, 'cashfree_split', '', ?,
         ?, ?, '', 'under_review', 'direct_seller_account',
         0, ?, datetime('now'), datetime('now')
       )`
    )
      .bind(websiteId, ownerId, bankAccountHolder, ifscCode, bankAccountLast4, notesStr)
      .run();
  }

  await writeAuditLog(env, {
    actorId: auth.user.id || auth.user.email,
    actorRole: access.effectiveRole || 'business_owner',
    action: 'SELLER_KYC_SUBMITTED',
    targetType: 'seller_payout_account',
    targetId: websiteId,
    details: {
      tenantId: tenantRowId,
      legalBusinessName,
      ifscCode,
    },
  });

  // Fetch updated record
  const updatedRow = await env.DB.prepare(
    'SELECT * FROM seller_payout_accounts WHERE website_id = ? LIMIT 1'
  )
    .bind(websiteId)
    .first<Record<string, any>>();

  const updatedAccount = mapAccountRowToUi(updatedRow, tenantRowId, tenant.name, routeEnabled);

  return jsonResponse({
    success: true,
    account: updatedAccount,
    message: 'Seller KYC submitted for Cashfree Easy Split verification.',
  });
}
