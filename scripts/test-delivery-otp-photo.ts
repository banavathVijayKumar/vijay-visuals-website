// ============================================================================
// LOCAL CUSTOMER OTP + PHOTO POD REGRESSIONS
// In-memory D1 + mocked Supabase. No email, SMS, provider call, or secrets.
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as customerOtp } from '../functions/api/customer/delivery-otp';
import { onRequestPatch as securePod } from '../functions/api/delivery/orders/[id]/secure-pod';
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

const { db, d1 } = createD1();
const env = { DB: d1, VITE_SUPABASE_URL: 'https://local.invalid', VITE_SUPABASE_ANON_KEY: 'local' } as CloudflareEnv;

for (const [id, email, role] of [
  ['customer-1', 'customer@local.invalid', 'customer'],
  ['other-customer', 'other@local.invalid', 'customer'],
  ['rider-1', 'rider1@local.invalid', 'customer'],
  ['other-rider', 'other-rider@local.invalid', 'customer'],
] as Array<[string, string, string]>) {
  db.prepare(
    `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status)
     VALUES (?, 'supabase', ?, ?, ?, ?, 'active')`
  ).run(id, id, email, `Test ${role}`, role);
}
db.prepare(
  `INSERT INTO customer_website_publications
    (website_id, owner_id, public_slug, business_name, website_json, status)
   VALUES ('site-1', 'owner-1', 'demo-shop', 'Demo Shop', '{"deliveryCommissionPct":10}', 'published')`
).run();
// Riders used by this POD test carry durable owner approval and online state in
// permissions_json; an active membership alone is no longer enough for assignment.
db.prepare(
  `INSERT INTO tenant_memberships
    (id, website_id, user_id, email, full_name, role, status, permissions_json, invited_by)
   VALUES (1, 'site-1', 'rider-1', 'rider1@local.invalid', 'Rider One', 'delivery_partner', 'active', ?, 'owner-1')`
).run(JSON.stringify(['deliveryApproval:owner_approved', 'availability:online']));
db.prepare(
  `INSERT INTO tenant_memberships
    (id, website_id, user_id, email, full_name, role, status, permissions_json, invited_by)
   VALUES (2, 'site-1', 'other-rider', 'other-rider@local.invalid', 'Rider Two', 'delivery_partner', 'active', ?, 'owner-1')`
).run(JSON.stringify(['deliveryApproval:owner_approved', 'availability:online']));
db.prepare(
  `INSERT INTO store_orders
    (id, order_number, website_id, owner_id, customer_user_id, customer_name, customer_phone,
     customer_email, shipping_address, items_json, subtotal_inr, discount_inr, gst_inr,
     shipping_inr, total_inr, payment_method, payment_status, order_status)
   VALUES (10, 'VV-POD-10', 'site-1', 'owner-1', 'customer-1', 'Customer Name', '9000000000',
     'customer@local.invalid', 'Address', '[]', 1000, 0, 0, 0, 1000,
     'cashfree_online', 'paid', 'out_for_delivery')`
).run();
db.prepare(
  `INSERT INTO delivery_assignments
    (website_id, order_id, delivery_partner_user_id, partner_name, status, cod_amount_inr)
   VALUES ('site-1', 10, '1', 'Rider One', 'in_transit', 0)`
).run();

