// ============================================================================
// PATCH /api/automation-logs/:id/decision — Approve or Reject Gated Automation
// Updates the approval status of a workflow action awaiting business owner consent.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../_shared';

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

  const body = await parseJsonBody<{ decision?: string }>(request);
  const decision = body?.decision === 'rejected' ? 'rejected' : 'approved';

  try {
    const pubs = await env.DB.prepare(
      `SELECT website_id, owner_id, website_json FROM customer_website_publications`
    ).all<{ website_id: string; owner_id: string; website_json: string }>();

    let foundTenant: { website_id: string; owner_id: string; parsed: Record<string, any> } | null = null;
    let foundLog: any = null;

    for (const pub of pubs.results || []) {
      try {
        const parsed = JSON.parse(pub.website_json || '{}');
        const logs = Array.isArray(parsed.automationLogs) ? parsed.automationLogs : [];
        const match = logs.find((l: any) => Number(l.id) === logId);
        if (match) {
          foundTenant = { website_id: pub.website_id, owner_id: pub.owner_id, parsed };
          foundLog = match;
          break;
        }
      } catch {}
    }

    if (!foundTenant || !foundLog) {
      return jsonResponse({ error: 'Automation log entry not found.' }, 404);
    }

    if (!auth.user.isSuperAdmin && foundTenant.owner_id !== auth.user.id && foundTenant.owner_id !== auth.user.authSubject) {
      return jsonResponse({ error: 'Forbidden: not authorized to decide on this action.' }, 403);
    }

    foundLog.status = decision;
    foundLog.summary = `${foundLog.summary} [Owner Decision: ${decision.toUpperCase()}]`;

    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(foundTenant.parsed), foundTenant.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: decision === 'approved' ? 'approve_workflow_log' : 'reject_workflow_log',
      targetType: 'website',
      targetId: foundTenant.website_id,
      details: { logId, decision },
    });

    return jsonResponse({ success: true, status: decision });
  } catch (err) {
    return jsonResponse({ error: 'Failed to record approval decision.' }, 500);
  }
}
