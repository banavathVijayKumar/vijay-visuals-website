// ============================================================================
// LOCAL CUSTOMER -> OWNER -> DELIVERY ORDER WORKFLOW REGRESSION SUITE
// Mock D1 + mock Supabase only. No network, no DB writes, no provider calls,
// no real OTP, payment, refund, or Production access.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { onRequestPatch as ownerOrderPatch } from '../functions/api/owner/orders/[id].ts';
import { onRequestGet as deliveryPortalGet } from '../functions/api/delivery/portal.ts';
import { onRequestPatch as deliveryStatusPatch } from '../functions/api/delivery/orders/[id]/status.ts';
import { onRequestPatch as deliveryPodPatch } from '../functions/api/delivery/orders/[id]/pod.ts';
import { onRequestPost as locationPost } from '../functions/api/delivery/orders/[id]/location.ts';
import { onRequestGet as liveLocationGet } from '../functions/api/orders/[orderNumber]/live-location.ts';
import { checkAssignedDeliveryAccess } from '../functions/api/delivery/_assignmentAccess.ts';
import { isFreshLocation, parseRecordedAt } from '../functions/api/delivery/_locationState.ts';

const read = (p: string) => fs.readFileSync(p, 'utf8');
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

type Row = Record<string, any>;

class MockStatement {
  private params: any[] = [];
  constructor(private sql: string, private db: MockD1) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.db.select(this.sql, this.params) as T[] };
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.db.select(this.sql, this.params);
    return (rows[0] as T) ?? null;
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    return this.db.mutate(this.sql, this.params);
  }
}

