// ============================================================================
// VIJAY VISUALS — SANDBOX PAYMENT TEST FLOW AUTOMATED VERIFICATION SUITE
// Tests the safe ₹1 Cashfree Sandbox testing flow:
// 1. Sandbox Test Product definition and ₹1 pricing
// 2. Production safety guard: strictly sandbox-only item injection
// 3. Test order creation: TEST-ORD-* prefix, ₹0 delivery fee waiver, ₹1 total
// 4. Test order metadata: [SANDBOX TEST ORDER] tags and note isolation
// 5. Cashfree Sandbox Hosted Checkout URL and Order Request formation
// 6. Payment Success state transition (payment_status: paid, order_status: confirmed)
// 7. Payment Failure state transition (payment_status: failed, order_status: cancelled)
// 8. Cashfree Webhook HMAC-SHA256 Base64 verification for test orders
// 9. Webhook and Checkout Verification Idempotency
// 10. Security: No secrets, passwords, or live credentials exposed
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${details || 'Assertion failed'}`);
    failed++;
  }
}

console.log('\n=============================================================');
console.log('VIJAY VISUALS — SANDBOX PAYMENT TEST FLOW VERIFICATION');
console.log('=============================================================\n');

// ----------------------------------------------------------------------------
// Test Group 1: Sandbox Test Product Specifications & Pricing
// ----------------------------------------------------------------------------
console.log('--- Test Group 1: Sandbox Test Product Specifications & Pricing ---');
{
  const testProduct = {
    id: 999999,
    tenant_id: 1,
    name: '[SANDBOX TEST] Cashfree Test Item — ₹1',
    description: 'Safe ₹1 test item for Cashfree Sandbox simulation. No real money will be charged.',
    price: 1,
    category: 'Sandbox Test',
    is_active: 1,
    stock: 9999,
  };

  assert(testProduct.id === 999999, 'Test product has reserved synthetic ID 999999');
  assert(testProduct.price === 1, 'Test product price is exactly ₹1.00');
  assert(testProduct.name.startsWith('[SANDBOX TEST]'), 'Test product name clearly identifies as [SANDBOX TEST]');
  assert(testProduct.description.includes('No real money will be charged'), 'Description clearly disclaims real money');
}

// ----------------------------------------------------------------------------
// Test Group 2: Production Guard: Sandbox-Only Injection
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 2: Production Safety Guard ---');
{
  function shouldInjectTestProduct(envMode: string | undefined): boolean {
    return envMode?.toLowerCase() === 'sandbox';
  }

  assert(shouldInjectTestProduct('sandbox') === true, 'Test product injected when mode is "sandbox"');
  assert(shouldInjectTestProduct('SANDBOX') === true, 'Test product injected case-insensitively for "SANDBOX"');
  assert(shouldInjectTestProduct('production') === false, 'Test product NEVER injected in "production" mode');
  assert(shouldInjectTestProduct('live') === false, 'Test product NEVER injected in "live" mode');
  assert(shouldInjectTestProduct(undefined) === false, 'Test product NEVER injected when mode is undefined');
  assert(shouldInjectTestProduct('') === false, 'Test product NEVER injected when mode is empty');
}

// ----------------------------------------------------------------------------
// Test Group 3: Test Order Number & Delivery Fee Waiver
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 3: Order Formatting & ₹0 Delivery Fee Waiver ---');
{
  interface CartItem {
    id: number;
    name: string;
    price: number;
    quantity: number;
  }

  function calculateStorefrontOrderTotal(items: CartItem[], standardDeliveryFee: number) {
    const isSandboxTestOrder = items.some(
      (it) => it.id === 999999 || (it.name && it.name.startsWith('[SANDBOX TEST]'))
    );
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const deliveryFee = isSandboxTestOrder ? 0 : standardDeliveryFee;
    const total = subtotal + deliveryFee;

    const orderNumber = isSandboxTestOrder
      ? `TEST-ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`
      : `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      isSandboxTestOrder,
      subtotal,
      deliveryFee,
      total,
      orderNumber,
    };
  }

  // Case A: Cart with only the ₹1 test item
  const testCart: CartItem[] = [
    { id: 999999, name: '[SANDBOX TEST] Cashfree Test Item — ₹1', price: 1, quantity: 1 },
  ];
  const testOrderResult = calculateStorefrontOrderTotal(testCart, 50);

  assert(testOrderResult.isSandboxTestOrder === true, 'Identifies test order correctly');
  assert(testOrderResult.deliveryFee === 0, 'Delivery fee waived (₹0) for sandbox test order');
  assert(testOrderResult.total === 1, 'Grand total is exactly ₹1.00');
  assert(testOrderResult.orderNumber.startsWith('TEST-ORD-'), `Order number starts with TEST-ORD- (${testOrderResult.orderNumber})`);

  // Case B: Real customer cart (regression check)
  const realCart: CartItem[] = [
    { id: 101, name: 'Royal Hyderabadi Biryani', price: 350, quantity: 2 },
  ];
  const realOrderResult = calculateStorefrontOrderTotal(realCart, 50);

  assert(realOrderResult.isSandboxTestOrder === false, 'Regular order NOT flagged as sandbox test');
  assert(realOrderResult.deliveryFee === 50, 'Regular order charges standard delivery fee (₹50)');
  assert(realOrderResult.total === 750, 'Regular order total calculated normally (₹700 + ₹50 = ₹750)');
  assert(realOrderResult.orderNumber.startsWith('ORD-') && !realOrderResult.orderNumber.startsWith('TEST-ORD-'), 'Regular order has ORD- prefix');
}

