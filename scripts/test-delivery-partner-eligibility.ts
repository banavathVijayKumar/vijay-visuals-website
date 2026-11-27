// ============================================================================
// LOCAL DELIVERY-PARTNER ELIGIBILITY REGRESSIONS
// Mock D1 + mock Supabase only. No network, no remote DB writes, no OTP,
// payment, deployment, migration, or Production access.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { onRequestGet as meGet } from '../functions/api/me.ts';
import {
  onRequestPatch as approvePartner,
  onRequestPost as registerPartner,
} from '../functions/api/tenants/[tenantId]/delivery-partners.ts';
import { onRequestPatch as availabilityPatch } from '../functions/api/delivery/partners/[id]/availability.ts';
import { onRequestGet as portalGet } from '../functions/api/delivery/portal.ts';
import { checkAssignedDeliveryAccess } from '../functions/api/delivery/_assignmentAccess.ts';
import { getAllowedDashboardTabs } from '../src/lib/dashboardAccess.ts';

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

  async all<T = Row>(): Promise<{ results: T[]; success: boolean }> {
    return { results: this.db.select(this.sql, this.params) as T[], success: true };
  }

  async first<T = Row>(): Promise<T | null> {
    return (this.db.select(this.sql, this.params)[0] as T) ?? null;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
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

  users: Row[] = [
    { id: 'owner-1', auth_subject: 'owner-1', email: 'owner@example.com', role: 'admin', status: 'active', full_name: 'Owner' },
    { id: 'rider-1', auth_subject: 'rider-1', email: 'rider@example.com', role: 'customer', status: 'active', full_name: 'Approved Rider' },
    { id: 'self-rider', auth_subject: 'self-rider', email: 'self@example.com', role: 'customer', status: 'active', full_name: 'Self Registered' },
    { id: 'suspended-rider', auth_subject: 'suspended-rider', email: 'suspended@example.com', role: 'customer', status: 'active', full_name: 'Suspended Rider' },
    { id: 'customer-1', auth_subject: 'customer-1', email: 'customer@example.com', role: 'customer', status: 'active', full_name: 'Customer' },
    { id: 'admin-1', auth_subject: 'admin-1', email: 'admin@vijayvisuals.in', role: 'admin', status: 'active', full_name: 'Super Admin' },
  ];

  members: Row[] = [
    // Approval/availability live in permissions_json, not in membership status.
    {
      id: 1,
      website_id: 'site-1',
      user_id: 'rider-1',
      email: 'rider@example.com',
      full_name: 'Approved Rider',
      role: 'delivery_partner',
      status: 'active',
      permissions_json: JSON.stringify(['deliveryApproval:owner_approved', 'availability:online']),
    },
    {
      id: 2,
      website_id: 'site-1',
      user_id: 'suspended-rider',
      email: 'suspended@example.com',
      full_name: 'Suspended Rider',
      role: 'delivery_partner',
      status: 'suspended',
      permissions_json: '[]',
    },
  ];

  orders: Row[] = [
    {
      id: 10,
      website_id: 'site-1',
      order_number: 'VV-ELIG-001',
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
    {
      id: 11,
      website_id: 'site-1',
      order_number: 'VV-ELIG-002',
      customer_name: 'Second Customer',
      customer_phone: '9876543211',
      customer_email: 'second@example.com',
      customer_user_id: 'customer-1',
      payment_method: 'cod',
      payment_status: 'pending',
      order_status: 'confirmed',
      total_inr: 1500,
      subtotal_inr: 1500,
      discount_inr: 0,
      gst_inr: 0,
      shipping_inr: 0,
      items_json: '[]',
    },
  ];

  assignments: Row[] = [
    {
      id: 1,
      website_id: 'site-1',
      order_id: 10,
      delivery_partner_user_id: '1',
      status: 'assigned',
      last_lat: null,
      last_lng: null,
    },
  ];

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }

  private norm(sql: string) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private matchesIdentity(row: Row, values: string[]) {
    return (
      values.length === 0 ||
      values.some((value) =>
        [row.id, row.website_id, row.user_id, row.email].some(
          (candidate) => String(candidate ?? '').toLowerCase() === value.toLowerCase()
        )
      )
    );
  }

  select(sql: string, params: any[]): Row[] {
    const n = this.norm(sql);
    const p = params.map(String);

    if (n.includes('from vv_users')) {
      return this.users.filter((u) => this.matchesIdentity(u, p));
    }
    if (n.includes('from platform_staff')) return [];
    if (n.includes('from customer_addresses')) return [];
    if (n.includes('from customer_website_publications')) {
      return this.publications.filter((row) => this.matchesIdentity(row, p));
    }

    if (n.includes('from tenant_memberships')) {
      if (n.includes('where id = ? and website_id = ?') && p.length >= 2) {
        // Both values are conjunctive here; a broad any-value match would pick
        // another rider on the same website and break the optimistic guard.
        return this.members.filter(
          (row) => String(row.id) === p[0] && String(row.website_id) === p[1]
        );
      }
      if (n.includes('where id = ?') && p.length >= 1 && !n.includes('user_id = ?')) {
        return this.members.filter((row) => String(row.id) === p[0]);
      }
      if (n.includes('where website_id = ? and user_id = ?') && p.length >= 2) {
        return this.members.filter(
          (row) => String(row.website_id) === p[0] && String(row.user_id) === p[1]
        );
      }
      const tripleIdentity = /user_id = \? or user_id = \? or (?:tm\.)?email = \?/.test(n);
      if (tripleIdentity) {
        const hasWebsite = n.includes('website_id = ?');
        const hasId = n.includes('where id = ?');
        const identityValues = hasWebsite || hasId ? p.slice(1, 4) : p.slice(0, 3);
        return this.members.filter((row) => {
          if (n.includes("role = 'delivery_partner'") && row.role !== 'delivery_partner') return false;
          if (n.includes("status = 'active'") && row.status !== 'active') return false;
          if (hasWebsite && String(row.website_id) !== p[0]) return false;
          if (hasId && String(row.id) !== p[0]) return false;
          return identityValues.some(
            (value) =>
              String(row.user_id) === value || String(row.email).toLowerCase() === value.toLowerCase()
          );
        });
      }
      return this.members.filter((row) => {
        if (n.includes("role = 'delivery_partner'") && row.role !== 'delivery_partner') return false;
        if (n.includes("status = 'active'") && row.status !== 'active') return false;
        return this.matchesIdentity(row, p);
      });
    }

    if (n.includes('from store_orders o join delivery_assignments')) {
      const midpoint = Math.floor(p.length / 2);
      const websites = p.slice(0, midpoint);
      const partners = p.slice(midpoint);
      return this.assignments
        .filter(
          (a) =>
            websites.includes(String(a.website_id)) &&
            partners.includes(String(a.delivery_partner_user_id))
        )
        .map((a) => {
          const order = this.orders.find(
            (o) => Number(o.id) === Number(a.order_id) && String(o.website_id) === String(a.website_id)
          );
          return order ? { ...order, assignment_partner_id: a.delivery_partner_user_id } : null;
        })
        .filter(Boolean) as Row[];
    }

    if (n.includes('from delivery_assignments')) {
      if (n.includes('order_id = ? and website_id = ?') && p.length >= 2) {
        return this.assignments.filter(
          (a) => String(a.order_id) === p[0] && String(a.website_id) === p[1]
        );
      }
      return this.assignments.filter((a) => {
        const keyMatch =
          p.length === 0 ||
          p.includes(String(a.id)) ||
          p.includes(String(a.order_id)) ||
          p.includes(String(a.website_id)) ||
          p.includes(String(a.delivery_partner_user_id));
        return keyMatch;
      });
    }

    if (n.includes('from store_orders')) {
      return this.orders.filter((row) => this.matchesIdentity(row, p));
    }

    return [];
  }

  mutate(sql: string, params: any[]): { success: boolean; meta: { changes: number; last_row_id: number } } {
    const n = this.norm(sql);

    if (n.includes('update vv_users')) {
      return { success: true, meta: { changes: 1, last_row_id: 0 } };
    }

    if (n.includes('insert or ignore into tenant_memberships')) {
      const websiteId = String(params[0]);
      const userId = String(params[1]);
      if (this.members.some((m) => String(m.website_id) === websiteId && String(m.user_id) === userId)) {
        return { success: true, meta: { changes: 0, last_row_id: 0 } };
      }
      const id = Math.max(0, ...this.members.map((m) => Number(m.id) || 0)) + 1;
      this.members.push({
        id,
        website_id: websiteId,
        user_id: userId,
        email: String(params[2] || ''),
        full_name: String(params[3] || ''),
        role: 'delivery_partner',
        status: String(params[4] || 'invited'),
        permissions_json: String(params[5] || '[]'),
      });
      return { success: true, meta: { changes: 1, last_row_id: id } };
    }

    if (n.includes('update tenant_memberships')) {
      // Approval and availability use guarded UPDATEs. Locate the row by its
      // bound membership id, enforce the observed permissions_json predicate,
      // and persist the exact state the API writes so eligibility tests read
      // the same durable state as production.
      const member = this.members.find((m) => params.some((p) => Number(p) === Number(m.id)));
      if (!member) return { success: true, meta: { changes: 0, last_row_id: 0 } };
      const guardedPermissions = n.includes('and permissions_json = ?');
      if (
        guardedPermissions &&
        String(params[params.length - 1] || '') !== String(member.permissions_json || '')
      ) {
        return { success: true, meta: { changes: 0, last_row_id: 0 } };
      }
      if (n.includes('set status = ?, permissions_json = ?')) {
        member.status = String(params[0]);
        member.permissions_json = String(params[1]);
      } else if (n.includes('permissions_json = ?')) {
        member.permissions_json = String(params[0]);
      } else {
        member.status = String(params[0]);
      }
      return { success: true, meta: { changes: 1, last_row_id: member.id } };
    }

    return { success: true, meta: { changes: 1, last_row_id: 0 } };
  }
}

