import { CloudflareEnv, jsonResponse } from '../_shared';
import { requireUser, isResponse, VerifiedUser } from './_auth';

export type AiAccess = { user: VerifiedUser; serviceId: string; planId: string; remaining: number | null; limit: number | null };

export async function requireAiEntitlement(request: Request, env: CloudflareEnv, serviceSlug: string): Promise<AiAccess | Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const subscription = await env.DB!.prepare(`
    SELECT sub.service_id, sub.plan_id, p.usage_limit
    FROM vv_subscriptions sub JOIN ai_services s ON s.id=sub.service_id
    JOIN ai_service_plans p ON p.id=sub.plan_id
    WHERE sub.user_id=? AND s.slug=? AND sub.status='active'
      AND s.is_active=1 AND p.is_active=1
      AND sub.starts_at <= ? AND (sub.ends_at IS NULL OR sub.ends_at > ?)
    ORDER BY sub.created_at DESC LIMIT 1
  `).bind(user.id, serviceSlug, new Date().toISOString(), new Date().toISOString()).first<any>();
  if (!subscription) return jsonResponse({ error: 'An active subscription for this AI service is required.', code: 'SUBSCRIPTION_REQUIRED' }, 402);
  const limit = subscription.usage_limit == null ? null : Number(subscription.usage_limit);
  if (limit !== null) {
    const used = await env.DB!.prepare(`SELECT COUNT(*) AS count FROM vv_ai_usage
      WHERE user_id=? AND service_id=? AND status IN ('success','error')
      AND created_at >= datetime('now','start of month')`).bind(user.id, subscription.service_id).first<any>();
    const count = Number(used?.count || 0);
    if (count >= limit) return jsonResponse({ error: 'Your subscription usage limit has been reached.', code: 'USAGE_LIMIT_REACHED', limit, used: count }, 429);
    return { user, serviceId: subscription.service_id, planId: subscription.plan_id, remaining: Math.max(0, limit-count), limit };
  }
  return { user, serviceId: subscription.service_id, planId: subscription.plan_id, remaining: null, limit: null };
}

export async function recordAiUsage(env: CloudflareEnv, access: AiAccess, status: 'success' | 'error' = 'success') {
  await env.DB!.prepare(`INSERT INTO vv_ai_usage (id,user_id,service_id,request_id,provider,model,status) VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), access.user.id, access.serviceId, crypto.randomUUID(), env.AI_PROVIDER || 'gemini',
      env.AI_PROVIDER === 'claude' ? (env.CLAUDE_MODEL || 'claude-3-5-haiku-latest') : (env.GEMINI_MODEL || 'gemini-2.5-flash-lite'), status).run();
}
export function isAiAccessResponse(value: AiAccess | Response): value is Response { return value instanceof Response; }
