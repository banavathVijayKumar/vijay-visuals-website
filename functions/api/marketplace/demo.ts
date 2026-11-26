import {
  CloudflareEnv,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
} from '../_shared';
import { requireUser, isResponse } from './_auth';
export async function onRequestOptions() { return handleOptions(); }
export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (!context.env.DB) return jsonResponse({ error: 'Database binding is not configured.' }, 503);

  const rl = await checkRateLimit(
    context.env,
    `marketplace_demo:${user.id}:${getClientIp(context.request)}`,
    10,
    600
  );
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many demo requests. Please try again later.');

  const body = await parseJsonBody<{ serviceId?: unknown; note?: unknown }>(context.request);
  if (!body || !body.serviceId) return jsonResponse({ error: 'serviceId is required.' }, 400);
  const service = await context.env.DB.prepare('SELECT id FROM ai_services WHERE id=? AND is_active=1 AND demo_enabled=1')
    .bind(String(body.serviceId)).first<any>();
  if (!service) return jsonResponse({ error: 'A free demo is not enabled for this service.' }, 404);
  const pending = await context.env.DB.prepare("SELECT id FROM vv_demo_requests WHERE user_id=? AND service_id=? AND status IN ('requested','approved')")
    .bind(user.id, service.id).first<any>();
  if (pending) return jsonResponse({ error: 'A demo request is already pending.', requestId: pending.id }, 409);
  const id = crypto.randomUUID();
  await context.env.DB.prepare('INSERT INTO vv_demo_requests (id,user_id,service_id,customer_note) VALUES (?,?,?,?)')
    .bind(id, user.id, service.id, String(body.note || '').slice(0,1000)).run();
  return jsonResponse({ submitted: true, requestId: id }, 201);
}
