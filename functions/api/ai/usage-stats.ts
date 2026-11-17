// Cloudflare Pages Function: GET /api/ai/usage-stats
import { CloudflareEnv, jsonResponse, handleOptions } from '../_shared';
import { requireUser, isResponse } from '../marketplace/_auth';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  const result = await context.env.DB!.prepare(`
    SELECT s.slug AS service, s.name AS serviceName, COUNT(u.id) AS usedThisMonth
    FROM vv_ai_usage u
    JOIN ai_services s ON s.id = u.service_id
    WHERE u.user_id = ?
      AND u.created_at >= datetime('now','start of month')
    GROUP BY s.id, s.slug, s.name
    ORDER BY s.sort_order
  `).bind(user.id).all<any>();
  return jsonResponse({
    userId: user.id,
    usage: result.results || [],
    runtime: 'cloudflare-pages-edge',
  });
}
