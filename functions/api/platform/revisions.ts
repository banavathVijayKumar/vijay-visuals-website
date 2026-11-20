// ============================================================================
// GET & POST /api/platform/revisions — Website Builder Draft, Publish & Restore
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  if (!websiteId) return errorJson('websiteId query parameter is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const revisionsRes = await env.DB.prepare(
    `SELECT id, website_id, version_number, revision_type, summary, created_by, created_at
     FROM website_revisions
     WHERE website_id = ?
     ORDER BY version_number DESC
     LIMIT 50`
  )
    .bind(websiteId)
    .all();

  return json({
    websiteId,
    currentStatus: access.website.status,
    revisions: revisionsRes.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    action?: 'save_draft' | 'publish' | 'unpublish' | 'restore';
    websiteJson?: Record<string, unknown> | string;
    summary?: string;
    revisionId?: number;
  }>(request);

  if (!body || !body.websiteId || !body.action) {
    return errorJson('websiteId and action are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const latestRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM website_revisions WHERE website_id = ?'
  )
    .bind(websiteId)
    .first<{ max_ver: number }>();
  const nextVersion = Number(latestRow?.max_ver || 0) + 1;

  if (body.action === 'unpublish') {
    await env.DB.prepare(
      `UPDATE customer_website_publications SET status = 'unpublished', updated_at = datetime('now') WHERE website_id = ?`
    )
      .bind(websiteId)
      .run();
    return json({ websiteId, status: 'unpublished', message: 'Website unpublished.' });
  }

  if (body.action === 'restore') {
    const revId = Number(body.revisionId);
    if (!Number.isInteger(revId) || revId <= 0) {
      return errorJson('Valid revisionId is required to restore.', 400);
    }
    const targetRev = await env.DB.prepare(
      'SELECT * FROM website_revisions WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(revId, websiteId)
      .first<{ id: number; version_number: number; website_json: string }>();
    if (!targetRev) return errorJson('Revision not found for this website.', 404);

    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(targetRev.website_json, websiteId)
      .run();

    await env.DB.prepare(
      `INSERT INTO website_revisions (website_id, owner_id, version_number, revision_type, summary, website_json, created_by, created_at)
       VALUES (?, ?, ?, 'restored', ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        nextVersion,
        `Restored from revision v${targetRev.version_number}`,
        targetRev.website_json,
        auth.user.id
      )
      .run();

    return json({
      restoredFromVersion: targetRev.version_number,
      newVersion: nextVersion,
      status: 'published',
      message: `Restored revision v${targetRev.version_number} and published as v${nextVersion}.`,
    });
  }

  const serializedJson =
    typeof body.websiteJson === 'string'
      ? body.websiteJson
      : JSON.stringify(body.websiteJson || {});

  if (serializedJson.length > 512_000) {
    return errorJson('Website content JSON exceeds the 512 KB limit.', 413);
  }

  const revType = body.action === 'publish' ? 'published' : 'draft';
  const summary = sanitizeText(body.summary || (revType === 'published' ? 'Published website update' : 'Saved draft'), 240);

  const insertRes = await env.DB.prepare(
    `INSERT INTO website_revisions (website_id, owner_id, version_number, revision_type, summary, website_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      websiteId,
      access.website.owner_id,
      nextVersion,
      revType,
      summary,
      serializedJson,
      auth.user.id
    )
    .run();

  if (revType === 'published') {
    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, status = 'published', published_at = datetime('now'), updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(serializedJson, websiteId)
      .run();
  }

  return json(
    {
      revisionId: Number(insertRes.meta?.last_row_id || 0),
      versionNumber: nextVersion,
      revisionType: revType,
      message: revType === 'published' ? `Published website version v${nextVersion}.` : `Saved draft v${nextVersion}.`,
    },
    201
  );
}
