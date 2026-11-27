// ============================================================================
// LOCAL DELIVERY AUTOMATION REGRESSIONS
// In-memory SQLite D1 + mocked Supabase only. No network, no remote writes,
// no real payment/payout, no secrets, no Production access.
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  autoAssignPaidOrder,
  hasExplicitOwnerApproval,
} from '../functions/api/delivery/_autoAssignment';
import { postRiderEarnings } from '../functions/api/delivery/_riderEarnings';
import { checkAssignedDeliveryAccess } from '../functions/api/delivery/_assignmentAccess';
import { onRequestPatch as approvePartner } from '../functions/api/tenants/[tenantId]/delivery-partners';
import { onRequestPatch as statusPatch } from '../functions/api/delivery/orders/[id]/status';
import { onRequestPatch as podPatch } from '../functions/api/delivery/orders/[id]/pod';
import { onRequestGet as portalGet } from '../functions/api/delivery/portal';
import type { CloudflareEnv, D1Database } from '../functions/api/_shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  const schemaPath = path.join(root, 'cloudflare', 'd1', 'schema.sql');
  const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');
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

const { db, d1 } = createD1();
const env = { DB: d1, VITE_SUPABASE_URL: 'https://local.invalid', VITE_SUPABASE_ANON_KEY: 'local' } as CloudflareEnv;

function insertUser(id: string, email: string, role: 'admin' | 'customer'): void {
  db.prepare(
    `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status)
     VALUES (?, 'supabase', ?, ?, ?, ?, 'active')`
  ).run(id, id, email, `Test ${role}`, role);
}

function insertMember(
  id: number,
  userId: string,
  status: 'active' | 'invited' | 'suspended',
  permissionsJson: string,
  invitedBy: string
): void {
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, website_id, user_id, email, full_name, role, status, permissions_json, invited_by)
     VALUES (?, 'site-1', ?, ?, ?, 'delivery_partner', ?, ?, ?)`
  ).run(id, userId, `${userId}@local.invalid`, `Rider ${id}`, status, permissionsJson, invitedBy);
}

function insertOrder(id: number, orderNumber: string, total: number, status = 'confirmed'): void {
  db.prepare(
    `INSERT INTO store_orders
      (id, order_number, website_id, owner_id, customer_user_id, customer_name,
       customer_phone, customer_email, shipping_address, items_json,
       subtotal_inr, discount_inr, gst_inr, shipping_inr, total_inr,
       payment_method, payment_status, order_status)
     VALUES (?, ?, 'site-1', 'owner-1', 'customer-1', 'Test Customer',
       '9000000000', 'customer@local.invalid', 'Test Address', '[]',
       ?, 0, 0, 0, ?, 'cashfree_online', 'paid', ?)`
  ).run(id, orderNumber, total, total, status);
}

function insertAssignment(orderId: number, partnerId: number, status = 'assigned'): void {
  db.prepare(
    `INSERT INTO delivery_assignments
      (website_id, order_id, delivery_partner_user_id, partner_name, status, cod_amount_inr)
     VALUES ('site-1', ?, ?, 'Assigned Rider', ?, 0)`
  ).run(orderId, String(partnerId), status);
}

insertUser('owner-1', 'owner@local.invalid', 'admin');
insertUser('rider-1', 'rider1@local.invalid', 'customer');
insertUser('rider-2', 'rider2@local.invalid', 'customer');
insertUser('suspended-rider', 'suspended@local.invalid', 'customer');
insertUser('unapproved-rider', 'unapproved@local.invalid', 'customer');
insertUser('customer-1', 'customer@local.invalid', 'customer');
insertUser('admin-1', 'admin@local.invalid', 'admin');

db.prepare(
  `INSERT INTO customer_website_publications
    (website_id, owner_id, public_slug, business_name, website_json, status)
   VALUES ('site-1', 'owner-1', 'demo-shop', 'Demo Shop', ?, 'published')`
).run(JSON.stringify({ deliveryCommissionPct: 10 }));

insertMember(
  1,
  'rider-1',
  'active',
  JSON.stringify([
    'phone:9000000001',
    'vehicleType:Two-Wheeler',
    'linkCurrentUser:false',
    'deliveryApproval:owner_approved',
    'availability:online',
  ]),
  'owner-1'
);
insertMember(
  2,
  'rider-2',
  'active',
  JSON.stringify(['phone:9000000002', 'vehicleType:Two-Wheeler', 'linkCurrentUser:true']),
  'rider-2'
);
insertMember(3, 'suspended-rider', 'suspended', '[]', 'owner-1');
insertMember(4, 'unapproved-rider', 'invited', '[]', 'unapproved-rider');

for (let id = 10; id <= 20; id += 1) {
  insertOrder(id, `VV-AUTO-${id}`, 5000);
}

function makeJwt(payload: Record<string, any>): string {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}

const tokens = {
  owner: makeJwt({ sub: 'owner-1', email: 'owner@local.invalid', role: 'business_owner' }),
  approvedRider: makeJwt({ sub: 'rider-1', email: 'rider1@local.invalid', role: 'delivery_partner' }),
  legacyRider: makeJwt({ sub: 'rider-2', email: 'rider2@local.invalid', role: 'delivery_partner' }),
  suspendedRider: makeJwt({ sub: 'suspended-rider', email: 'suspended@local.invalid', role: 'delivery_partner' }),
  unapprovedRider: makeJwt({ sub: 'unapproved-rider', email: 'unapproved@local.invalid', role: 'delivery_partner' }),
  customer: makeJwt({ sub: 'customer-1', email: 'customer@local.invalid', role: 'customer' }),
  admin: makeJwt({ sub: 'admin-1', email: 'admin@local.invalid', role: 'super_admin' }),
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
  throw new Error(`Unexpected network request in delivery automation test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const count = (sql: string, ...params: any[]) =>
  Number((db.prepare(sql).get(...params) as Record<string, number>)?.n || 0);
