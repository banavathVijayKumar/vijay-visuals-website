// ============================================================================
// POST /api/tenants/:slug/workflows — Add Business Automation Workflow
// Persists workflow into tenant publication JSON with owner authorization.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';
import { requireTenantOwnerAccess } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    name?: string;
    triggerType?: string;
    conditionText?: string;
    actionType?: string;
    requiresApproval?: boolean;
    scheduleCron?: string;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const name = sanitizeText(body.name, 120);
  const triggerType = sanitizeText(body.triggerType, 60);
  const conditionText = sanitizeText(body.conditionText, 300);
  const actionType = sanitizeText(body.actionType, 60);
  const scheduleCron = sanitizeText(body.scheduleCron, 60) || '0 */6 * * *';
  const requiresApproval = Boolean(body.requiresApproval);

  if (!name || name.length < 3) {
    return jsonResponse({ error: 'Workflow name is required (minimum 3 characters).' }, 400);
  }
  if (!triggerType || !actionType) {
    return jsonResponse({ error: 'Trigger type and action type are required.' }, 400);
  }

  const tenantRowId = Number(access.row.rowid || 0);
  const parsed = access.parsed || {};
  const currentWorkflows: Array<Record<string, any>> = Array.isArray(parsed.automationWorkflows)
    ? [...parsed.automationWorkflows]
    : [
        {
          id: 1,
          tenantId: tenantRowId,
          name: 'Abandoned Cart WhatsApp Recovery',
          triggerType: 'abandoned_cart',
          conditionText: 'Cart value > ₹1,000 and customer consented',
          actionType: 'whatsapp_template',
          requiresApproval: false,
          scheduleCron: '0 */2 * * *',
          enabled: true,
          lastRunAt: null,
        },
        {
          id: 2,
          tenantId: tenantRowId,
          name: 'Low Stock Auto-Alert & Vendor PO Draft',
          triggerType: 'low_stock',
          conditionText: 'stock_qty <= low_stock_threshold',
          actionType: 'draft_purchase_order',
          requiresApproval: true,
          scheduleCron: '0 9 * * *',
          enabled: true,
          lastRunAt: null,
        },
      ];

  const newWorkflow = {
    id: Date.now(),
    tenantId: tenantRowId,
    name,
    triggerType,
    conditionText: conditionText || 'Always trigger on event',
    actionType,
    requiresApproval,
    scheduleCron,
    enabled: true,
    lastRunAt: null,
  };

  currentWorkflows.push(newWorkflow);
  parsed.automationWorkflows = currentWorkflows;

  try {
    await env.DB!.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsed), access.row.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_workflow',
      targetType: 'website',
      targetId: access.row.website_id,
      details: { workflowName: name, triggerType, actionType },
    });

    return jsonResponse({ success: true, workflow: newWorkflow });
  } catch (err) {
    return jsonResponse({ error: 'Failed to persist workflow rule.' }, 500);
  }
}
