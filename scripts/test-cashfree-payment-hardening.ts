// ============================================================================
// CASHFREE PAYMENT-HARDENING REGRESSIONS (LOCAL, MOCKED)
// Covers authoritative success confirmation, failure, duplicates, invalid
// signatures, explicit CANCELLED/EXPIRED states and refund capture guards.
// No network, no real provider, no payments, no secrets, no Production access.
// ============================================================================

import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as cashfreeWebhook } from '../functions/api/webhooks/cashfree';
import { onRequestPost as platformRefund } from '../functions/api/payments/platform/[id]/refund';
import type { CloudflareEnv, D1Database } from '../functions/api/_shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

const WEBHOOK_SECRET = 'local-only-webhook-secret';
const originalFetch = globalThis.fetch;
let providerPayments: Array<Record<string, unknown>> = [];
let refundCallCount = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.includes('/auth/v1/user')) {
    const auth = new Headers(init?.headers || {}).get('Authorization') || '';
    if (!auth.includes('token-admin')) return new Response('{}', { status: 401 });
    return new Response(
      JSON.stringify({ id: 'auth-admin', email: 'admin@example.invalid' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(
      JSON.stringify([
        { id: 'auth-admin', role: 'super_admin', full_name: 'Local Test Admin' },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/orders/') && url.endsWith('/payments')) {
    return new Response(JSON.stringify(providerPayments), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/orders/') && url.includes('/refunds')) {
    refundCallCount += 1;
    return new Response(
      JSON.stringify({
        cf_refund_id: 'cfrefundlocal1',
        refund_status: 'PENDING',
        refund_amount: 199,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error(`Unexpected mocked URL in hardening test: ${url}`);
}) as typeof fetch;

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err?.message || err}`);
  }
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }

  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound.map((value) => (value === undefined ? null : value));
          return this;
        },
        async first<T = any>(col?: string): Promise<T | null> {
          const row = db.prepare(sql).get(...values) as any;
          if (!row) return null;
          return col ? (row[col] as T) : (row as T);
        },
        async all<T = any>() {
          return { results: db.prepare(sql).all(...values) as T[], success: true };
        },
        async run() {
          const info = db.prepare(sql).run(...values);
          return {
            success: true,
            meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
          };
        },
      } as any;
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  } as D1Database;
  return { db, d1 };
}

function makeEnv(d1: D1Database): CloudflareEnv {
  return {
    DB: d1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-local-test-key',
    CASHFREE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CASHFREE_CLIENT_ID: 'local-cashfree-client-id',
    CASHFREE_CLIENT_SECRET: 'local-cashfree-client-secret',
    CASHFREE_ENV: 'sandbox',
  } as CloudflareEnv;
}

function seedPlatformOrder(db: DatabaseSync, orderId: string): void {
  db.prepare(
    `INSERT INTO cashfree_payments
      (order_id, cf_order_id, payment_session_id, entity_type, reference_id, user_id,
       base_amount_inr, gst_amount_inr, amount_inr, currency, environment, status)
     VALUES (?, ?, ?, 'platform_package', 'business-website', 'auth-local-user',
             199, 0, 199, 'INR', 'sandbox', 'CREATED')`
  ).run(orderId, `cf_order_${orderId}`, `session_${orderId}`);

  db.prepare(
    `INSERT INTO platform_payments
      (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
       base_amount_inr, gst_amount_inr, amount_inr, currency, razorpay_mode,
       razorpay_order_id, signature_verified, status)
     VALUES (NULL, 'auth-local-user', 'website_purchase', 'business-website',
             'Business Website Package', 'one_time', 199, 0, 199, 'INR', 'test', ?, 0, 'created')`
  ).run(`cf_${orderId}`);
}

function seedRefundPayment(
  db: DatabaseSync,
  orderId: string,
  status: 'created' | 'paid',
  paymentId: string | null
): number {
  db.prepare(
    `INSERT INTO platform_payments
      (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
       base_amount_inr, gst_amount_inr, amount_inr, currency, razorpay_mode,
       razorpay_order_id, razorpay_payment_id, signature_verified, status)
     VALUES (NULL, 'auth-local-user', 'website_purchase', 'business-website',
             'Business Website Package', 'one_time', 199, 0, 199, 'INR', 'test',
             ?, ?, ?, ?)`
  ).run(`cf_${orderId}`, paymentId, status === 'paid' ? 1 : 0, status);
  return Number(
    (db.prepare('SELECT id FROM platform_payments WHERE razorpay_order_id = ?').get(`cf_${orderId}`) as any).id
  );
}

function seedRefundRow(
  db: DatabaseSync,
  paymentId: number,
  refundId: string,
  amountInr: number
): void {
  db.prepare(
    `INSERT INTO refunds
      (flow_type, platform_payment_id, razorpay_payment_id, razorpay_refund_id,
       amount_inr, reason, status, requested_by)
     VALUES ('platform_payment', ?, ?, ?, ?, 'local hardening test', 'created', 'local-admin')`
  ).run(paymentId, 'cfpay_refund_webhook', refundId, amountInr);
}

function refundPayload(
  orderId: string,
  refundId: string,
  refundStatus = 'SUCCESS',
  refundAmount = 199
): Record<string, unknown> {
  return {
    type: 'REFUND_STATUS_WEBHOOK',
    data: {
      order: { order_id: orderId },
      payment: { cf_payment_id: 47001 },
      refund: {
        refund_id: refundId,
        cf_refund_id: `cfrefund_${refundId}`,
        refund_status: refundStatus,
        refund_amount: refundAmount,
      },
    },
  };
}

function successPayload(orderId: string, cfPaymentId = 47001): Record<string, unknown> {
  return {
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: orderId, order_amount: 199, order_currency: 'INR' },
      payment: {
        cf_payment_id: cfPaymentId,
        payment_status: 'SUCCESS',
        payment_amount: 199,
        payment_currency: 'INR',
        payment_time: '2026-11-28T10:00:00Z',
      },
    },
  };
}

function providerSuccess(cfPaymentId: number | string = 47001): Array<Record<string, unknown>> {
  return [
    {
      cf_payment_id: cfPaymentId,
      payment_status: 'SUCCESS',
      payment_amount: 199,
      payment_currency: 'INR',
      payment_time: '2026-11-28T10:00:00Z',
    },
  ];
}

async function postWebhook(
  env: CloudflareEnv,
  payload: Record<string, unknown>,
  options: { secret?: string } = {}
): Promise<{ response: Response; body: any }> {
  const raw = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const secret = options.secret || WEBHOOK_SECRET;
  const signature = createHmac('sha256', secret).update(`${timestamp}${raw}`).digest('base64');
  const response = await cashfreeWebhook({
    request: new Request('https://preview.example.test/api/webhooks/cashfree', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp,
      },
      body: raw,
    }),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  } as any);
  return { response, body: await response.json().catch(() => ({})) };
}

async function postRefund(
  env: CloudflareEnv,
  paymentId: number,
  body: Record<string, unknown> = {}
): Promise<{ response: Response; body: any }> {
  const response = await platformRefund({
    request: new Request(`https://preview.example.test/api/payments/platform/${paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-admin',
      },
      body: JSON.stringify({ amountInr: 199, reason: 'local test', ...body }),
    }),
    env,
    params: { id: String(paymentId) },
    next: async () => new Response(null, { status: 204 }),
  } as any);
  return { response, body: await response.json().catch(() => ({})) };
}

function cashfreeStatus(db: DatabaseSync, orderId: string): string {
  return String(
    (db.prepare('SELECT status FROM cashfree_payments WHERE order_id = ?').get(orderId) as any)?.status
  );
}

function platformStatus(db: DatabaseSync, orderId: string): { status: string; signature: number } {
  const row = db
    .prepare('SELECT status, signature_verified FROM platform_payments WHERE razorpay_order_id = ?')
    .get(`cf_${orderId}`) as any;
  return { status: String(row?.status), signature: Number(row?.signature_verified) };
}

function eventCount(db: DatabaseSync, orderId: string): number {
  return Number(
    (db
      .prepare('SELECT COUNT(*) AS count FROM payment_webhook_events WHERE reference_id = ?')
      .get(orderId) as any).count
  );
}

console.log('================================================================');
console.log('CASHFREE PAYMENT-HARDENING REGRESSIONS (LOCAL, MOCKED)');
console.log('================================================================');

await it('provider-confirmed success webhook marks both ledgers paid once', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_success_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();

  const { response } = await postWebhook(makeEnv(d1), successPayload(orderId));
  assert.equal(response.status, 200);
  assert.equal(cashfreeStatus(db, orderId), 'PAID');
  assert.deepEqual(platformStatus(db, orderId), { status: 'paid', signature: 1 });
  assert.equal(eventCount(db, orderId), 1);
});

await it('signed success payload without provider confirmation never marks PAID', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_unconfirmed_001';
  seedPlatformOrder(db, orderId);
  providerPayments = [];

  const { response } = await postWebhook(makeEnv(d1), successPayload(orderId));
  assert.equal(response.status, 409);
  assert.equal(cashfreeStatus(db, orderId), 'CREATED');
  assert.equal(platformStatus(db, orderId).status, 'created');
  assert.equal(eventCount(db, orderId), 0);
});

