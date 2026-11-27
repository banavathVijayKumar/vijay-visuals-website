// ============================================================================
// CASHFREE WEBHOOK FRESHNESS / REPLAY REGRESSIONS (LOCAL, MOCKED)
// Covers the timestamp guard added in front of HMAC and business logic.
// No network, no real provider, no remote D1, no secrets, no payments.
// ============================================================================

import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as cashfreeWebhook } from '../functions/api/webhooks/cashfree';
import {
  CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS,
  CASHFREE_WEBHOOK_TIMESTAMP_MAX_AGE_MS,
  checkCashfreeWebhookTimestampFreshness,
} from '../functions/api/payments/_cashfree';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

// Synthetic test-only material. Never used against a real provider.
const WEBHOOK_SECRET = 'local-only-webhook-secret';
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('Unexpected network call in local webhook freshness test');
}) as typeof fetch;

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
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
    CASHFREE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CASHFREE_ENV: 'sandbox',
  } as CloudflareEnv;
}

function successPayload(orderId: string, paymentStatus = 'SUCCESS'): Record<string, unknown> {
  return {
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: { order_id: orderId, order_amount: 199, order_currency: 'INR' },
      payment: {
        cf_payment_id: 91001,
        payment_status: paymentStatus,
        payment_amount: 199,
        payment_currency: 'INR',
        payment_time: new Date().toISOString(),
      },
    },
  };
}

function headersFor(raw: string, timestamp: string, secret = WEBHOOK_SECRET): Record<string, string> {
  const signature = createHmac('sha256', secret).update(`${timestamp}${raw}`).digest('base64');
  return {
    'Content-Type': 'application/json',
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
  };
}

async function postWebhook(
  env: CloudflareEnv,
  payload: Record<string, unknown>,
  headers: Record<string, string>
): Promise<{ response: Response; body: any }> {
  const raw = JSON.stringify(payload);
  const context: PagesContext = {
    request: new Request('https://preview.example.test/api/webhooks/cashfree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: raw,
    }),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  };
  const response = await cashfreeWebhook(context);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function eventCount(db: DatabaseSync, orderId: string): number {
  return Number(
    (
      db
        .prepare('SELECT COUNT(*) AS count FROM payment_webhook_events WHERE reference_id = ?')
        .get(orderId) as any
    ).count
  );
}

console.log('================================================================');
console.log('CASHFREE WEBHOOK FRESHNESS REGRESSIONS (LOCAL, MOCKED)');
console.log('================================================================');

console.log('\nTimestamp helper boundaries');

await it('accepts a current 13-digit epoch-millisecond timestamp', () => {
  const result = checkCashfreeWebhookTimestampFreshness(String(Date.now()));
  assert.deepEqual(result.ok, true);
});

await it('rejects missing and malformed timestamps', () => {
  assert.deepEqual(checkCashfreeWebhookTimestampFreshness(''), {
    ok: false,
    reason: 'missing',
  });
  assert.deepEqual(checkCashfreeWebhookTimestampFreshness(String(Math.floor(Date.now() / 1000))), {
    ok: false,
    reason: 'malformed',
  });
});

await it('rejects stale and future timestamps with the documented local tolerances', () => {
  const now = Date.now();
  assert.deepEqual(
    checkCashfreeWebhookTimestampFreshness(
      String(
        now -
          CASHFREE_WEBHOOK_TIMESTAMP_MAX_AGE_MS -
          CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS -
          60_000
      ),
      now
    ),
    { ok: false, reason: 'stale' }
  );
  assert.deepEqual(
    checkCashfreeWebhookTimestampFreshness(
      String(now + CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS + 60_000),
      now
    ),
    { ok: false, reason: 'future' }
  );
});

console.log('\nEndpoint behaviour');

await it('a fresh valid signature reaches business logic and records an unmatched order', async () => {
  const { db, d1 } = createD1();
  const orderId = 'fresh_webhook_order_001';
  const payload = successPayload(orderId);
  const raw = JSON.stringify(payload);
  const { response, body } = await postWebhook(makeEnv(d1), payload, headersFor(raw, String(Date.now())));
  assert.equal(response.status, 200);
  assert.equal(body.status, 'unmatched_order_recorded');
  assert.equal(eventCount(db, orderId), 1);
});

await it('an invalid HMAC signature is rejected before any ledger write', async () => {
  const { db, d1 } = createD1();
  const orderId = 'bad_signature_order_001';
  const raw = JSON.stringify(successPayload(orderId));
  const headers = headersFor(raw, String(Date.now()), 'wrong-local-secret');
  const { response } = await postWebhook(makeEnv(d1), successPayload(orderId), headers);
  assert.equal(response.status, 401);
  assert.equal(eventCount(db, orderId), 0);
});

for (const [name, timestamp] of [
  ['missing timestamp', null],
  ['malformed seconds timestamp', String(Math.floor(Date.now() / 1000))],
  [
    'stale timestamp',
    String(
      Date.now() -
        CASHFREE_WEBHOOK_TIMESTAMP_MAX_AGE_MS -
        CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS -
        60_000
    ),
  ],
  ['future timestamp', String(Date.now() + CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS + 60_000)],
] as const) {
  await it(`${name} is rejected with 401 before HMAC or business logic`, async () => {
    const { db, d1 } = createD1();
    const orderId = `bad_time_${String(name).replace(/[^a-z0-9]/gi, '_')}`;
    const raw = JSON.stringify(successPayload(orderId));
    const headers = headersFor(raw, timestamp || String(Date.now()));
    if (timestamp === null) delete headers['x-webhook-timestamp'];
    const { response } = await postWebhook(makeEnv(d1), successPayload(orderId), headers);
    assert.equal(response.status, 401);
    assert.equal(eventCount(db, orderId), 0);
  });
}

await it('a replayed signed event is idempotent and never creates two ledger rows', async () => {
  const { db, d1 } = createD1();
  const orderId = 'replay_webhook_order_001';
  const payload = successPayload(orderId);
  const raw = JSON.stringify(payload);
  const headers = headersFor(raw, String(Date.now()));
  const env = makeEnv(d1);

  const first = await postWebhook(env, payload, headers);
  const second = await postWebhook(env, payload, headers);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(second.body.idempotentDuplicate, true);
  assert.equal(eventCount(db, orderId), 1);
});

await it('a fresh signature with an unverified failed payment never records a successful payment', async () => {
  const { db, d1 } = createD1();
  const orderId = 'failed_confirmation_order_001';
  const payload = successPayload(orderId, 'FAILED');
  const raw = JSON.stringify(payload);
  const { response } = await postWebhook(
    makeEnv(d1),
    payload,
    headersFor(raw, String(Date.now()))
  );
  assert.equal(response.status, 400);
  assert.equal(eventCount(db, orderId), 0);
});

globalThis.fetch = originalFetch;

console.log('================================================================');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('================================================================');
if (failed > 0) process.exitCode = 1;