const userFor = (payload: Record<string, any>) =>
  ({
    id: payload.sub,
    authSubject: payload.sub,
    email: payload.email,
    isSuperAdmin: payload.role === 'super_admin',
  }) as any;
const payloadOf = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')) as Record<string, any>;

console.log('\n====================================================================');
console.log('DELIVERY AUTOMATION REGRESSIONS');
console.log('====================================================================\n');

await test('paid order is automatically assigned exactly once', async () => {
  const first = await autoAssignPaidOrder(env, 10);
  assert.equal(first.assigned, true);
  assert.equal(first.partnerId, 1);
  const second = await autoAssignPaidOrder(env, 10);
  assert.equal(second.assigned, false);
  assert.equal(second.reason, 'already_assigned');
  assert.equal(count('SELECT COUNT(*) AS n FROM delivery_assignments WHERE order_id = ?', 10), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM vv_audit_log WHERE action = ?', 'auto_assign_delivery'), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM notification_logs WHERE event_type = 'order_assigned'"), 1);
});

await test('unpaid orders are never auto-assigned', async () => {
  db.prepare(
    `UPDATE store_orders SET payment_status = 'pending' WHERE id = 11`
  ).run();
  const result = await autoAssignPaidOrder(env, 11);
  assert.equal(result.assigned, false);
  assert.equal(result.reason, 'unpaid');
  assert.equal(count('SELECT COUNT(*) AS n FROM delivery_assignments WHERE order_id = ?', 11), 0);
  db.prepare(`UPDATE store_orders SET payment_status = 'paid' WHERE id = 11`).run();
});

await test('legacy self-registration is excluded until explicit owner approval', async () => {
  // Temporarily remove the only cleanly approved rider to prove the legacy
  // self-registered active row is not treated as eligible.
  db.prepare(`UPDATE tenant_memberships SET status = 'suspended' WHERE id = 1`).run();
  const before = await autoAssignPaidOrder(env, 12);
  assert.equal(before.assigned, false);
  assert.equal(before.reason, 'no_eligible_rider');
  assert.equal(count('SELECT COUNT(*) AS n FROM delivery_assignments WHERE order_id = ?', 12), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM notification_logs WHERE event_type = 'delivery_exception'"), 1);
  // Restore rider 1 as active but offline so the newly approved rider 2 is the
  // only eligible candidate for the next automatic assignment.
  db.prepare(
    `UPDATE tenant_memberships SET status = 'active', permissions_json = ? WHERE id = 1`
  ).run(JSON.stringify([
    'phone:9000000001',
    'vehicleType:Two-Wheeler',
    'linkCurrentUser:false',
    'deliveryApproval:owner_approved',
    'availability:offline',
  ]));

  const approval = await approvePartner(
    ctx(
      req('https://local.invalid/api/tenants/site-1/delivery-partners', tokens.owner, 'PATCH', {
        partnerId: 2,
        approved: true,
      }),
      { tenantId: 'site-1' }
    )
  );
  assert.equal(approval.status, 200);
  assert.equal(await hasExplicitOwnerApproval(env, 2), true);
  assert.equal(count('SELECT COUNT(*) AS n FROM vv_audit_log WHERE action = ?', 'delivery_partner_approved'), 1);

  // Approval and availability are independent: the rider must go online
  // explicitly before becoming eligible for automatic assignment.
  db.prepare(`UPDATE tenant_memberships SET permissions_json = ? WHERE id = 2`).run(
    JSON.stringify([
      'phone:9000000002',
      'vehicleType:Two-Wheeler',
      'linkCurrentUser:true',
      'deliveryApproval:owner_approved',
      'availability:online',
    ])
  );

  const after = await autoAssignPaidOrder(env, 12);
  assert.equal(after.assigned, true);
  assert.equal(after.partnerId, 2);
});

await test('concurrent assignment calls cannot duplicate one order', async () => {
  const results = await Promise.all([
    autoAssignPaidOrder(env, 13),
    autoAssignPaidOrder(env, 13),
    autoAssignPaidOrder(env, 13),
  ]);
  assert.equal(results.filter((r) => r.assigned).length, 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM delivery_assignments WHERE order_id = ?', 13), 1);
});

await test('role isolation blocks unassigned and wrong-rider delivery mutations', async () => {
  const accessApproved = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.approvedRider)), 'site-1', 10);
  const accessSuspended = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.suspendedRider)), 'site-1', 10);
  const accessUnapproved = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.unapprovedRider)), 'site-1', 10);
  const accessCustomer = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.customer)), 'site-1', 10);
  const accessAdmin = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.admin)), 'site-1', 10);
  const accessUnassigned = await checkAssignedDeliveryAccess(env, userFor(payloadOf(tokens.approvedRider)), 'site-1', 20);

  assert.equal(accessApproved.authorized, true);
  assert.equal(accessSuspended.authorized, false);
  assert.equal(accessUnapproved.authorized, false);
  assert.equal(accessCustomer.authorized, false);
  assert.equal(accessAdmin.authorized, true);
  assert.equal(accessUnassigned.authorized, false);
});

