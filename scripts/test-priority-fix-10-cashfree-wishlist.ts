// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 10 REGRESSION TESTS
// Cashfree verification (direct + platform alias) and Cloudflare Pages wishlist
// endpoints. Runs fully local: in-memory D1, mocked Supabase/Cashfree HTTP.
// No remote D1, no secrets, no real payments, no .env access.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost as verifyCashfree } from '../functions/api/payments/cashfree/verify';
import { onRequestPost as verifyPlatform } from '../functions/api/payments/platform/verify';
import { onRequestGet as getWishlist } from '../functions/api/customer/wishlist';
import { onRequestPost as toggleWishlist } from '../functions/api/customer/wishlist/toggle';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'migrations');

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound.map((v) => (v === undefined ? null : v));
          return this;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          const row = db.prepare(sql).get(...values) as any;
          if (!row) return null;
          return colName ? (row[colName] as T) : (row as T);
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          return { results: db.prepare(sql).all(...values) as T[], success: true };
        },
        async run(): Promise<{ success: boolean; meta: any }> {
          const info = db.prepare(sql).run(...values);
          return { success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
        },
      };
    },
  };
  return { db, d1 };
}

function seedUnpaidOrder(db: DatabaseSync, orderId = 'vv_test_unpaid_001'): void {
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, 'published')`
  ).run('web_test_1', 'auth-user-1', 'test-store', 'Test Store', '{}');

  db.prepare(
    `INSERT INTO platform_payments
      (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
       base_amount_inr, gst_amount_inr, amount_inr, razorpay_order_id, status)
     VALUES (?, ?, 'website_purchase', 'starter-website', 'Starter Website Package',
             'one_time', 2999, 540, 3539, ?, 'created')`
  ).run('web_test_1', 'auth-user-1', `cf_${orderId}`);

  db.prepare(
    `INSERT INTO cashfree_payments
      (order_id, cf_order_id, entity_type, reference_id, website_id, user_id,
       base_amount_inr, gst_amount_inr, amount_inr, status)
     VALUES (?, '123456789', 'platform_package', 'starter-website', ?, ?,
             2999, 540, 3539, 'CREATED')`
  ).run(orderId, 'web_test_1', 'auth-user-1');
}

function makeContext(
  env: CloudflareEnv,
  body: unknown,
  token?: string,
  method = 'POST',
  url = 'https://de7cf37a.vijay-visuals-site.pages.dev/api/test'
): PagesContext {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    request: new Request(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    }),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  };
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const originalFetch = globalThis.fetch;
let fetchMode: 'cashfree' | 'wishlist' = 'cashfree';
let cashfreeScenario:
  | 'active'
  | 'failed'
  | 'cancelled'
  | 'unknown'
  | 'provider_error' = 'active';

interface TestWishlistRow {
  id: number;
  user_id: number;
  product_id: number;
  tenant_id: number;
  created_at: string;
}
let wishlistRows: TestWishlistRow[] = [];
let nextWishlistId = 1;

function headersOf(init?: RequestInit): Headers {
  return new Headers(init?.headers || {});
}

function param(url: string, name: string): string | null {
  const match = url.match(new RegExp(`[?&]${name}=eq\\.([^&]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);

  if (fetchMode === 'cashfree') {
    if (url.includes('/auth/v1/user')) {
      return jsonRes({ id: 'auth-user-1', email: 'smoke.tester@example.invalid' });
    }
    if (url.includes('/rest/v1/profiles')) {
      return jsonRes([{ id: 'auth-user-1', role: 'customer', full_name: 'Smoke Tester' }]);
    }
    if (url.includes('sandbox.cashfree.com/pg/orders/')) {
      if (cashfreeScenario === 'provider_error') {
        return jsonRes({ message: 'Simulated provider outage' }, 500);
      }
      const orderId = url.split('/pg/orders/')[1]?.split(/[?/]/)[0] || 'vv_test_unpaid_001';
      if (url.endsWith('/payments')) {
        if (cashfreeScenario === 'failed') {
          return jsonRes([
            {
              cf_payment_id: 9001,
              payment_status: 'FAILED',
              payment_amount: 3539,
              payment_currency: 'INR',
              payment_group: 'upi',
            },
          ]);
        }
        if (cashfreeScenario === 'cancelled') {
          return jsonRes([
            {
              cf_payment_id: 9002,
              payment_status: 'USER_DROPPED',
              payment_amount: 3539,
              payment_currency: 'INR',
              payment_group: 'upi',
            },
          ]);
        }
        return jsonRes([]);
      }
      const orderStatus =
        cashfreeScenario === 'failed'
          ? 'ACTIVE'
          : cashfreeScenario === 'cancelled'
            ? 'CANCELLED'
            : cashfreeScenario === 'unknown'
              ? 'UNKNOWN'
              : 'ACTIVE';
      return jsonRes({
        cf_order_id: 123456789,
        order_id: orderId,
        order_status: orderStatus,
        order_amount: cashfreeScenario === 'unknown' ? 0 : 3539,
        order_currency: 'INR',
      });
    }
    return jsonRes({ error: `Unexpected cashfree mock URL: ${url}` }, 500);
  }

  const authorization = headersOf(init).get('Authorization') || '';
  const subject =
    authorization === 'Bearer token-user-a'
      ? 'auth-user-a'
      : authorization === 'Bearer token-user-b'
        ? 'auth-user-b'
        : '';

  if (url.includes('/auth/v1/user')) {
    if (!subject) return jsonRes({ message: 'invalid token' }, 401);
    return jsonRes({ id: subject, email: `${subject}@example.invalid` });
  }
  if (url.includes('/rest/v1/profiles')) {
    return jsonRes([{ id: subject, role: 'customer', full_name: 'Test Customer' }]);
  }
  if (url.includes('/rest/v1/users')) {
    const uid = param(url, 'uid') || subject;
    const userId = uid === 'auth-user-a' ? 1 : uid === 'auth-user-b' ? 2 : null;
    return jsonRes(userId ? [{ id: userId }] : []);
  }
  if (url.includes('/rest/v1/products')) {
    const productId = Number(param(url, 'id'));
    if (productId === 101) return jsonRes([{ id: 101, tenant_id: 1, active: true }]);
    if (productId === 202) return jsonRes([{ id: 202, tenant_id: 2, active: true }]);
    return jsonRes([]);
  }
  if (url.includes('/rest/v1/wishlists')) {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') {
      const userId = Number(param(url, 'user_id'));
      const productIdParam = param(url, 'product_id');
      let rows = wishlistRows.filter((row) => row.user_id === userId);
      if (productIdParam) rows = rows.filter((row) => row.product_id === Number(productIdParam));
      return jsonRes(
        rows.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          tenant_id: row.tenant_id,
          created_at: row.created_at,
        }))
      );
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}'));
      wishlistRows.push({
        id: nextWishlistId++,
        user_id: Number(body.user_id),
        product_id: Number(body.product_id),
        tenant_id: Number(body.tenant_id),
        created_at: new Date().toISOString(),
      });
      return new Response(null, { status: 201 });
    }
    if (method === 'DELETE') {
      const id = Number(param(url, 'id'));
      wishlistRows = wishlistRows.filter((row) => row.id !== id);
      return new Response(null, { status: 204 });
    }
  }
  return jsonRes({ error: `Unexpected wishlist mock URL: ${url}` }, 500);
}) as typeof fetch;

