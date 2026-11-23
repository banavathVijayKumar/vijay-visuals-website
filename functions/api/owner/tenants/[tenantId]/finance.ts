// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/finance — Multi-Tenant Finance Ledger
// Tracks expenses, quotations, credit notes, GST calculations, and net margin.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

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
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  let totalSales = 0;
  let totalExpenses = 0;
  let gstPayable = 0;

  // Calculate total completed/paid sales from store_orders
  if (env.DB) {
    try {
      const salesRes = await env.DB.prepare(
        `SELECT total_inr FROM store_orders WHERE website_id = ? AND order_status NOT IN ('cancelled', 'returned')`
      )
        .bind(websiteId)
        .all<{ total_inr: number }>();
      for (const s of salesRes.results || []) {
        totalSales += Number(s.total_inr || 0);
      }
    } catch {}
  }

  try {
    const res = await env.DB!.prepare(
      `SELECT id, entry_type, category, amount_inr, gst_inr, reference_id, notes, created_at
       FROM finance_ledger
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 200`
    )
      .bind(websiteId)
      .all<Record<string, any>>();

    const records = (res.results || []).map((r) => {
      const amount = Number(r.amount_inr || 0);
      const gst = Number(r.gst_inr || 0);
      const entryType = String(r.entry_type || 'expense');
      if (entryType === 'expense') {
        totalExpenses += amount;
      }
      gstPayable += gst;

      return {
        id: Number(r.id),
        tenantId: tenantRowId,
        recordType: (entryType === 'expense' || entryType === 'quotation' || entryType === 'credit_note')
          ? entryType
          : 'expense',
        referenceNo: String(r.reference_id || `REF-${r.id}`),
        partyName: String(r.notes || 'Vendor / Counterparty'),
        category: String(r.category || 'general'),
        amountInr: amount,
        gstRatePct: amount > 0 ? Math.round((gst / amount) * 100) : 0,
        gstAmountInr: gst,
        status: 'recorded',
      };
    });

    const netProfit = totalSales - totalExpenses;

    return jsonResponse({
      records,
      summary: {
        totalSales,
        totalExpenses,
        netProfit,
        gstPayable,
      },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      const fallbackRecords = Array.isArray(access.parsed.financeRecords) ? access.parsed.financeRecords : [];
      for (const f of fallbackRecords) {
        if (f.recordType === 'expense') totalExpenses += Number(f.amountInr || 0);
        gstPayable += Number(f.gstAmountInr || 0);
      }
      return jsonResponse({
        records: fallbackRecords,
        summary: {
          totalSales,
          totalExpenses,
          netProfit: totalSales - totalExpenses,
          gstPayable,
        },
      });
    }
    return jsonResponse({ error: 'Unable to load finance ledger.' }, 500);
  }
}

export async function onRequestPost(
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

  const body = await parseJsonBody<{
    recordType?: string;
    partyName?: string;
    category?: string;
    amountInr?: number;
    gstRatePct?: number;
    gstAmountInr?: number;
    status?: string;
    notes?: string;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const recordType = ['expense', 'quotation', 'credit_note'].includes(String(body.recordType || ''))
    ? String(body.recordType)
    : 'expense';
  const partyName = sanitizeText(body.partyName, 120);
  const category = sanitizeText(body.category, 60) || 'general';
  const amountInr = Math.max(0, Math.trunc(Number(body.amountInr) || 0));
  const gstRatePct = Math.max(0, Math.min(28, Number(body.gstRatePct) || 0));
  const gstAmountInr = Math.max(0, Math.trunc(Number(body.gstAmountInr) || 0));
  const notes = sanitizeText(body.notes || partyName, 300);
  const referenceNo = `FIN-${Date.now().toString().slice(-6)}`;

  if (amountInr <= 0) {
    return jsonResponse({ error: 'Amount must be greater than zero.' }, 400);
  }

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const insertRes = await env.DB!.prepare(
      `INSERT INTO finance_ledger (website_id, owner_id, entry_type, category, amount_inr, gst_inr, reference_id, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.row.owner_id,
        recordType,
        category,
        amountInr,
        gstAmountInr,
        referenceNo,
        notes,
        auth.user.email || auth.user.id
      )
      .run();

    const createdRecord = {
      id: Number(insertRes.meta?.last_row_id || Date.now()),
      tenantId: tenantRowId,
      recordType,
      referenceNo,
      partyName,
      category,
      amountInr,
      gstRatePct,
      gstAmountInr,
      status: 'recorded',
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'record_finance_entry',
      targetType: 'finance',
      targetId: String(createdRecord.id),
      details: { websiteId, recordType, amountInr, referenceNo },
    });

    return jsonResponse({ success: true, record: createdRecord });
  } catch (err) {
    if (isMissingTableError(err)) {
      const currentRecords: any[] = Array.isArray(access.parsed.financeRecords)
        ? [...access.parsed.financeRecords]
        : [];
      const createdRecord = {
        id: Date.now(),
        tenantId: tenantRowId,
        recordType,
        referenceNo,
        partyName,
        category,
        amountInr,
        gstRatePct,
        gstAmountInr,
        status: 'recorded',
      };
      currentRecords.unshift(createdRecord);
      access.parsed.financeRecords = currentRecords;

      await env.DB!.prepare(
        `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(JSON.stringify(access.parsed), websiteId)
        .run();

      return jsonResponse({ success: true, record: createdRecord });
    }
    return jsonResponse({ error: 'Failed to record finance entry.' }, 500);
  }
}
