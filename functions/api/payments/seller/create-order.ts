// ============================================================================
// POST /api/payments/seller/create-order
// Flow 2: Shop Owner Customer Store Payments (STRICT ACCOUNT SEPARATION)
// SECURITY RULE: Shop owners' customer payments MUST NEVER automatically go
// into Vijay Visuals' personal Razorpay account.
// Online Razorpay checkout for a store order is ONLY permitted when:
//   1. env.RAZORPAY_ROUTE_ENABLED === 'true'
//   2. Seller's payout account has kyc_status === 'verified' AND valid acc_* ID
//   3. Order payload attaches explicit Razorpay Route `transfers` to seller acc_*
// Otherwise returns 403 instructing storefront to use COD or seller's direct UPI.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  json,
  parseJsonBody,
  sanitizeText,
} from '../../_shared';
import { createEdgeRazorpayOrder, getEdgeRazorpayStatus } from '../_razorpay';

interface StoreOrderRow {
  id: number;
  order_number: string;
  website_id: string;
  owner_id: string;
  customer_user_id: string | null;
  total_inr: number;
  payment_status: string;
}

interface SellerPayoutRow {
  website_id: string;
  linked_account_id: string;
  kyc_status: string;
  settlement_mode: string;
  platform_commission_percent: number;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rl = await checkRateLimit(env, `rzp_seller_order:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) {
    return errorJson('Too many checkout attempts. Please wait a few minutes.', 429);
  }

  const rzpStatus = getEdgeRazorpayStatus(env);
  if (!rzpStatus.configured) {
    return json(
      {
        status: rzpStatus.mode === 'live_locked' ? 'live_locked' : 'setup_required',
        settlementFallback: 'cod_or_seller_direct',
        error: rzpStatus.message,
      },
      rzpStatus.mode === 'live_locked' ? 403 : 503
    );
  }

  // HARD GUARDRAIL 1: Never collect shop owner customer sales into Vijay Visuals' personal account without Route
  if (!rzpStatus.routeEnabled) {
    return json(
      {
        status: 'seller_route_not_enabled',
        settlementFallback: 'cod_or_seller_direct',
        error:
          'Online payment routing for shop owner stores is disabled so customer funds never settle into Vijay Visuals’ personal account. Use Cash on Delivery or the shop owner’s direct payment method until Razorpay Route is enabled.',
      },
      403
    );
  }

  const body = await parseJsonBody<{
    websiteId?: string;
    orderId?: number;
    orderNumber?: string;
  }>(request);

  if (!body || !body.websiteId || (!body.orderId && !body.orderNumber)) {
    return errorJson('websiteId and orderId (or orderNumber) are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const orderId = Number(body.orderId || 0);
  const orderNumber = sanitizeText(body.orderNumber || '', 80);

  // Authoritative order lookup from Cloudflare D1 (never trust client amount)
  const order = await env.DB.prepare(
    `SELECT id, order_number, website_id, owner_id, customer_user_id, total_inr, payment_status
     FROM store_orders
     WHERE website_id = ? AND (id = ? OR order_number = ?) LIMIT 1`
  )
    .bind(websiteId, orderId || -1, orderNumber || '__none__')
    .first<StoreOrderRow>();

  if (!order) {
    return errorJson('Store order not found.', 404);
  }

  const isBuyerOrSeller =
    order.customer_user_id === auth.user.id ||
    order.customer_user_id === auth.user.authSubject ||
    order.owner_id === auth.user.id ||
    order.owner_id === auth.user.authSubject ||
    auth.user.isSuperAdmin;

  if (!isBuyerOrSeller) {
    return errorJson('Forbidden: you cannot initiate payment for another customer’s order.', 403);
  }

  if (order.payment_status === 'paid') {
    return errorJson('This store order is already marked as paid.', 409);
  }

  // HARD GUARDRAIL 2: Require verified Seller Linked Account (acc_*) so funds route to seller, NOT Vijay Visuals
  const payout = await env.DB.prepare(
    `SELECT website_id, linked_account_id, kyc_status, settlement_mode, platform_commission_percent
     FROM seller_payout_accounts WHERE website_id = ? LIMIT 1`
  )
    .bind(websiteId)
    .first<SellerPayoutRow>();

  if (
    !payout ||
    payout.kyc_status !== 'verified' ||
    !/^acc_[A-Za-z0-9]+$/.test((payout.linked_account_id || '').trim())
  ) {
    return json(
      {
        status: 'seller_kyc_required',
        settlementFallback: 'cod_or_seller_direct',
        error:
          'This shop owner has not completed verified Razorpay Route Linked Account KYC yet. Customer store payments are blocked from going into Vijay Visuals’ personal account — please complete checkout via COD or the seller’s direct UPI.',
      },
      403
    );
  }

  const grossAmountInr = Math.round(Number(order.total_inr || 0));
  if (grossAmountInr <= 0) {
    return errorJson('Order total must be greater than ₹0.', 400);
  }

  const commissionPct = Math.max(0, Math.min(25, Number(payout.platform_commission_percent || 0)));
  const platformFeeInr = Math.round((grossAmountInr * commissionPct) / 100);
  const sellerNetAmountInr = Math.max(1, grossAmountInr - platformFeeInr);

  try {
    const created = await createEdgeRazorpayOrder(env, {
      amountInr: grossAmountInr,
      currency: 'INR',
      receipt: order.order_number.slice(0, 40),
      notes: {
        flow_type: 'seller_order',
        website_id: websiteId,
        order_number: order.order_number,
        seller_linked_account_id: payout.linked_account_id,
      },
      routeTransfer: {
        linkedAccountId: payout.linked_account_id,
        sellerNetAmountInr,
        onHold: false,
      },
    });

    await env.DB.prepare(
      `INSERT INTO seller_payment_transfers
        (website_id, seller_owner_id, store_order_id, order_number, buyer_user_id,
         seller_linked_account_id, gross_amount_inr, platform_fee_inr, seller_net_amount_inr,
         currency, razorpay_mode, razorpay_order_id, signature_verified, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 0, 'created', datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        order.owner_id,
        order.id,
        order.order_number,
        auth.user.id,
        payout.linked_account_id,
        grossAmountInr,
        platformFeeInr,
        sellerNetAmountInr,
        created.mode,
        created.order.id
      )
      .run();

    await env.DB.prepare(
      `UPDATE store_orders SET payment_method = 'razorpay_online', gateway_order_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(created.order.id, order.id)
      .run();

    return json(
      {
        keyId: created.keyId, // Public RAZORPAY_KEY_ID only for Checkout modal
        mode: created.mode,
        settlementRecipient: payout.linked_account_id,
        grossAmountInr,
        platformFeeInr,
        sellerNetAmountInr,
        razorpayOrder: created.order,
      },
      201
    );
  } catch (err) {
    return errorJson(
      err instanceof Error ? err.message : 'Unable to create routed Razorpay store order.',
      502
    );
  }
}
