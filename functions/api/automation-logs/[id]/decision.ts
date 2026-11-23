// ============================================================================
// PATCH /api/automation-logs/:id/decision — Approve or Reject Gated Automation
// Updates the approval status of a workflow action awaiting business owner consent.
// Enforces tenant isolation, purchase order status synchronization, and safe vendor isolation.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../_shared';
import { requireTenantOwnerAccess } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const logId = Number(params.id);
  if (!Number.isFinite(logId) || logId <= 0) {
    return jsonResponse({ error: 'Invalid log ID.' }, 400);
  }

  const body = await parseJsonBody<{ decision?: string; tenantId?: number | string }>(request);
  const decision = body?.decision === 'rejected' ? 'rejected' : 'approved';

  try {
    let identifier = body?.tenantId ? String(body.tenantId).trim() : '';

    if (!identifier) {
      const userTenant = await env.DB.prepare(
        `SELECT rowid, website_id FROM customer_website_publications
         WHERE owner_id = ? OR owner_id = ? LIMIT 1`
      )
        .bind(auth.user.id, auth.user.authSubject || auth.user.id)
        .first<{ rowid: number; website_id: string }>();

      if (userTenant) {
        identifier = String(userTenant.rowid);
      }
    }

    if (!identifier) {
      return jsonResponse({ error: 'Tenant identifier required.' }, 400);
    }

    const access = await requireTenantOwnerAccess(env, auth.user, identifier, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;

    const parsed = access.parsed || {};
    const logs = Array.isArray(parsed.automationLogs) ? parsed.automationLogs : [];
    const foundLog = logs.find((l: any) => Number(l.id) === logId);

    if (!foundLog) {
      return jsonResponse({ error: 'Automation log entry not found.' }, 404);
    }

    foundLog.status = decision;

    // Check if this log references a draft purchase order
    const poMatch = String(foundLog.summary || '').match(/PO-\d+/);
    if (poMatch) {
      const poNumber = poMatch[0];
      if (decision === 'approved') {
        try {
          await env.DB.prepare(
            `UPDATE purchase_orders
             SET status = 'draft', updated_at = datetime('now')
             WHERE po_number = ? AND website_id = ?`
          )
            .bind(poNumber, access.row.website_id)
            .run();
        } catch {}

        foundLog.summary = `${foundLog.summary} [Owner Decision: APPROVED - Ready for supplier dispatch via vendor portal]`;
      } else {
        try {
          await env.DB.prepare(
            `UPDATE purchase_orders
             SET status = 'cancelled', updated_at = datetime('now')
             WHERE po_number = ? AND website_id = ?`
          )
            .bind(poNumber, access.row.website_id)
            .run();
        } catch {}

        foundLog.summary = `${foundLog.summary} [Owner Decision: REJECTED - Draft cancelled]`;
      }
    } else {
      foundLog.summary = `${foundLog.summary} [Owner Decision: ${decision.toUpperCase()}]`;
    }

    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsed), access.row.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: decision === 'approved' ? 'approve_workflow_log' : 'reject_workflow_log',
      targetType: 'website',
      targetId: access.row.website_id,
      details: { logId, decision, poNumber: poMatch ? poMatch[0] : null },
    });

    return jsonResponse({ success: true, status: decision, log: foundLog });
  } catch (err) {
    return jsonResponse({ error: 'Failed to record approval decision.' }, 500);
  }
}