const db = new MockD1();
const env: Record<string, any> = {
  DB: db,
  VITE_SUPABASE_URL: 'https://mock-supabase.local',
  VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
};

function makeJwt(payload: Record<string, any>) {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}

const tokens: Record<string, string> = {
  owner: makeJwt({ sub: 'owner-1', email: 'owner@example.com', role: 'business_owner' }),
  rider: makeJwt({ sub: 'rider-1', email: 'rider@example.com', role: 'delivery_partner' }),
  self: makeJwt({ sub: 'self-rider', email: 'self@example.com', role: 'end_customer' }),
  suspended: makeJwt({ sub: 'suspended-rider', email: 'suspended@example.com', role: 'delivery_partner' }),
  customer: makeJwt({ sub: 'customer-1', email: 'customer@example.com', role: 'end_customer' }),
  admin: makeJwt({ sub: 'admin-1', email: 'admin@vijayvisuals.in', role: 'super_admin' }),
};

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
  throw new Error(`Unexpected network request in eligibility test: ${url}`);
};

const ctx = (request: Request, params: Record<string, string> = {}) =>
  ({ request, env, params, next: async () => new Response() }) as any;
const req = (url: string, token: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const jsonOf = async (res: Response) => (await res.json()) as Row;
const me = async (who: keyof typeof tokens) => jsonOf(await meGet(ctx(req('https://preview.local/api/me', tokens[who]))));
const portal = async (who: keyof typeof tokens) =>
  jsonOf(await portalGet(ctx(req('https://preview.local/api/delivery/portal', tokens[who]))));
const userFor = (who: keyof typeof tokens) => {
  const tokenPayload = JSON.parse(Buffer.from(tokens[who].split('.')[1], 'base64').toString('utf8'));
  return {
    id: tokenPayload.sub,
    authSubject: tokenPayload.sub,
    email: tokenPayload.email,
    isSuperAdmin: tokenPayload.role === 'super_admin',
  } as any;
};

console.log('\n====================================================================');
console.log('DELIVERY-PARTNER ELIGIBILITY REGRESSIONS');
console.log('====================================================================\n');

let selfPartnerId = 0;

await test('self-registration creates an unapproved membership', async () => {
  const res = await registerPartner(
    ctx(
      req('https://preview.local/api/tenants/site-1/delivery-partners', tokens.self, 'POST', {
        name: 'Self Registered',
        phone: '9876543210',
        vehicleType: 'Two-Wheeler',
        linkCurrentUser: true,
      }),
      { tenantId: 'site-1' }
    )
  );
  assert.equal(res.status, 201);
  const body = await jsonOf(res);
  assert.equal(body.partner.status, 'invited');
  assert.equal(body.partner.approvalPending, true);
  selfPartnerId = Number(body.partner.id);
  assert.ok(selfPartnerId > 0);
});

await test('self-registered rider is server-ineligible and cannot see assigned orders', async () => {
  const meBody = await me('self');
  assert.equal(meBody.deliveryEligible, false);
  assert.equal(meBody.deliveryProfiles.length, 0);
  assert.deepEqual(getAllowedDashboardTabs('customer', 0, false), ['customer']);

  const portalBody = await portal('self');
  assert.equal(portalBody.partners.length, 0);
  assert.equal(portalBody.assignedOrders.length, 0);
});

await test('self-registered rider cannot self-approve or self-activate', async () => {
  const approveRes = await approvePartner(
    ctx(
      req('https://preview.local/api/tenants/site-1/delivery-partners', tokens.self, 'PATCH', {
        partnerId: selfPartnerId,
        approved: true,
      }),
      { tenantId: 'site-1' }
    )
  );
  assert.equal(approveRes.status, 403);

  const onlineRes = await availabilityPatch(
    ctx(
      req(`https://preview.local/api/delivery/partners/${selfPartnerId}/availability`, tokens.self, 'PATCH', {
        available: true,
      }),
      { id: String(selfPartnerId) }
    )
  );
  assert.equal(onlineRes.status, 403);
  assert.equal(db.members.find((m) => Number(m.id) === selfPartnerId)?.status, 'invited');
});

await test('assigned but unapproved rider is denied by assignment authority', async () => {
  db.assignments.push({
    id: 2,
    website_id: 'site-1',
    order_id: 11,
    delivery_partner_user_id: String(selfPartnerId),
    status: 'assigned',
    last_lat: null,
    last_lng: null,
  });
  const access = await checkAssignedDeliveryAccess(env as any, userFor('self'), 'site-1', 11);
  assert.equal(access.authorized, false);
});

await test('owner approval makes the rider eligible and exposes assigned orders', async () => {
  const res = await approvePartner(
    ctx(
      req('https://preview.local/api/tenants/site-1/delivery-partners', tokens.owner, 'PATCH', {
        partnerId: selfPartnerId,
        approved: true,
      }),
      { tenantId: 'site-1' }
    )
  );
  assert.equal(res.status, 200);
  assert.equal((await jsonOf(res)).status, 'active');

  const meBody = await me('self');
  assert.equal(meBody.deliveryEligible, true);
  assert.equal(meBody.deliveryProfiles.length, 1);
  assert.equal(
    getAllowedDashboardTabs('customer', 0, meBody.deliveryEligible).includes('delivery'),
    true
  );

  const portalBody = await portal('self');
  assert.equal(portalBody.partners.length, 1);
  assert.equal(portalBody.assignedOrders.length, 1);
  assert.equal(String(portalBody.assignedOrders[0].deliveryPartnerId), String(selfPartnerId));

  const access = await checkAssignedDeliveryAccess(env as any, userFor('self'), 'site-1', 11);
  assert.equal(access.authorized, true);
});

await test('owner suspension immediately revokes eligibility and assignment access', async () => {
  const res = await approvePartner(
    ctx(
      req('https://preview.local/api/tenants/site-1/delivery-partners', tokens.owner, 'PATCH', {
        partnerId: selfPartnerId,
        approved: false,
      }),
      { tenantId: 'site-1' }
    )
  );
  assert.equal(res.status, 200);
  assert.equal((await jsonOf(res)).status, 'suspended');

  const meBody = await me('self');
  assert.equal(meBody.deliveryEligible, false);
  const portalBody = await portal('self');
  assert.equal(portalBody.partners.length, 0);
  assert.equal(portalBody.assignedOrders.length, 0);
  assert.equal((await checkAssignedDeliveryAccess(env as any, userFor('self'), 'site-1', 11)).authorized, false);

  const onlineRes = await availabilityPatch(
    ctx(
      req(`https://preview.local/api/delivery/partners/${selfPartnerId}/availability`, tokens.self, 'PATCH', {
        available: true,
      }),
      { id: String(selfPartnerId) }
    )
  );
  assert.equal(onlineRes.status, 403);
});

await test('approved active rider keeps eligibility and assignment authority', async () => {
  const meBody = await me('rider');
  assert.equal(meBody.deliveryEligible, true);
  const portalBody = await portal('rider');
  assert.equal(portalBody.assignedOrders.length, 1);
  assert.equal((await checkAssignedDeliveryAccess(env as any, userFor('rider'), 'site-1', 10)).authorized, true);
});

await test('customer has no delivery eligibility or portal data', async () => {
  const meBody = await me('customer');
  assert.equal(meBody.deliveryEligible, false);
  assert.equal(meBody.deliveryProfiles.length, 0);
  assert.equal(getAllowedDashboardTabs('customer', 0, false).includes('delivery'), false);
  const portalBody = await portal('customer');
  assert.equal(portalBody.partners.length, 0);
  assert.equal(portalBody.assignedOrders.length, 0);
});

await test('super-admin permissions remain unchanged', async () => {
  const meBody = await me('admin');
  assert.equal(meBody.deliveryEligible, true);
  assert.equal(
    getAllowedDashboardTabs('super_admin', 0, meBody.deliveryEligible).includes('super_admin'),
    true
  );
  assert.equal(
    getAllowedDashboardTabs('super_admin', 0, meBody.deliveryEligible).includes('delivery'),
    true
  );
  const portalBody = await portal('admin');
  assert.equal(portalBody.partners.length >= 2, true);
  assert.equal((await checkAssignedDeliveryAccess(env as any, userFor('admin'), 'site-1', 10)).isOwnerOrAdmin, true);
});

await test('source guards keep the server authoritative and mutations assignment-scoped', () => {
  const meSource = read('functions/api/me.ts');
  assert.match(meSource, /let deliveryEligible = auth\.user\.isSuperAdmin/);
  assert.match(meSource, /if \(deliveryProfiles\.length > 0\) deliveryEligible = true/);
  assert.match(meSource, /deliveryEligible,/);

  const hook = read('src/hooks/useAuth.tsx');
  assert.match(hook, /deliveryEligible\?: boolean/);
  assert.match(hook, /setDeliveryEligible\(data\.deliveryEligible === true\)/);

  const hub = read('src/components/DashboardsHub.tsx');
  assert.match(hub, /getAllowedDashboardTabs\(profile\?\.role, ownedTenants\.length, deliveryEligible\)/);
  assert.match(hub, /handleUpdateOwnerRiderApproval/);

  const access = read('src/lib/dashboardAccess.ts');
  assert.match(access, /const canDeliver = deliveryEligible \|\| normalized === 'super_admin'/);
  assert.doesNotMatch(access, /normalized === 'delivery_partner'/);

  for (const file of [
    'functions/api/delivery/orders/[id]/status.ts',
    'functions/api/delivery/orders/[id]/location.ts',
  ]) {
    assert.match(read(file), /checkAssignedDeliveryAccess/);
  }
  const pod = read('functions/api/delivery/orders/[id]/pod.ts');
  assert.match(pod, /SECURE_POD_REQUIRED/);
  assert.match(pod, /410/);
});

globalThis.fetch = originalFetch;
console.log(`\nPASS — ${passed} delivery eligibility checks.\n`);
