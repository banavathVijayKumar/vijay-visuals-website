// ============================================================================
// POST /api/payments/seller/verify
// Flow 2 Server-Side Signature Verification for Routed Shop Owner Store Orders
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../../_shared';
import { verifyEdgeRazorpayPaymentSignature } from '../_razorpay';

interface SellerTransferRow {
  id: number;
  website_id: string;
  seller_owner_id: string;
  store_order_id: number;
  order_number: string;
  buyer_user_id: string | null;
  razorpay_order_id: string;
  signature_verified: number;
  status: string;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  }>(request);

  if (!body) return errorJson('Invalid JSON payload.', 400);

  const orderId = sanitizeText(body.razorpay_order_id || body.razorpayOrderId || '', 120);
  const paymentId = sanitizeText(body.razorpay_payment_id || body.razorpayPaymentId || '', 120);
  const signature = sanitizeText(body.razorpay_signature || body.razorpaySignature || '', 128);

  if (!orderId || !paymentId || !signature) {
    return errorJson(
      'razorpay_order_id, razorpay_payment_id, and razorpay_signature are all required.',
      400
    );
  }

  const transfer = await env.DB.prepare(
    'SELECT * FROM seller_payment_transfers WHERE razorpay_order_id = ? LIMIT 1'
  )
    .bind(orderId)
    .first<SellerTransferRow>();

  if (!transfer) {
    return errorJson('Seller store payment order record not found.', 404);
  }

  const allowed =
    transfer.buyer_user_id === auth.user.id ||
    transfer.buyer_user_id === auth.user.authSubject ||
    transfer.seller_owner_id === auth.user.id ||
    transfer.seller_owner_id === auth.user.authSubject ||
    auth.user.isSuperAdmin;

  if (!allowed) {
    return errorJson('Forbidden: you cannot verify this store payment.', 403);
  }

  const validSig = await verifyEdgeRazorpayPaymentSignature(env, {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });

  if (!validSig) {
    return errorJson('Store payment verification failed: invalid HMAC-SHA256 signature.', 400);
  }

  if (transfer.signature_verified === 1) {
    return json({ verified: true, idempotentReplay: true, orderNumber: transfer.order_number });
  }

  await env.DB.prepare(
    `UPDATE seller_payment_transfers
     SET razorpay_payment_id = ?, signature_verified = 1, status = 'routed', updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(paymentId, transfer.id)
    .run();

  await env.DB.prepare(
    `UPDATE store_orders
     SET payment_status = 'paid', order_status = 'confirmed',
         gateway_order_id = ?, gateway_payment_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(orderId, paymentId, transfer.store_order_id)
    .run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_webhook_events
      (event_id, provider, event_type, flow_type, reference_id, signature_verified, payload_json, processed_at)
     VALUES (?, 'razorpay', 'payment.verified_seller_checkout', 'seller_order', ?, 1, ?, datetime('now'))`
  )
    .bind(`seller_checkout:${paymentId}`, orderId, JSON.stringify({ orderNumber: transfer.order_number, paymentId }))
    .run();

  return json({
    verified: true,
    idempotentReplay: false,
    orderNumber: transfer.order_number,
    paymentId,
  });
}