class MockD1 {
  publications: Row[] = [
    {
      rowid: 1,
      website_id: 'site-1',
      owner_id: 'owner-1',
      public_slug: 'demo-shop',
      business_name: 'Demo Shop',
      website_json: '{}',
      status: 'published',
    },
  ];
  orders: Row[] = [
    {
      id: 10,
      website_id: 'site-1',
      order_number: 'VV-TEST-001',
      customer_name: 'Test Customer',
      customer_phone: '9876543210',
      customer_email: 'customer@example.com',
      customer_user_id: 'customer-1',
      payment_method: 'cod',
      payment_status: 'pending',
      order_status: 'confirmed',
      total_inr: 1200,
      subtotal_inr: 1200,
      discount_inr: 0,
      gst_inr: 0,
      shipping_inr: 0,
      items_json: '[]',
    },
  ];
  members: Row[] = [
    { id: 77, website_id: 'site-1', user_id: 'rider-1', email: 'rider@example.com', full_name: 'Rider One', role: 'delivery_partner', status: 'active' },
    { id: 78, website_id: 'site-1', user_id: 'rider-2', email: 'other@example.com', full_name: 'Rider Two', role: 'delivery_partner', status: 'active' },
  ];
  assignments: Row[] = [];
  users: Row[] = [
    { id: 'owner-1', auth_subject: 'owner-1', email: 'owner@example.com', role: 'business_owner', status: 'active', full_name: 'Owner' },
    { id: 'rider-1', auth_subject: 'rider-1', email: 'rider@example.com', role: 'delivery_partner', status: 'active', full_name: 'Rider One' },
    { id: 'rider-2', auth_subject: 'rider-2', email: 'other@example.com', role: 'delivery_partner', status: 'active', full_name: 'Rider Two' },
    { id: 'customer-1', auth_subject: 'customer-1', email: 'customer@example.com', role: 'end_customer', status: 'active', full_name: 'Customer' },
  ];
  rateLimits: Row[] = [];
  auditLogs: Row[] = [];

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }

  private norm(sql: string) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  select(sql: string, params: any[]): Row[] {
    const n = this.norm(sql);
    const p = params.map(String);

    if (n.includes('from vv_users')) {
      return this.users.filter((u) =>
        p.includes(String(u.auth_subject)) || p.includes(String(u.id)) || p.includes(String(u.email).toLowerCase())
      );
    }
    if (n.includes('from platform_staff')) return [];
    if (n.includes('from customer_website_publications')) {
      return this.publications.filter((row) =>
        p.includes(String(row.rowid)) || p.includes(String(row.website_id)) || p.includes(String(row.public_slug))
      );
    }
    if (n.includes('from tenant_memberships')) {
      if (n.includes('where id = ?')) {
        return this.members.filter(
          (row) => String(row.id) === p[0] && String(row.website_id) === p[1]
        );
      }
      if (n.includes('user_id = ? or user_id = ? or email = ?')) {
        return this.members.filter(
          (row) =>
            String(row.user_id) === p[0] ||
            String(row.user_id) === p[1] ||
            String(row.email).toLowerCase() === String(p[2]).toLowerCase()
        );
      }
      return this.members.filter(
        (row) =>
          String(row.website_id) === p[0] &&
          (String(row.user_id) === p[1] ||
            String(row.user_id) === p[2] ||
            String(row.email).toLowerCase() === String(p[3]).toLowerCase())
      );
    }
    if (n.includes('from delivery_assignments')) {
      return this.assignments.filter((row) => {
        const keyMatch =
          p.length === 0 || p.includes(String(row.id)) || p.includes(String(row.order_id)) || p.includes(String(row.website_id));
        const hasCoords = !n.includes('last_lat is not null') || (row.last_lat != null && row.last_lng != null);
        return keyMatch && hasCoords;
      });
    }
    if (n.includes('from store_orders o join delivery_assignments')) {
      return this.assignments
        .filter((a) =>
          p.length === 0 ||
          (p.includes(String(a.website_id)) && p.includes(String(a.delivery_partner_user_id)))
        )
        .map((a) => {
          const order = this.orders.find((o) => Number(o.id) === Number(a.order_id) && String(o.website_id) === String(a.website_id));
          return order ? { ...order, assignment_partner_id: a.delivery_partner_user_id } : null;
        })
        .filter(Boolean) as Row[];
    }
    if (n.includes('from store_orders')) {
      return this.orders.filter((row) =>
        p.length === 0 || p.includes(String(row.id)) || p.includes(String(row.website_id)) || p.includes(String(row.order_number))
      );
    }
    if (n.includes('from api_rate_limits')) {
      return this.rateLimits.filter((row) => p.includes(String(row.rate_key)) && p.includes(String(row.window_start)));
    }
    return [];
  }

  mutate(sql: string, params: any[]): { meta: { changes: number; last_row_id: number } } {
    const n = this.norm(sql);
    const p = params.map(String);

    if (n.includes('update api_rate_limits set hit_count = hit_count + 1')) {
      const row = this.rateLimits.find((r) => String(r.rate_key) === p[0] && String(r.window_start) === p[1]);
      if (!row || Number(row.hit_count) >= Number(p[2])) return { meta: { changes: 0, last_row_id: 0 } };
      row.hit_count = Number(row.hit_count) + 1;
      return { meta: { changes: 1, last_row_id: 0 } };
    }
    if (n.includes('insert or ignore into api_rate_limits')) {
      if (this.rateLimits.some((r) => String(r.rate_key) === p[0] && String(r.window_start) === p[1])) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      this.rateLimits.push({ rate_key: p[0], window_start: p[1], hit_count: 1 });
      return { meta: { changes: 1, last_row_id: this.rateLimits.length } };
    }
    if (n.includes('insert into vv_users')) {
      return { meta: { changes: 1, last_row_id: this.users.length } };
    }
    if (n.includes('update vv_users')) return { meta: { changes: 1, last_row_id: 0 } };

    if (n.includes('insert into delivery_assignments')) {
      const existing = this.assignments.find((a) => Number(a.order_id) === Number(params[1]));
      if (existing) {
        Object.assign(existing, {
          website_id: params[0],
          order_id: params[1],
          delivery_partner_user_id: params[2],
          partner_name: params[3],
          cod_amount_inr: params[4],
          status: 'assigned',
          last_lat: null,
          last_lng: null,
        });
        return { meta: { changes: 1, last_row_id: existing.id } };
      }
      const id = this.assignments.length + 1;
      this.assignments.push({
        id,
        website_id: params[0],
        order_id: params[1],
        delivery_partner_user_id: params[2],
        partner_name: params[3],
        cod_amount_inr: params[4],
        status: 'assigned',
        last_lat: null,
        last_lng: null,
        updated_at: new Date().toISOString(),
        proof_of_delivery_note: '',
        proof_of_delivery_url: '',
        cod_collected: 0,
      });
      return { meta: { changes: 1, last_row_id: id } };
    }
    if (n.includes('delete from delivery_assignments')) {
      const before = this.assignments.length;
      this.assignments = this.assignments.filter(
        (a) => !(Number(a.order_id) === Number(params[0]) && String(a.website_id) === String(params[1]))
      );
      return { meta: { changes: before - this.assignments.length, last_row_id: 0 } };
    }
    if (n.includes('update delivery_assignments')) {
      const row = this.assignments.find((a) => Number(a.id) === Number(params[params.length - 2] ?? params[params.length - 1]));
      const target = row ?? this.assignments.find((a) => Number(a.order_id) === Number(params[params.length - 1]));
      if (!target) return { meta: { changes: 0, last_row_id: 0 } };
      if (n.includes('proof_of_delivery_note')) {
        target.status = 'delivered';
        target.proof_of_delivery_note = params[0];
        target.proof_of_delivery_url = params[1];
        target.cod_collected = params[2];
        target.last_lat = null;
        target.last_lng = null;
      } else if (n.includes('last_lat = null')) {
        if (n.includes('status = ?')) target.status = params[0];
        target.last_lat = null;
        target.last_lng = null;
      } else if (n.includes('last_lat = ?')) {
        target.last_lat = params[0];
        target.last_lng = params[1];
      } else if (n.includes('status = ?')) {
        target.status = params[0];
      }
      return { meta: { changes: 1, last_row_id: target.id } };
    }
    if (n.includes('update store_orders')) {
      const order = this.orders.find((o) => Number(o.id) === Number(params[params.length - 1]));
      if (order) {
        if (n.includes("order_status = 'delivered'")) {
          order.order_status = 'delivered';
        } else if (n.includes('order_status = ?')) {
          order.order_status = params[0];
        }
        if (n.includes("payment_status = 'paid'")) {
          order.payment_status = 'paid';
        } else if (n.includes('payment_status = ?')) {
          order.payment_status = params[1] ?? order.payment_status;
        }
      }
      return { meta: { changes: order ? 1 : 0, last_row_id: 0 } };
    }
    if (n.includes('insert into audit_logs')) {
      this.auditLogs.push({ action: params[0] || 'audit' });
      return { meta: { changes: 1, last_row_id: this.auditLogs.length } };
    }
    return { meta: { changes: 1, last_row_id: 0 } };
  }
}

