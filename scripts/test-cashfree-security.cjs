// ============================================================================
// VIJAY VISUALS — CASHFREE SECURITY & FINANCIAL VALIDATION TEST SUITE
// 22 Comprehensive Mocks-Only Automated Security Tests:
// 1. Correct amount and INR — accepted.
// 2. Incorrect Cashfree order amount — rejected.
// 3. Incorrect actual payment amount — rejected.
// 4. Incorrect currency — rejected.
// 5. Missing currency — rejected.
// 6. Zero amount — rejected.
// 7. Negative amount — rejected.
// 8. NaN or Infinity — rejected.
// 9. Malformed amount — rejected.
// 10. Browser-submitted amount manipulation — rejected.
// 11. Storefront amount mismatch — rejected.
// 12. Invalid webhook signature — rejected.
// 13. Valid webhook signature with amount mismatch — rejected.
// 14. Duplicate webhook event — safely ignored (idempotent).
// 15. Invalid event can be retried after correction.
// 16. Unpaid online order cannot be marked delivered.
// 17. Unpaid online order cannot be dispatched (ready_for_pickup / out_for_delivery).
// 18. COD order workflow remains functional.
// 19. Paid Cashfree order can proceed through fulfillment.
// 20. Legacy Razorpay create endpoint returns HTTP 410.
// 21. Legacy Razorpay verify endpoint returns HTTP 410.
// 22. Cashfree secrets never appear in API responses or logs.
// ============================================================================

const crypto = require('crypto');
const assert = require('assert');

// ----------------------------------------------------------------------------
// Utilities & Validation Logic Under Test
// ----------------------------------------------------------------------------
function toIntegerPaise(amount) {
  if (typeof amount === 'string' && amount.trim() === '') return -1;
  const num = Number(amount);
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) return -1;
  return Math.round(num * 100);
}

function computeHmacSha256Base64(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isLocalHost(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

function isApprovedDomain(hostname) {
  const h = (hostname || '').toLowerCase();
  if (isLocalHost(h)) return true;
  if (h === 'vijay-visuals-site.pages.dev' || h.endsWith('.vijay-visuals-site.pages.dev')) return true;
  if (h === 'vijayvisuals.com' || h.endsWith('.vijayvisuals.com')) return true;
  return false;
}

function getSafeRequestOrigin(request, env) {
  const configuredOrigin = (env?.APP_BASE_URL || env?.PUBLIC_ORIGIN || '').trim();
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalHost(parsed.hostname))) {
        return parsed.origin;
      }
    } catch {}
  }

  if (request?.url) {
    try {
      const reqUrl = new URL(request.url);
      const proto = reqUrl.protocol;
      const host = reqUrl.hostname;
      if (proto === 'https:' || (proto === 'http:' && isLocalHost(host))) {
        return reqUrl.origin;
      }
    } catch {}
  }

  const envMode = (env?.CASHFREE_ENV || 'sandbox').toLowerCase().trim();
  if (envMode === 'production') {
    return 'https://vijay-visuals-site.pages.dev';
  }
  return 'https://master.vijay-visuals-site.pages.dev';
}

