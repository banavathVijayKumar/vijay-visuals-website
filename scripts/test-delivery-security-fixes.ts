// ============================================================================
// LOCAL DELIVERY SECURITY FIX REGRESSIONS
// In-memory D1 + mocked Supabase only. No network, provider, payment, payout,
// remote D1, secrets, or Production access.
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPatch as legacyPod } from '../functions/api/delivery/orders/[id]/pod';
import { onRequestPatch as statusPatch } from '../functions/api/delivery/orders/[id]/status';
import { onRequestPatch as securePod } from '../functions/api/delivery/orders/[id]/secure-pod';
import { onRequestPatch as availabilityPatch } from '../functions/api/delivery/partners/[id]/availability';
import { onRequestPatch as ownerPatch } from '../functions/api/owner/orders/[id]';
import { onRequestPost as commercePost } from '../functions/api/platform/commerce';
import {
  onRequestGet as customerOtpGet,
  onRequestPost as customerOtpPost,
} from '../functions/api/customer/delivery-otp';
import { onRequestGet as trackGet } from '../functions/api/orders/track/[orderNumber]';
import { onRequestGet as liveLocationGet } from '../functions/api/orders/[orderNumber]/live-location';
import { checkAssignedDeliveryAccess } from '../functions/api/delivery/_assignmentAccess';
import { isAutoAssignmentEligible, readRiderState } from '../functions/api/delivery/_riderState';
import { postRiderEarnings } from '../functions/api/delivery/_riderEarnings';
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
const env = {
  DB: d1,
  VITE_SUPABASE_URL: 'https://local.invalid',
  VITE_SUPABASE_ANON_KEY: 'local',
  DELIVERY_CHALLENGE_SECRET: 'local-only-challenge-secret',
} as CloudflareEnv;

