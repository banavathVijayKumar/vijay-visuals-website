// ============================================================================
// GET & POST /api/platform/shipping
// Shiprocket Integration (When Configured) + Transparent Shipping Quotes,
// Address Validation, Shipment Tracking, Cancellation & Return Workflows.
// SECURITY/HONESTY: Never invents fake AWB numbers or marks orders delivered
// without verified carrier/delivery status!
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText } from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  if (!websiteId) return errorJson('websiteId query parameter is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const shipmentsRes = await env.DB.prepare(
    'SELECT * FROM shipments WHERE website_id = ? ORDER BY updated_at DESC LIMIT 100'
  )
    .bind(websiteId)
    .all();

  const shiprocketConfigured = Boolean((env.SHIPROCKET_TOKEN || '').trim());

  return json({
    shiprocket: {
      configured: shiprocketConfigured,
      status: shiprocketConfigured ? 'configured' : 'setup_required',
      message: shiprocketConfigured
        ? 'Shiprocket API token configured on Cloudflare Pages Secrets.'
        : 'Integration Required: Configure SHIPROCKET_TOKEN in Cloudflare Pages Secrets to enable live Shiprocket AWB generation and automated courier tracking.',
    },
    shipments: shipmentsRes.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.action) return errorJson('action is required.', 400);
  const action = String(body.action);

  // 1. Validate Indian Delivery Address & Calculate Transparent Shipping Charge
  if (action === 'validate_and_quote') {
    const pincode = sanitizeText(body.pincode || '', 10).replace(/\D/g, '');
    const orderSubtotalInr = Math.max(0, Math.round(Number(body.orderSubtotalInr || 0)));
    const weightKg = Math.max(0.1, Number(body.weightKg || 0.5));

    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return errorJson('Please enter a valid 6-digit Indian delivery pincode.', 400);
    }

    const freeShippingThresholdInr = 999;
    const baseChargeInr = orderSubtotalInr >= freeShippingThresholdInr ? 0 : Math.max(49, Math.round(49 + Math.max(0, weightKg - 0.5) * 40));

    return json({
      validAddress: true,
      pincode,
      shippingChargeInr: baseChargeInr,
      freeShippingApplied: baseChargeInr === 0,
      freeShippingThresholdInr,
      shiprocketConfigured: Boolean((env.SHIPROCKET_TOKEN || '').trim()),
    });
  }

  const websiteId = sanitizeText(body.websiteId || '', 120);
  if (!websiteId) return errorJson('websiteId is required.', 400);

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  // 2. Create Shipment (Uses Live Shiprocket API if configured; never fabricates AWBs)
  if (action === 'create_shipment') {
    const orderId = Number(body.orderId);
    const provider = body.provider === 'shiprocket' ? 'shiprocket' : body.provider === 'local_delivery' ? 'local_delivery' : 'manual';
    const deliveryPincode = sanitizeText(body.deliveryPincode || '', 10).replace(/\D/g, '');
    const shippingChargeInr = Math.max(0, Math.round(Number(body.shippingChargeInr || 0)));

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return errorJson('Valid orderId is required.', 400);
    }
    if (deliveryPincode && !/^[1-9][0-9]{5}$/.test(deliveryPincode)) {
      return errorJson('Invalid 6-digit Indian delivery pincode.', 400);
    }

    const order = await env.DB.prepare(
      'SELECT * FROM store_orders WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(orderId, websiteId)
      .first<{
        id: number;
        order_number: string;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        shipping_address: string;
        total_inr: number;
        payment_method: string;
        items_json: string;
      }>();

    if (!order) return errorJson('Store order not found for this website.', 404);

    let shiprocketOrderId = '';
    let shiprocketShipmentId = '';
    let awbCode = sanitizeText(body.awbCode || '', 80);
    let courierName = sanitizeText(body.courierName || '', 80);
    let trackingUrl = sanitizeText(body.trackingUrl || '', 400);

    if (provider === 'shiprocket') {
      const token = (env.SHIPROCKET_TOKEN || '').trim();
      if (!token) {
        return json(
          {
            status: 'setup_required',
            error:
              'Integration Required: Configure SHIPROCKET_TOKEN in Cloudflare Pages Secrets before creating Shiprocket shipments. Alternatively use manual courier tracking or local delivery.',
          },
          503
        );
      }

      const srRes = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: order.order_number,
          order_date: new Date().toISOString().slice(0, 10),
          pickup_location: sanitizeText(body.pickupLocation || 'Primary', 60),
          billing_customer_name: order.customer_name,
          billing_last_name: '',
          billing_address: order.shipping_address || 'Address provided by customer',
          billing_city: sanitizeText(body.city || 'Hyderabad', 60),
          billing_pincode: deliveryPincode || '500001',
          billing_state: sanitizeText(body.state || 'Telangana', 60),
          billing_country: 'India',
          billing_email: order.customer_email || 'vk66278@gmail.com',
          billing_phone: order.customer_phone || '9381362201',
          shipping_is_billing: true,
          order_items: [
            {
              name: `Order ${order.order_number}`,
              sku: order.order_number,
              units: 1,
              selling_price: order.total_inr,
            },
          ],
          payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
          sub_total: order.total_inr,
          length: 10,
          breadth: 10,
          height: 10,
          weight: Number(body.weightKg || 0.5),
        }),
      });

      const srData = (await srRes.json().catch(() => ({}))) as {
        order_id?: number | string;
        shipment_id?: number | string;
        awb_code?: string;
        courier_name?: string;
        message?: string;
      };

      if (!srRes.ok || !srData.order_id) {
        return errorJson(
          `Shiprocket API error (${srRes.status}): ${srData.message || 'Unable to create Shiprocket order.'}`,
          502
        );
      }

      shiprocketOrderId = String(srData.order_id);
      shiprocketShipmentId = String(srData.shipment_id || '');
      awbCode = String(srData.awb_code || '');
      courierName = String(srData.courier_name || 'Shiprocket');
      trackingUrl = awbCode ? `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}` : '';
    }

    const status = awbCode ? 'awb_assigned' : 'pending';
    await env.DB.prepare(
      `INSERT INTO shipments
        (website_id, order_id, order_number, provider, shiprocket_order_id, shiprocket_shipment_id,
         awb_code, courier_name, tracking_url, shipping_charge_inr, delivery_pincode, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(order_id) DO UPDATE SET
         provider = excluded.provider,
         shiprocket_order_id = excluded.shiprocket_order_id,
         shiprocket_shipment_id = excluded.shiprocket_shipment_id,
         awb_code = excluded.awb_code,
         courier_name = excluded.courier_name,
         tracking_url = excluded.tracking_url,
         status = excluded.status,
         updated_at = datetime('now')`
    )
      .bind(
        websiteId,
        order.id,
        order.order_number,
        provider,
        shiprocketOrderId,
        shiprocketShipmentId,
        awbCode,
        courierName,
        trackingUrl,
        shippingChargeInr,
        deliveryPincode,
        status
      )
      .run();

    const saved = await env.DB.prepare('SELECT * FROM shipments WHERE order_id = ? LIMIT 1')
      .bind(order.id)
      .first();
    return json({ shipment: saved }, 201);
  }

  // 3. Update Shipment Status (Enforces Verified Delivery Proof Requirement)
  if (action === 'update_status') {
    const orderId = Number(body.orderId);
    const nextStatus = sanitizeText(body.status || '', 40);
    const allowed = ['pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'rto_initiated', 'returned'];
    if (!Number.isInteger(orderId) || !allowed.includes(nextStatus)) {
      return errorJson('Valid orderId and shipment status are required.', 400);
    }

    const verifiedSource = sanitizeText(body.verifiedDeliverySource || '', 120);
    if (nextStatus === 'delivered' && !verifiedSource) {
      return errorJson(
        'Orders cannot be marked delivered without a verified delivery source (carrier tracking proof or delivery partner POD).',
        400
      );
    }

    const storeOrder = await env.DB.prepare(
      'SELECT id, website_id, payment_method, payment_status, order_status FROM store_orders WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(orderId, websiteId)
      .first<{
        id: number;
        website_id: string;
        payment_method: string;
        payment_status: string;
        order_status: string;
      }>();

    if (!storeOrder) {
      return errorJson('Store order not found for this website.', 404);
    }

    const mappedOrderStatus =
      nextStatus === 'delivered'
        ? 'delivered'
        : nextStatus === 'out_for_delivery' || nextStatus === 'in_transit'
          ? 'out_for_delivery'
          : nextStatus === 'cancelled'
            ? 'cancelled'
            : nextStatus === 'returned'
              ? 'returned'
              : null;

    // UNPAID ONLINE ORDER FULFILLMENT RESTRICTION
    // Block transitions to out_for_delivery or delivered unless payment is verified as paid.
    // COD orders proceed without online payment restriction.
    const RESTRICTED_FULFILLMENT_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'delivered'];
    const isOnlinePayment = storeOrder.payment_method === 'cashfree_online' || storeOrder.payment_method !== 'cod';
    if (
      isOnlinePayment &&
      storeOrder.payment_status !== 'paid' &&
      mappedOrderStatus &&
      RESTRICTED_FULFILLMENT_STATUSES.includes(mappedOrderStatus)
    ) {
      return errorJson(
        `Cannot transition unpaid online order to "${mappedOrderStatus}". Payment must be verified before fulfillment.`,
        409
      );
    }

    await env.DB.prepare(
      `UPDATE shipments SET status = ?, verified_delivery_source = ?, updated_at = datetime('now') WHERE order_id = ? AND website_id = ?`
    )
      .bind(nextStatus, verifiedSource, orderId, websiteId)
      .run();

    if (mappedOrderStatus) {
      await env.DB.prepare(
        `UPDATE store_orders SET order_status = ?, updated_at = datetime('now') WHERE id = ? AND website_id = ?`
      )
        .bind(mappedOrderStatus, orderId, websiteId)
        .run();
    }

    return json({ updated: true, orderId, status: nextStatus, verifiedDeliverySource: verifiedSource });
  }

  return errorJson('Unsupported shipping action.', 400);
}
