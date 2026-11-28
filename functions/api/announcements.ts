// ============================================================================
// GET /api/announcements — Public Platform Announcements (Cloudflare Pages)
// Only active announcements written by the protected Admin API are exposed.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse, sanitizeText } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  if (!env.DB) return jsonResponse({ announcements: [] });

  try {
    const res = await env.DB.prepare(
      `SELECT id, title, message, severity, created_by, created_at
       FROM platform_announcements
       WHERE active = 1
       ORDER BY created_at DESC LIMIT 50`
    ).all<Record<string, any>>();

    return jsonResponse({
      announcements: (res.results || []).map((a) => ({
        id: Number(a.id || 0),
        title: sanitizeText(String(a.title || ''), 120),
        message: sanitizeText(String(a.message || ''), 1000),
        severity: ['info', 'update', 'maintenance'].includes(String(a.severity || ''))
          ? String(a.severity)
          : 'info',
        createdBy: sanitizeText(String(a.created_by || 'Super Admin'), 120),
        createdAt: String(a.created_at || ''),
      })),
    });
  } catch {
    // Missing table is an honest empty public feed, never invented content.
    return jsonResponse({ announcements: [] });
  }
}
