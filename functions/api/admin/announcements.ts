// ============================================================================
// GET & POST /api/admin/announcements — Platform Announcements Management
// Strictly protected by `requireAdmin`. Zero unauthenticated access.
// ============================================================================

import { requireAdmin } from '../_auth';
import { PagesContext, errorJson, handleOptions, jsonResponse, parseJsonBody, sanitizeText } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  if (!env.DB) return jsonResponse({ announcements: [] });

  try {
    const res = await env.DB.prepare(
      `SELECT id, title, message, severity, active, created_by, created_at
       FROM platform_announcements
       ORDER BY created_at DESC LIMIT 50`
    ).all<Record<string, any>>();

    return jsonResponse({
      announcements: (res.results || []).map((a) => ({
        id: Number(a.id || 0),
        title: String(a.title || ''),
        message: String(a.message || ''),
        severity: String(a.severity || 'info'),
        active: Boolean(a.active ?? true),
        createdBy: String(a.created_by || 'Admin'),
        createdAt: String(a.created_at || ''),
      })),
    });
  } catch {
    return jsonResponse({ announcements: [] });
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    title?: string;
    message?: string;
    severity?: string;
  }>(request);

  if (!body || !body.title || !body.message) {
    return errorJson('Title and message are required for platform announcements.', 400);
  }

  const title = sanitizeText(body.title, 120);
  const message = sanitizeText(body.message, 1000);
  const severity = ['info', 'update', 'maintenance'].includes(String(body.severity || ''))
    ? String(body.severity)
    : 'info';

  try {
    // Ensure table exists
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS platform_announcements (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         title TEXT NOT NULL,
         message TEXT NOT NULL,
         severity TEXT NOT NULL DEFAULT 'info',
         active INTEGER NOT NULL DEFAULT 1,
         created_by TEXT NOT NULL DEFAULT 'Super Admin',
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`
    ).run();

    const insertRes = await env.DB.prepare(
      `INSERT INTO platform_announcements (title, message, severity, active, created_by)
       VALUES (?, ?, ?, 1, ?)`
    )
      .bind(title, message, severity, auth.user.email || 'Super Admin')
      .run();

    return jsonResponse({
      ok: true,
      id: insertRes.meta.last_row_id,
      title,
      message,
      severity,
    });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : 'Failed to publish announcement.', 500);
  }
}
