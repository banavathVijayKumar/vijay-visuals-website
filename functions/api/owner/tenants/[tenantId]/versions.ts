// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/versions — Website Draft Snapshots
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  try {
    const res = await env.DB!.prepare(
      `SELECT id, version_number, revision_type, summary, created_at
       FROM website_revisions
       WHERE website_id = ?
       ORDER BY version_number DESC LIMIT 30`
    )
      .bind(access.row.website_id)
      .all<Record<string, any>>();

    const versions = (res.results || []).map((v) => ({
      id: Number(v.id),
      versionNumber: Number(v.version_number),
      status: String(v.revision_type || 'draft'),
      label: String(v.summary || 'Saved Snapshot'),
      note: String(v.summary || 'Saved Snapshot'),
      createdAt: String(v.created_at || ''),
    }));
    return jsonResponse({ versions, published: access.row.status === 'published' });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ versions: [], published: access.row.status === 'published' });
    }
    return jsonResponse({ error: 'Unable to load saved website versions.' }, 500);
  }
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{ label?: string; note?: string }>(request);
  const note = sanitizeText(body?.label || body?.note, 160) || 'Manual builder snapshot';

  try {
    const latest = await env.DB!.prepare(
      `SELECT MAX(version_number) AS max_ver FROM website_revisions WHERE website_id = ?`
    )
      .bind(access.row.website_id)
      .first<{ max_ver?: number | null }>();
    const nextVer = Number(latest?.max_ver || 0) + 1;

    await env.DB!.prepare(
      `INSERT INTO website_revisions (website_id, owner_id, version_number, revision_type, summary, website_json, created_by)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`
    )
      .bind(
        access.row.website_id,
        access.row.owner_id,
        nextVer,
        note,
        access.row.website_json,
        auth.user.id
      )
      .run();

    return jsonResponse({ ok: true, versionNumber: nextVer }, 201);
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Version history requires D1 migration 0003 (website_revisions).' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to save website snapshot.' }, 500);
  }
}