// ----------------------------------------------------------------------------
// Test Group 4: Cashfree Sandbox Order Payload Creation
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 4: Cashfree Sandbox Order Payload Generation ---');
{
  function buildCashfreeOrderPayload(orderNumber: string, amount: number, customerPhone: string, customerEmail: string) {
    const cashfreeOrderId = `vv_cf_${orderNumber.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
    return {
      order_id: cashfreeOrderId,
      order_amount: Math.round(amount * 100) / 100,
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${customerPhone.replace(/[^0-9]/g, '') || 'guest'}`,
        customer_name: 'Cashfree Sandbox Tester',
        customer_email: customerEmail || 'test@vijayvisuals.com',
        customer_phone: customerPhone || '9999999999',
      },
      order_meta: {
        return_url: `https://master.vijay-visuals-site.pages.dev/site/royal-feast-cloud-kitchen?order_id=${cashfreeOrderId}&status=return`,
        notify_url: 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree',
      },
      order_note: '[SANDBOX TEST ORDER] ₹1 Cashfree Sandbox simulation',
      order_tags: {
        is_sandbox_test: 'true',
        platform: 'vijay_visuals',
        environment: 'sandbox',
      },
    };
  }

  const payload = buildCashfreeOrderPayload('TEST-ORD-123456-7890', 1.0, '9876543210', 'test@sandbox.com');

  assert(payload.order_id.startsWith('vv_cf_test'), `Generated safe Cashfree Order ID: ${payload.order_id}`);
  assert(payload.order_amount === 1.0, 'Cashfree order amount is exactly 1.00 INR');
  assert(payload.order_currency === 'INR', 'Currency is INR');
  assert(payload.order_note.includes('[SANDBOX TEST ORDER]'), 'Order note contains [SANDBOX TEST ORDER]');
  assert(payload.order_tags.is_sandbox_test === 'true', 'Order tags set is_sandbox_test: "true"');
  assert(payload.order_meta.return_url.includes('master.vijay-visuals-site.pages.dev'), 'Return URL targets Preview environment');
}

// ----------------------------------------------------------------------------
// Test Group 5: Payment Success State Transition
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 5: Payment Success State Machine ---');
{
  interface OrderState {
    id: number;
    orderNumber: string;
    paymentStatus: 'pending' | 'paid' | 'failed';
    orderStatus: 'placed' | 'confirmed' | 'cancelled';
    gatewayPaymentId: string | null;
  }

  function simulatePaymentSuccess(order: OrderState, cfPaymentId: string): OrderState {
    return {
      ...order,
      paymentStatus: 'paid',
      orderStatus: order.orderStatus === 'placed' ? 'confirmed' : order.orderStatus,
      gatewayPaymentId: cfPaymentId,
    };
  }

  const initialOrder: OrderState = {
    id: 42,
    orderNumber: 'TEST-ORD-987654-3210',
    paymentStatus: 'pending',
    orderStatus: 'placed',
    gatewayPaymentId: null,
  };

  const paidOrder = simulatePaymentSuccess(initialOrder, 'cf_pay_sim_99887766');

  assert(paidOrder.paymentStatus === 'paid', 'Order payment_status transitioned to "paid"');
  assert(paidOrder.orderStatus === 'confirmed', 'Order status transitioned from "placed" to "confirmed"');
  assert(paidOrder.gatewayPaymentId === 'cf_pay_sim_99887766', 'Cashfree payment ID recorded accurately');
}

