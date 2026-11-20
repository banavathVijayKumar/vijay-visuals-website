import { CloudflareEnv, jsonResponse, handleOptions } from '../_shared';
import { requireUser, isResponse } from './_auth';
export async function onRequestOptions() { return handleOptions(); }
export async function onRequestGet(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  const [orders, subscriptions, usage] = await Promise.all([
    context.env.DB!.prepare(`SELECT o.id,o.amount_minor,o.currency,o.status,o.created_at,s.name AS service_name,p.billing_period
      FROM vv_orders o JOIN ai_services s ON s.id=o.service_id JOIN ai_service_plans p ON p.id=o.plan_id
      WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 100`).bind(user.id).all<any>(),
    context.env.DB!.prepare(`SELECT sub.id,sub.status,sub.starts_at,sub.ends_at,s.name AS service_name,p.billing_period
      FROM vv_subscriptions sub JOIN ai_services s ON s.id=sub.service_id JOIN ai_service_plans p ON p.id=sub.plan_id
      WHERE sub.user_id=? ORDER BY sub.created_at DESC`).bind(user.id).all<any>(),
    context.env.DB!.prepare(`SELECT id,service_id,provider,model,status,created_at FROM vv_ai_usage WHERE user_id=? ORDER BY created_at DESC LIMIT 100`)
      .bind(user.id).all<any>(),
  ]);
  return jsonResponse({ user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role }, orders: orders.results || [],
    subscriptions: subscriptions.results || [], usage: usage.results || [] }, 200, { 'Cache-Control': 'no-store' });
}