await test('accepted milestone persists DB-compatible delivered preparation state', async () => {
  const res = await statusPatch(
    ctx(req('https://local.invalid/api/delivery/orders/10/status', tokens.approvedRider, 'PATCH', { status: 'accepted' }), { id: '10' })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, any>;
  assert.equal(body.status, 'accepted');
  assert.equal(
    (db.prepare('SELECT order_status FROM store_orders WHERE id = ?').get(10) as Record<string, string>).order_status,
    'confirmed'
  );
  assert.equal(
    (db.prepare('SELECT status FROM delivery_assignments WHERE order_id = ?').get(10) as Record<string, string>).status,
    'assigned'
  );
});

await test('verified delivery posts immutable earnings once', async () => {
  // The generic status endpoint must never deliver an order; only the secure
  // POD writer can produce the delivered state assumed by the ledger.
  const forced = await statusPatch(
    ctx(req('https://local.invalid/api/delivery/orders/10/status', tokens.approvedRider, 'PATCH', { status: 'delivered' }), { id: '10' })
  );
  assert.equal(forced.status, 410);
  db.prepare(`UPDATE store_orders SET order_status = 'delivered' WHERE id = 10`).run();
  db.prepare(`UPDATE delivery_assignments SET status = 'delivered' WHERE order_id = 10`).run();

  // A wrong partner hint is ignored: earnings must come from the assignment.
  const first = await postRiderEarnings(env, { websiteId: 'site-1', orderId: 10, partnerId: 999 });
  assert.equal(first.posted, true);
  assert.equal(first.reason, 'posted');
  const rows = db.prepare(
    `SELECT amount_inr, entry_type, category, reference_id FROM finance_ledger
     WHERE category = 'rider_earnings'`
  ).all() as Array<Record<string, any>>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_inr, 500);
  assert.equal(rows[0].entry_type, 'expense');
  assert.match(String(rows[0].reference_id), /^rider_earnings:site-1:10:1$/);
  assert.equal(count("SELECT COUNT(*) AS n FROM notification_logs WHERE event_type = 'rider_earnings_posted'"), 1);

  const duplicate = await postRiderEarnings(env, { websiteId: 'site-1', orderId: 10, partnerId: 1 });
  assert.equal(duplicate.posted, false);
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings'"), 1);
});

