// ============================================================================
// POST /api/workflows/:id/run — Trigger Automation Workflow Execution
// Executes workflow test run, creates an automation log entry, and updates lastRunAt.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  writeAuditLog,
} from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const targetId = Number(params.id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return jsonResponse({ error: 'Invalid workflow ID.' }, 400);
  }

  try {
    // Scan publications to find the tenant owning this workflow
    const pubs = await env.DB.prepare(
      `SELECT rowid, website_id, owner_id, website_json FROM customer_website_publications`
    ).all<{ rowid: number; website_id: string; owner_id: string; website_json: string }>();

    let foundTenant: { rowid: number; website_id: string; owner_id: string; parsed: Record<string, any> } | null = null;
    let foundWorkflow: any = null;

    for (const pub of pubs.results || []) {
      try {
        const parsed = JSON.parse(pub.website_json || '{}');
        const workflows = Array.isArray(parsed.automationWorkflows) ? parsed.automationWorkflows : [];
        const match = workflows.find((w: any) => Number(w.id) === targetId);
        if (match) {
          foundTenant = { rowid: pub.rowid, website_id: pub.website_id, owner_id: pub.owner_id, parsed };
          foundWorkflow = match;
          break;
        }
      } catch {}
    }

    if (!foundTenant || !foundWorkflow) {
      return jsonResponse({ error: 'Workflow not found.' }, 404);
    }

    // Verify ownership or super admin privileges
    if (!auth.user.isSuperAdmin && foundTenant.owner_id !== auth.user.id && foundTenant.owner_id !== auth.user.authSubject) {
      return jsonResponse({ error: 'Forbidden: not authorized to run this workflow.' }, 403);
    }

    const nowIso = new Date().toISOString();
    foundWorkflow.lastRunAt = nowIso;

    const newLog = {
      id: Date.now(),
      tenantId: Number(foundTenant.rowid || 0),
      workflowId: foundWorkflow.id,
      eventType: String(foundWorkflow.triggerType || 'manual_trigger'),
      status: foundWorkflow.requiresApproval ? 'awaiting_approval' : 'completed',
      summary: `Automated rule "${foundWorkflow.name}" executed. Action: ${String(foundWorkflow.actionType || 'action').replace(/_/g, ' ')}. ${
        foundWorkflow.requiresApproval ? 'Awaiting business owner manual approval.' : 'Dispatched without approval gate.'
      }`,
      creditsUsed: 1,
      createdAt: nowIso,
    };

    const currentLogs = Array.isArray(foundTenant.parsed.automationLogs)
      ? foundTenant.parsed.automationLogs
      : [];
    currentLogs.unshift(newLog);
    foundTenant.parsed.automationLogs = currentLogs.slice(0, 50);

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
      action: 'run_workflow',
      targetType: 'website',
      targetId: foundTenant.website_id,
      details: { workflowId: targetId, workflowName: foundWorkflow.name, logStatus: newLog.status },
    });

    return jsonResponse({ success: true, log: newLog });
  } catch (err) {
    return jsonResponse({ error: 'Failed to execute workflow.' }, 500);
  }
}
