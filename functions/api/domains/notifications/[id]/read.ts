// ============================================================================
// PATCH /api/domains/notifications/:id/read
// Marks a domain notification read ONLY if owned by the authenticated user.
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, errorJson, json } from '../../../_shared';

export async function onRequestPatch(context: PagesContext<{ id: string }>): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const notifId = Number(params.id);
  if (!Number.isInteger(notifId) || notifId <= 0) {
    return errorJson('Invalid notification ID.', 400);
  }

  const row = await env.DB.prepare(
    'SELECT id, owner_id, is_read FROM domain_notifications WHERE id = ? LIMIT 1'
  )
    .bind(notifId)
    .first<{ id: number; owner_id: string; is_read: number }>();

  if (!row) {
    return errorJson('Notification not found.', 404);
  }
  if (!auth.user.isSuperAdmin && row.owner_id !== auth.user.id && row.owner_id !== auth.user.authSubject) {
    return errorJson('Forbidden: you cannot modify another customer’s notification.', 403);
  }

  await env.DB.prepare(
    `UPDATE domain_notifications SET is_read = 1, read_at = COALESCE(read_at, datetime('now')) WHERE id = ?`
  )
    .bind(notifId)
    .run();

  return json({ id: notifId, isRead: true });
}