await test('legacy POD is retired and recorded earnings stay idempotent', async () => {
  insertAssignment(14, 2);
  // The old /pod route accepted client-supplied otpVerified/status as proof.
  // It is now a deliberate 410; earnings remain tied to delivered state only.
  const retired = await podPatch();
  assert.equal(retired.status, 410);
  const retiredBody = (await retired.json()) as Record<string, any>;
  assert.equal(retiredBody.code, 'SECURE_POD_REQUIRED');

  db.prepare(`UPDATE store_orders SET order_status = 'delivered' WHERE id = 14`).run();
  db.prepare(`UPDATE delivery_assignments SET status = 'delivered' WHERE order_id = 14`).run();
  const first = await postRiderEarnings(env, { websiteId: 'site-1', orderId: 14, partnerId: 2 });
  assert.equal(first.posted, true);
  assert.equal(
    count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings' AND reference_id LIKE '%:14:%'"),
    1
  );

  const duplicate = await postRiderEarnings(env, { websiteId: 'site-1', orderId: 14, partnerId: 2 });
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(
    count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings' AND reference_id LIKE '%:14:%'"),
    1
  );
});

await test('rider portal exposes only assigned orders and pending payout totals', async () => {
  const res = await portalGet(ctx(req('https://local.invalid/api/delivery/portal', tokens.approvedRider)));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { partners: Array<Record<string, any>>; assignedOrders: Array<Record<string, any>> };
  assert.ok(body.partners.length >= 1);
  assert.ok(body.partners[0].pendingPayoutInr >= 500);
  assert.ok(body.assignedOrders.every((o) => Number(o.deliveryPartnerId) > 0));
  assert.ok(body.assignedOrders.some((o) => Number(o.id) === 10));
});

await test('no payout or fake balance was created', async () => {
  assert.equal(count("SELECT COUNT(*) AS n FROM finance_ledger WHERE category = 'rider_earnings' AND amount_inr < 0"), 0);
  const transfers = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'seller_payment_transfers'").get();
  assert.ok(transfers);
  assert.equal(count('SELECT COUNT(*) AS n FROM seller_payment_transfers'), 0);
});

globalThis.fetch = originalFetch;
console.log(`\n${passed} checks passed. No network, remote D1, payment, payout, or Production calls were made.\n`);
