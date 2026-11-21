// ============================================================================
// GET /api/owner/tenants/:tenantId/full-export
// Complete tenant-isolated JSON data export (Products, Orders, Coupons, Settings, Versions)
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse, writeAuditLog } from '../../../_shared';
import { requireTenantOwnerAccess, mapProductRowToUi, mapOrderRowToUi } from '../../../_tenantAccess';
import { mapPublicationToTenant } from '../../../_tenantMapper';

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
  ]);
  if (!access.ok) return access.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);
  const tenant = mapPublicationToTenant(access.row, access.parsed);

  const products: any[] = [];
  const orders: any[] = [];
  const coupons: any[] = [];
  const versions: any[] = [];

  try {
    const prods = await env.DB.prepare('SELECT * FROM store_products WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const p of prods.results || []) {
      products.push(mapProductRowToUi(p, tenantRowId));
    }
  } catch {}

  try {
    const ords = await env.DB.prepare('SELECT * FROM store_orders WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const o of ords.results || []) {
      orders.push(mapOrderRowToUi(o, tenantRowId));
    }
  } catch {}

  try {
    const coups = await env.DB.prepare('SELECT * FROM store_coupons WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const c of coups.results || []) {
      coupons.push(c);
    }
  } catch {}

  try {
    const vers = await env.DB.prepare('SELECT id, version_number, label, created_at FROM website_version_snapshots WHERE website_id = ? ORDER BY version_number ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const v of vers.results || []) {
      versions.push(v);
    }
  } catch {}

  const exportPayload = {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    websiteId,
    publicSlug: access.row.public_slug,
    businessName: access.row.business_name,
    tenant,
    products,
    orders,
    coupons,
    versions,
  };

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(exportPayload)));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksumSha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'tenant_full_export_downloaded',
    targetType: 'website',
    targetId: websiteId,
    details: {
      websiteId,
      checksumSha256,
      productsCount: products.length,
      ordersCount: orders.length,
    },
  });

  return jsonResponse({
    ...exportPayload,
    checksumSha256,
  });
}
