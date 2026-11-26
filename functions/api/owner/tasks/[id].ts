// ============================================================================
// PATCH /api/owner/tasks/:id — legacy caller compatibility.
// Resolves the owning tenant server-side, then delegates to the tenant-scoped
// Pages handler so authorization and status mapping stay in one place.
// ============================================================================

import { requireUser } from '../../_auth';
import { CloudflareEnv, errorJson, handleOptions, jsonResponse, PagesContext } from '../../_shared';
import { onRequestPatch as patchTenantTask } from '../tenants/[tenantId]/tasks/[id]';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

async function resolveTenantRowId(env: CloudflareEnv, id: number): Promise<number | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    `SELECT p.rowid AS tenant_rowid
     FROM developer_tasks t
     INNER JOIN customer_website_publications p ON p.website_id = t.website_id
     WHERE t.id = ?
     LIMIT 1`
  )
    .bind(id)
    .first<{ tenant_rowid: number }>();
  return row?.tenant_rowid ? Number(row.tenant_rowid) : null;
}

export async function onRequestPatch(context: PagesContext<{ id: string }>): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Task not found.' }, 404);
  }

  const tenantRowId = await resolveTenantRowId(env, id);
  if (!tenantRowId) return jsonResponse({ error: 'Task not found.' }, 404);

  return patchTenantTask({
    ...context,
    params: { tenantId: String(tenantRowId), id: params.id },
  });
}
