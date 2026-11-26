// ============================================================================
// PATCH /api/admin/announcements/:id — Super Admin announcement visibility toggle
// Ported from src/routes/ecosystem.ts (Express) to Cloudflare Pages + D1.
// ============================================================================

import { requireAdmin } from '../../_auth';
import { PagesContext, errorJson, jsonResponse, parseJsonBody } from '../../_shared';

interface AnnouncementRow {
  id: number;
  title: string;
  message: string;
  severity: string;
  active: number | boolean;
  created_by?: string;
  created_at?: string;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function mapAnnouncement(row: AnnouncementRow): Record<string, unknown> {
  return {
    id: Number(row.id || 0),
    title: String(row.title || ''),
    message: String(row.message || ''),
    severity: String(row.severity || 'info'),
    active: Boolean(row.active ?? true),
    createdBy: String(row.created_by || 'Admin'),
    createdAt: String(row.created_at || ''),
  };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = parseId(params.id || '');
  if (id === null) return errorJson('Invalid announcement id.', 400);

  const body = await parseJsonBody<{ active?: unknown }>(request);
  if (!body) return errorJson('Invalid JSON request payload.', 400);

  // Express used Boolean(req.body?.active); preserve that truthiness contract.
  const active = Boolean(body.active) ? 1 : 0;

  try {
    const existing = await env.DB.prepare(
      `SELECT id, title, message, severity, active, created_by, created_at
       FROM platform_announcements WHERE id = ? LIMIT 1`
    )
      .bind(id)
      .first<AnnouncementRow>();
    if (!existing) return errorJson('Announcement not found.', 404);

    // platform_announcements is created by the existing POST handler and has no
    // updated_at column; do not reference columns outside that schema.
    await env.DB.prepare('UPDATE platform_announcements SET active = ? WHERE id = ?')
      .bind(active, id)
      .run();

    const updated = await env.DB.prepare(
      `SELECT id, title, message, severity, active, created_by, created_at
       FROM platform_announcements WHERE id = ? LIMIT 1`
    )
      .bind(id)
      .first<AnnouncementRow>();

    return jsonResponse({ announcement: updated ? mapAnnouncement(updated) : null });
  } catch {
    return errorJson('Unable to update announcement.', 500);
  }
}
