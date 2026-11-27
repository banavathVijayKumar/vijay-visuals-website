// ============================================================================
// LOCAL DELIVERY SCANNER REGRESSIONS
// In-memory D1 + mocked Supabase. No network, remote D1, camera, or secrets.
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyPickupScan,
  buildLabelPayload,
  buildPickupProgress,
  code39Pattern,
  enqueueScan,
  loadScanQueue,
  matchPickupCode,
  normalizeScanCode,
  parseOrderItems,
  pickupComplete,
  qrFormatBits,
  qrIsFunctionModule,
  qrMatrix,
  qrSvg,
  reconcileScanQueue,
  scanDedupeKey,
  type DeliveryProductLookup,
} from '../src/lib/deliveryScanner';
import { onRequestGet as productsGet } from '../functions/api/delivery/orders/[id]/products';
import type { CloudflareEnv, D1Database } from '../functions/api/_shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'cloudflare', 'd1', 'schema.sql'), 'utf8'));
  const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');
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

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};

const { db, d1 } = createD1();
const env = { DB: d1, VITE_SUPABASE_URL: 'https://local.invalid', VITE_SUPABASE_ANON_KEY: 'local' } as CloudflareEnv;

for (const [id, email, role] of [
  ['owner-1', 'owner@local.invalid', 'admin'],
  ['rider-1', 'rider1@local.invalid', 'customer'],
  ['rider-2', 'rider2@local.invalid', 'customer'],
] as Array<[string, string, string]>) {
  db.prepare(
    `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status)
     VALUES (?, 'supabase', ?, ?, ?, ?, 'active')`
  ).run(id, id, email, `Test ${role}`, role);
}
db.prepare(
  `INSERT INTO customer_website_publications
    (website_id, owner_id, public_slug, business_name, website_json, status)
   VALUES ('site-1', 'owner-1', 'demo-shop', 'Demo Shop', '{}', 'published')`
).run();
for (const [id, userId] of [
  [1, 'rider-1'],
  [2, 'rider-2'],
] as Array<[number, string]>) {
  // Scanner access is assignment-scoped and now also requires durable approval.
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, website_id, user_id, email, full_name, role, status, permissions_json, invited_by)
     VALUES (?, 'site-1', ?, ?, ?, 'delivery_partner', 'active', ?, 'owner-1')`
  ).run(
    id,
    userId,
    `${userId}@local.invalid`,
    `Rider ${id}`,
    JSON.stringify(['deliveryApproval:owner_approved', 'availability:online'])
  );
}
db.prepare(
  `INSERT INTO store_orders
    (id, order_number, website_id, owner_id, customer_user_id, customer_name, customer_phone,
     customer_email, shipping_address, items_json, subtotal_inr, discount_inr, gst_inr,
     shipping_inr, total_inr, payment_method, payment_status, order_status)
   VALUES (10, 'VV-SCAN-10', 'site-1', 'owner-1', 'customer-1', 'Customer Name', '9000000000',
     'customer@local.invalid', 'Address', '[{"productId":101,"quantity":2},{"productId":102,"quantity":1}]',
     1500, 0, 0, 0, 1500, 'cashfree_online', 'paid', 'confirmed')`
).run();
db.prepare(
  `INSERT INTO delivery_assignments
    (website_id, order_id, delivery_partner_user_id, partner_name, status, cod_amount_inr)
   VALUES ('site-1', 10, '1', 'Rider 1', 'assigned', 0)`
).run();
for (const [id, sku, barcode, name] of [
  [101, 'SKU-ALPHA-1', '8901234567890', 'Alpha Product'],
  [102, 'SKU-BETA-2', '8901234567891', 'Beta Product'],
] as Array<[number, string, string, string]>) {
  db.prepare(
    `INSERT INTO store_products
      (id, website_id, owner_id, sku, barcode, name, price_inr, stock_qty, is_active)
     VALUES (?, 'site-1', 'owner-1', ?, ?, ?, 500, 20, 1)`
  ).run(id, sku, barcode, name);
}

function makeJwt(payload: Record<string, any>): string {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}
const tokens = {
  rider: makeJwt({ sub: 'rider-1', email: 'rider1@local.invalid', role: 'delivery_partner' }),
  otherRider: makeJwt({ sub: 'rider-2', email: 'rider2@local.invalid', role: 'delivery_partner' }),
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const headers = init?.headers as Record<string, string> | Headers | undefined;
  const auth =
    headers instanceof Headers
      ? headers.get('Authorization') || ''
      : headers?.Authorization || headers?.authorization || '';
  const match = auth.match(/^Bearer mock\.([A-Za-z0-9+/=]+)\.sig/);
  const payload = match ? JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) : {};
  if (url.includes('/auth/v1/user')) {
    if (!payload.sub) return new Response('{"error":"invalid"}', { status: 401 });
    return new Response(
      JSON.stringify({ id: payload.sub, email: payload.email, email_confirmed_at: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(
      JSON.stringify([{ id: payload.sub, role: payload.role || 'customer', full_name: 'Test User' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error(`Unexpected network request in scanner test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token: string) =>
  new Request(url, { headers: { Authorization: `Bearer ${token}` } });

console.log('\n====================================================================');
console.log('DELIVERY SCANNER REGRESSIONS');
console.log('====================================================================\n');

