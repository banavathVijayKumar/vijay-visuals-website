// ============================================================================
// POST /api/owner/tenants/:tenantId/versions/:versionId/restore
// ============================================================================

import { requireUser } from '../../../../../_auth';
import { PagesContext, handleOptions, jsonResponse, writeAuditLog } from '../../../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../../../_tenantAccess';
import { mapPublicationToTenant } from '../../../../../_tenantMapper';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string; versionId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const versionId = Number(params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return jsonResponse({ error: 'Invalid version ID.' }, 400);
  }

  try {
    const rev = await env.DB!.prepare(
      `SELECT id, version_number, website_json FROM website_revisions
       WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(versionId, access.row.website_id)
      .first<{ id: number; version_number: number; website_json: string }>();

    if (!rev) {
      return jsonResponse({ error: 'Saved version not found for this website.' }, 404);
    }

    let parsedObj: Record<string, any> = {};
    let parsedName = access.row.business_name;
    try {
      const obj = JSON.parse(rev.website_json);
      if (obj && typeof obj === 'object') {
        parsedObj = obj;
        if (obj.businessName || obj.name) {
          parsedName = String(obj.businessName || obj.name).slice(0, 140);
        }
      }
    } catch {}

    await env.DB!.prepare(
      `UPDATE customer_website_publications
       SET business_name = ?, website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(parsedName, rev.website_json, access.row.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'website_version_restored',
      targetType: 'website',
      targetId: access.row.website_id,
      details: { versionId, versionNumber: rev.version_number },
    });

    const tenant = mapPublicationToTenant(
      { ...access.row, business_name: parsedName, website_json: rev.website_json },
      parsedObj
    );
    return jsonResponse({ ok: true, tenant, restoredVersion: rev.version_number });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Version restore requires D1 migration 0003 (website_revisions).' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to restore version.' }, 500);
  }
}