function makeJwt(payload: Record<string, any>): string {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}
const tokens = {
  customer: makeJwt({ sub: 'customer-1', email: 'customer@local.invalid', role: 'customer' }),
  otherCustomer: makeJwt({ sub: 'other-customer', email: 'other@local.invalid', role: 'customer' }),
  rider: makeJwt({ sub: 'rider-1', email: 'rider1@local.invalid', role: 'delivery_partner' }),
  otherRider: makeJwt({ sub: 'other-rider', email: 'other-rider@local.invalid', role: 'delivery_partner' }),
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
  throw new Error(`Unexpected network request in OTP/POD test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const count = (sql: string, ...params: any[]) =>
  Number((db.prepare(sql).get(...params) as Record<string, number>)?.n || 0);
const PHOTO = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA==';

let otp = '';

console.log('\n====================================================================');
console.log('DELIVERY OTP + PHOTO POD REGRESSIONS');
console.log('====================================================================\n');

await test('only the authenticated order customer can request a delivery code', async () => {
  const denied = await customerOtp(ctx(req('https://local.invalid/api/customer/delivery-otp?orderId=10', tokens.otherCustomer)));
  assert.equal(denied.status, 403);

  const allowed = await customerOtp(ctx(req('https://local.invalid/api/customer/delivery-otp?orderId=10', tokens.customer)));
  assert.equal(allowed.status, 200);
  const body = (await allowed.json()) as { otp: string };
  assert.match(body.otp, /^\d{6}$/);
  otp = body.otp;
  assert.equal(
    count("SELECT COUNT(*) AS n FROM auth_email_otps WHERE purpose = 'login' AND otp_hash = ?", body.otp),
    0,
    'raw OTP must never be stored'
  );
});

await test('code resend respects cooldown and wrong attempts are bounded', async () => {
  const cooldown = await customerOtp(ctx(req('https://local.invalid/api/customer/delivery-otp?orderId=10', tokens.customer)));
  assert.equal(cooldown.status, 429);

  const wrong = await securePod(ctx(req('https://local.invalid/api/delivery/orders/10/secure-pod', tokens.rider, {
    recipientName: 'Recipient',
    podCode: 'POD-10',
    customerOtp: '000000' === otp ? '111111' : '000000',
    photoDataUrl: PHOTO,
  }), { id: '10' }));
  assert.equal(wrong.status, 400);
  assert.equal(count('SELECT attempts AS n FROM auth_email_otps WHERE consumed_at IS NULL AND purpose = ?', 'login'), 1);
});

await test('secure POD rejects unsafe photos and wrong riders', async () => {
  const unsafe = await securePod(ctx(req('https://local.invalid/api/delivery/orders/10/secure-pod', tokens.rider, {
    recipientName: 'Recipient',
    podCode: 'POD-10',
    customerOtp: otp,
    photoDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
  }), { id: '10' }));
  assert.equal(unsafe.status, 400);

  const wrongRider = await securePod(ctx(req('https://local.invalid/api/delivery/orders/10/secure-pod', tokens.otherRider, {
    recipientName: 'Recipient',
    podCode: 'POD-10',
    customerOtp: otp,
    photoDataUrl: PHOTO,
  }), { id: '10' }));
  assert.equal(wrongRider.status, 403);
});

await test('valid OTP + photo completes delivery, stores proof, and posts earnings once', async () => {
  const response = await securePod(ctx(req('https://local.invalid/api/delivery/orders/10/secure-pod', tokens.rider, {
    recipientName: 'Recipient',
    podCode: 'SECURE-POD-10',
    codCollected: false,
    customerOtp: otp,
    photoDataUrl: PHOTO,
  }), { id: '10' }));
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, any>;
  assert.equal(body.otpVerified, true);
  assert.equal(body.photoProof, true);

  const assignment = db.prepare(
    'SELECT status, proof_of_delivery_url, proof_of_delivery_note FROM delivery_assignments WHERE order_id = ?'
  ).get(10) as Record<string, string>;
  assert.equal(assignment.status, 'delivered');
  assert.equal(assignment.proof_of_delivery_url, PHOTO);
  assert.match(assignment.proof_of_delivery_note, /customer OTP/);
  assert.equal(
    (db.prepare('SELECT order_status FROM store_orders WHERE id = ?').get(10) as Record<string, string>).order_status,
    'delivered'
  );
  assert.equal(count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings'"), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM vv_audit_log WHERE action = 'delivery_otp_verified'"), 1);

  const replay = await securePod(ctx(req('https://local.invalid/api/delivery/orders/10/secure-pod', tokens.rider, {
    recipientName: 'Recipient',
    podCode: 'SECURE-POD-10',
    customerOtp: otp,
    photoDataUrl: PHOTO,
  }), { id: '10' }));
  assert.equal(replay.status, 400);
  assert.equal(count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings'"), 1);
});

globalThis.fetch = originalFetch;
console.log(`\n${passed} checks passed. No email, SMS, external provider, remote D1, payment, payout, or Production calls were made.\n`);
