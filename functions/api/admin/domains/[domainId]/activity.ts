// ============================================================================
// GET /api/admin/domains/:domainId/activity — Domain Audit & Health History
// ============================================================================

import { requirePlatformStaff } from '../../../_auth';
import { PagesContext, errorJson, json } from '../../../_shared';

export async function onRequestGet(
  context: PagesContext<{ domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requirePlatformStaff(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const domainId = Number(params.domainId);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return errorJson('Invalid domain ID.', 400);
  }

  const domain = await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
    .bind(domainId)
    .first();
  if (!domain) return errorJson('Domain not found.', 404);

  const [eventsRes, checksRes, notificationsRes] = await Promise.all([
    env.DB.prepare('SELECT * FROM domain_events WHERE domain_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(domainId)
      .all(),
    env.DB.prepare('SELECT * FROM domain_health_checks WHERE domain_id = ? ORDER BY checked_at DESC LIMIT 30')
      .bind(domainId)
      .all(),
    env.DB.prepare('SELECT * FROM domain_notifications WHERE domain_id = ? ORDER BY created_at DESC LIMIT 30')
      .bind(domainId)
      .all(),
  ]);

  return json({
    domain,
    events: eventsRes.results || [],
    healthChecks: checksRes.results || [],
    notifications: notificationsRes.results || [],
  });
}