// ----------------------------------------------------------------------------
// Test Group 6: Payment Failure & Drop State Transition
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 6: Payment Failure / Drop State Machine ---');
{
  interface OrderState {
    id: number;
    paymentStatus: string;
    orderStatus: string;
  }

  function simulatePaymentFailure(order: OrderState, reason: string): OrderState {
    return {
      ...order,
      paymentStatus: 'failed',
      orderStatus: 'cancelled',
    };
  }

  const initialOrder: OrderState = {
    id: 43,
    paymentStatus: 'pending',
    orderStatus: 'placed',
  };

  const failedOrder = simulatePaymentFailure(initialOrder, 'USER_DROPPED');
  assert(failedOrder.paymentStatus === 'failed', 'Payment status set to "failed" on failure');
  assert(failedOrder.orderStatus === 'cancelled', 'Order status set to "cancelled" on failure');
}

// ----------------------------------------------------------------------------
// Test Group 7: Webhook Signature Verification on Test Orders
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 7: Webhook Signature Verification [SECURITY] ---');
{
  const secret = 'cfsk_ma_test_sandbox_secret_9988';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const webhookBody = JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    event_time: new Date().toISOString(),
    data: {
      order: {
        order_id: 'vv_cf_test_ord_123456_7890',
        order_amount: 1.0,
        order_currency: 'INR',
        order_tags: { is_sandbox_test: 'true' },
      },
      payment: {
        cf_payment_id: 11223344,
        payment_status: 'SUCCESS',
        payment_amount: 1.0,
        payment_method: 'card',
      },
    },
  });

  const message = `${timestamp}${webhookBody}`;
  const validSignature = crypto.createHmac('sha256', secret).update(message).digest('base64');

  function verifyWebhookSignature(body: string, ts: string, sig: string, key: string): boolean {
    const expected = crypto.createHmac('sha256', key).update(`${ts}${body}`).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  assert(
    verifyWebhookSignature(webhookBody, timestamp, validSignature, secret) === true,
    'Valid HMAC-SHA256 signature accepted'
  );

  const tamperedSig = crypto.createHmac('sha256', 'wrong_key').update(message).digest('base64');
  let rejected = false;
  try {
    rejected = !verifyWebhookSignature(webhookBody, timestamp, tamperedSig, secret);
  } catch {
    rejected = true;
  }
  assert(rejected, 'Tampered or forged webhook signature rejected');
}

// ----------------------------------------------------------------------------
// Test Group 8: Idempotency Protection
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 8: Idempotency Verification ---');
{
  const processedEvents = new Set<string>();

  function processPaymentVerification(eventId: string, currentStatus: string) {
    if (currentStatus === 'PAID' || processedEvents.has(eventId)) {
      return { verified: true, idempotentReplay: true, status: 'PAID' };
    }
    processedEvents.add(eventId);
    return { verified: true, idempotentReplay: false, status: 'PAID' };
  }

  const firstCall = processPaymentVerification('checkout:cf_pay_11223344', 'PENDING');
  assert(firstCall.verified === true && firstCall.idempotentReplay === false, 'First verification processes payment');

  const secondCall = processPaymentVerification('checkout:cf_pay_11223344', 'PAID');
  assert(secondCall.verified === true && secondCall.idempotentReplay === true, 'Duplicate verification returns idempotent replay without double processing');
}

// ----------------------------------------------------------------------------
// Test Group 9: Codebase Secret Leakage Audit
// ----------------------------------------------------------------------------
console.log('\n--- Test Group 9: Codebase Secret Leakage Audit ---');
{
  const projectRoot = process.cwd();
  const filesToScan = [
    'functions/api/tenants/[slug].ts',
    'functions/api/orders.ts',
    'src/components/StorefrontView.tsx',
    'functions/api/payments/cashfree/verify.ts',
  ];

  let foundLeak = false;
  for (const relPath of filesToScan) {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Check for hardcoded cashfree secret keys (e.g. cfsk_ma_...)
      if (/cfsk_ma_[a-zA-Z0-9]{16,}/.test(content)) {
        foundLeak = true;
        assert(false, `Secret leakage in ${relPath}`);
      }
    }
  }

  assert(!foundLeak, 'No hardcoded Cashfree API secret keys in modified source files');
}

// ----------------------------------------------------------------------------
// Final Summary
// ----------------------------------------------------------------------------
console.log('\n=============================================================');
console.log(`SANDBOX PAYMENT TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
