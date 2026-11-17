// Admin-only D1 catalogue management. A Supabase access token is verified server-side;
// the admin role is read from D1 and is never accepted from the browser.
import { CloudflareEnv, jsonResponse, handleOptions } from '../../_shared';
import { requireUser, isResponse } from '../_auth';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') return jsonResponse({ error: 'Administrator access required.' }, 403);
  const result = await context.env.DB!.prepare(`SELECT s.*, p.id AS plan_id, p.billing_period, p.price_minor, p.currency,
    p.usage_limit, p.features_json, p.is_active AS plan_active FROM ai_services s
    LEFT JOIN ai_service_plans p ON p.service_id=s.id ORDER BY s.sort_order, s.name`).all<any>();
  return jsonResponse({ services: result.results || [] }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') return jsonResponse({ error: 'Administrator access required.' }, 403);
  const body: any = await context.request.json().catch(() => null);
  if (!body || typeof body.name !== 'string' || typeof body.slug !== 'string' || typeof body.category !== 'string')
    return jsonResponse({ error: 'name, slug and category are required.' }, 400);
  const id = crypto.randomUUID();
  try {
    await context.env.DB!.prepare(`INSERT INTO ai_services (id,slug,name,short_description,description,category,icon,is_active,demo_enabled,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, body.slug.trim().toLowerCase(), body.name.trim(), String(body.shortDescription || ''),
      String(body.description || ''), body.category.trim(), String(body.icon || 'sparkles'), body.isActive ? 1 : 0,
      body.demoEnabled ? 1 : 0, Number.isInteger(body.sortOrder) ? body.sortOrder : 0).run();
    return jsonResponse({ id, created: true }, 201);
  } catch (error: any) {
    return jsonResponse({ error: error?.message?.includes('UNIQUE') ? 'That service slug already exists.' : 'Could not create service.' }, 400);
  }
}

export async function onRequestPut(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') return jsonResponse({ error: 'Administrator access required.' }, 403);
  const body: any = await context.request.json().catch(() => null);
  if (!body?.id) return jsonResponse({ error: 'Service id is required.' }, 400);
  const result = await context.env.DB!.prepare(`UPDATE ai_services SET name=?,slug=?,short_description=?,description=?,category=?,icon=?,is_active=?,demo_enabled=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(String(body.name || ''), String(body.slug || ''), String(body.shortDescription || ''), String(body.description || ''),
      String(body.category || ''), String(body.icon || 'sparkles'), body.isActive ? 1 : 0, body.demoEnabled ? 1 : 0,
      Number.isInteger(body.sortOrder) ? body.sortOrder : 0, String(body.id)).run();
  if (!result.meta?.changes) return jsonResponse({ error: 'Service not found.' }, 404);
  return jsonResponse({ updated: true });
}

export async function onRequestDelete(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') return jsonResponse({ error: 'Administrator access required.' }, 403);
  const body: any = await context.request.json().catch(() => null);
  if (!body?.id) return jsonResponse({ error: 'Service id is required.' }, 400);
  await context.env.DB!.prepare('UPDATE ai_services SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(String(body.id)).run();
  return jsonResponse({ deactivated: true });
}
