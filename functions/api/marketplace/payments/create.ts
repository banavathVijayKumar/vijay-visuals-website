import { CloudflareEnv, jsonResponse, handleOptions } from '../../_shared';
import { requireUser, isResponse } from '../_auth';
export async function onRequestOptions() { return handleOptions(); }
export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  const env = context.env;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return jsonResponse({ error: 'Razorpay is not configured by the administrator.' }, 503);
  const body: any = await context.request.json().catch(() => null);
  if (!body?.planId) return jsonResponse({ error: 'planId is required.' }, 400);
  const plan = await env.DB!.prepare(`SELECT p.id,p.service_id,p.price_minor,p.currency,p.billing_period,s.name AS service_name
    FROM ai_service_plans p JOIN ai_services s ON s.id=p.service_id
    WHERE p.id=? AND p.is_active=1 AND s.is_active=1`).bind(String(body.planId)).first<any>();
  if (!plan || !Number.isInteger(plan.price_minor) || plan.price_minor <= 0)
    return jsonResponse({ error: 'This plan is unavailable or has no valid admin-configured price.' }, 400);
  const orderId = crypto.randomUUID();
  const receipt = `vv_${orderId.replace(/-/g, '').slice(0, 24)}`;
  const basic = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const rpResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: plan.price_minor, currency: plan.currency || 'INR', receipt, notes: { vv_order_id: orderId, user_id: user.id } }),
  });
  const rpOrder: any = await rpResponse.json().catch(() => ({}));
  if (!rpResponse.ok || !rpOrder.id) return jsonResponse({ error: rpOrder?.error?.description || 'Unable to create Razorpay order.' }, 502);
  await env.DB!.prepare(`INSERT INTO vv_orders (id,user_id,service_id,plan_id,amount_minor,currency,status,razorpay_order_id)
    VALUES (?,?,?,?,?,?, 'payment_pending',?)`).bind(orderId, user.id, plan.service_id, plan.id, plan.price_minor, plan.currency || 'INR', rpOrder.id).run();
  return jsonResponse({ orderId, razorpayOrderId: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency,
    keyId: env.RAZORPAY_KEY_ID, serviceName: plan.service_name });
}
