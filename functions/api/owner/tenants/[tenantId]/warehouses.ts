// ============================================================================
// POST /api/owner/tenants/:tenantId/warehouses — Add Inventory Warehouse Hub
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
    name?: string;
    city?: string;
    capacityUnits?: number;
    managerName?: string;
    active?: boolean;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const name = sanitizeText(body.name, 120);
  const city = sanitizeText(body.city, 100);
  const capacityUnits = Number.isFinite(Number(body.capacityUnits)) ? Math.max(1, Number(body.capacityUnits)) : 1000;
  const managerName = sanitizeText(body.managerName, 120);

  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Warehouse name is required.' }, 400);
  }

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const res = await env.DB!.prepare(
      `INSERT INTO inventory_warehouses (website_id, owner_id, name, address, manager_name, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`
    )
      .bind(websiteId, access.row.owner_id, name, city, managerName)
      .run();

    const createdWh = {
      id: Number(res.meta?.last_row_id || Date.now()),
      tenantId: tenantRowId,
      name,
      city,
      capacityUnits,
      managerName,
      active: true,
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_warehouse',
      targetType: 'warehouse',
      targetId: String(createdWh.id),
      details: { websiteId, name, city },
    });

    return jsonResponse({ success: true, warehouse: createdWh });
  } catch (err) {
    if (isMissingTableError(err)) {
      const currentWh: any[] = Array.isArray(access.parsed.warehouses) ? [...access.parsed.warehouses] : [];
      const createdWh = {
        id: Date.now(),
        tenantId: tenantRowId,
        name,
        city,
        capacityUnits,
        managerName,
        active: true,
      };
      currentWh.unshift(createdWh);
      access.parsed.warehouses = currentWh;

      await env.DB!.prepare(
        `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(JSON.stringify(access.parsed), websiteId)
        .run();

      return jsonResponse({ success: true, warehouse: createdWh });
    }
    return jsonResponse({ error: 'Failed to record warehouse.' }, 500);
  }
}