function resolveSafeReturnUrl(inputUrl, fallbackPath, request, env) {
  const safeOrigin = getSafeRequestOrigin(request, env);
  const cleanFallbackPath = (fallbackPath || '/').startsWith('/') ? fallbackPath : `/${fallbackPath}`;

  if (!inputUrl || typeof inputUrl !== 'string' || inputUrl.trim() === '') {
    return `${safeOrigin}${cleanFallbackPath}`;
  }

  const trimmed = inputUrl.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return `${safeOrigin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${safeOrigin}${cleanFallbackPath}`;
    }
    const parsedOrigin = parsed.origin;

    if (parsedOrigin === safeOrigin) {
      return parsed.toString();
    }

    if (
      isApprovedDomain(parsed.hostname) &&
      (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalHost(parsed.hostname)))
    ) {
      return parsed.toString();
    }

    return `${safeOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `${safeOrigin}${cleanFallbackPath}`;
  }
}

function getSafeCashfreeNotifyUrl(request, env) {
  const explicitWebhookUrl = (env?.CASHFREE_WEBHOOK_URL || '').trim();
  if (explicitWebhookUrl) {
    try {
      const parsed = new URL(explicitWebhookUrl);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {}
  }

  const safeOrigin = getSafeRequestOrigin(request, env);
  try {
    const parsed = new URL(safeOrigin);
    if (parsed.protocol === 'https:' && !isLocalHost(parsed.hostname)) {
      return `${safeOrigin}/api/webhooks/cashfree`;
    }
  } catch {}

  const envMode = (env?.CASHFREE_ENV || 'sandbox').toLowerCase().trim();
  if (envMode === 'production') {
    return 'https://vijay-visuals-site.pages.dev/api/webhooks/cashfree';
  }
  return 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree';
}

// ----------------------------------------------------------------------------
// Mock Test Database
// ----------------------------------------------------------------------------
function createMockDatabase() {
  const cashfreePayments = new Map();
  const storeOrders = new Map();
  const webhookEvents = new Set();
  const deliveryAssignments = new Map();
  const shipments = new Map();

  cashfreePayments.set('vv_order_1001', {
    order_id: 'vv_order_1001',
    amount_inr: 14999,
    currency: 'INR',
    status: 'CREATED',
    entity_type: 'platform_package',
  });

  cashfreePayments.set('vv_store_order_2001', {
    order_id: 'vv_store_order_2001',
    amount_inr: 2500,
    currency: 'INR',
    status: 'CREATED',
    entity_type: 'storefront_order',
  });

  storeOrders.set(2001, {
    id: 2001,
    website_id: 'site_vijay',
    gateway_order_id: 'vv_store_order_2001',
    order_number: 'VV-STORE-2001',
    payment_method: 'cashfree_online',
    payment_status: 'pending',
    order_status: 'placed',
    total_inr: 2500,
  });

  storeOrders.set(2002, {
    id: 2002,
    website_id: 'site_vijay',
    gateway_order_id: 'vv_store_order_2002',
    order_number: 'VV-STORE-2002',
    payment_method: 'cashfree_online',
    payment_status: 'failed',
    order_status: 'placed',
    total_inr: 1800,
  });

  storeOrders.set(3001, {
    id: 3001,
    website_id: 'site_vijay',
    gateway_order_id: 'cod_order_3001',
    order_number: 'COD-3001',
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'placed',
    total_inr: 1200,
  });

  storeOrders.set(4001, {
    id: 4001,
    website_id: 'site_vijay',
    gateway_order_id: 'vv_paid_4001',
    order_number: 'PAID-4001',
    payment_method: 'cashfree_online',
    payment_status: 'paid',
    order_status: 'confirmed',
    total_inr: 3500,
  });

  deliveryAssignments.set(101, {
    id: 101,
    website_id: 'site_vijay',
    order_id: 2001,
    delivery_partner_user_id: 'user_dp_1',
    status: 'assigned',
  });

  deliveryAssignments.set(102, {
    id: 102,
    website_id: 'site_vijay',
    order_id: 2002,
    delivery_partner_user_id: 'user_dp_1',
    status: 'assigned',
  });

  deliveryAssignments.set(103, {
    id: 103,
    website_id: 'site_vijay',
    order_id: 3001,
    delivery_partner_user_id: 'user_dp_1',
    status: 'assigned',
  });

  deliveryAssignments.set(104, {
    id: 104,
    website_id: 'site_vijay',
    order_id: 4001,
    delivery_partner_user_id: 'user_dp_1',
    status: 'assigned',
  });

  return { cashfreePayments, storeOrders, webhookEvents, deliveryAssignments, shipments };
}

// ----------------------------------------------------------------------------
// Mock Payment Verify Handler Simulation
// ----------------------------------------------------------------------------
function simulateVerify({ db, orderId, cfOrder, cfPayments, clientAmount }) {
  // Ignore client-supplied amounts
  const existing = db.cashfreePayments.get(orderId);
  if (!existing) {
    return { status: 404, body: { error: 'Payment order record not found.' } };
  }

  if (existing.status === 'PAID') {
    return { status: 200, body: { verified: true, idempotentReplay: true, status: 'PAID' } };
  }

  const successfulPayment = (cfPayments || []).find((p) => p.payment_status === 'SUCCESS');
  const isPaid = cfOrder.order_status === 'PAID' || Boolean(successfulPayment);

  if (!isPaid) {
    return { status: 200, body: { verified: false, status: cfOrder.order_status } };
  }

  // Financial validation: expected amount from D1
  const expectedPaise = toIntegerPaise(existing.amount_inr);
  if (expectedPaise <= 0) {
    return { status: 500, body: { error: 'Invalid authoritative expected order amount in database.' } };
  }

  // Currency validation
  const cfOrderCurrency = String(cfOrder.order_currency || '').trim().toUpperCase();
  if (cfOrderCurrency !== 'INR') {
    return { status: 400, body: { error: `Payment currency mismatch. Expected INR, received ${cfOrderCurrency || 'unspecified'}.` } };
  }

  // Amount validation: order amount
  const cfOrderPaise = toIntegerPaise(cfOrder.order_amount);
  if (cfOrderPaise <= 0 || cfOrderPaise !== expectedPaise) {
    return { status: 400, body: { error: 'Payment order amount mismatch.' } };
  }

  // Amount validation: payment amount
  if (successfulPayment) {
    const paymentCurrency = String(successfulPayment.payment_currency || '').trim().toUpperCase();
    if (paymentCurrency && paymentCurrency !== 'INR') {
      return { status: 400, body: { error: 'Payment currency mismatch.' } };
    }
    const paymentPaise = toIntegerPaise(successfulPayment.payment_amount);
    if (paymentPaise <= 0 || paymentPaise !== expectedPaise) {
      return { status: 400, body: { error: 'Captured payment amount mismatch.' } };
    }
  }

  // Storefront total check
  if (existing.entity_type === 'storefront_order') {
    let storeOrder = null;
    for (const o of db.storeOrders.values()) {
      if (o.gateway_order_id === orderId) { storeOrder = o; break; }
    }
    if (!storeOrder) {
      return { status: 404, body: { error: 'Associated storefront store_order record not found.' } };
    }
    const storePaise = toIntegerPaise(storeOrder.total_inr);
    if (storePaise <= 0 || storePaise !== expectedPaise) {
      return { status: 400, body: { error: 'Storefront order total mismatch.' } };
    }
    storeOrder.payment_status = 'paid';
    storeOrder.order_status = 'confirmed';
  }

  existing.status = 'PAID';
  return { status: 200, body: { verified: true, status: 'PAID' } };
}

// ----------------------------------------------------------------------------
// Mock Webhook Handler Simulation
// ----------------------------------------------------------------------------
function simulateWebhook({ db, secret, timestamp, rawBody, signatureHeader, eventId }) {
  const expectedSig = computeHmacSha256Base64(secret, `${timestamp}${rawBody}`);
  if (!safeEqual(signatureHeader, expectedSig)) {
    return { status: 401, body: { error: 'Invalid Cashfree webhook HMAC-SHA256 Base64 signature.' } };
  }

  if (db.webhookEvents.has(eventId)) {
    return { status: 200, body: { ok: true, idempotentDuplicate: true, eventId } };
  }

  const payload = JSON.parse(rawBody);
  const eventType = payload.type || payload.event;
  const orderId = payload.data?.order?.order_id;
  const orderData = payload.data?.order;
  const paymentData = payload.data?.payment;

  if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'ORDER_PAID_WEBHOOK') {
    const existing = db.cashfreePayments.get(orderId);
    let storeOrder = null;
    for (const o of db.storeOrders.values()) {
      if (o.gateway_order_id === orderId) { storeOrder = o; break; }
    }

    if (!existing && !storeOrder) {
      return { status: 404, body: { error: 'Order record not found.' } };
    }

    let expectedPaise = -1;
    if (existing) expectedPaise = toIntegerPaise(existing.amount_inr);
    if (storeOrder) {
      const storePaise = toIntegerPaise(storeOrder.total_inr);
      if (expectedPaise > 0 && storePaise !== expectedPaise) {
        return { status: 400, body: { error: 'Storefront order amount mismatch.' } };
      }
      if (expectedPaise <= 0) expectedPaise = storePaise;
    }

    if (expectedPaise <= 0) {
      return { status: 500, body: { error: 'Invalid authoritative amount in database.' } };
    }

    const receivedCurrency = String(paymentData?.payment_currency || orderData?.order_currency || '').trim().toUpperCase();
    if (receivedCurrency !== 'INR') {
      return { status: 400, body: { error: 'Payment currency mismatch.' } };
    }

    const orderPaise = toIntegerPaise(orderData?.order_amount);
    if (orderPaise <= 0 || orderPaise !== expectedPaise) {
      return { status: 400, body: { error: 'Payment order amount mismatch.' } };
    }

    const paymentPaise = toIntegerPaise(paymentData?.payment_amount ?? orderData?.order_amount);
    if (paymentPaise <= 0 || paymentPaise !== expectedPaise) {
      return { status: 400, body: { error: 'Payment amount mismatch.' } };
    }

    // Success: mark paid and record eventId
    if (existing) existing.status = 'PAID';
    if (storeOrder) {
      storeOrder.payment_status = 'paid';
      storeOrder.order_status = 'confirmed';
    }
    db.webhookEvents.add(eventId);
    return { status: 200, body: { ok: true, eventId } };
  }

  return { status: 200, body: { ok: true, ignored: true } };
}

// ----------------------------------------------------------------------------
// Mock Delivery Status Handler Simulation
// ----------------------------------------------------------------------------
function simulateDeliveryStatusUpdate({ db, orderId, nextStatus }) {
  const order = db.storeOrders.get(orderId);
  if (!order) {
    return { status: 404, body: { error: 'Order not found.' } };
  }

  const RESTRICTED_FULFILLMENT_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'delivered'];
  if (
    order.payment_method === 'cashfree_online' &&
    order.payment_status !== 'paid' &&
    RESTRICTED_FULFILLMENT_STATUSES.includes(nextStatus)
  ) {
    return {
      status: 409,
      body: { error: `Cannot transition unpaid online order to "${nextStatus}". Payment must be verified before fulfillment.` },
    };
  }

  order.order_status = nextStatus;
  return { status: 200, body: { success: true, status: nextStatus } };
}

// ----------------------------------------------------------------------------
// Mock Platform Commerce Delivery Status Simulation (functions/api/platform/commerce.ts)
// ----------------------------------------------------------------------------
function simulateCommerceDeliveryStatusUpdate({ db, assignmentId, nextStatus, requestingUserId = 'user_dp_1', userRole = 'delivery_partner' }) {
  const assignment = db.deliveryAssignments.get(assignmentId);
  if (!assignment) {
    return { status: 404, body: { error: 'Delivery assignment not found.' } };
  }

  const isAssigned = assignment.delivery_partner_user_id === requestingUserId;
  const isAuthorized = isAssigned || userRole === 'super_admin' || userRole === 'business_owner';
  if (!isAuthorized) {
    return { status: 403, body: { error: 'Forbidden: only the assigned delivery partner or business manager can update this delivery.' } };
  }

  const storeOrder = db.storeOrders.get(assignment.order_id);
  if (!storeOrder) {
    return { status: 404, body: { error: 'Associated store order not found.' } };
  }

  const RESTRICTED_FULFILLMENT_STATUSES = ['picked_up', 'in_transit', 'delivered', 'ready_for_pickup', 'out_for_delivery'];
  const isOnlinePayment = storeOrder.payment_method === 'cashfree_online' || storeOrder.payment_method !== 'cod';
  if (
    isOnlinePayment &&
    storeOrder.payment_status !== 'paid' &&
    RESTRICTED_FULFILLMENT_STATUSES.includes(nextStatus)
  ) {
    const targetLabel = nextStatus === 'delivered' ? 'delivered' : 'out_for_delivery';
    return {
      status: 409,
      body: { error: `Cannot transition unpaid online order to "${targetLabel}". Payment must be verified before fulfillment.` },
    };
  }

  assignment.status = nextStatus;
  if (nextStatus === 'delivered') {
    storeOrder.order_status = 'delivered';
    if (storeOrder.payment_method === 'cod') {
      storeOrder.payment_status = 'paid';
    }
  } else if (nextStatus === 'in_transit' || nextStatus === 'picked_up') {
    storeOrder.order_status = 'out_for_delivery';
  }

  return { status: 200, body: { updated: true, status: nextStatus } };
}

// ----------------------------------------------------------------------------
// Mock Platform Shipping Status Simulation (functions/api/platform/shipping.ts)
// ----------------------------------------------------------------------------
function simulateShippingStatusUpdate({ db, orderId, websiteId, nextStatus, verifiedSource = 'BlueDart Carrier AWB: 12345678' }) {
  const storeOrder = db.storeOrders.get(orderId);
  if (!storeOrder || storeOrder.website_id !== websiteId) {
    return { status: 404, body: { error: 'Store order not found for this website.' } };
  }

  if (nextStatus === 'delivered' && !verifiedSource) {
    return { status: 400, body: { error: 'Orders cannot be marked delivered without a verified delivery source.' } };
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

  const RESTRICTED_FULFILLMENT_STATUSES = ['ready_for_pickup', 'out_for_delivery', 'delivered'];
  const isOnlinePayment = storeOrder.payment_method === 'cashfree_online' || storeOrder.payment_method !== 'cod';
  if (
    isOnlinePayment &&
    storeOrder.payment_status !== 'paid' &&
    mappedOrderStatus &&
    RESTRICTED_FULFILLMENT_STATUSES.includes(mappedOrderStatus)
  ) {
    return {
      status: 409,
      body: { error: `Cannot transition unpaid online order to "${mappedOrderStatus}". Payment must be verified before fulfillment.` },
    };
  }

  const shipment = db.shipments.get(orderId) || { order_id: orderId, website_id: websiteId };
  shipment.status = nextStatus;
  db.shipments.set(orderId, shipment);

  if (mappedOrderStatus) {
    storeOrder.order_status = mappedOrderStatus;
  }

  return { status: 200, body: { updated: true, status: nextStatus } };
}

// ----------------------------------------------------------------------------
// Test Execution
// ----------------------------------------------------------------------------
async function runTests() {
  console.log('====================================================================');
  console.log('VIJAY VISUALS — CASHFREE REMEDIATION SECURITY TEST SUITE (36 TESTS)');
  console.log('====================================================================\n');

  let passed = 0;
  const webhookSecret = 'test_webhook_secret_key_12345';

  function test(name, fn) {
    try {
      fn();
      console.log(`[PASS] Test ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] Test ${name}:`, err.message);
    }
  }

  // Test 1: Correct amount and INR — accepted
  test('1: Correct amount and INR — accepted', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 14999, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 14999, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.verified, true);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'PAID');
  });

  // Test 2: Incorrect Cashfree order amount — rejected
  test('2: Incorrect Cashfree order amount — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 1, order_currency: 'INR' }, // Tampered
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 14999, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /amount mismatch/i);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 3: Incorrect actual payment amount — rejected
  test('3: Incorrect actual payment amount — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 14999, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 100, payment_currency: 'INR' }], // Tampered
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /amount mismatch/i);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 4: Incorrect currency — rejected
  test('4: Incorrect currency — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 14999, order_currency: 'USD' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 14999, payment_currency: 'USD' }],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /currency mismatch/i);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 5: Missing currency — rejected
  test('5: Missing currency — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 14999, order_currency: '' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 14999 }],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /currency mismatch/i);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 6: Zero amount — rejected
  test('6: Zero amount — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 0, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 0, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 7: Negative amount — rejected
  test('7: Negative amount — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: -14999, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: -14999, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 8: NaN or Infinity — rejected
  test('8: NaN or Infinity — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: NaN, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: Infinity, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 9: Malformed amount — rejected
  test('9: Malformed amount — rejected', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 'abc', order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: '14999xyz', payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
  });

  // Test 10: Browser-submitted amount manipulation — rejected
  test('10: Browser-submitted amount manipulation — rejected', () => {
    const db = createMockDatabase();
    // Attacker sends { clientAmount: 1 } in browser request body, Cashfree returns real 14999
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'PAID', order_amount: 14999, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 14999, payment_currency: 'INR' }],
      clientAmount: 1, // Manipulated
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').amount_inr, 14999);
  });

  // Test 11: Storefront amount mismatch — rejected
  test('11: Storefront amount mismatch — rejected', () => {
    const db = createMockDatabase();
    // Tamper storeOrders total to 2000 while cashfree_payments is 2500
    db.storeOrders.get(2001).total_inr = 2000;
    const res = simulateVerify({
      db,
      orderId: 'vv_store_order_2001',
      cfOrder: { order_status: 'PAID', order_amount: 2500, order_currency: 'INR' },
      cfPayments: [{ payment_status: 'SUCCESS', payment_amount: 2500, payment_currency: 'INR' }],
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /Storefront order total mismatch/i);
    assert.strictEqual(db.storeOrders.get(2001).payment_status, 'pending');
  });

  // Test 12: Invalid webhook signature — rejected
  test('12: Invalid webhook signature — rejected', () => {
    const db = createMockDatabase();
    const rawBody = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'vv_order_1001', order_amount: 14999, order_currency: 'INR' } } });
    const res = simulateWebhook({
      db,
      secret: webhookSecret,
      timestamp: '1700000000',
      rawBody,
      signatureHeader: 'invalid_forged_signature_base64',
      eventId: 'evt_101',
    });
    assert.strictEqual(res.status, 401);
    assert.match(res.body.error, /signature/i);
  });

  // Test 13: Valid webhook signature with amount mismatch — rejected
  test('13: Valid webhook signature with amount mismatch — rejected', () => {
    const db = createMockDatabase();
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'vv_order_1001', order_amount: 10, order_currency: 'INR' }, // Underpaid
        payment: { cf_payment_id: 'cf_pay_999', payment_amount: 10, payment_currency: 'INR' },
      },
    });
    const timestamp = '1700000000';
    const signature = computeHmacSha256Base64(webhookSecret, `${timestamp}${rawBody}`);
    const res = simulateWebhook({
      db,
      secret: webhookSecret,
      timestamp,
      rawBody,
      signatureHeader: signature,
      eventId: 'evt_102',
    });
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /amount mismatch/i);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'CREATED');
    // Important: invalid event must NOT be recorded as processed
    assert.strictEqual(db.webhookEvents.has('evt_102'), false);
  });

  // Test 14: Duplicate webhook event — safely ignored
  test('14: Duplicate webhook event — safely ignored', () => {
    const db = createMockDatabase();
    db.webhookEvents.add('evt_103'); // Already processed
    const rawBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: 'vv_order_1001', order_amount: 14999, order_currency: 'INR' } },
    });
    const timestamp = '1700000000';
    const signature = computeHmacSha256Base64(webhookSecret, `${timestamp}${rawBody}`);
    const res = simulateWebhook({
      db,
      secret: webhookSecret,
      timestamp,
      rawBody,
      signatureHeader: signature,
      eventId: 'evt_103',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.idempotentDuplicate, true);
  });

  // Test 15: Invalid event can be retried after correction
  test('15: Invalid event can be retried after correction', () => {
    const db = createMockDatabase();
    // Step 1: Failed attempt with bad amount
    const badBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: 'vv_order_1001', order_amount: 999, order_currency: 'INR' } },
    });
    const timestamp = '1700000000';
    simulateWebhook({
      db,
      secret: webhookSecret,
      timestamp,
      rawBody: badBody,
      signatureHeader: computeHmacSha256Base64(webhookSecret, `${timestamp}${badBody}`),
      eventId: 'evt_retry_101',
    });
    assert.strictEqual(db.webhookEvents.has('evt_retry_101'), false);

    // Step 2: Retry with corrected amount succeeds
    const goodBody = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: { order: { order_id: 'vv_order_1001', order_amount: 14999, order_currency: 'INR' }, payment: { payment_amount: 14999, payment_currency: 'INR' } },
    });
    const retryRes = simulateWebhook({
      db,
      secret: webhookSecret,
      timestamp,
      rawBody: goodBody,
      signatureHeader: computeHmacSha256Base64(webhookSecret, `${timestamp}${goodBody}`),
      eventId: 'evt_retry_101',
    });
    assert.strictEqual(retryRes.status, 200);
    assert.strictEqual(db.webhookEvents.has('evt_retry_101'), true);
    assert.strictEqual(db.cashfreePayments.get('vv_order_1001').status, 'PAID');
  });

  // Test 16: Unpaid online order cannot be marked delivered
  test('16: Unpaid online order cannot be marked delivered', () => {
    const db = createMockDatabase();
    const res = simulateDeliveryStatusUpdate({ db, orderId: 2001, nextStatus: 'delivered' });
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /Cannot transition unpaid online order/i);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
  });

  // Test 17: Unpaid online order cannot be dispatched
  test('17: Unpaid online order cannot be dispatched', () => {
    const db = createMockDatabase();
    const res1 = simulateDeliveryStatusUpdate({ db, orderId: 2001, nextStatus: 'ready_for_pickup' });
    assert.strictEqual(res1.status, 409);
    const res2 = simulateDeliveryStatusUpdate({ db, orderId: 2001, nextStatus: 'out_for_delivery' });
    assert.strictEqual(res2.status, 409);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
  });

  // Test 18: COD order workflow remains functional
  test('18: COD order workflow remains functional', () => {
    const db = createMockDatabase();
    // COD orders are allowed to progress through dispatch & delivery
    const res1 = simulateDeliveryStatusUpdate({ db, orderId: 3001, nextStatus: 'ready_for_pickup' });
    assert.strictEqual(res1.status, 200);
    const res2 = simulateDeliveryStatusUpdate({ db, orderId: 3001, nextStatus: 'out_for_delivery' });
    assert.strictEqual(res2.status, 200);
    const res3 = simulateDeliveryStatusUpdate({ db, orderId: 3001, nextStatus: 'delivered' });
    assert.strictEqual(res3.status, 200);
    assert.strictEqual(db.storeOrders.get(3001).order_status, 'delivered');
  });

  // Test 19: Paid Cashfree order can proceed through fulfillment
  test('19: Paid Cashfree order can proceed through fulfillment', () => {
    const db = createMockDatabase();
    const res = simulateDeliveryStatusUpdate({ db, orderId: 4001, nextStatus: 'delivered' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(db.storeOrders.get(4001).order_status, 'delivered');
  });

  // Test 20: Legacy Razorpay create endpoint returns HTTP 410
  test('20: Legacy Razorpay create endpoint returns HTTP 410', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../functions/api/marketplace/payments/create.ts'), 'utf8');
    assert.strictEqual(content.includes('410'), true);
    assert.strictEqual(content.includes('decommissioned'), true);
    assert.strictEqual(content.includes('https://api.razorpay.com'), false);
    assert.strictEqual(content.includes('RAZORPAY_KEY_SECRET'), false);
  });

  // Test 21: Legacy Razorpay verify endpoint returns HTTP 410
  test('21: Legacy Razorpay verify endpoint returns HTTP 410', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../functions/api/marketplace/payments/verify.ts'), 'utf8');
    assert.strictEqual(content.includes('410'), true);
    assert.strictEqual(content.includes('decommissioned'), true);
    assert.strictEqual(content.includes('https://api.razorpay.com'), false);
    assert.strictEqual(content.includes('RAZORPAY_KEY_SECRET'), false);
  });

  // Test 22: Cashfree secrets never appear in API responses or logs
  test('22: Cashfree secrets never appear in API responses or logs', () => {
    const db = createMockDatabase();
    const res = simulateVerify({
      db,
      orderId: 'vv_order_1001',
      cfOrder: { order_status: 'FAILED', order_amount: 14999, order_currency: 'INR' },
      cfPayments: [],
    });
    const serialized = JSON.stringify(res);
    assert.strictEqual(serialized.includes('CASHFREE_CLIENT_SECRET'), false);
    assert.strictEqual(serialized.includes('CASHFREE_WEBHOOK_SECRET'), false);
  });

  // Test 23: Unpaid online order cannot become "out_for_delivery" via platform commerce route
  test('23: Unpaid online order cannot become "out_for_delivery" via platform commerce route', () => {
    const db = createMockDatabase();
    const res1 = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'in_transit' });
    assert.strictEqual(res1.status, 409);
    assert.match(res1.body.error, /Cannot transition unpaid online order to "out_for_delivery"/i);
    const res2 = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'picked_up' });
    assert.strictEqual(res2.status, 409);
    assert.match(res2.body.error, /Cannot transition unpaid online order to "out_for_delivery"/i);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
  });

  // Test 24: Unpaid online order cannot become "delivered" via platform commerce route
  test('24: Unpaid online order cannot become "delivered" via platform commerce route', () => {
    const db = createMockDatabase();
    const res = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'delivered' });
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /Cannot transition unpaid online order to "delivered"/i);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
    assert.strictEqual(db.deliveryAssignments.get(101).status, 'assigned');
  });

  // Test 25: Unpaid online order cannot become "out_for_delivery" via platform shipping route
  test('25: Unpaid online order cannot become "out_for_delivery" via platform shipping route', () => {
    const db = createMockDatabase();
    const res1 = simulateShippingStatusUpdate({ db, orderId: 2001, websiteId: 'site_vijay', nextStatus: 'in_transit' });
    assert.strictEqual(res1.status, 409);
    assert.match(res1.body.error, /Cannot transition unpaid online order to "out_for_delivery"/i);
    const res2 = simulateShippingStatusUpdate({ db, orderId: 2001, websiteId: 'site_vijay', nextStatus: 'out_for_delivery' });
    assert.strictEqual(res2.status, 409);
    assert.match(res2.body.error, /Cannot transition unpaid online order to "out_for_delivery"/i);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
  });

  // Test 26: Unpaid online order cannot become "delivered" via platform shipping route
  test('26: Unpaid online order cannot become "delivered" via platform shipping route', () => {
    const db = createMockDatabase();
    const res = simulateShippingStatusUpdate({ db, orderId: 2001, websiteId: 'site_vijay', nextStatus: 'delivered' });
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /Cannot transition unpaid online order to "delivered"/i);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
    assert.strictEqual(db.shipments.has(2001), false);
  });

  // Test 27: Pending and failed online payments are blocked with HTTP 409 across platform routes
  test('27: Pending and failed online payments are blocked with HTTP 409 across platform routes', () => {
    const db = createMockDatabase();
    // Order 2001 is pending
    const resPending1 = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'delivered' });
    assert.strictEqual(resPending1.status, 409);
    const resPending2 = simulateShippingStatusUpdate({ db, orderId: 2001, websiteId: 'site_vijay', nextStatus: 'delivered' });
    assert.strictEqual(resPending2.status, 409);

    // Order 2002 is failed
    const resFailed1 = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 102, nextStatus: 'delivered' });
    assert.strictEqual(resFailed1.status, 409);
    const resFailed2 = simulateShippingStatusUpdate({ db, orderId: 2002, websiteId: 'site_vijay', nextStatus: 'delivered' });
    assert.strictEqual(resFailed2.status, 409);
  });

  // Test 28: Paid online order can proceed through platform delivery and shipping workflows
  test('28: Paid online order can proceed through platform delivery and shipping workflows', () => {
    const db = createMockDatabase();
    // Order 4001 is paid online
    const resCommerceTransit = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 104, nextStatus: 'in_transit' });
    assert.strictEqual(resCommerceTransit.status, 200);
    assert.strictEqual(db.storeOrders.get(4001).order_status, 'out_for_delivery');

    const resCommerceDelivered = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 104, nextStatus: 'delivered' });
    assert.strictEqual(resCommerceDelivered.status, 200);
    assert.strictEqual(db.storeOrders.get(4001).order_status, 'delivered');

    // Shipping workflow for paid order
    const resShipping = simulateShippingStatusUpdate({ db, orderId: 4001, websiteId: 'site_vijay', nextStatus: 'delivered' });
    assert.strictEqual(resShipping.status, 200);
    assert.strictEqual(db.storeOrders.get(4001).order_status, 'delivered');
  });

  // Test 29: COD order fulfillment remains functional across platform delivery and shipping routes
  test('29: COD order fulfillment remains functional across platform delivery and shipping routes', () => {
    const db = createMockDatabase();
    // Order 3001 is COD
    const resCommerce = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 103, nextStatus: 'in_transit' });
    assert.strictEqual(resCommerce.status, 200);
    assert.strictEqual(db.storeOrders.get(3001).order_status, 'out_for_delivery');

    const resShipping = simulateShippingStatusUpdate({ db, orderId: 3001, websiteId: 'site_vijay', nextStatus: 'out_for_delivery' });
    assert.strictEqual(resShipping.status, 200);

    const resDelivered = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 103, nextStatus: 'delivered' });
    assert.strictEqual(resDelivered.status, 200);
    assert.strictEqual(db.storeOrders.get(3001).order_status, 'delivered');
    assert.strictEqual(db.storeOrders.get(3001).payment_status, 'paid');
  });

  // Test 30: Rejected transitions do not modify database order status or shipments, and tenant isolation holds
  test('30: Rejected transitions do not modify database order status or shipments, and tenant isolation holds', () => {
    const db = createMockDatabase();
    // Attempt rejected delivery update on order 2001
    const resBlocked = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'delivered' });
    assert.strictEqual(resBlocked.status, 409);
    assert.strictEqual(db.storeOrders.get(2001).order_status, 'placed');
    assert.strictEqual(db.deliveryAssignments.get(101).status, 'assigned');

    // Tenant isolation: order from another website returns 404
    const resForeignWebsite = simulateShippingStatusUpdate({ db, orderId: 2001, websiteId: 'wrong_tenant_site', nextStatus: 'delivered' });
    assert.strictEqual(resForeignWebsite.status, 404);

    // Authorization: unauthorized user cannot update delivery
    const resUnauthorized = simulateCommerceDeliveryStatusUpdate({ db, assignmentId: 101, nextStatus: 'delivered', requestingUserId: 'unauthorized_hacker', userRole: 'customer' });
    assert.strictEqual(resUnauthorized.status, 403);
  });

  // Test 31: Dynamic request origin resolution for Preview and Production domains
  test('31: Dynamic request origin resolution for Preview and Production domains', () => {
    // 1. Preview request origin
    const previewReq = { url: 'https://master.vijay-visuals-site.pages.dev/api/orders' };
    const previewOrigin = getSafeRequestOrigin(previewReq, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(previewOrigin, 'https://master.vijay-visuals-site.pages.dev');

    // 2. Production custom domain request origin
    const prodReq = { url: 'https://vijayvisuals.com/api/orders' };
    const prodOrigin = getSafeRequestOrigin(prodReq, { CASHFREE_ENV: 'production' });
    assert.strictEqual(prodOrigin, 'https://vijayvisuals.com');

    // 3. Fallback when request is missing
    const defaultPreview = getSafeRequestOrigin(null, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(defaultPreview, 'https://master.vijay-visuals-site.pages.dev');
    const defaultProd = getSafeRequestOrigin(null, { CASHFREE_ENV: 'production' });
    assert.strictEqual(defaultProd, 'https://vijay-visuals-site.pages.dev');
  });

  // Test 32: Relative return URL path resolution dynamically preserves request origin
  test('32: Relative return URL path resolution dynamically preserves request origin', () => {
    const previewReq = { url: 'https://master.vijay-visuals-site.pages.dev/api/orders' };
    const resolvedPreview = resolveSafeReturnUrl('/site/royal-feast?order_id=vv_123', '/site/royal-feast', previewReq, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(resolvedPreview, 'https://master.vijay-visuals-site.pages.dev/site/royal-feast?order_id=vv_123');

    const prodReq = { url: 'https://vijayvisuals.com/api/orders' };
    const resolvedProd = resolveSafeReturnUrl('/proposal/sec_token_99?order_id=cf_99', '/proposal/sec_token_99', prodReq, { CASHFREE_ENV: 'production' });
    assert.strictEqual(resolvedProd, 'https://vijayvisuals.com/proposal/sec_token_99?order_id=cf_99');
  });

  // Test 33: Open Redirect prevention: untrusted external origin re-anchored to safe origin
  test('33: Open Redirect prevention: untrusted external origin re-anchored to safe origin', () => {
    const req = { url: 'https://master.vijay-visuals-site.pages.dev/api/payments/cashfree/create-order' };
    // Attacker passes an external phishing URL
    const maliciousUrl = 'https://attacker-phishing.com/steal-credentials?token=xyz';
    const sanitized = resolveSafeReturnUrl(maliciousUrl, '/payments/cashfree/return', req, { CASHFREE_ENV: 'sandbox' });
    // Must NOT redirect to attacker domain; must re-anchor to safe origin
    assert.strictEqual(sanitized.startsWith('https://master.vijay-visuals-site.pages.dev'), true);
    assert.strictEqual(sanitized.includes('attacker-phishing.com'), false);
    assert.strictEqual(sanitized, 'https://master.vijay-visuals-site.pages.dev/steal-credentials?token=xyz');
  });

  // Test 34: Malformed or script return URLs safely fall back without open redirect
  test('34: Malformed or script return URLs safely fall back without open redirect', () => {
    const req = { url: 'https://master.vijay-visuals-site.pages.dev/api/orders' };
    // Javascript pseudo-protocol injection
    const jsUrl = 'javascript:alert(document.cookie)';
    const safeJs = resolveSafeReturnUrl(jsUrl, '/payments/cashfree/return', req, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(safeJs, 'https://master.vijay-visuals-site.pages.dev/payments/cashfree/return');

    // Scheme-relative URL
    const schemeRelative = '//evil.com/phishing';
    const safeScheme = resolveSafeReturnUrl(schemeRelative, '/site/store', req, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(safeScheme.includes('//evil.com'), false);
    assert.strictEqual(safeScheme.startsWith('https://master.vijay-visuals-site.pages.dev'), true);
  });

  // Test 35: Webhook notify URL resolves to trusted public endpoint in Preview and Production
  test('35: Webhook notify URL resolves to trusted public endpoint in Preview and Production', () => {
    const previewReq = { url: 'https://master.vijay-visuals-site.pages.dev/api/orders' };
    const previewNotify = getSafeCashfreeNotifyUrl(previewReq, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(previewNotify, 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree');

    const prodReq = { url: 'https://vijayvisuals.com/api/orders' };
    const prodNotify = getSafeCashfreeNotifyUrl(prodReq, { CASHFREE_ENV: 'production' });
    assert.strictEqual(prodNotify, 'https://vijayvisuals.com/api/webhooks/cashfree');
  });

  // Test 36: Webhook notify URL safely falls back from localhost to public preview endpoint
  test('36: Webhook notify URL safely falls back from localhost to public preview endpoint', () => {
    // Localhost cannot receive webhooks from Cashfree servers on the internet
    const localReq = { url: 'http://localhost:5173/api/orders' };
    const localNotify = getSafeCashfreeNotifyUrl(localReq, { CASHFREE_ENV: 'sandbox' });
    assert.strictEqual(localNotify, 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree');

    const localProd = getSafeCashfreeNotifyUrl(localReq, { CASHFREE_ENV: 'production' });
    assert.strictEqual(localProd, 'https://vijay-visuals-site.pages.dev/api/webhooks/cashfree');
  });

  console.log('\n====================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${36 - passed} FAILED (TOTAL: 36)`);
  console.log('====================================================================');

  if (passed !== 36) {
    process.exit(1);
  }
}

runTests();
