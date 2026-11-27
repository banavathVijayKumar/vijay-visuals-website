// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/versions — Website Draft Snapshots & Backups (Module 6)
// Provides manual backups, version history, retention metadata, cryptographic SHA-256
// audit verification, and documented media/database backup boundaries.
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

export const RETENTION_POLICY = {
  maxSnapshotsRetained: 50,
  retentionWindowDays: 90,
  // Snapshots are currently manual. No scheduled or publish-time snapshot job
  // is registered, so do not advertise either capability as active.
  autoSnapshotOnPublish: false,
  scheduledDailySnapshot: false,
  backupScope: {
    included: [
      'website_json',
      'branding_logo_typography',
      'hero_banners_gallery_sections',
      'page_navigation_menus',
      'seo_and_social_metadata',
      'product_catalog_definitions',
      'store_settings_delivery_payment',
    ],
    externalStorageNote:
      'Cloudflare R2 media assets (images, banners) and Supabase Auth credentials are preserved in redundant cloud storage and referenced by canonical URL/UUID.',
  },
};

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
      `SELECT id, version_number, revision_type, summary, created_by, created_at
       FROM website_revisions
       WHERE website_id = ?
       ORDER BY version_number DESC LIMIT 50`
    )
      .bind(access.row.website_id)
      .all<Record<string, any>>();

    const versions = (res.results || []).map((v) => ({
      id: Number(v.id),
      versionNumber: Number(v.version_number),
      status: String(v.revision_type || 'draft'),
      label: String(v.summary || 'Saved Snapshot'),
      note: String(v.summary || 'Saved Snapshot'),
      createdBy: String(v.created_by || 'owner'),
      createdAt: String(v.created_at || ''),
    }));

    return jsonResponse({
      versions,
      published: access.row.status === 'published',
      publishedAt: access.row.published_at,
      retentionPolicy: RETENTION_POLICY,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({
        versions: [],
        published: access.row.status === 'published',
        retentionPolicy: RETENTION_POLICY,
      });
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

  const body = await parseJsonBody<{
    label?: string;
    note?: string;
    isManualBackup?: boolean;
    beforeMajorChange?: boolean;
  }>(request);

  const rawNote = sanitizeText(body?.label || body?.note, 160) || 'Manual website backup snapshot';
  const prefix = body?.beforeMajorChange ? '[Pre-Change Backup] ' : body?.isManualBackup ? '[Manual Backup] ' : '';
  const note = `${prefix}${rawNote}`.slice(0, 160);

  try {
    const latest = await env.DB!.prepare(
      `SELECT MAX(version_number) AS max_ver FROM website_revisions WHERE website_id = ?`
    )
      .bind(access.row.website_id)
      .first<{ max_ver?: number | null }>();
    const nextVer = Number(latest?.max_ver || 0) + 1;

    await env.DB!.prepare(
      `INSERT INTO website_revisions (website_id, owner_id, version_number, revision_type, summary, website_json, created_by, created_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, datetime('now'))`
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

    // Compute checksum and audit backup
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(access.row.website_json || '{}'));
    const checksum = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    try {
      await env.DB!.prepare(
        `INSERT INTO backup_audit_records (scope, website_id, initiated_by, status, checksum_sha256, notes, created_at)
         VALUES ('website_revision_snapshot', ?, ?, 'recorded', ?, ?, datetime('now'))`
      )
        .bind(access.row.website_id, auth.user.id, checksum, note)
        .run();
    } catch {}

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'create_website_backup',
      targetType: 'website',
      targetId: access.row.website_id,
      details: { versionNumber: nextVer, note, checksumSha256: checksum },
    });

    return jsonResponse(
      {
        ok: true,
        versionNumber: nextVer,
        checksumSha256: checksum,
        note,
        createdAt: new Date().toISOString(),
        retentionPolicy: RETENTION_POLICY,
      },
      201
    );
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