for (const [id, email, role] of [
  ['customer-1', 'customer20@local.invalid', 'customer'],
  ['customer-2', 'customer21@local.invalid', 'customer'],
  ['rider-1', 'rider1@local.invalid', 'customer'],
  ['rider-2', 'rider2@local.invalid', 'customer'],
  ['owner-1', 'owner@local.invalid', 'admin'],
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

const APPROVED_ONLINE = JSON.stringify(['deliveryApproval:owner_approved', 'availability:online']);
for (const [id, userId, name] of [
  [1, 'rider-1', 'Rider One'],
  [2, 'rider-2', 'Rider Two'],
] as Array<[number, string, string]>) {
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, website_id, user_id, email, full_name, role, status, permissions_json, invited_by)
     VALUES (?, 'site-1', ?, ?, ?, 'delivery_partner', 'active', ?, 'owner-1')`
  ).run(id, userId, `${userId}@local.invalid`, name, APPROVED_ONLINE);
}

for (const row of [
  [20, 'VV-SEC-20', 'customer-1', 'Secret Customer Twenty', '9000000020', 'customer20@local.invalid',
    'Flat 9, Secret Street, Hyderabad', 'cashfree_online', 'paid', 'out_for_delivery', 1000],
  [21, 'VV-SEC-21', 'customer-1', 'Second Secret Customer', '9000000021', 'customer21@local.invalid',
    'Flat 10, Hidden Lane, Hyderabad', 'cod', 'pending', 'confirmed', 2000],
  [22, 'VV-SEC-22', 'customer-2', 'Third Secret Customer', '9000000022', 'customer22@local.invalid',
    'Flat 11, Private Road, Hyderabad', 'cod', 'pending', 'confirmed', 3000],
  [23, 'VV-SEC-23', 'customer-2', 'Fourth Secret Customer', '9000000023', 'customer23@local.invalid',
    'Flat 12, Quiet Street, Hyderabad', 'cod', 'pending', 'confirmed', 4000],
] as Array<[number, string, string, string, string, string, string, string, string, string, number]>) {
  db.prepare(
    `INSERT INTO store_orders
      (id, order_number, website_id, owner_id, customer_user_id, customer_name, customer_phone,
       customer_email, shipping_address, items_json, subtotal_inr, discount_inr, gst_inr,
       shipping_inr, total_inr, payment_method, payment_status, order_status)
     VALUES (?, ?, 'site-1', 'owner-1', ?, ?, ?, ?, ?, '[]', ?, 0, 0, 0, ?, ?, ?, ?)`
  ).run(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[10], row[10], row[7], row[8], row[9]);
}

for (const [orderId, membershipId, status] of [
  [20, 1, 'in_transit'],
  [21, 1, 'assigned'],
  [22, 2, 'assigned'],
] as Array<[number, number, string]>) {
  db.prepare(
    `INSERT INTO delivery_assignments
      (website_id, order_id, delivery_partner_user_id, partner_name, status, cod_amount_inr)
     VALUES ('site-1', ?, ?, 'Rider', ?, 0)`
  ).run(orderId, String(membershipId), status);
}

function makeJwt(payload: Record<string, any>): string {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}
const tokens = {
  customer: makeJwt({ sub: 'customer-1', email: 'customer20@local.invalid', role: 'customer' }),
  rider: makeJwt({ sub: 'rider-1', email: 'rider1@local.invalid', role: 'delivery_partner' }),
  otherRider: makeJwt({ sub: 'rider-2', email: 'rider2@local.invalid', role: 'delivery_partner' }),
  owner: makeJwt({ sub: 'owner-1', email: 'owner@local.invalid', role: 'admin' }),
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
  throw new Error(`Unexpected external request in security test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token?: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const count = (sql: string, ...params: any[]) =>
  Number((db.prepare(sql).get(...params) as Record<string, number>)?.n || 0);
const PHOTO = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA==';
const POD_REF = 'SECURE-POD-VVSEC20';
const SECRETS = [
  'customer20@local.invalid',
  'customer21@local.invalid',
  '9000000020',
  '9000000021',
  'Secret Customer Twenty',
  'Second Secret Customer',
  'Secret Street',
  'POD-VVSEC20',
];

let otp20 = '';

console.log('\n====================================================================');
console.log('DELIVERY SECURITY FIX REGRESSIONS');
console.log('====================================================================\n');

await test('legacy POD and direct delivered mutations cannot complete a delivery', async () => {
  // Legacy POD is retired at the route boundary for every caller and payload.
  const legacy = await legacyPod();
  assert.equal(legacy.status, 410);
  assert.equal((await legacy.json() as any).code, 'SECURE_POD_REQUIRED');

  const riderMilestone = await statusPatch(
    ctx(req('https://local.invalid/api/delivery/orders/20/status', tokens.rider, 'PATCH', { status: 'delivered' }), { id: '20' })
  );
  assert.equal(riderMilestone.status, 410);
  assert.equal((await riderMilestone.json() as any).code, 'SECURE_POD_REQUIRED');

  const marketplace = await commercePost(
    ctx(req('https://local.invalid/api/platform/commerce', tokens.owner, 'POST', {
      action: 'update_delivery_status',
      assignmentId: 1,
      status: 'delivered',
    }))
  );
  assert.equal(marketplace.status, 410);

  const owner = await ownerPatch(
    ctx(req('https://local.invalid/api/owner/orders/20', tokens.owner, 'PATCH', { status: 'delivered' }), { id: '20' })
  );
  assert.equal(owner.status, 410);

  assert.equal(
    (db.prepare('SELECT order_status FROM store_orders WHERE id = ?').get(20) as any).order_status,
    'out_for_delivery'
  );
  assert.equal(count('SELECT COUNT(*) AS n FROM finance_ledger'), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM notification_logs'), 0);
});

await test('wrong rider and cross-order OTP cannot be used as proof', async () => {
  const issued = await customerOtpGet(
    ctx(req('https://local.invalid/api/customer/delivery-otp?orderId=20', tokens.customer))
  );
  assert.equal(issued.status, 200);
  const issuedBody = (await issued.json()) as { otp: string; channel: string; message: string };
  assert.match(issuedBody.otp, /^\d{6}$/);
  assert.equal(issuedBody.channel, 'in_app_display_only');
  assert.match(issuedBody.message, /no SMS or email/i);
  otp20 = issuedBody.otp;

  const wrongRider = await securePod(
    ctx(req('https://local.invalid/api/delivery/orders/20/secure-pod', tokens.otherRider, 'PATCH', {
      recipientName: 'Recipient',
      podCode: POD_REF,
      customerOtp: otp20,
      photoDataUrl: PHOTO,
    }), { id: '20' })
  );
  assert.equal(wrongRider.status, 403);

  const crossOrder = await securePod(
    ctx(req('https://local.invalid/api/delivery/orders/21/secure-pod', tokens.rider, 'PATCH', {
      recipientName: 'Recipient',
      podCode: 'SECURE-POD-VVSEC21',
      customerOtp: otp20,
      photoDataUrl: PHOTO,
    }), { id: '21' })
  );
  assert.equal(crossOrder.status, 400);
  assert.equal(
    (db.prepare('SELECT order_status FROM store_orders WHERE id = ?').get(21) as any).order_status,
    'confirmed'
  );
  // The failed writes must not burn the legitimate one-time code.
  assert.equal(
    count('SELECT COUNT(*) AS n FROM auth_email_otps WHERE purpose = ? AND consumed_at IS NULL', 'login'),
    1
  );
});

await test('verified secure POD completes delivery once and then rejects replay', async () => {
  const response = await securePod(
    ctx(req('https://local.invalid/api/delivery/orders/20/secure-pod', tokens.rider, 'PATCH', {
      recipientName: 'Secret Customer Twenty',
      podCode: POD_REF,
      customerOtp: otp20,
      photoDataUrl: PHOTO,
      status: 'delivered',
      otpVerified: true,
    }), { id: '20' })
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as any;
  assert.equal(body.otpVerified, true);
  assert.equal(body.photoProof, true);
  assert.equal((db.prepare('SELECT order_status FROM store_orders WHERE id = ?').get(20) as any).order_status, 'delivered');
  assert.equal((db.prepare('SELECT status FROM delivery_assignments WHERE order_id = ?').get(20) as any).status, 'delivered');
  assert.equal(count('SELECT COUNT(*) AS n FROM finance_ledger WHERE category = ?', 'rider_earnings'), 1);
  assert.equal(count('SELECT COUNT(*) AS n FROM vv_audit_log WHERE action = ?', 'delivery_otp_verified'), 1);
  assert.equal(
    count('SELECT COUNT(*) AS n FROM auth_email_otps WHERE purpose = ? AND consumed_at IS NOT NULL', 'login'),
    1
  );

  const replay = await securePod(
    ctx(req('https://local.invalid/api/delivery/orders/20/secure-pod', tokens.rider, 'PATCH', {
      recipientName: 'Recipient',
      podCode: POD_REF,
      customerOtp: otp20,
      photoDataUrl: PHOTO,
    }), { id: '20' })
  );
  assert.equal(replay.status, 400);
  assert.equal(count('SELECT COUNT(*) AS n FROM finance_ledger WHERE category = ?', 'rider_earnings'), 1);

  const backwards = await statusPatch(
    ctx(req('https://local.invalid/api/delivery/orders/20/status', tokens.rider, 'PATCH', { status: 'out_for_delivery' }), { id: '20' })
  );
  assert.equal(backwards.status, 409);
});

await test('concurrent and duplicate earnings posts produce exactly one row', async () => {
  db.prepare(`UPDATE store_orders SET order_status = 'delivered' WHERE id = ?`).run(21);
  db.prepare(`UPDATE delivery_assignments SET status = 'delivered' WHERE order_id = ?`).run(21);

  const results = await Promise.all([
    postRiderEarnings(env, { websiteId: 'site-1', orderId: 21, partnerId: 1 }),
    postRiderEarnings(env, { websiteId: 'site-1', orderId: 21, partnerId: 1 }),
  ]);
  assert.equal(results.filter((r) => r.posted).length, 1);
  // A different client hint must not change the assignment-derived rider.
  const wrongHint = await postRiderEarnings(env, { websiteId: 'site-1', orderId: 21, partnerId: 999 });
  assert.equal(wrongHint.posted, false);
  const row = db.prepare(
    `SELECT reference_id FROM finance_ledger WHERE category = ? AND reference_id LIKE ?`
  ).get('rider_earnings', '%:21:%') as any;
  assert.equal(row.reference_id, 'rider_earnings:site-1:21:1');
  assert.equal(count('SELECT COUNT(*) AS n FROM finance_ledger WHERE category = ?', 'rider_earnings'), 2);
});

await test('guest code requires full contact or a signed challenge, never a provider call', async () => {
  const partial = await customerOtpPost(
    ctx(req('https://local.invalid/api/customer/delivery-otp', undefined, 'POST', {
      orderNumber: 'VV-SEC-23',
      phone: '0023',
    }))
  );
  assert.equal(partial.status, 403);

  const missing = await customerOtpGet(
    ctx(req('https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-23&phone=0023'))
  );
  assert.equal(missing.status, 403);
  assert.equal((await missing.json() as any).code, 'TRACKING_VERIFICATION_REQUIRED');

  const challenged = await customerOtpPost(
    ctx(req('https://local.invalid/api/customer/delivery-otp', undefined, 'POST', {
      orderNumber: 'VV-SEC-23',
      phone: '9000000023',
    }))
  );
  assert.equal(challenged.status, 200);
  const challenge = (await challenged.json() as any).challenge;
  assert.ok(challenge?.signature);
  assert.ok(!JSON.stringify(challenge).includes('9000000023'));
  assert.ok(!JSON.stringify(challenge).includes('customer23@local.invalid'));

  const tampered = await customerOtpGet(
    ctx(req(
      `https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-23&expiresAt=${challenge.expiresAt}&signature=bad`
    ))
  );
  assert.equal(tampered.status, 403);

  const viaChallenge = await customerOtpGet(
    ctx(req(
      `https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-23&expiresAt=${challenge.expiresAt}&signature=${challenge.signature}`
    ))
  );
  assert.equal(viaChallenge.status, 200);
  const challengeBody = (await viaChallenge.json()) as any;
  assert.match(challengeBody.otp, /^\d{6}$/);
  assert.equal(challengeBody.channel, 'in_app_display_only');

  const viaEmail = await customerOtpGet(
    ctx(req('https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-22&email=customer22@local.invalid'))
  );
  assert.equal(viaEmail.status, 200);

  for (let i = 0; i < 5; i += 1) {
    await customerOtpGet(
      ctx(req('https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-22&phone=9000000022'))
    );
  }
  const limited = await customerOtpGet(
    ctx(req('https://local.invalid/api/customer/delivery-otp?orderNumber=VV-SEC-22&phone=9000000022'))
  );
  assert.equal(limited.status, 429);
  assert.equal((await limited.json() as any).code, 'RATE_LIMIT_EXCEEDED');
});

await test('public tracking and live location never expose the delivery code', async () => {
  const tracking = await trackGet(
    ctx(req('https://local.invalid/api/orders/track/VV-SEC-20'), { orderNumber: 'VV-SEC-20' })
  );
  assert.equal(tracking.status, 200);
  const trackingText = await tracking.text();
  assert.ok(!trackingText.includes(otp20));
  assert.ok(!/delivery.?code|\botp\b/i.test(trackingText));

  const live = await liveLocationGet(
    ctx(req('https://local.invalid/api/orders/VV-SEC-21/live-location?phone=9000000021'), { orderNumber: 'VV-SEC-21' })
  );
  assert.equal(live.status, 200);
  const liveText = await live.text();
  assert.ok(!liveText.includes(otp20));
  assert.ok(!/delivery.?code|\botp\b/i.test(liveText));
});

await test('offline availability keeps approval and assignment authority', async () => {
  const offline = await availabilityPatch(
    ctx(req('https://local.invalid/api/delivery/partners/1/availability', tokens.rider, 'PATCH', { available: false }), { id: '1' })
  );
  assert.equal(offline.status, 200);
  const member = db.prepare('SELECT status, permissions_json FROM tenant_memberships WHERE id = ?').get(1) as any;
  assert.equal(member.status, 'active', 'offline must never suspend the membership');
  assert.equal(readRiderState(member.permissions_json).deliveryApproval, 'owner_approved');
  assert.equal(readRiderState(member.permissions_json).availability, 'offline');
  assert.equal(isAutoAssignmentEligible({ ...member, role: 'delivery_partner' }), false);

  // Order 21 is already delivered by the earnings test; use order 22 for a live
  // assignment authority check under a different rider before/after toggling.
  const ownAccess = await checkAssignedDeliveryAccess(
    env,
    {
      id: 'rider-1',
      authSubject: 'rider-1',
      email: 'rider1@local.invalid',
      isSuperAdmin: false,
    } as any,
    'site-1',
    21
  );
  assert.equal(ownAccess.authorized, true, 'offline riders keep authority on assigned orders');
  const crossAccess = await checkAssignedDeliveryAccess(
    env,
    {
      id: 'rider-1',
      authSubject: 'rider-1',
      email: 'rider1@local.invalid',
      isSuperAdmin: false,
    } as any,
    'site-1',
    22
  );
  assert.equal(crossAccess.authorized, false, 'another rider assignment stays inaccessible');

  const online = await availabilityPatch(
    ctx(req('https://local.invalid/api/delivery/partners/1/availability', tokens.rider, 'PATCH', { available: true }), { id: '1' })
  );
  assert.equal(online.status, 200);
  const restored = db.prepare('SELECT status, permissions_json FROM tenant_memberships WHERE id = ?').get(1) as any;
  assert.equal(isAutoAssignmentEligible({ ...restored, role: 'delivery_partner' }), true);
});

await test('notification logs and audit metadata contain no raw PII', async () => {
  const notifications = db.prepare('SELECT recipient_contact, subject, message_preview, error_detail FROM notification_logs').all() as any[];
  assert.ok(notifications.length > 0);
  const audits = db.prepare('SELECT metadata_json FROM vv_audit_log').all() as any[];
  assert.ok(audits.length > 0);

  const storedText = [...notifications, ...audits]
    .map((row) => Object.values(row).join(' | '))
    .join('\n');
  for (const secret of SECRETS) {
    assert.ok(!storedText.includes(secret), `raw PII leaked into durable logs: ${secret}`);
  }
  for (const notification of notifications) {
    assert.ok(!notification.recipient_contact?.includes?.('@local.invalid') ||
      /^[A-Za-z]\*{3}[A-Za-z0-9]@/.test(notification.recipient_contact));
  }
});

await test('UI cleanup source clears GPS on unmount and background pause', async () => {
  const gpsSource = fs.readFileSync(path.join(root, 'src', 'components', 'DeliveryGpsSharer.tsx'), 'utf8');
  assert.match(gpsSource, /clearServerLocation\(\)/);
  assert.match(gpsSource, /visibilitychange/);
  assert.match(gpsSource, /return \(\) => \{[\s\S]*clearWatcher\(\)[\s\S]*clearServerLocation\(\)/);

  const dashboardSource = fs.readFileSync(path.join(root, 'src', 'components', 'DashboardsHub.tsx'), 'utf8');
  assert.ok(!/\/api\/delivery\/orders\/\$\{ord\.id\}\/pod/.test(dashboardSource));
  assert.ok(!/status: 'delivered'/.test(dashboardSource));
});

globalThis.fetch = originalFetch;
console.log(`\n${passed} checks passed. No network, email, SMS, provider, payment, payout, remote D1, or Production calls were made.\n`);
