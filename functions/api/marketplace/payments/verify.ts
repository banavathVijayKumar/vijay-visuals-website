import { CloudflareEnv, jsonResponse, handleOptions } from '../../_shared';
import { requireUser, isResponse, hmacSha256Hex, safeEqual } from '../_auth';
export async function onRequestOptions() { return handleOptions(); }
export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  const env = context.env;
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return jsonResponse({ error: 'Razorpay is not configured.' }, 503);
  const body: any = await context.request.json().catch(() => null);
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body || {};
  if (![orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === 'string' && v.length))
    return jsonResponse({ error: 'Payment verification details are incomplete.' }, 400);
  const order = await env.DB!.prepare(`SELECT id,user_id,service_id,plan_id,amount_minor,currency,status,razorpay_order_id
    FROM vv_orders WHERE id=? AND user_id=?`).bind(orderId, user.id).first<any>();
  if (!order || order.razorpay_order_id !== razorpay_order_id) return jsonResponse({ error: 'Order not found.' }, 404);
  if (order.status === 'paid') return jsonResponse({ verified: true, alreadyActivated: true });
  const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!safeEqual(expected, razorpay_signature)) return jsonResponse({ error: 'Payment signature verification failed.' }, 400);

  // Verify the payment with Razorpay itself before activating access.
  const basic = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  const payment: any = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok || payment.order_id !== razorpay_order_id || payment.status !== 'captured' ||
      payment.amount !== order.amount_minor || payment.currency !== order.currency) {
    return jsonResponse({ error: 'Razorpay has not confirmed a captured payment matching this order.' }, 402);
  }

  const now = new Date();
  const plan = await env.DB!.prepare('SELECT billing_period FROM ai_service_plans WHERE id=?').bind(order.plan_id).first<any>();
  const ends = new Date(now);
  if (plan?.billing_period === 'monthly') ends.setMonth(ends.getMonth() + 1);
  else if (plan?.billing_period === 'yearly') ends.setFullYear(ends.getFullYear() + 1);
  else ends.setFullYear(ends.getFullYear() + 100);
  await env.DB!.prepare(`UPDATE vv_orders SET status='paid',razorpay_payment_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='payment_pending'`)
    .bind(razorpay_payment_id, order.id).run();
  await env.DB!.prepare(`INSERT OR IGNORE INTO vv_subscriptions (id,user_id,service_id,plan_id,order_id,status,starts_at,ends_at)
    VALUES (?,?,?,?,?,'active',?,?)`).bind(crypto.randomUUID(), user.id, order.service_id, order.plan_id, order.id, now.toISOString(), ends.toISOString()).run();
  return jsonResponse({ verified: true, activated: true });
}
