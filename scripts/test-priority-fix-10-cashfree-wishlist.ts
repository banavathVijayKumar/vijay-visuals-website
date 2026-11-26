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
  // `vv_users` is managed outside the numbered migrations. requireUser reads it
  // before every authenticated endpoint, so local fixtures must provide it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vv_users (
      id TEXT PRIMARY KEY,
      auth_provider TEXT NOT NULL DEFAULT 'supabase',
      auth_subject TEXT UNIQUE,
      email TEXT,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
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

const wishlistFetchUrls: string[] = [];

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
  if (fetchMode === 'wishlist') wishlistFetchUrls.push(url);

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

function seedWishlistProducts(db: DatabaseSync): void {
  const insertUser = db.prepare(
    `INSERT INTO vv_users (id, auth_subject, email, full_name, role, status)
     VALUES (?, ?, ?, ?, 'customer', 'active')`
  );
  insertUser.run('auth-user-a', 'auth-user-a', 'user-a@example.invalid', 'Auth User A');
  insertUser.run('auth-user-b', 'auth-user-b', 'user-b@example.invalid', 'Auth User B');

  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, 'published')`
  ).run('web_a', 'auth-user-a', 'store-a', 'Store A', '{}');
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, 'published')`
  ).run('web_b', 'auth-user-b', 'store-b', 'Store B', '{}');

  const insertProduct = db.prepare(
    `INSERT INTO store_products
      (id, website_id, owner_id, name, price_inr, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertProduct.run(101, 'web_a', 'auth-user-a', 'Active Product A', 100, 1);
  insertProduct.run(202, 'web_b', 'auth-user-b', 'Active Product B', 200, 1);
  insertProduct.run(303, 'web_a', 'auth-user-a', 'Inactive Product A', 300, 0);
}

function createBrokenWishlistDb(): D1Database {
  const fail = () => {
    throw new Error('no such table: customer_wishlists');
  };
  return {
    prepare(sql: string) {
      const normalized = String(sql || '').toLowerCase();
      // Authentication must succeed so the test reaches the wishlist store.
      if (/\b(from|into|update)\s+vv_users\b/.test(normalized)) {
        return {
          bind() {
            return this;
          },
          async first() {
            return {
              id: 'auth-user-a',
              auth_subject: 'auth-user-a',
              role: 'customer',
              status: 'active',
              full_name: 'Auth User A',
            };
          },
          async all() {
            return { results: [], success: true };
          },
          async run() {
            return { success: true, meta: { changes: 0, last_row_id: 0 } };
          },
        } as any;
      }
      return {
        bind() {
          return this;
        },
        async first() {
          return fail();
        },
        async all() {
          return fail();
        },
        async run() {
          return fail();
        },
      } as any;
    },
  } as unknown as D1Database;
}

async function runWishlistTests(): Promise<void> {
  console.log('\nWishlist Pages Function regressions (D1 authoritative store)');
  fetchMode = 'wishlist';
  wishlistFetchUrls.length = 0;

  const { db, d1 } = createD1();
  seedWishlistProducts(db);
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
    assert.ok(Array.isArray(body.items));
  });

  await it('toggle adds a valid active product and returns productIds', async () => {
    const response = await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, [101]);
  });

  await it('repeated toggle is safe and creates no duplicate row', async () => {
    const response = await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, []);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM customer_wishlists WHERE user_id = 'auth-user-a' AND product_id = 101").get()?.n,
      0
    );
  });

  await it('add uses INSERT OR IGNORE so duplicate rows cannot be created', async () => {
    db.prepare('DELETE FROM customer_wishlists').run();
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM customer_wishlists WHERE user_id = 'auth-user-a' AND product_id = 101")
      .get()?.n;
    assert.equal(Number(count) <= 1, true);
  });

  await it('wishlist read reflects stored product IDs', async () => {
    db.prepare('DELETE FROM customer_wishlists').run();
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    const response = await getWishlist(makeContext(env, {}, 'token-user-a', 'GET'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.deepEqual(body.productIds, [101]);
  });

  await it('cross-user access is isolated with spoofed userId/ownerId fields', async () => {
    db.prepare('DELETE FROM customer_wishlists').run();
    await toggleWishlist(makeContext(env, { productId: 101 }, 'token-user-a'));
    await toggleWishlist(
      makeContext(env, { productId: 202, userId: 1, ownerId: 'auth-user-a', tenantId: 1 }, 'token-user-b')
    );
    const a = await readJson(await getWishlist(makeContext(env, {}, 'token-user-a', 'GET')));
    const b = await readJson(await getWishlist(makeContext(env, {}, 'token-user-b', 'GET')));
    assert.deepEqual(a.productIds, [101]);
    assert.deepEqual(b.productIds, [202]);
    const spoofRows = db
      .prepare("SELECT COUNT(*) AS n FROM customer_wishlists WHERE user_id = 'auth-user-a' AND product_id = 202")
      .get()?.n;
    assert.equal(spoofRows, 0);
  });

  await it('invalid product IDs are rejected safely', async () => {
    for (const invalid of [0, -1, 1.5, 'abc', null, 2_147_483_648]) {
      const response = await toggleWishlist(makeContext(env, { productId: invalid }, 'token-user-a'));
      assert.equal(response.status, 400, `productId ${String(invalid)} should be rejected`);
    }
  });

  await it('unknown and inactive products return 404', async () => {
    const unknown = await toggleWishlist(makeContext(env, { productId: 999 }, 'token-user-a'));
    const inactive = await toggleWishlist(makeContext(env, { productId: 303 }, 'token-user-a'));
    assert.equal(unknown.status, 404);
    assert.equal(inactive.status, 404);
  });

  await it('missing D1 binding returns explicit 503 migration error', async () => {
    const noDbEnv: CloudflareEnv = {
      VITE_SUPABASE_URL: 'https://supabase.invalid',
      VITE_SUPABASE_ANON_KEY: 'anon-test-key',
    };
    const read = await getWishlist(makeContext(noDbEnv, {}, 'token-user-a', 'GET'));
    const write = await toggleWishlist(makeContext(noDbEnv, { productId: 101 }, 'token-user-a'));
    assert.equal(read.status, 503);
    assert.equal(write.status, 503);
    assert.equal((await readJson(read)).code, 'WISHLIST_STORAGE_UNAVAILABLE');
    assert.equal((await readJson(write)).code, 'WISHLIST_STORAGE_UNAVAILABLE');
  });

  await it('missing wishlist table returns explicit 503 instead of 502', async () => {
    const brokenEnv: CloudflareEnv = {
      ...env,
      DB: createBrokenWishlistDb(),
    };
    const read = await getWishlist(makeContext(brokenEnv, {}, 'token-user-a', 'GET'));
    const write = await toggleWishlist(makeContext(brokenEnv, { productId: 101 }, 'token-user-a'));
    assert.equal(read.status, 503);
    assert.equal(write.status, 503);
    assert.match((await readJson(read)).error, /0017_customer_wishlists\.sql/);
    assert.match((await readJson(write)).error, /0017_customer_wishlists\.sql/);
  });

  await it('no Supabase REST wishlist/product/user calls are made', async () => {
    const forbidden = wishlistFetchUrls.filter((url) =>
      /\/rest\/v1\/(wishlists|products|users)(\?|$)/i.test(url)
    );
    assert.deepEqual(forbidden, []);
  });

  await it('frontend response shape remains productIds: number[]', async () => {
    const response = await getWishlist(makeContext(env, {}, 'token-user-a', 'GET'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.productIds));
    assert.equal(body.productIds.every((id: unknown) => typeof id === 'number'), true);
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