await test('barcode and QR labels are generated locally and deterministically', () => {
  assert.equal(normalizeScanCode(' sku:SKU-ALPHA-1 '), 'SKU-ALPHA-1');
  const pattern = code39Pattern('SKU-ALPHA-1');
  assert.ok(pattern);
  assert.deepEqual(
    Array.from(new Set((pattern as string).match(/1+|0+/g)!.map((run) => run.length))).sort(),
    [1, 3]
  );
  assert.equal(code39Pattern('sku-with-bad-@'), null);
  const matrix = qrMatrix(buildLabelPayload('site-1', 101));
  assert.ok(matrix);
  assert.equal(qrFormatBits(1, 0) > 0, true);
  assert.ok(qrSvg(buildLabelPayload('site-1', 101)).includes('<svg'));
  assert.ok(qrSvg('x'.repeat(200)) === '');

  // Round-trip the byte-mode data region using the same reserved-module map.
  const bits: number[] = [];
  const size = matrix!.length;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (qrIsFunctionModule(x, y, size)) continue;
        let dark = matrix![y][x];
        if ((x + y) % 2 === 0) dark = !dark;
        bits.push(dark ? 1 : 0);
      }
    }
  }
  // QR byte mode is 4-bit mode + 8-bit length + 8-bit data, so read a bit
  // stream instead of assuming byte alignment at the start.
  let cursor = 0;
  const readBits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i += 1) value = (value << 1) | bits[cursor++];
    return value;
  };
  assert.equal(readBits(4), 0b0100);
  const length = readBits(8);
  assert.ok(length <= 40);
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) data[i] = readBits(8);
  assert.equal(new TextDecoder().decode(data), buildLabelPayload('site-1', 101));
});

await test('batch pickup matching detects wrong, duplicate, and unknown products', () => {
  const products: DeliveryProductLookup[] = [
    { id: 101, name: 'Alpha', sku: 'SKU-ALPHA-1', barcode: '8901234567890', stock: 20, active: true },
    { id: 102, name: 'Beta', sku: 'SKU-BETA-2', barcode: '8901234567891', stock: 20, active: true },
  ];
  const items = parseOrderItems('[{"productId":101,"quantity":2},{"productId":102,"quantity":1}]');
  let progress = buildPickupProgress(items, products);
  assert.equal(matchPickupCode('8901234567890', progress, 'site-1').status, 'ok');
  assert.equal(matchPickupCode('SKU-BETA-2', progress, 'site-1').status, 'ok');
  assert.equal(matchPickupCode(buildLabelPayload('site-1', 101), progress, 'site-1').status, 'ok');
  assert.equal(matchPickupCode(buildLabelPayload('other-site', 101), progress, 'site-1').status, 'wrong_product');
  assert.equal(matchPickupCode('SKU-GAMMA-9', progress, 'site-1').status, 'wrong_product');
  assert.equal(matchPickupCode('', progress, 'site-1').status, 'unknown_product');

  progress = applyPickupScan(progress, 'SKU-ALPHA-1', 'site-1').progress;
  progress = applyPickupScan(progress, buildLabelPayload('site-1', 101), 'site-1').progress;
  const over = applyPickupScan(progress, '8901234567890', 'site-1');
  assert.equal(over.status, 'over_scan');
  assert.equal(over.progress[0].picked, 2);
  assert.equal(pickupComplete(over.progress), false);
  progress = applyPickupScan(over.progress, 'SKU-BETA-2', 'site-1').progress;
  assert.equal(pickupComplete(progress), true);
});

await test('offline scan queue persists, dedupes, and reconciliation makes no mutations', async () => {
  store.clear();
  const createdAt = '2026-11-27T10:00:00.000Z';
  const event = {
    dedupeKey: scanDedupeKey('site-1', 10, 'SKU-ALPHA-1', createdAt),
    tenantId: 'site-1',
    orderId: 10,
    productId: 101,
    code: 'SKU-ALPHA-1',
    status: 'ok' as const,
    createdAt,
  };
  enqueueScan(event);
  enqueueScan(event);
  assert.equal(loadScanQueue().length, 1);

  let fetchCalls = 0;
  const result = await reconcileScanQueue(async () => {
    fetchCalls += 1;
    return true;
  });
  assert.deepEqual(result.verified, [event.dedupeKey]);
  assert.equal(fetchCalls, 1);
  assert.ok(loadScanQueue()[0].syncedAt);
  assert.equal(fetchCalls, 1, 'reconcile must not call fetch or replay a PATCH');
});

await test('product endpoint is assignment-scoped and hides customer data', async () => {
  const allowed = await productsGet(ctx(req('https://local.invalid/api/delivery/orders/10/products', tokens.rider), { id: '10' }));
  assert.equal(allowed.status, 200);
  const body = (await allowed.json()) as { products: DeliveryProductLookup[] };
  assert.equal(body.products.length, 2);
  assert.equal(body.products[0].sku, 'SKU-ALPHA-1');
  assert.ok(!JSON.stringify(body).includes('customer@local.invalid'));

  const denied = await productsGet(ctx(req('https://local.invalid/api/delivery/orders/10/products', tokens.otherRider), { id: '10' }));
  assert.equal(denied.status, 403);
});

globalThis.fetch = originalFetch;
console.log(`\n${passed} checks passed. No network, remote D1, camera, payment, or Production calls were made.\n`);
