// ============================================================================
// GET & POST /api/platform/commerce
// E-Commerce Catalog, Server-Side Coupons, Authenticated & Guest Checkout,
// Customer Address Book, Order History/Tracking, Cancel/Return Requests,
// Low-Stock Alerts, Warehouses, Suppliers, POs, and Scoped Delivery Partners
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../_shared';
import { assertProductQuota } from '../_tenantAccess';

interface CouponRow {
  id: number;
  website_id: string;
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  min_order_inr: number;
  max_discount_inr: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: number;
}

function evaluateCoupon(
  coupon: CouponRow,
  subtotalInr: number
): { valid: true; discountInr: number } | { valid: false; reason: string } {
  if (!coupon.is_active) return { valid: false, reason: 'This coupon is currently inactive.' };
  if (coupon.expires_at) {
    const expMs = Date.parse(coupon.expires_at);
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return { valid: false, reason: 'This coupon has expired.' };
    }
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, reason: 'This coupon has reached its maximum usage limit.' };
  }
  if (subtotalInr < (coupon.min_order_inr || 0)) {
    return {
      valid: false,
      reason: `Minimum order value of ₹${coupon.min_order_inr} is required for coupon ${coupon.code}.`,
    };
  }
  let discount =
    coupon.discount_type === 'percent'
      ? Math.round((subtotalInr * coupon.discount_value) / 100)
      : Math.round(coupon.discount_value);
  if (coupon.max_discount_inr !== null && coupon.max_discount_inr > 0) {
    discount = Math.min(discount, coupon.max_discount_inr);
  }
  discount = Math.max(0, Math.min(subtotalInr, discount));
  return { valid: true, discountInr: discount };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  const scope = (url.searchParams.get('scope') || '').toLowerCase();

  // Public / Guest Order Tracking (requires exact orderNumber + last 4 digits of phone)
  if (scope === 'track_order') {
    const orderNumber = sanitizeText(url.searchParams.get('orderNumber') || '', 60).toUpperCase();
    const phoneLast4 = sanitizeText(url.searchParams.get('phoneLast4') || '', 10).replace(/\D/g, '').slice(-4);
    if (!orderNumber || phoneLast4.length !== 4) {
      return errorJson('orderNumber and the last 4 digits of customer phone (phoneLast4) are required.', 400);
    }

    const order = await env.DB.prepare(
      `SELECT id, order_number, website_id, customer_name, customer_phone, subtotal_inr, discount_inr, gst_inr,
              shipping_inr, total_inr, payment_method, payment_status, order_status, created_at, updated_at
       FROM store_orders WHERE UPPER(order_number) = ? LIMIT 1`
    )
      .bind(orderNumber)
      .first<Record<string, unknown>>();

    if (!order) return errorJson('Order not found.', 404);
    const storedDigits = String(order.customer_phone || '').replace(/\D/g, '');
    if (!storedDigits.endsWith(phoneLast4)) {
      return errorJson('Order tracking verification failed. Phone digits do not match.', 403);
    }

    const shipment = await env.DB.prepare(
      'SELECT courier_name, awb_code, tracking_url, status, updated_at FROM shipments WHERE order_id = ? LIMIT 1'
    )
      .bind(order.id)
      .first()
      .catch(() => null);

    return json({
      order: {
        orderNumber: order.order_number,
        customerName: order.customer_name,
        totalInr: order.total_inr,
        discountInr: order.discount_inr,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
      shipment: shipment || null,
    });
  }

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  // Authenticated Customer Order History (strictly scoped to own user ID)
  if (scope === 'my_orders') {
    const orders = await env.DB.prepare(
      `SELECT id, order_number, website_id, customer_name, items_json, subtotal_inr, discount_inr, gst_inr,
              shipping_inr, total_inr, coupon_code, payment_method, payment_status, order_status, created_at, updated_at
       FROM store_orders
       WHERE customer_user_id = ? OR customer_user_id = ?
       ORDER BY created_at DESC LIMIT 100`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all();
    return json({ orders: orders.results || [] });
  }

  // Authenticated Customer Address Book (strictly scoped to own user ID)
  if (scope === 'my_addresses') {
    const addresses = await env.DB.prepare(
      `SELECT * FROM customer_addresses
       WHERE user_id = ? OR user_id = ?
       ORDER BY is_default DESC, updated_at DESC LIMIT 20`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all();
    return json({ addresses: addresses.results || [] });
  }

  // Delivery Partner view: ONLY assigned deliveries for this authenticated user
  if (scope === 'my_deliveries') {
    const deliveries = await env.DB.prepare(
      `SELECT da.*, so.order_number, so.customer_name, so.customer_phone, so.shipping_address, so.total_inr, so.payment_method
       FROM delivery_assignments da
       INNER JOIN store_orders so ON so.id = da.order_id
       WHERE da.delivery_partner_user_id = ? OR da.delivery_partner_user_id = ?
       ORDER BY da.updated_at DESC`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all();

    return json({ deliveries: deliveries.results || [] });
  }

  if (!websiteId) return errorJson('websiteId query parameter is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const [products, orders, warehouses, suppliers, purchaseOrders, deliveries, coupons, refunds] =
    await Promise.all([
      env.DB.prepare('SELECT * FROM store_products WHERE website_id = ? ORDER BY id DESC')
        .bind(websiteId)
        .all<Record<string, unknown>>(),
      env.DB.prepare('SELECT * FROM store_orders WHERE website_id = ? ORDER BY created_at DESC LIMIT 100')
        .bind(websiteId)
        .all(),
      env.DB.prepare(
        'SELECT * FROM inventory_warehouses WHERE website_id = ? ORDER BY is_default DESC, id ASC'
      )
        .bind(websiteId)
        .all(),
      env.DB.prepare('SELECT * FROM inventory_suppliers WHERE website_id = ? ORDER BY name ASC')
        .bind(websiteId)
        .all(),
      env.DB.prepare('SELECT * FROM purchase_orders WHERE website_id = ? ORDER BY created_at DESC LIMIT 50')
        .bind(websiteId)
        .all(),
      env.DB.prepare(
        'SELECT * FROM delivery_assignments WHERE website_id = ? ORDER BY updated_at DESC LIMIT 50'
      )
        .bind(websiteId)
        .all(),
      env.DB.prepare('SELECT * FROM store_coupons WHERE website_id = ? ORDER BY created_at DESC LIMIT 50')
        .bind(websiteId)
        .all()
        .catch(() => ({ results: [] })),
      env.DB.prepare('SELECT * FROM refunds WHERE website_id = ? ORDER BY created_at DESC LIMIT 50')
        .bind(websiteId)
        .all()
        .catch(() => ({ results: [] })),
    ]);

  const productRows = products.results || [];
  const lowStockAlerts = productRows.filter(
    (p) => Number(p.stock_qty || 0) <= Number(p.low_stock_threshold || 5)
  );

  return json({
    products: productRows,
    lowStockAlerts,
    orders: orders.results || [],
    warehouses: warehouses.results || [],
    suppliers: suppliers.results || [],
    purchaseOrders: purchaseOrders.results || [],
    deliveries: deliveries.results || [],
    coupons: coupons.results || [],
    refunds: refunds.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.action) return errorJson('action is required.', 400);
  const action = String(body.action);

  // Public or Authenticated Coupon Validation (read-only)
  if (action === 'validate_coupon') {
    const websiteId = sanitizeText(body.websiteId || '', 120);
    const code = sanitizeText(body.couponCode || '', 30).toUpperCase();
    const subtotalInr = Math.max(0, Math.round(Number(body.subtotalInr || 0)));
    if (!websiteId || !code) return errorJson('websiteId and couponCode are required.', 400);

    const coupon = await env.DB.prepare(
      'SELECT * FROM store_coupons WHERE website_id = ? AND UPPER(code) = ? LIMIT 1'
    )
      .bind(websiteId, code)
      .first<CouponRow>();
    if (!coupon) return errorJson('Invalid coupon code for this store.', 404);

    const check = evaluateCoupon(coupon, subtotalInr);
    if (!check.valid) return errorJson(check.reason, 400);

    return json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      discountInr: check.discountInr,
    });
  }

  // Place Order action: supports BOTH Authenticated customers AND Guest COD checkout
  if (action === 'create_order') {
    const websiteId = sanitizeText(body.websiteId || '', 120);
    if (!websiteId) return errorJson('websiteId is required.', 400);

    const isGuestCheckout = body.guestCheckout === true && !request.headers.get('Authorization');
    let actorUserId: string | null = null;
    let defaultName = '';
    let defaultEmail = '';

    if (isGuestCheckout) {
      const clientIp =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For') ||
        'unknown';
      const rl = await checkRateLimit(env, `guest_order:${clientIp}`, 15, 3600);
      if (!rl.allowed) {
        return errorJson('Too many guest checkout attempts. Please try again later.', 429);
      }
      if (body.paymentMethod && body.paymentMethod !== 'cod') {
        return errorJson(
          'Online checkout requires signing in so payment receipts and refunds remain tied to your account. Guest checkout supports Cash on Delivery (cod).',
          401
        );
      }
    } else {
      const auth = await requireUser(request, env);
      if (!auth.ok) return auth.response;
      actorUserId = auth.user.id;
      defaultName = auth.user.fullName;
      defaultEmail = auth.user.email;
    }

    const customerName = sanitizeText(body.customerName || defaultName, 120);
    const customerPhone = sanitizeText(body.customerPhone || '', 30);
    const customerEmail = sanitizeText(body.customerEmail || defaultEmail, 120);
    const shippingAddress = sanitizeText(body.shippingAddress || '', 400);

    if (customerName.length < 2 || customerPhone.replace(/\D/g, '').length < 10) {
      return errorJson('Valid customerName and 10-digit customerPhone are required.', 400);
    }
    if (isGuestCheckout && shippingAddress.length < 10) {
      return errorJson('Complete shippingAddress (minimum 10 characters) is required for guest checkout.', 400);
    }

    const website = await env.DB.prepare(
      'SELECT website_id, owner_id, status FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ website_id: string; owner_id: string; status: string }>();
    if (!website) return errorJson('Store website not found.', 404);

    const items = Array.isArray(body.items) ? (body.items as Array<{ productId?: number; qty?: number }>) : [];
    if (items.length === 0) return errorJson('At least one product item is required.', 400);

    let subtotal = 0;
    let gstTotal = 0;
    const resolvedItems: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const prodId = Number(item.productId);
      const qty = Math.max(1, Math.round(Number(item.qty || 1)));
      const product = await env.DB.prepare(
        'SELECT id, name, price_inr, gst_percent, stock_qty FROM store_products WHERE id = ? AND website_id = ? AND is_active = 1 LIMIT 1'
      )
        .bind(prodId, websiteId)
        .first<{ id: number; name: string; price_inr: number; gst_percent: number; stock_qty: number }>();
      if (!product) return errorJson(`Product #${prodId} is unavailable for this store.`, 404);
      if (product.stock_qty < qty) {
        return errorJson(`Insufficient stock for "${product.name}" (available: ${product.stock_qty}).`, 409);
      }

      const lineSubtotal = product.price_inr * qty;
      const lineGst = Math.round((lineSubtotal * product.gst_percent) / 100);
      subtotal += lineSubtotal;
      gstTotal += lineGst;
      resolvedItems.push({
        productId: product.id,
        name: product.name,
        qty,
        unitPriceInr: product.price_inr,
        gstPercent: product.gst_percent,
        lineTotalInr: lineSubtotal + lineGst,
      });

      const dec = await env.DB.prepare(
        `UPDATE store_products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ? AND website_id = ? AND stock_qty >= ?`
      )
        .bind(qty, product.id, websiteId, qty)
        .run();

      if (dec?.meta?.changes === 0) {
        return errorJson(`Insufficient stock for "${product.name}" (available: ${product.stock_qty}).`, 409);
      }

      await env.DB.prepare(
        `INSERT INTO stock_movements (website_id, product_id, delta_qty, movement_type, reference_note, actor_id, created_at)
         VALUES (?, ?, ?, 'sale_out', ?, ?, datetime('now'))`
      )
        .bind(
          websiteId,
          product.id,
          -qty,
          isGuestCheckout ? 'Guest store order' : 'Customer store order',
          actorUserId || 'guest'
        )
        .run();
    }

    // SECURITY: Authoritative server-side coupon evaluation (NEVER trust client discountInr!)
    let appliedCouponCode = '';
    let discountInr = 0;
    const requestedCoupon = sanitizeText(body.couponCode || '', 30).toUpperCase();
    if (requestedCoupon) {
      const coupon = await env.DB.prepare(
        'SELECT * FROM store_coupons WHERE website_id = ? AND UPPER(code) = ? LIMIT 1'
      )
        .bind(websiteId, requestedCoupon)
        .first<CouponRow>();
      if (!coupon) return errorJson(`Coupon code "${requestedCoupon}" is invalid.`, 400);

      const check = evaluateCoupon(coupon, subtotal);
      if (!check.valid) return errorJson(check.reason, 400);

      appliedCouponCode = coupon.code;
      discountInr = check.discountInr;
      await env.DB.prepare(
        `UPDATE store_coupons SET used_count = used_count + 1 WHERE id = ?`
      )
        .bind(coupon.id)
        .run();
    }

    const shippingInr = Math.max(0, Math.round(Number(body.shippingInr || 0)));
    const totalInr = Math.max(0, subtotal - discountInr + gstTotal + shippingInr);
    const orderNumber = `VV-${Date.now().toString(36).toUpperCase()}-${randomHex(2).toUpperCase()}`;
    const paymentMethod =
      !isGuestCheckout &&
      (body.paymentMethod === 'razorpay_online' || body.paymentMethod === 'upi_manual')
        ? body.paymentMethod
        : 'cod';

    // SECURITY: Online orders ALWAYS start as payment_status = 'pending' until HMAC verified!
    const insertRes = await env.DB.prepare(
      `INSERT INTO store_orders
        (order_number, website_id, owner_id, customer_user_id, customer_name, customer_phone, customer_email,
         shipping_address, items_json, subtotal_inr, discount_inr, gst_inr, shipping_inr, total_inr,
         coupon_code, payment_method, payment_status, order_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'placed', datetime('now'), datetime('now'))`
    )
      .bind(
        orderNumber,
        websiteId,
        website.owner_id,
        actorUserId,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        JSON.stringify(resolvedItems),
        subtotal,
        discountInr,
        gstTotal,
        shippingInr,
        totalInr,
        appliedCouponCode,
        paymentMethod
      )
      .run();

    return json(
      {
        orderId: Number(insertRes.meta?.last_row_id || 0),
        orderNumber,
        guestCheckout: isGuestCheckout,
        paymentMethod,
        paymentStatus: 'pending',
        subtotalInr: subtotal,
        discountInr,
        couponCode: appliedCouponCode || null,
        gstInr: gstTotal,
        shippingInr,
        totalInr,
        items: resolvedItems,
      },
      201
    );
  }

  // All remaining POST actions require an authenticated user
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  // Customer Address Book: Save / Update Address
  if (action === 'save_address') {
    const recipientName = sanitizeText(body.recipientName || auth.user.fullName, 120);
    const phone = sanitizeText(body.phone || '', 30);
    const addressLine1 = sanitizeText(body.addressLine1 || '', 240);
    const city = sanitizeText(body.city || '', 80);
    const state = sanitizeText(body.state || '', 80);
    const pincode = sanitizeText(body.pincode || '', 12).replace(/\D/g, '');
    if (recipientName.length < 2 || addressLine1.length < 5 || !/^[1-9][0-9]{5}$/.test(pincode)) {
      return errorJson('Valid recipientName, addressLine1, and 6-digit Indian pincode are required.', 400);
    }

    const isDefault = body.isDefault ? 1 : 0;
    if (isDefault) {
      await env.DB.prepare('UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?')
        .bind(auth.user.id)
        .run();
    }

    const res = await env.DB.prepare(
      `INSERT INTO customer_addresses
        (user_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        auth.user.id,
        sanitizeText(body.label || 'Home', 40),
        recipientName,
        phone,
        addressLine1,
        sanitizeText(body.addressLine2 || '', 240),
        city,
        state,
        pincode,
        isDefault
      )
      .run();

    return json({ addressId: Number(res.meta?.last_row_id || 0), saved: true }, 201);
  }

  // Customer Address Book: Delete Own Address
  if (action === 'delete_address') {
    const addressId = Number(body.addressId);
    if (!Number.isInteger(addressId)) return errorJson('addressId is required.', 400);
    const res = await env.DB.prepare('DELETE FROM customer_addresses WHERE id = ? AND user_id = ?')
      .bind(addressId, auth.user.id)
      .run();
    if (!res.meta?.changes) return errorJson('Address not found or forbidden.', 404);
    return json({ deleted: true, addressId });
  }

  // Customer or Shop Owner: Cancel Order or Request Return / Refund
  if (action === 'request_cancel_or_return') {
    const orderId = Number(body.orderId);
    const reason = sanitizeText(body.reason || '', 300);
    if (!Number.isInteger(orderId) || reason.length < 5) {
      return errorJson('orderId and reason (minimum 5 characters) are required.', 400);
    }

    const order = await env.DB.prepare(
      `SELECT id, order_number, website_id, owner_id, customer_user_id, items_json, total_inr,
              payment_method, payment_status, order_status
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<{
        id: number;
        order_number: string;
        website_id: string;
        owner_id: string;
        customer_user_id: string | null;
        items_json: string;
        total_inr: number;
        payment_method: string;
        payment_status: string;
        order_status: string;
      }>();

    if (!order) return errorJson('Order not found.', 404);
    const isBuyer =
      order.customer_user_id === auth.user.id || order.customer_user_id === auth.user.authSubject;
    const isOwner = order.owner_id === auth.user.id || auth.user.isSuperAdmin;
    if (!isBuyer && !isOwner) {
      return errorJson('Forbidden: you do not have permission to cancel or return this order.', 403);
    }

    if (order.order_status === 'cancelled') {
      return errorJson('Order is already cancelled.', 409);
    }

    const isPreShipment = ['placed', 'confirmed', 'packed'].includes(order.order_status);
    const nextOrderStatus = isPreShipment ? 'cancelled' : 'return_requested';

    await env.DB.prepare(
      `UPDATE store_orders SET order_status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(nextOrderStatus, order.id)
      .run();

    // Restore inventory on pre-shipment cancellation
    if (isPreShipment) {
      try {
        const parsedItems = JSON.parse(order.items_json || '[]') as Array<{ productId?: number; qty?: number }>;
        for (const item of parsedItems) {
          if (item.productId && item.qty) {
            await env.DB.prepare(
              `UPDATE store_products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ? AND website_id = ?`
            )
              .bind(item.qty, item.productId, order.website_id)
              .run();
          }
        }
      } catch {
        // Non-fatal if items_json cannot be parsed
      }
    }

    let refundId: number | null = null;
    if (order.payment_status === 'paid' || nextOrderStatus === 'return_requested') {
      const refRes = await env.DB.prepare(
        `INSERT INTO refunds
          (flow_type, store_order_id, website_id, amount_inr, reason, status, requested_by, created_at, updated_at)
         VALUES ('seller_order', ?, ?, ?, ?, 'requested', ?, datetime('now'), datetime('now'))`
      )
        .bind(order.id, order.website_id, order.total_inr, reason, auth.user.id)
        .run();
      refundId = Number(refRes.meta?.last_row_id || 0);
    }

    return json({
      updated: true,
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: nextOrderStatus,
      refundId,
      refundStatus: refundId ? 'requested' : 'not_required_unpaid_cod',
    });
  }

  // Delivery Partner status update (scoped ONLY to their own assigned delivery!)
  if (action === 'update_delivery_status') {
    const assignmentId = Number(body.assignmentId);
    const nextStatus = sanitizeText(body.status || '', 30);
    const allowedStatuses = ['picked_up', 'in_transit', 'delivered', 'failed_attempt', 'returned'];
    if (!Number.isInteger(assignmentId) || !allowedStatuses.includes(nextStatus)) {
      return errorJson('Valid assignmentId and delivery status are required.', 400);
    }

    const assignment = await env.DB.prepare('SELECT * FROM delivery_assignments WHERE id = ? LIMIT 1')
      .bind(assignmentId)
      .first<{ id: number; website_id: string; order_id: number; delivery_partner_user_id: string }>();
    if (!assignment) return errorJson('Delivery assignment not found.', 404);

    const isAssignedPartner =
      assignment.delivery_partner_user_id === auth.user.id ||
      assignment.delivery_partner_user_id === auth.user.authSubject;

    if (!isAssignedPartner && !auth.user.isSuperAdmin) {
      const ownerAccess = await requireWebsiteAccess(env, auth.user, assignment.website_id, [
        'business_owner',
        'business_manager',
      ]);
      if (!ownerAccess.ok) {
        return errorJson('Forbidden: only the assigned delivery partner or business manager can update this delivery.', 403);
      }
    }

    const storeOrder = await env.DB.prepare(
      'SELECT id, website_id, payment_method, payment_status, order_status FROM store_orders WHERE id = ? LIMIT 1'
    )
      .bind(assignment.order_id)
      .first<{
        id: number;
        website_id: string;
        payment_method: string;
        payment_status: string;
        order_status: string;
      }>();

    if (!storeOrder) {
      return errorJson('Associated store order not found.', 404);
    }

    // UNPAID ONLINE ORDER FULFILLMENT RESTRICTION
    // Block transitions to out_for_delivery or delivered unless payment is verified as paid.
    // COD orders proceed without online payment restriction.
    const RESTRICTED_FULFILLMENT_STATUSES = ['picked_up', 'in_transit', 'delivered', 'ready_for_pickup', 'out_for_delivery'];
    const isOnlinePayment = storeOrder.payment_method === 'cashfree_online' || storeOrder.payment_method !== 'cod';
    if (
      isOnlinePayment &&
      storeOrder.payment_status !== 'paid' &&
      RESTRICTED_FULFILLMENT_STATUSES.includes(nextStatus)
    ) {
      const targetLabel = nextStatus === 'delivered' ? 'delivered' : 'out_for_delivery';
      return errorJson(
        `Cannot transition unpaid online order to "${targetLabel}". Payment must be verified before fulfillment.`,
        409
      );
    }

    const codCollected = body.codCollected ? 1 : 0;
    const podNote = sanitizeText(body.proofOfDeliveryNote || '', 300);
    const podUrl = sanitizeText(body.proofOfDeliveryUrl || '', 500);

    await env.DB.prepare(
      `UPDATE delivery_assignments
       SET status = ?, cod_collected = ?, proof_of_delivery_note = ?, proof_of_delivery_url = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(nextStatus, codCollected, podNote, podUrl, assignmentId)
      .run();

    if (nextStatus === 'delivered') {
      await env.DB.prepare(
        `UPDATE store_orders
         SET order_status = 'delivered',
             payment_status = CASE WHEN payment_method = 'cod' AND ? = 1 THEN 'paid' ELSE payment_status END,
             updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(codCollected, assignment.order_id)
        .run();
    } else if (nextStatus === 'in_transit' || nextStatus === 'picked_up') {
      await env.DB.prepare(
        `UPDATE store_orders SET order_status = 'out_for_delivery', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(assignment.order_id)
        .run();
    }

    return json({ updated: true, assignmentId, status: nextStatus, codCollected: Boolean(codCollected) });
  }

  const websiteId = sanitizeText(body.websiteId || '', 120);
  if (!websiteId) return errorJson('websiteId is required.', 400);

  // All remaining management actions require Business Owner / Manager / Staff role on this website
  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  // Store Coupons: Create Coupon
  if (action === 'create_coupon') {
    const code = sanitizeText(body.code || '', 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const discountType = body.discountType === 'flat' ? 'flat' : 'percent';
    const discountValue = Math.round(Number(body.discountValue || 0));
    const minOrderInr = Math.max(0, Math.round(Number(body.minOrderInr || 0)));
    const maxDiscountInr = body.maxDiscountInr ? Math.round(Number(body.maxDiscountInr)) : null;
    const maxUses = body.maxUses ? Math.max(1, Math.round(Number(body.maxUses))) : null;
    const expiresAt = body.expiresAt ? sanitizeText(body.expiresAt, 40) : null;

    if (code.length < 3 || discountValue <= 0) {
      return errorJson('Coupon code (3+ alphanumeric chars) and positive discountValue are required.', 400);
    }
    if (discountType === 'percent' && discountValue > 90) {
      return errorJson('Percentage coupon discount cannot exceed 90%.', 400);
    }

    try {
      const res = await env.DB.prepare(
        `INSERT INTO store_coupons
          (website_id, owner_id, code, discount_type, discount_value, min_order_inr, max_discount_inr, max_uses, used_count, expires_at, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, datetime('now'))`
      )
        .bind(
          websiteId,
          access.website.owner_id,
          code,
          discountType,
          discountValue,
          minOrderInr,
          maxDiscountInr,
          maxUses,
          expiresAt
        )
        .run();
      return json({ couponId: Number(res.meta?.last_row_id || 0), code, discountType, discountValue }, 201);
    } catch {
      return errorJson(`Coupon code "${code}" already exists for this store.`, 409);
    }
  }

  if (action === 'toggle_coupon') {
    const couponId = Number(body.couponId);
    const isActive = body.isActive ? 1 : 0;
    if (!Number.isInteger(couponId)) return errorJson('couponId is required.', 400);
    await env.DB.prepare('UPDATE store_coupons SET is_active = ? WHERE id = ? AND website_id = ?')
      .bind(isActive, couponId, websiteId)
      .run();
    return json({ updated: true, couponId, isActive: Boolean(isActive) });
  }

  if (action === 'create_product') {
    const name = sanitizeText(body.name || '', 160);
    const priceInr = Math.round(Number(body.priceInr || 0));
    if (name.length < 2 || !Number.isFinite(priceInr) || priceInr < 0) {
      return errorJson('Product name (2+ chars) and non-negative priceInr are required.', 400);
    }

    const quota = await assertProductQuota(
      env,
      websiteId,
      access.website.owner_id,
      auth.user.isSuperAdmin
    );
    if (!quota.ok) return quota.error;

    const insertRes = await env.DB.prepare(
      `INSERT INTO store_products
        (website_id, owner_id, sku, barcode, name, category, description, price_inr, compare_at_price_inr,
         gst_percent, stock_qty, low_stock_threshold, variants_json, images_json, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        sanitizeText(body.sku || `SKU-${randomHex(3).toUpperCase()}`, 60),
        sanitizeText(body.barcode || '', 64),
        name,
        sanitizeText(body.category || 'general', 60),
        sanitizeText(body.description || '', 1200),
        priceInr,
        body.compareAtPriceInr ? Math.round(Number(body.compareAtPriceInr)) : null,
        Math.max(0, Math.min(28, Math.round(Number(body.gstPercent || 0)))),
        Math.max(0, Math.round(Number(body.stockQty || 0))),
        Math.max(0, Math.round(Number(body.lowStockThreshold || 5))),
        JSON.stringify(Array.isArray(body.variants) ? body.variants : []),
        JSON.stringify(Array.isArray(body.images) ? body.images : [])
      )
      .run();

    const productId = Number(insertRes.meta?.last_row_id || 0);
    return json({ productId, name, priceInr }, 201);
  }

  if (action === 'create_warehouse') {
    const name = sanitizeText(body.name || '', 100);
    if (name.length < 2) return errorJson('Warehouse name is required.', 400);
    const res = await env.DB.prepare(
      `INSERT INTO inventory_warehouses (website_id, owner_id, name, address, manager_name, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        name,
        sanitizeText(body.address || '', 300),
        sanitizeText(body.managerName || '', 100),
        body.isDefault ? 1 : 0
      )
      .run();
    return json({ warehouseId: Number(res.meta?.last_row_id || 0), name }, 201);
  }

  if (action === 'create_supplier') {
    const name = sanitizeText(body.name || '', 120);
    if (name.length < 2) return errorJson('Supplier name is required.', 400);
    const res = await env.DB.prepare(
      `INSERT INTO inventory_suppliers (website_id, owner_id, name, contact_phone, contact_email, gst_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        websiteId,
        access.website.owner_id,
        name,
        sanitizeText(body.contactPhone || '', 30),
        sanitizeText(body.contactEmail || '', 120),
        sanitizeText(body.gstNumber || '', 20).toUpperCase(),
        sanitizeText(body.notes || '', 400)
      )
      .run();
    return json({ supplierId: Number(res.meta?.last_row_id || 0), name }, 201);
  }

  if (action === 'assign_delivery') {
    const orderId = Number(body.orderId);
    const partnerUserId = sanitizeText(body.deliveryPartnerUserId || '', 120);
    const partnerName = sanitizeText(body.partnerName || '', 120);
    if (!Number.isInteger(orderId) || !partnerUserId) {
      return errorJson('orderId and deliveryPartnerUserId are required.', 400);
    }

    const order = await env.DB.prepare(
      'SELECT id, total_inr, payment_method FROM store_orders WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(orderId, websiteId)
      .first<{ id: number; total_inr: number; payment_method: string }>();
    if (!order) return errorJson('Order not found for this website.', 404);

    const codAmount = order.payment_method === 'cod' ? order.total_inr : 0;
    const res = await env.DB.prepare(
      `INSERT INTO delivery_assignments (website_id, order_id, delivery_partner_user_id, partner_name, status, cod_amount_inr, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'assigned', ?, datetime('now'), datetime('now'))
       ON CONFLICT(order_id) DO UPDATE SET
         delivery_partner_user_id = excluded.delivery_partner_user_id,
         partner_name = excluded.partner_name,
         status = 'assigned',
         updated_at = datetime('now')`
    )
      .bind(websiteId, orderId, partnerUserId, partnerName, codAmount)
      .run();

    const row = await env.DB.prepare('SELECT id FROM delivery_assignments WHERE order_id = ?').bind(orderId).first<{ id: number }>();
    return json({ assignmentId: row?.id || Number(res.meta?.last_row_id || 0), orderId, partnerUserId }, 201);
  }

  return errorJson('Unsupported commerce action.', 400);
}
