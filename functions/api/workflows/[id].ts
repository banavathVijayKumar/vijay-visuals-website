// ============================================================================
// PATCH /api/workflows/:id — Toggle or Update Automation Workflow
// Finds tenant containing the workflow and toggles enabled state with owner auth.
// Enforces tenant isolation and auto-seeds default workflows if not yet stored.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../_shared';
import { requireTenantOwnerAccess } from '../_tenantAccess';

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

  const targetId = Number(params.id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return jsonResponse({ error: 'Invalid workflow ID.' }, 400);
  }

  const body = await parseJsonBody<{ enabled?: boolean; tenantId?: number | string }>(request);
  const nextEnabled = typeof body?.enabled === 'boolean' ? body.enabled : true;

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
      'business_staff',
    ]);
    if (!access.ok) return access.response;

    const tenantRowId = Number(access.row.rowid || 0);
    const parsed = access.parsed || {};

    const defaultWorkflows = [
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
      {
        id: 3,
        tenantId: tenantRowId,
        name: 'New Order Welcome & Invoice PDF Delivery',
        triggerType: 'order_placed',
        conditionText: 'payment_status = paid',
        actionType: 'send_whatsapp_invoice',
        requiresApproval: false,
        scheduleCron: 'realtime',
        enabled: true,
        lastRunAt: null,
      },
    ];

    if (!Array.isArray(parsed.automationWorkflows) || parsed.automationWorkflows.length === 0) {
      parsed.automationWorkflows = defaultWorkflows;
    }

    const workflows = parsed.automationWorkflows as any[];
    let foundWorkflow = workflows.find((w: any) => Number(w.id) === targetId);

    if (!foundWorkflow && [1, 2, 3].includes(targetId)) {
      const def = defaultWorkflows.find((w) => w.id === targetId);
      if (def) {
        workflows.push(def);
        foundWorkflow = def;
      }
    }

    if (!foundWorkflow) {
      return jsonResponse({ error: 'Workflow not found.' }, 404);
    }

    foundWorkflow.enabled = nextEnabled;

    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsed), access.row.website_id)
      .run();

    return jsonResponse({ success: true, enabled: nextEnabled });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update workflow.' }, 500);
  }
}