const db = new MockD1();
const env: Record<string, any> = {
  DB: db,
  VITE_SUPABASE_URL: 'https://mock-supabase.local',
  VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
  GOOGLE_MAPS_API_KEY: 'mock-maps-key',
};

function makeJwt(payload: Record<string, any>) {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}
const ownerToken = makeJwt({ sub: 'owner-1', email: 'owner@example.com', role: 'business_owner' });
const riderToken = makeJwt({ sub: 'rider-1', email: 'rider@example.com', role: 'delivery_partner' });
const otherRiderToken = makeJwt({ sub: 'rider-2', email: 'other@example.com', role: 'delivery_partner' });

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const headers = init?.headers as Record<string, string> | Headers | undefined;
  const auth =
    headers instanceof Headers
      ? headers.get('Authorization') || ''
      : (headers?.Authorization || headers?.authorization || '');
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
      JSON.stringify([{ id: payload.sub, role: payload.role || 'end_customer', full_name: 'Test User' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error(`Unexpected network request in local workflow test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const jsonOf = async (res: Response) => (await res.json()) as Row;

console.log('\n====================================================================');
console.log('LOCAL CUSTOMER → OWNER → DELIVERY ORDER WORKFLOW REGRESSIONS');
console.log('====================================================================\n');

await test('assignment access requires a matching delivery_assignments row', async () => {
  db.assignments.push({
    id: 1,
    website_id: 'site-1',
    order_id: 10,
    delivery_partner_user_id: '77',
    status: 'assigned',
    last_lat: null,
    last_lng: null,
  });
  const riderUser = { id: 'rider-1', authSubject: 'rider-1', email: 'rider@example.com', isSuperAdmin: false } as any;
  const otherUser = { id: 'rider-2', authSubject: 'rider-2', email: 'other@example.com', isSuperAdmin: false } as any;
  const ownerUser = { id: 'owner-1', authSubject: 'owner-1', email: 'owner@example.com', isSuperAdmin: false } as any;

  assert.equal((await checkAssignedDeliveryAccess(env as any, riderUser, 'site-1', 10)).authorized, true);
  assert.equal((await checkAssignedDeliveryAccess(env as any, otherUser, 'site-1', 10)).authorized, false);
  assert.equal((await checkAssignedDeliveryAccess(env as any, ownerUser, 'site-1', 10)).authorized, true);
});

await test('owner assignment persists to delivery_assignments and is not claimed on failure', async () => {
  db.assignments.length = 0;
  const bad = await ownerOrderPatch(
    ctx(req('https://preview.local/api/owner/orders/10', ownerToken, 'PATCH', { deliveryPartnerId: 999 }), { id: '10' })
  );
  assert.equal(bad.status, 403);
  assert.equal(db.assignments.length, 0);

  const res = await ownerOrderPatch(
    ctx(req('https://preview.local/api/owner/orders/10', ownerToken, 'PATCH', { deliveryPartnerId: 77 }), { id: '10' })
  );
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  assert.equal(body.order.deliveryPartnerId, 77);
  assert.equal(db.assignments.length, 1);
  assert.equal(String(db.assignments[0].delivery_partner_user_id), '77');
  assert.equal(db.assignments[0].status, 'assigned');
  assert.equal('delivery_partner_id' in db.orders[0], false);
});

await test('delivery portal lists only the rider’s assigned orders', async () => {
  const mine = await deliveryPortalGet(ctx(req('https://preview.local/api/delivery/portal', riderToken)));
  assert.equal(mine.status, 200);
  const mineBody = await jsonOf(mine);
  assert.equal(mineBody.assignedOrders.length, 1);
  assert.equal(mineBody.assignedOrders[0].deliveryPartnerId, 77);

  const other = await deliveryPortalGet(ctx(req('https://preview.local/api/delivery/portal', otherRiderToken)));
  const otherBody = await jsonOf(other);
  assert.equal(otherBody.assignedOrders.length, 0);
});

await test('unassigned rider cannot change order status or record POD', async () => {
  const statusRes = await deliveryStatusPatch(
    ctx(req('https://preview.local/api/delivery/orders/10/status', otherRiderToken, 'PATCH', { status: 'out_for_delivery' }), { id: '10' })
  );
  assert.equal(statusRes.status, 403);
  const podRes = await deliveryPodPatch(
    ctx(req('https://preview.local/api/delivery/orders/10/pod', otherRiderToken, 'PATCH', { recipientName: 'X', podCode: 'POD-X' }), { id: '10' })
  );
  assert.equal(podRes.status, 403);
});

await test('assigned rider advances status without trusting client ownership fields', async () => {
  const res = await deliveryStatusPatch(
    ctx(req('https://preview.local/api/delivery/orders/10/status', riderToken, 'PATCH', {
      status: 'out_for_delivery',
      deliveryPartnerId: 78,
      paymentStatus: 'paid',
    }), { id: '10' })
  );
  assert.equal(res.status, 200);
  assert.equal(db.orders[0].order_status, 'out_for_delivery');
  assert.equal(db.orders[0].payment_status, 'pending');
  assert.equal(db.assignments[0].status, 'in_transit');
  assert.equal(String(db.assignments[0].delivery_partner_user_id), '77');
});

await test('location pings require consent and valid coordinates', async () => {
  const noConsent = await locationPost(
    ctx(req('https://preview.local/api/delivery/orders/10/location', riderToken, 'POST', { latitude: 17.4, longitude: 78.4 }), { id: '10' })
  );
  assert.equal(noConsent.status, 400);
  const invalid = await locationPost(
    ctx(req('https://preview.local/api/delivery/orders/10/location', riderToken, 'POST', {
      latitude: 999, longitude: 78.4, consentGranted: true,
    }), { id: '10' })
  );
  assert.equal(invalid.status, 400);
});

await test('consented location writes to the assignment and deduplicates redundant pings', async () => {
  const first = await locationPost(
    ctx(req('https://preview.local/api/delivery/orders/10/location', riderToken, 'POST', {
      latitude: 17.385, longitude: 78.4867, accuracyMeters: 12, consentGranted: true,
    }), { id: '10' })
  );
  assert.equal(first.status, 201);
  assert.equal(Number(db.assignments[0].last_lat), 17.385);

  const duplicate = await locationPost(
    ctx(req('https://preview.local/api/delivery/orders/10/location', riderToken, 'POST', {
      latitude: 17.385001, longitude: 78.486701, accuracyMeters: 12, consentGranted: true,
    }), { id: '10' })
  );
  const dupBody = await jsonOf(duplicate);
  assert.equal(duplicate.status, 200);
  assert.equal(dupBody.deduplicated, true);
});

await test('customer sees fresh live location with verification but not stale live claims', async () => {
  const fresh = await liveLocationGet(
    ctx(req('https://preview.local/api/orders/VV-TEST-001/live-location?phone=9876543210', ownerToken), { orderNumber: 'VV-TEST-001' })
  );
  assert.equal(fresh.status, 200);
  const freshBody = await jsonOf(fresh);
  assert.equal(freshBody.stale, false);
  assert.equal(freshBody.latestPing != null, true);
  assert.match(String(freshBody.message), /Live rider coordinates updated/);

  db.assignments[0].updated_at = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const stale = await liveLocationGet(
    ctx(req('https://preview.local/api/orders/VV-TEST-001/live-location?phone=9876543210', ownerToken), { orderNumber: 'VV-TEST-001' })
  );
  const staleBody = await jsonOf(stale);
  assert.equal(staleBody.stale, true);
  assert.equal(staleBody.latestPing, null);
  assert.equal(staleBody.lastKnownPing != null, true);
  assert.doesNotMatch(String(staleBody.message), /Live rider coordinates updated/);
});

await test('stop sharing clears coordinates at the source', async () => {
  db.assignments[0].updated_at = new Date().toISOString();
  const stop = await locationPost(
    ctx(req('https://preview.local/api/delivery/orders/10/location', riderToken, 'POST', { sharingEnabled: false }), { id: '10' })
  );
  assert.equal(stop.status, 200);
  assert.equal(db.assignments[0].last_lat, null);
  assert.equal(db.assignments[0].last_lng, null);

  const after = await liveLocationGet(
    ctx(req('https://preview.local/api/orders/VV-TEST-001/live-location?phone=9876543210', ownerToken), { orderNumber: 'VV-TEST-001' })
  );
  const body = await jsonOf(after);
  assert.equal(body.latestPing, null);
  assert.equal(body.lastKnownPing, null);
});

await test('freshness helper parses SQLite and ISO timestamps and rejects stale data', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.equal(parseRecordedAt('2026-11-27 11:59:00'), now - 60_000);
  assert.equal(isFreshLocation('2026-11-27 11:56:00', now), true);
  assert.equal(isFreshLocation('2026-11-27 11:54:59', now), false);
  assert.equal(isFreshLocation(null, now), false);
});

await test('assigned rider records POD on real saved order state', async () => {
  const res = await deliveryPodPatch(
    ctx(req('https://preview.local/api/delivery/orders/10/pod', riderToken, 'PATCH', {
      recipientName: 'Priya', podCode: 'POD-REAL-10', codCollected: true,
    }), { id: '10' })
  );
  assert.equal(res.status, 200);
  assert.equal(db.orders[0].order_status, 'delivered');
  assert.equal(db.orders[0].payment_status, 'paid');
  assert.equal(db.assignments[0].status, 'delivered');
  assert.match(String(db.assignments[0].proof_of_delivery_note), /POD-REAL-10/);
  assert.equal(db.assignments[0].last_lat, null);
  assert.equal('notes' in db.orders[0], false);
});

await test('source guards prevent regressions in routing, assignment, GPS and white-label/demo scope', () => {
  const middleware = read('functions/_middleware.ts');
  assert.match(middleware, /SPA_SHELL_EXACT_ROUTES = new Set\(\['\/demo', '\/dashboards', '\/builder'\]\)/);
  assert.doesNotMatch(middleware, /SPA_SHELL_EXACT_ROUTES[^\n]*'\/marketplace'/);

  const owner = read('functions/api/owner/orders/[id].ts');
  assert.match(owner, /INSERT INTO delivery_assignments/);
  assert.match(owner, /deliveryPartnerId\?: number \| string \| null/);

  const portal = read('functions/api/delivery/portal.ts');
  assert.match(portal, /JOIN delivery_assignments da/);
  assert.doesNotMatch(portal, /delivery_partner_id IN/);

  for (const file of [
    'functions/api/delivery/orders/[id]/status.ts',
    'functions/api/delivery/orders/[id]/pod.ts',
    'functions/api/delivery/orders/[id]/location.ts',
  ]) {
    assert.match(read(file), /checkAssignedDeliveryAccess/);
  }

  const pod = read('functions/api/delivery/orders/[id]/pod.ts');
  assert.doesNotMatch(pod, /notes = notes/);
  const location = read('functions/api/delivery/orders/[id]/location.ts');
  assert.match(location, /sharingEnabled === false/);
  assert.doesNotMatch(location, /delivery_location_pings/);
  const live = read('functions/api/orders/[orderNumber]/live-location.ts');
  assert.match(live, /isFreshLocation/);
  assert.match(live, /lastKnownPing/);

  const tracker = read('src/components/OrderTrackerModal.tsx');
  assert.match(tracker, /liveLoc\?\.lastKnownPing/);
  assert.match(tracker, /liveLoc\.stale/);
  const gps = read('src/components/DeliveryGpsSharer.tsx');
  assert.match(gps, /sharingEnabled: false/);
  const ownerModal = read('src/components/OwnerOrderDetailModal.tsx');
  assert.match(ownerModal, /order\.status === 'placed' \|\| order\.status === 'pending'/);
  const storefront = read('src/components/StorefrontView.tsx');
  assert.doesNotMatch(storefront, />Retry Payment</);
});

globalThis.fetch = originalFetch;
console.log(`\nPASS — ${passed} local customer delivery workflow checks.\n`);