await it('webhook payment ID must match the authoritative provider payment ID', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_mismatch_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess(47999);

  const { response } = await postWebhook(makeEnv(d1), successPayload(orderId, 47001));
  assert.equal(response.status, 409);
  assert.equal(cashfreeStatus(db, orderId), 'CREATED');
});

await it('failure webhook records a non-paid state only', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_failed_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();
  const payload = {
    type: 'PAYMENT_FAILED_WEBHOOK',
    data: {
      order: { order_id: orderId, order_amount: 199, order_currency: 'INR' },
      payment: { cf_payment_id: 47001, payment_status: 'FAILED' },
    },
  };

  const { response } = await postWebhook(makeEnv(d1), payload);
  assert.equal(response.status, 200);
  assert.equal(cashfreeStatus(db, orderId), 'FAILED');
  assert.equal(platformStatus(db, orderId).status, 'failed');
  assert.notEqual(cashfreeStatus(db, orderId), 'PAID');
});

await it('duplicate success event is acknowledged without a second ledger write', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_duplicate_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();
  const env = makeEnv(d1);
  const payload = successPayload(orderId);

  const first = await postWebhook(env, payload);
  const second = await postWebhook(env, payload);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.idempotentDuplicate, true);
  assert.equal(cashfreeStatus(db, orderId), 'PAID');
  assert.equal(eventCount(db, orderId), 1);
});

