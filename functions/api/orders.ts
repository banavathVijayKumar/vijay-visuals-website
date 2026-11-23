// ============================================================================
// POST /api/orders — Production Storefront Checkout Endpoint (Cloudflare D1)
// - Server-side price, stock & coupon recalculation (never trusts client totals)
// - Atomic stock check & decrement
// - Rate-limited duplicate submission guard
// - Honest payment status: NEVER marks online/UPI payments as "paid" without
//   verified gateway webhook / manual merchant verification.
// ============================================================================

import { requireUser } from './_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from './_shared';
import {
  findPublicationByIdentifier,
  isMissingTableError,
  mapOrderRowToUi,
  parseProductMeta,
} from './_tenantAccess';
import { createEdgeCashfreeOrder, getEdgeCashfreeStatus } from './payments/_cashfree';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  if (!env.DB) {
    return jsonResponse({ error: 'Order storage is not configured.' }, 503);
  }

  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(env, `order_create:${clientIp}`, 15, 600);
  if (!rl.allowed) {
    return jsonResponse(
      { error: 'Too many order attempts. Please wait a few minutes and try again.' },
      429
    );
  }

  // Optional authenticated customer attribution
  let customerUserId: string | null = null;
  if (request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (auth.ok) customerUserId = auth.user.id;
  }

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);
  }

  const tenantIdentifier = body.tenantId ?? body.tenantSlug ?? body.websiteId;
  if (!tenantIdentifier) {
    return jsonResponse({ error: 'Storefront identifier is required.' }, 400);
  }

  const pub = await findPublicationByIdentifier(env, String(tenantIdentifier));
  if (!pub || pub.status !== 'published') {
    return jsonResponse({ error: 'This storefront is not currently accepting orders.' }, 404);
  }

  const customerName = sanitizeText(body.customerName, 120);
  const customerPhone = sanitizeText(body.customerPhone, 30);
  const customerEmail = sanitizeText(body.customerEmail, 160).toLowerCase();
  const streetAddress = sanitizeText(body.shippingAddress, 320);
  const city = sanitizeText(body.city, 80);
  const state = sanitizeText(body.state, 80);
  const pincode = sanitizeText(body.pincode, 16).replace(/[^A-Za-z0-9-\s]/g, '');
  const deliveryInstructions = sanitizeText(body.deliveryInstructions, 240);

  if (pincode && pincode.replace(/\D/g, '').length > 0 && pincode.replace(/\D/g, '').length < 4) {
    return jsonResponse({ error: 'Please enter a valid postal/PIN code.' }, 400);
  }

  const addressParts = [streetAddress, city, state, pincode ? `PIN: ${pincode}` : ''].filter(Boolean);
  const composedAddress = deliveryInstructions
    ? `${addressParts.join(', ')} | Note: ${deliveryInstructions}`
    : addressParts.join(', ');
  const shippingAddress = composedAddress.slice(0, 600);

  if (!customerName || customerName.length < 2) {
    return jsonResponse({ error: 'Customer full name is required.' }, 400);
  }
  if (!customerPhone || customerPhone.replace(/\D/g, '').length < 8) {
    return jsonResponse({ error: 'A valid phone number is required for order delivery.' }, 400);
  }
  if (!streetAddress || streetAddress.length < 5) {
    return jsonResponse({ error: 'Delivery address is required.' }, 400);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0 || rawItems.length > 50) {
    return jsonResponse({ error: 'Cart must contain between 1 and 50 items.' }, 400);
  }

  let parsedWebsite: Record<string, any> = {};
  try {
    parsedWebsite = pub.website_json ? JSON.parse(pub.website_json) : {};
  } catch {}

  const rawMethod = String(body.paymentMethod || 'cod').toLowerCase();
  const dbPaymentMethod: 'cod' | 'upi_manual' | 'cashfree_online' =
    rawMethod === 'upi_reference' || rawMethod === 'upi_manual'
      ? 'upi_manual'
      : rawMethod === 'cashfree_online' || rawMethod === 'online' || rawMethod === 'cashfree' || rawMethod === 'razorpay_online'
        ? 'cashfree_online'
        : 'cod';

  if (dbPaymentMethod === 'cod' && parsedWebsite.codEnabled === false) {
    return jsonResponse(
      { error: 'Cash on Delivery is not enabled for this store.' },
      400
    );
  }
  if (dbPaymentMethod === 'cashfree_online') {
    const cfStatus = getEdgeCashfreeStatus(env);
    if (!cfStatus.configured) {
      return jsonResponse(
        { error: 'Online Cashfree payment gateway is not configured on the server. Please select Cash on Delivery or UPI.' },
        503
      );
    }
  }

  const paymentReference = sanitizeText(body.paymentReference, 100);
  if (dbPaymentMethod === 'upi_manual' && !paymentReference) {
    return jsonResponse({ error: 'UPI transaction UTR/reference number is required.' }, 400);
  }

  const deliveryFee = Math.max(0, Math.round(Number(parsedWebsite.deliveryFee || 0)));
  const isWholesale = Boolean(body.isWholesale);

  try {
    // 1. Validate every item against authoritative D1 store_products table
    const orderLines: Array<{
      productId: number;
      name: string;
      variant: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];
    let subtotal = 0;

    for (const item of rawItems) {
      const productId = Number(item?.productId);
      const quantity = Math.round(Number(item?.quantity));
      const variant = sanitizeText(item?.variant, 60) || 'Standard';

      if (!Number.isInteger(productId) || productId <= 0) {
        return jsonResponse({ error: 'Invalid product in cart.' }, 400);
      }
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 500) {
        return jsonResponse({ error: 'Invalid item quantity.' }, 400);
      }

      const prod = await env.DB.prepare(
        `SELECT id, name, price_inr, stock_qty, variants_json, is_active
         FROM store_products
         WHERE id = ? AND website_id = ? LIMIT 1`
      )
        .bind(productId, pub.website_id)
        .first<{
          id: number;
          name: string;
          price_inr: number;
          stock_qty: number;
          variants_json?: string | null;
          is_active: number;
        }>();

      if (!prod || prod.is_active !== 1) {
        return jsonResponse({ error: `Product #${productId} is no longer available.` }, 400);
      }
      if (prod.stock_qty < quantity) {
        return jsonResponse(
          { error: `Insufficient stock for "${prod.name}". Only ${prod.stock_qty} available.` },
          409
        );
      }

      const meta = parseProductMeta(prod.variants_json);
      const unitPrice =
        isWholesale && meta.wholesalePrice > 0 && quantity >= meta.minWholesaleQty
          ? meta.wholesalePrice
          : Number(prod.price_inr);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      orderLines.push({
        productId: prod.id,
        name: prod.name,
        variant,
        quantity,
        unitPrice,
        lineTotal,
      });
    }

    // 2. Validate & apply optional coupon server-side
    let discount = 0;
    let appliedCode = '';
    const requestedCoupon = sanitizeText(body.couponCode, 40).toUpperCase();
    if (requestedCoupon) {
      try {
        const coup = await env.DB.prepare(
          `SELECT id, code, discount_type, discount_value, min_order_inr, max_discount_inr, expires_at
           FROM store_coupons
           WHERE website_id = ? AND UPPER(code) = ? AND is_active = 1 LIMIT 1`
        )
          .bind(pub.website_id, requestedCoupon)
          .first<Record<string, any>>();
        if (coup && subtotal >= Number(coup.min_order_inr || 0)) {
          const expMs = coup.expires_at ? Date.parse(String(coup.expires_at)) : NaN;
          if (!Number.isFinite(expMs) || expMs >= Date.now()) {
            appliedCode = String(coup.code);
            if (coup.discount_type === 'flat') {
              discount = Math.min(subtotal, Number(coup.discount_value || 0));
            } else {
              discount = Math.round((subtotal * Number(coup.discount_value || 0)) / 100);
              if (coup.max_discount_inr) {
                discount = Math.min(discount, Number(coup.max_discount_inr));
              }
            }
            await env.DB.prepare(
              'UPDATE store_coupons SET used_count = used_count + 1 WHERE id = ?'
            )
              .bind(coup.id)
              .run();
          }
        }
      } catch {
        // Optional store_coupons table may not exist
      }
    }

    const total = Math.max(0, subtotal - discount + deliveryFee);
    const orderNumber = `VV-${Date.now().toString().slice(-6)}-${randomHex(2).toUpperCase()}`;

    // 3. Decrement product stock atomically (conditional WHERE stock_qty >= quantity)
    for (const line of orderLines) {
      const dec = await env.DB.prepare(
        `UPDATE store_products
         SET stock_qty = stock_qty - ?, updated_at = datetime('now')
         WHERE id = ? AND website_id = ? AND stock_qty >= ?`
      )
        .bind(line.quantity, line.productId, pub.website_id, line.quantity)
        .run();
      if (dec?.meta?.changes === 0) {
        return jsonResponse(
          { error: `Stock changed while placing order for "${line.name}". Please retry.` },
          409
        );
      }
    }

    // 4. Create Cashfree Order if online payment selected
    let cfSessionId: string | null = null;
    let cfOrderId: string = '';
    let cfMode: 'sandbox' | 'production' = 'sandbox';

    if (dbPaymentMethod === 'cashfree_online') {
      cfOrderId = `vv_store_${orderNumber}_${randomHex(2)}`;
      const returnUrl = `https://master.vijay-visuals-site.pages.dev/site/${pub.public_slug}?order_id=${encodeURIComponent(
        cfOrderId
      )}`;

      const cfRes = await createEdgeCashfreeOrder(env, {
        orderId: cfOrderId,
        amountInr: total,
        currency: 'INR',
        customerDetails: {
          customerId: customerUserId || `cust_${Date.now().toString(36)}`,
          customerName,
          customerEmail: customerEmail || 'store.customer@vijayvisuals.com',
          customerPhone: customerPhone || '9999999999',
        },
        orderMeta: { returnUrl },
        orderNote: `Store Order #${orderNumber} (${pub.public_slug || 'Store'})`,
        orderTags: {
          website_id: pub.website_id,
          order_number: orderNumber,
        },
      });

      cfSessionId = cfRes.paymentSessionId;
      cfMode = cfRes.mode;
    }

    // 5. Insert order with honest payment_status = 'pending' (never fake paid)
    const insertRes = await env.DB.prepare(
      `INSERT INTO store_orders
       (order_number, website_id, owner_id, customer_user_id, customer_name, customer_phone, customer_email,
        shipping_address, items_json, subtotal_inr, discount_inr, gst_inr, shipping_inr, total_inr,
        coupon_code, payment_method, payment_status, gateway_order_id, gateway_payment_id, order_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?, ?, 'placed')`
    )
      .bind(
        orderNumber,
        pub.website_id,
        pub.owner_id,
        customerUserId,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress,
        JSON.stringify(orderLines),
        subtotal,
        discount,
        deliveryFee,
        total,
        appliedCode,
        dbPaymentMethod,
        cfOrderId,
        paymentReference
      )
      .run();

    const orderId = Number(insertRes?.meta?.last_row_id || 0);

    // Record in cashfree_payments ledger if online Cashfree order
    if (dbPaymentMethod === 'cashfree_online' && cfOrderId && cfSessionId) {
      await env.DB.prepare(
        `INSERT INTO cashfree_payments (
          order_id, cf_order_id, payment_session_id, entity_type, reference_id,
          website_id, user_id, user_email, user_phone, base_amount_inr,
          gst_amount_inr, amount_inr, currency, environment, status,
          notes_json, raw_response_json, created_at, updated_at
        ) VALUES (
          ?, NULL, ?, 'storefront_order', ?,
          ?, ?, ?, ?, ?,
          0, ?, 'INR', ?, 'CREATED',
          ?, '{}', datetime('now'), datetime('now')
        )`
      )
        .bind(
          cfOrderId,
          cfSessionId,
          orderNumber,
          pub.website_id,
          customerUserId || 'guest',
          customerEmail,
          customerPhone,
          total,
          total,
          cfMode,
          JSON.stringify({ orderNumber, websiteId: pub.website_id, deliveryFee, subtotal, discount })
        )
        .run();
    }

    const createdRow = orderId
      ? await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
          .bind(orderId)
          .first<Record<string, any>>()
      : await env.DB.prepare('SELECT * FROM store_orders WHERE order_number = ? LIMIT 1')
          .bind(orderNumber)
          .first<Record<string, any>>();

    return jsonResponse(
      {
        order: createdRow
          ? mapOrderRowToUi(createdRow, Number(pub.rowid || 0))
          : null,
        paymentSessionId: cfSessionId,
        cfOrderId: cfOrderId || null,
        cashfreeEnvironment: cfMode,
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error:
            'Online order checkout requires D1 migration 0003 (store_orders, store_products). Please contact the store via WhatsApp.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to place order right now. Please try again.' }, 500);
  }
}