async function runCashfreeTests(): Promise<void> {
  console.log('\nCashfree verification regressions');

  const baseEnvFactory = () => {
    const { db, d1 } = createD1();
    seedUnpaidOrder(db);
    const env: CloudflareEnv = {
      DB: d1,
      VITE_SUPABASE_URL: 'https://supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'anon-test-key',
      CASHFREE_ENV: 'sandbox',
      CASHFREE_CLIENT_ID: 'test-client-id',
      CASHFREE_CLIENT_SECRET: 'test-client-secret',
      CASHFREE_API_VERSION: '2023-08-01',
    };
    return { db, env };
  };

  await it('unpaid active order returns JSON verified:false and no entitlement (cashfree endpoint)', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'active';
    const { db, env } = baseEnvFactory();
    const response = await verifyCashfree(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.verified, false);
    assert.equal(body.paymentCompleted, false);
    assert.equal(body.entitlementGranted, false);
    assert.equal(body.status, 'ACTIVE');
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
    assert.equal(
      db.prepare("SELECT status FROM platform_payments WHERE razorpay_order_id = ?").get('cf_vv_test_unpaid_001')?.status,
      'created'
    );
    assert.equal(
      db.prepare("SELECT status FROM cashfree_payments WHERE order_id = ?").get('vv_test_unpaid_001')?.status,
      'PENDING'
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tenant_subscriptions').get()?.n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tenant_lifetime_entitlements').get()?.n, 0);
  });

  await it('unpaid active order works through /api/payments/platform/verify alias', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'active';
    const { env } = baseEnvFactory();
    const response = await verifyPlatform(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.verified, false);
    assert.equal(body.status, 'ACTIVE');
  });

  await it('failed provider payment maps to failed ledger without granting access', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'failed';
    const { db, env } = baseEnvFactory();
    const response = await verifyCashfree(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.verified, false);
    assert.equal(
      db.prepare("SELECT status FROM platform_payments WHERE razorpay_order_id = ?").get('cf_vv_test_unpaid_001')?.status,
      'failed'
    );
    assert.equal(
      db.prepare("SELECT status FROM cashfree_payments WHERE order_id = ?").get('vv_test_unpaid_001')?.status,
      'FAILED'
    );
  });

  await it('cancelled provider payment maps to failed/cancelled ledger safely', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'cancelled';
    const { db, env } = baseEnvFactory();
    const response = await verifyCashfree(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.verified, false);
    assert.equal(
      db.prepare("SELECT status FROM platform_payments WHERE razorpay_order_id = ?").get('cf_vv_test_unpaid_001')?.status,
      'failed'
    );
    assert.equal(
      db.prepare("SELECT status FROM cashfree_payments WHERE order_id = ?").get('vv_test_unpaid_001')?.status,
      'CANCELLED'
    );
  });

  await it('unknown/missing provider data returns verified:false JSON', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'unknown';
    const { env } = baseEnvFactory();
    const response = await verifyCashfree(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.verified, false);
    assert.equal(body.status, 'UNKNOWN');
  });

  await it('invalid order ID is rejected with 400 JSON', async () => {
    fetchMode = 'cashfree';
    const { env } = baseEnvFactory();
    const response = await verifyCashfree(makeContext(env, { orderId: 'bad id!' }, 'smoke-token'));
    assert.equal(response.status, 400);
    assert.match((await readJson(response)).error, /Invalid Cashfree order ID/);
  });

  await it('provider outage returns 502 JSON instead of a Worker exception', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'provider_error';
    const { env } = baseEnvFactory();
    const response = await verifyCashfree(
      makeContext(env, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
    assert.match((await readJson(response)).error, /Simulated provider outage/);
  });

  await it('unexpected database exception returns JSON 500 instead of Cloudflare HTML', async () => {
    fetchMode = 'cashfree';
    cashfreeScenario = 'active';
    const { env } = baseEnvFactory();
    const brokenEnv = {
      ...env,
      DB: {
        prepare() {
          throw new Error('simulated D1 exception');
        },
      } as unknown as D1Database,
    };
    const response = await verifyCashfree(
      makeContext(brokenEnv, { orderId: 'vv_test_unpaid_001' }, 'smoke-token')
    );
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
    assert.equal((await readJson(response)).code, 'CASHFREE_VERIFY_EXCEPTION');
  });
}

