// ============================================================================
// PATCH /api/workflows/:id — Toggle or Update Automation Workflow
// Finds tenant containing the workflow and toggles enabled state with owner auth.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../_shared';

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

  const body = await parseJsonBody<{ enabled?: boolean }>(request);
  const nextEnabled = typeof body?.enabled === 'boolean' ? body.enabled : true;

  try {
    // Scan publications to find the tenant owning this workflow
    const pubs = await env.DB.prepare(
      `SELECT website_id, owner_id, website_json FROM customer_website_publications`
    ).all<{ website_id: string; owner_id: string; website_json: string }>();

    let foundTenant: { website_id: string; owner_id: string; parsed: Record<string, any> } | null = null;
    let foundIndex = -1;

    for (const pub of pubs.results || []) {
      try {
        const parsed = JSON.parse(pub.website_json || '{}');
        const workflows = Array.isArray(parsed.automationWorkflows) ? parsed.automationWorkflows : [];
        const idx = workflows.findIndex((w: any) => Number(w.id) === targetId);
        if (idx !== -1) {
          foundTenant = { website_id: pub.website_id, owner_id: pub.owner_id, parsed };
          foundIndex = idx;
          break;
        }
      } catch {}
    }

    if (!foundTenant || foundIndex === -1) {
      // If workflow was default (id 1, 2, 3) and not yet customized in website_json, locate caller's tenant
      const userTenant = await env.DB.prepare(
        `SELECT website_id, owner_id, website_json FROM customer_website_publications
         WHERE owner_id = ? OR owner_id = ? LIMIT 1`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .first<{ website_id: string; owner_id: string; website_json: string }>();

      if (userTenant) {
        const parsed = JSON.parse(userTenant.website_json || '{}');
        const defaultWorkflows = [
          {
            id: 1,
            name: 'Abandoned Cart WhatsApp Recovery',
            triggerType: 'abandoned_cart',
            conditionText: 'Cart value > ₹1,000 and customer consented',
            actionType: 'whatsapp_template',
            requiresApproval: false,
            scheduleCron: '0 */2 * * *',
            enabled: targetId === 1 ? nextEnabled : true,
            lastRunAt: null,
          },
          {
            id: 2,
            name: 'Low Stock Auto-Alert & Vendor PO Draft',
            triggerType: 'low_stock',
            conditionText: 'stock_qty <= low_stock_threshold',
            actionType: 'draft_purchase_order',
            requiresApproval: true,
            scheduleCron: '0 9 * * *',
            enabled: targetId === 2 ? nextEnabled : true,
            lastRunAt: null,
          },
          {
            id: 3,
            name: 'New Order Welcome & Invoice PDF Delivery',
            triggerType: 'order_placed',
            conditionText: 'payment_status = paid',
            actionType: 'send_whatsapp_invoice',
            requiresApproval: false,
            scheduleCron: 'realtime',
            enabled: targetId === 3 ? nextEnabled : true,
            lastRunAt: null,
          },
        ];
        parsed.automationWorkflows = defaultWorkflows;
        await env.DB.prepare(
          `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
        )
          .bind(JSON.stringify(parsed), userTenant.website_id)
          .run();
        return jsonResponse({ success: true, enabled: nextEnabled });
      }

      return jsonResponse({ error: 'Workflow not found.' }, 404);
    }

    // Verify ownership or super admin privileges
    if (!auth.user.isSuperAdmin && foundTenant.owner_id !== auth.user.id && foundTenant.owner_id !== auth.user.authSubject) {
      return jsonResponse({ error: 'Forbidden: not authorized to modify this workflow.' }, 403);
    }

    foundTenant.parsed.automationWorkflows[foundIndex].enabled = nextEnabled;

    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(foundTenant.parsed), foundTenant.website_id)
      .run();

    return jsonResponse({ success: true, enabled: nextEnabled });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update workflow.' }, 500);
  }
}
