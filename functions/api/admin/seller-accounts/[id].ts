// ============================================================================
// PATCH /api/admin/seller-accounts/:id — Super Admin seller/route approval
// Ported from src/routes/ecosystem.ts (Express) to Cloudflare Pages + D1.
// Cashfree-only: request field names stay Express-compatible, but nothing
// enables Razorpay Route. Values are stored in seller_payout_accounts columns
// that exist in migration 0003 (linked_account_id, kyc_status, commission,
// notes) and the account provider is kept on cashfree_split.
// ============================================================================

import { requireAdmin } from '../../_auth';
import {
  PagesContext,
  errorJson,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';

interface SellerAccountRow {
  id: number;
  website_id: string;
  owner_id: string;
  provider: string;
  linked_account_id: string;
  account_holder_name: string;
  bank_ifsc: string;
  bank_account_last4: string;
  kyc_status: string;
  platform_commission_percent: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface SellerPatchBody {
  kycStatus?: unknown;
  razorpayAccountId?: unknown;
  platformCommissionPct?: unknown;
  routeEnabled?: unknown;
}

const D1_KYC_STATUSES = new Set([
  'not_configured',
  'pending_kyc',
  'under_review',
  'verified',
  'rejected',
]);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeKycStatus(input: unknown, fallback: string): string {
  if (input === undefined || input === null) return fallback;
  const value = String(input).trim().toLowerCase();
  if (value === 'pending_review') return 'pending_kyc';
  return D1_KYC_STATUSES.has(value) ? value : fallback;
}

function toUiKycStatus(status: string): string {
  if (status === 'verified') return 'verified';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_kyc' || status === 'under_review') return 'pending_review';
  return 'not_submitted';
}

function parseNotes(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = parseId(params.id || '');
  if (id === null) return errorJson('Invalid seller account id.', 400);

  const body = await parseJsonBody<SellerPatchBody>(request);
  if (!body) return errorJson('Invalid JSON request payload.', 400);

  try {
    const existing = await env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SellerAccountRow>();
    if (!existing) return errorJson('Seller payout account not found.', 404);

    const kycStatus = normalizeKycStatus(body.kycStatus, String(existing.kyc_status || 'not_configured'));
    const linkedAccountId =
      body.razorpayAccountId !== undefined
        ? sanitizeText(body.razorpayAccountId, 128)
        : String(existing.linked_account_id || '');

    let platformCommissionPct = Number(existing.platform_commission_percent || 0);
    if (body.platformCommissionPct !== undefined) {
      const input = Number(body.platformCommissionPct);
      if (Number.isFinite(input)) platformCommissionPct = Math.max(0, Math.min(30, input));
    }

    // Express required verified KYC + an account id + explicit opt-out guard.
    const routeEnabled =
      kycStatus === 'verified' && Boolean(linkedAccountId) && Boolean(body.routeEnabled ?? true);

    const notes = parseNotes(existing.notes);
    notes.routeEnabled = routeEnabled;

    // Never flip provider to razorpay_route; this is the Cashfree split path.
    await env.DB.prepare(
      `UPDATE seller_payout_accounts
       SET provider = 'cashfree_split',
           kyc_status = ?,
           linked_account_id = ?,
           platform_commission_percent = ?,
           notes = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(kycStatus, linkedAccountId, platformCommissionPct, JSON.stringify(notes).slice(0, 4000), id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM seller_payout_accounts WHERE id = ? LIMIT 1')
      .bind(id)
      .first<SellerAccountRow>();

    let tenantId = 0;
    try {
      const pub = await env.DB.prepare(
        'SELECT rowid FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(updated?.website_id || existing.website_id)
        .first<{ rowid: number }>();
      tenantId = Number(pub?.rowid || 0);
    } catch {
      // Tenant id is display-only; do not fail the update if lookup is unavailable.
    }

    await writeAuditLog(env, {
      actorId: auth.user.id || auth.user.email,
      actorRole: auth.user.platformRole,
      action: 'SELLER_ROUTE_UPDATED',
      targetType: 'seller_payout_account',
      targetId: String(id),
      details: {
        tenantId,
        kycStatus,
        platformCommissionPct,
        routeEnabled,
        accountId: linkedAccountId ? 'set' : 'empty',
      },
    });

    const responseNotes = parseNotes(updated?.notes);
    return jsonResponse({
      account: {
        id: Number(updated?.id || id),
        tenantId,
        legalBusinessName: String(responseNotes.legalBusinessName || updated?.account_holder_name || ''),
        panNumber: String(responseNotes.panNumber || ''),
        gstin: String(responseNotes.gstin || ''),
        bankAccountHolder: String(updated?.account_holder_name || ''),
        bankAccountLast4: String(updated?.bank_account_last4 || ''),
        ifscCode: String(updated?.bank_ifsc || ''),
        // Express-compatible key; on Pages it holds the Cashfree split account id.
        razorpayAccountId: String(updated?.linked_account_id || ''),
        kycStatus: toUiKycStatus(String(updated?.kyc_status || kycStatus)),
        platformCommissionPct: Number(updated?.platform_commission_percent || 0),
        settlementHoldDays: 2,
        routeEnabled: Boolean(responseNotes.routeEnabled),
        updatedAt: String(updated?.updated_at || updated?.created_at || ''),
      },
    });
  } catch {
    return errorJson('Unable to update seller account.', 500);
  }
}
