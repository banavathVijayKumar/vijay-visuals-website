import { CloudflareEnv, jsonResponse, handleOptions } from '../../_shared';
import { requireUser, isResponse } from '../_auth';
export async function onRequestOptions() { return handleOptions(); }
export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') return jsonResponse({ error: 'Administrator access required.' }, 403);
  const body: any = await context.request.json().catch(() => null);
  if (!body?.serviceId || !['monthly','yearly','one_time'].includes(body.billingPeriod) || !Number.isInteger(body.priceMinor) || body.priceMinor < 0 || (body.usageLimit != null && (!Number.isInteger(body.usageLimit) || body.usageLimit < 0)))
    return jsonResponse({ error: 'serviceId, billingPeriod and non-negative priceMinor are required.' }, 400);
  const id = crypto.randomUUID();
  try {
    await context.env.DB!.prepare(`INSERT INTO ai_service_plans (id,service_id,billing_period,price_minor,currency,usage_limit,features_json,is_active)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(service_id,billing_period) DO UPDATE SET price_minor=excluded.price_minor,
      currency=excluded.currency,usage_limit=excluded.usage_limit,features_json=excluded.features_json,is_active=excluded.is_active,updated_at=CURRENT_TIMESTAMP`)
      .bind(id, String(body.serviceId), body.billingPeriod, body.priceMinor, String(body.currency || 'INR'),
        Number.isInteger(body.usageLimit) ? body.usageLimit : null, JSON.stringify(Array.isArray(body.features) ? body.features : []), body.isActive ? 1 : 0).run();
    return jsonResponse({ saved: true });
  } catch { return jsonResponse({ error: 'Unable to save plan. Check the service id and database schema.' }, 400); }
}