async function runWishlistTests(): Promise<void> {
  console.log('\nWishlist Pages Function regressions');
  fetchMode = 'wishlist';
  wishlistRows = [];
  nextWishlistId = 1;

  const { d1 } = createD1();
  const env: CloudflareEnv = {
    DB: d1,
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-test-key',
  };

  await it('unauthenticated wishlist read returns 401', async () => {
    const response = await getWishlist(makeContext(env, {}, undefined, 'GET'));
    assert.equal(response.status, 401);
  });

  await it('authenticated user can read an empty wishlist', async () => {
    const response = await getWishlist(makeContext(env, {}, 'token-user-a', 'GET'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, []);
  });

  await it('toggle adds a valid product and returns productIds', async () => {
    const response = await toggleWishlist(
      makeContext(env, { productId: 101 }, 'token-user-a')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, [101]);
  });

  await it('repeated toggle is safe and creates no duplicate row', async () => {
    const response = await toggleWishlist(
      makeContext(env, { productId: 101 }, 'token-user-a')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, []);
    assert.equal(wishlistRows.filter((r) => r.user_id === 1 && r.product_id === 101).length, 0);
  });

  await it('wishlist read reflects stored product IDs', async () => {
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    const response = await getWishlist(makeContext(env, {}, 'token-user-a', 'GET'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, [101]);
  });

  await it('cross-user access is isolated even with a spoofed userId body', async () => {
    await toggleWishlist(
      makeContext(env, { productId: 202, userId: 1 }, 'token-user-b')
    );
    const a = await readJson(await getWishlist(makeContext(env, {}, 'token-user-a', 'GET')));
    const b = await readJson(await getWishlist(makeContext(env, {}, 'token-user-b', 'GET')));
    assert.deepEqual(a.productIds, [101]);
    assert.deepEqual(b.productIds, [202]);
  });

  await it('invalid product IDs are rejected safely', async () => {
    for (const invalid of [0, -1, 1.5, 'abc', null, 2_147_483_648]) {
      const response = await toggleWishlist(
        makeContext(env, { productId: invalid }, 'token-user-a')
      );
      assert.equal(response.status, 400, `productId ${String(invalid)} should be rejected`);
    }
  });

  await it('unknown product returns 404', async () => {
    const response = await toggleWishlist(
      makeContext(env, { productId: 999 }, 'token-user-a')
    );
    assert.equal(response.status, 404);
  });
}

async function main(): Promise<void> {
  console.log('================================================================');
  console.log(' PRIORITY FIX 10 LOCAL REGRESSION TESTS');
  console.log('================================================================');
  try {
    await runCashfreeTests();
    await runWishlistTests();
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