await it('invalid HMAC signature is rejected before any ledger write', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_signature_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();

  const { response } = await postWebhook(makeEnv(d1), successPayload(orderId), {
    secret: 'wrong-local-secret',
  });
  assert.equal(response.status, 401);
  assert.equal(cashfreeStatus(db, orderId), 'CREATED');
  assert.equal(eventCount(db, orderId), 0);
});

await it('explicit CANCELLED state is terminal and never provisionally paid', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_cancelled_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();
  const payload = {
    type: 'ORDER_CANCELLED_WEBHOOK',
    data: { order: { order_id: orderId, order_amount: 199, order_currency: 'INR' } },
  };

  const { response, body } = await postWebhook(makeEnv(d1), payload);
  assert.equal(response.status, 200);
  assert.equal(body.terminalStatus, 'CANCELLED');
  assert.equal(body.paymentMarkedPaid, false);
  assert.equal(cashfreeStatus(db, orderId), 'CANCELLED');
  assert.equal(platformStatus(db, orderId).status, 'failed');
  const notes = JSON.parse(
    (db.prepare('SELECT notes_json FROM cashfree_payments WHERE order_id = ?').get(orderId) as any).notes_json
  );
  assert.equal(notes.terminalWebhookStatus, 'CANCELLED');
  assert.equal(notes.paidViaWebhook, false);
});

await it('a success event carrying CANCELLED status is not treated as payment success', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_cancelled_conflict_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();
  const payload = successPayload(orderId);
  (payload.data as any).order.order_status = 'CANCELLED';

  const { response } = await postWebhook(makeEnv(d1), payload);
  assert.equal(response.status, 200);
  assert.equal(cashfreeStatus(db, orderId), 'CANCELLED');
  assert.equal(platformStatus(db, orderId).status, 'failed');
});

await it('explicit EXPIRED state is recorded without a false PAID transition', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_expired_001';
  seedPlatformOrder(db, orderId);
  providerPayments = providerSuccess();
  const payload = {
    type: 'ORDER_EXPIRED_WEBHOOK',
    data: { order: { order_id: orderId, order_amount: 199, order_currency: 'INR' } },
  };

  const { response, body } = await postWebhook(makeEnv(d1), payload);
  assert.equal(response.status, 200);
  assert.equal(body.terminalStatus, 'EXPIRED');
  assert.equal(body.ledgerStatus, 'CANCELLED');
  assert.equal(cashfreeStatus(db, orderId), 'CANCELLED');
  assert.notEqual(cashfreeStatus(db, orderId), 'PAID');
  const notes = JSON.parse(
    (db.prepare('SELECT notes_json FROM cashfree_payments WHERE order_id = ?').get(orderId) as any).notes_json
  );
  assert.equal(notes.terminalWebhookStatus, 'EXPIRED');
});

