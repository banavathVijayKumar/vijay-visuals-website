// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/plugins — Ecosystem Plugins & Extensions
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
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

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

  const installed: any[] = Array.isArray(access.parsed.plugins) ? access.parsed.plugins : [];
  return jsonResponse({ installed });
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
    pluginCode?: string;
    pluginName?: string;
    permissionScope?: string;
    configJson?: string;
    enabled?: boolean;
  }>(request);

  if (!body || !body.pluginCode) {
    return jsonResponse({ error: 'Plugin code is required.' }, 400);
  }

  const pluginCode = sanitizeText(body.pluginCode, 60);
  const pluginName = sanitizeText(body.pluginName, 120) || pluginCode;
  const permissionScope = sanitizeText(body.permissionScope, 100) || 'storefront_read';
  const configJson = typeof body.configJson === 'string' ? body.configJson : '{}';
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

  const tenantRowId = Number(access.row.rowid || 0);
  const currentPlugins: any[] = Array.isArray(access.parsed.plugins) ? [...access.parsed.plugins] : [];

  const existingIdx = currentPlugins.findIndex((p) => p.pluginCode === pluginCode);
  if (existingIdx !== -1) {
    currentPlugins[existingIdx].enabled = enabled;
    if (body.configJson) currentPlugins[existingIdx].configJson = configJson;
  } else {
    currentPlugins.push({
      id: Date.now(),
      tenantId: tenantRowId,
      pluginCode,
      pluginName,
      permissionScope,
      configJson,
      enabled,
      installedAt: new Date().toISOString(),
    });
  }

  access.parsed.plugins = currentPlugins;

  try {
    await env.DB!.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(access.parsed), access.row.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'configure_plugin',
      targetType: 'plugin',
      targetId: pluginCode,
      details: { websiteId: access.row.website_id, enabled },
    });

    return jsonResponse({ success: true, installed: currentPlugins });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update plugin configuration.' }, 500);
  }
}
