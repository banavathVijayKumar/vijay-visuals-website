// ============================================================================
// POST /api/owner/tenants/:tenantId/finance-entry
// Cloudflare Pages / D1 port of the Express accounting entry creator.
// The Express record types are mapped onto finance_ledger.entry_type values
// allowed by migration 0003; the original type remains in the reference prefix.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

const RECORD_TYPES = [
  'income',
  'expense',
  'quotation',
  'credit_note',
  'debit_note',
  'cash_bank',
];

const REFERENCE_PREFIX: Record<string, string> = {
  income: 'INC',
  expense: 'EXP',
  quotation: 'QTN',
  credit_note: 'CRN',
  debit_note: 'DBN',
  cash_bank: 'BNK',
};

// finance_ledger.entry_type CHECK: sale | expense | purchase | refund | tax_adjustment
const LEDGER_ENTRY_TYPE: Record<string, string> = {
  income: 'sale',
  expense: 'expense',
  quotation: 'expense',
  credit_note: 'refund',
  debit_note: 'purchase',
  cash_bank: 'expense',
};

const STATUSES = ['recorded', 'sent', 'accepted', 'settled'];

function toPositiveInt(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function toGstRate(value: unknown): number {
  if (value === undefined || value === null || value === '') return 18;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 28 ? n : -1;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const recordType = String(body.recordType || '');
  const partyName = sanitizeText(body.partyName, 120);
  const category = sanitizeText(body.category, 60);
  const amountInr = toPositiveInt(body.amountInr);
  const gstRatePct = toGstRate(body.gstRatePct);
  const status = body.status ? String(body.status) : 'recorded';
  const notes = sanitizeText(body.notes, 400);

  if (
    !RECORD_TYPES.includes(recordType) ||
    partyName.length < 2 ||
    category.length < 2 ||
    amountInr <= 0 ||
    gstRatePct < 0 ||
    !STATUSES.includes(status)
  ) {
    return jsonResponse(
      { error: 'Enter a valid record type, party name, category, and INR amount.' },
      400
    );
  }

  const gstAmountInr = Math.round((amountInr * gstRatePct) / 100);
  const referenceNo = `${REFERENCE_PREFIX[recordType]}-${Date.now().toString().slice(-6)}`;
  const statusSuffix = status !== 'recorded' ? ` [${status}]` : '';
  const ledgerNotes = `${partyName}${notes ? `: ${notes}` : ''}${statusSuffix}`.slice(0, 500);

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);
  const actor = auth.user.email || auth.user.id;

  try {
    const insertRes = await env.DB.prepare(
      `INSERT INTO finance_ledger
        (website_id, owner_id, entry_type, category, amount_inr, gst_inr, reference_id, notes,
         entry_date, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.row.owner_id,
        LEDGER_ENTRY_TYPE[recordType],
        category,
        amountInr,
        gstAmountInr,
        referenceNo,
        ledgerNotes,
        actor
      )
      .run();

    const record = {
      id: Number(insertRes.meta?.last_row_id || 0),
      tenantId: tenantRowId,
      recordType,
      referenceNo,
      partyName,
      category,
      amountInr,
      gstRatePct,
      gstAmountInr,
      status,
      notes,
      createdAt: new Date().toISOString(),
    };

    return jsonResponse({ record }, 201);
  } catch {
    return jsonResponse({ error: 'Unable to save accounting entry.' }, 500);
  }
}