await it('refund rejects an uncaptured local payment before any provider refund call', async () => {
  const { db, d1 } = createD1();
  const paymentId = seedRefundPayment(db, 'hardening_refund_uncaptured', 'created', null);
  refundCallCount = 0;
  providerPayments = providerSuccess('cfpay_refund_uncaptured');

  const { response } = await postRefund(makeEnv(d1), paymentId);
  assert.equal(response.status, 409);
  assert.equal(refundCallCount, 0);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS count FROM refunds').get() as any).count), 0);
});

await it('refund rejects a locally paid row without matching provider capture', async () => {
  const { db, d1 } = createD1();
  const paymentId = seedRefundPayment(db, 'hardening_refund_unconfirmed', 'paid', 'cfpay_refund_ok');
  refundCallCount = 0;
  providerPayments = [];

  const { response } = await postRefund(makeEnv(d1), paymentId);
  assert.equal(response.status, 409);
  assert.equal(refundCallCount, 0);
  assert.equal(Number((db.prepare('SELECT COUNT(*) AS count FROM refunds').get() as any).count), 0);
});

await it('refund proceeds only after provider confirms matching capture', async () => {
  const { db, d1 } = createD1();
  const paymentId = seedRefundPayment(db, 'hardening_refund_confirmed', 'paid', 'cfpay_refund_ok');
  refundCallCount = 0;
  providerPayments = providerSuccess('cfpay_refund_ok');

  const { response, body } = await postRefund(makeEnv(d1), paymentId);
  assert.equal(response.status, 200);
  assert.equal(body.refundPending, true);
  assert.equal(refundCallCount, 1);
});

await it('known refund webhook finalizes the linked payment without re-marking it paid', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_refund_webhook_ok';
  const paymentId = seedRefundPayment(db, orderId, 'paid', 'cfpay_refund_webhook');
  seedRefundRow(db, paymentId, 'refundknown001', 199);
  providerPayments = [];

  const { response, body } = await postWebhook(makeEnv(d1), refundPayload(orderId, 'refundknown001'));
  assert.equal(response.status, 200);
  assert.equal(body.refundFinalized, true);
  assert.equal(
    (db.prepare('SELECT status FROM refunds WHERE razorpay_refund_id = ?').get('refundknown001') as any)
      .status,
    'processed'
  );
  assert.equal(platformStatus(db, orderId).status, 'refunded');
  assert.notEqual(platformStatus(db, orderId).status, 'paid');
});

await it('unknown-refund webhook fails closed before changing any ledger', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_refund_webhook_unknown';
  const paymentId = seedRefundPayment(db, orderId, 'paid', 'cfpay_refund_webhook');
  const { response } = await postWebhook(
    makeEnv(d1),
    refundPayload(orderId, 'refundunknown01')
  );
  assert.equal(response.status, 400);
  assert.equal(
    (db.prepare('SELECT status FROM platform_payments WHERE id = ?').get(paymentId) as any).status,
    'paid'
  );
  assert.equal(eventCount(db, orderId), 0);
});

await it('mismatched refund amount is rejected without revoking entitlement', async () => {
  const { db, d1 } = createD1();
  const orderId = 'hardening_refund_webhook_amount';
  const paymentId = seedRefundPayment(db, orderId, 'paid', 'cfpay_refund_webhook');
  seedRefundRow(db, paymentId, 'refundamount01', 199);

  const { response } = await postWebhook(
    makeEnv(d1),
    refundPayload(orderId, 'refundamount01', 'SUCCESS', 1)
  );
  assert.equal(response.status, 409);
  assert.equal(
    (db.prepare('SELECT status FROM refunds WHERE razorpay_refund_id = ?').get('refundamount01') as any)
      .status,
    'created'
  );
  assert.equal(platformStatus(db, orderId).status, 'paid');
});

globalThis.fetch = originalFetch;

console.log('================================================================');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('================================================================');
if (failed > 0) process.exitCode = 1;
