// ============================================================================
// PLATFORM OWNER ROLE + DASHBOARD REGRESSIONS
// Local mocks only. No network, no OTP, no password, no remote database,
// no Production resource, and no secret is read or written by this test.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  requireAdmin,
  requireOwner,
  requirePlatformStaff,
  requireUser,
} from '../functions/api/_auth.ts';
import {
  isAuthorizedPlatformOwnerRow,
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_FULL_NAME,
  PLATFORM_OWNER_TITLE,
  type PlatformOwnerRow,
} from '../functions/api/_ownerRole.ts';
import { onRequestGet as dashboardGet } from '../functions/api/platform-owner/dashboard.ts';
import { onRequestGet as meGet } from '../functions/api/me.ts';
import { canAccessBusinessOwnerDashboard } from '../src/lib/dashboardAccess.ts';

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
  ownerRow: PlatformOwnerRow | null = null;
  users: Row[] = [
    {
      id: 'admin-d1-id',
      auth_subject: 'admin-sub-1',
      email: 'kalyanibanavath6@gmail.com',
      full_name: 'Kalyani Banavath',
      role: 'admin',
      status: 'active',
    },
    {
      id: 'customer-d1-id',
      auth_subject: 'customer-sub-1',
      email: 'customer@example.com',
      full_name: 'Test Customer',
      role: 'customer',
      status: 'active',
    },
  ];

  prepare(sql: string) {
    return new MockStatement(sql, this);
  }

  private norm(sql: string) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  select(sql: string, params: any[]): Row[] {
    const n = this.norm(sql);
    const p = params.map((value) => String(value ?? '').toLowerCase());

    if (n.includes('from platform_owner')) {
      return this.ownerRow ? [{ ...this.ownerRow }] : [];
    }

    if (n.includes('from vv_users')) {
      if (n.includes('count(') || n.includes('count( ')) {
        if (n.includes("role = 'customer'")) {
          return [{ cnt: this.users.filter((u) => u.role === 'customer').length }];
        }
        if (n.includes("role = 'admin'")) {
          return [{ cnt: this.users.filter((u) => u.role === 'admin').length }];
        }
        return [{ cnt: this.users.length }];
      }
      return this.users.filter((u) =>
        p.some(
          (value) =>
            value &&
            [u.id, u.auth_subject, u.email].some(
              (candidate) => String(candidate ?? '').toLowerCase() === value
            )
        )
      );
    }

    if (n.includes('from platform_staff')) return [];
    if (n.includes('from cashfree_payments') && n.includes('select id, entity_type')) return [];
    if (n.includes('from vv_audit_log') && n.includes('select id, action')) return [];
    if (n.includes('from backup_audit_records') && n.includes('group by')) return [];
    if (n.includes('group by')) return [];
    if (n.includes('count(') || n.includes('sum(')) return [{ cnt: 0 }];

    // All remaining aggregate/detail reads stay empty in this local mock.
    return [];
  }

  mutate(sql: string, params: any[]): { success: boolean; meta: { changes: number; last_row_id: number } } {
    const n = this.norm(sql);
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
  ownerCandidate: makeJwt({
    sub: 'owner-sub-1',
    email: PLATFORM_OWNER_EMAIL,
    email_confirmed_at: '2026-11-28T00:00:00Z',
    role: 'customer',
    full_name: 'Vijay Kumar',
  }),
  fakeOwnerProfile: makeJwt({
    sub: 'attacker-sub-1',
    email: 'attacker@example.com',
    email_confirmed_at: '2026-11-28T00:00:00Z',
    role: 'platform_owner',
  }),
  admin: makeJwt({
    sub: 'admin-sub-1',
    email: 'kalyanibanavath6@gmail.com',
    email_confirmed_at: '2026-11-28T00:00:00Z',
    role: 'admin',
    full_name: 'Kalyani Banavath',
  }),
  customer: makeJwt({
    sub: 'customer-sub-1',
    email: 'customer@example.com',
    email_confirmed_at: '2026-11-28T00:00:00Z',
    role: 'customer',
  }),
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const headers = init?.headers as Record<string, string> | Headers | undefined;
  const authorization =
    headers instanceof Headers
      ? headers.get('Authorization') || ''
      : (headers?.Authorization || headers?.authorization || '');
  const match = authorization.match(/^Bearer mock\.([A-Za-z0-9+/=]+)\.sig/);
  const payload = match ? JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) : {};

  if (url.includes('/auth/v1/user')) {
    if (!payload.sub) return new Response('{"error":"invalid"}', { status: 401 });
    return new Response(
      JSON.stringify({
        id: payload.sub,
        email: payload.email,
        email_confirmed_at: payload.email_confirmed_at || null,
        user_metadata: { full_name: payload.full_name || '' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(
      JSON.stringify([
        {
          id: payload.sub,
          role: payload.role || 'customer',
          full_name: payload.full_name || 'Test User',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error(`Unexpected external request in Owner regression test: ${url}`);
};

const ctx = (request: Request) =>
  ({ request, env, params: {}, next: async () => new Response() }) as any;
const req = (url: string, token: string, method = 'GET', body?: unknown) =>
  new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const jsonOf = async (res: Response) => (await res.json()) as Row;
const me = async (who: keyof typeof tokens) =>
  jsonOf(await meGet(ctx(req('https://preview.local/api/me', tokens[who]))));

console.log('\n====================================================================');
console.log('PLATFORM OWNER ROLE + DASHBOARD REGRESSIONS');
console.log('====================================================================\n');

await test('singleton row validator enforces exact identity, active state, and email match', () => {
  const valid: PlatformOwnerRow = {
    singleton_id: 1,
    user_id: 'owner-sub-1',
    email: PLATFORM_OWNER_EMAIL,
    full_name: PLATFORM_OWNER_FULL_NAME,
    status: 'active',
  };
  assert.equal(isAuthorizedPlatformOwnerRow(valid, 'owner-sub-1', PLATFORM_OWNER_EMAIL), true);
  assert.equal(isAuthorizedPlatformOwnerRow(valid, 'owner-sub-1', PLATFORM_OWNER_EMAIL.toUpperCase()), true);
  assert.equal(isAuthorizedPlatformOwnerRow({ ...valid, singleton_id: 2 }, 'owner-sub-1', PLATFORM_OWNER_EMAIL), false);
  assert.equal(isAuthorizedPlatformOwnerRow({ ...valid, status: 'suspended' }, 'owner-sub-1', PLATFORM_OWNER_EMAIL), false);
  assert.equal(isAuthorizedPlatformOwnerRow(valid, 'different-sub', PLATFORM_OWNER_EMAIL), false);
  assert.equal(isAuthorizedPlatformOwnerRow(valid, 'owner-sub-1', 'attacker@example.com'), false);
  assert.equal(isAuthorizedPlatformOwnerRow(null, 'owner-sub-1', PLATFORM_OWNER_EMAIL), false);
});

await test('client helper never grants Owner from a role string alone', () => {
  assert.equal(canAccessBusinessOwnerDashboard(false), false);
  assert.equal(canAccessBusinessOwnerDashboard(true), true);
});

await test('unprovisioned Owner candidate is denied; raw profile string does not escalate', async () => {
  const ownerAuth = await requireOwner(req('https://preview.local/api/platform-owner/dashboard', tokens.ownerCandidate), env as any);
  assert.equal(ownerAuth.ok, false);
  assert.equal(ownerAuth.response?.status, 403);

  const dashboard = await dashboardGet(ctx(req('https://preview.local/api/platform-owner/dashboard', tokens.ownerCandidate)));
  assert.equal(dashboard.status, 403);

  const fakeAuth = await requireOwner(req('https://preview.local/api/platform-owner/dashboard', tokens.fakeOwnerProfile), env as any);
  assert.equal(fakeAuth.ok, false);
  assert.equal(fakeAuth.response?.status, 403);

  const fakeMe = await me('fakeOwnerProfile');
  assert.equal(fakeMe.user.role, 'customer');
  assert.equal(fakeMe.user.isPlatformOwner, false);
});

await test('verified Owner is recognized by /api/me while Supabase profile remains customer', async () => {
  db.ownerRow = {
    singleton_id: 1,
    user_id: 'owner-sub-1',
    email: PLATFORM_OWNER_EMAIL,
    full_name: PLATFORM_OWNER_FULL_NAME,
    status: 'active',
  };
  const auth = await requireUser(req('https://preview.local/api/me', tokens.ownerCandidate), env as any);
  assert.equal(auth.ok, true);
  if (auth.ok) {
    assert.equal(auth.user.platformRole, 'platform_owner');
    assert.equal(auth.user.isOwner, true);
    assert.equal(auth.user.isSuperAdmin, false);
    assert.equal(auth.user.isPlatformStaff, false);
    assert.equal(auth.user.supabaseRole, 'customer');
  }

  const body = await me('ownerCandidate');
  assert.equal(body.user.role, 'platform_owner');
  assert.equal(body.user.isPlatformOwner, true);
  assert.equal(body.user.supabaseRole, 'customer');
});

await test('Owner dashboard returns 200 with only aggregate, non-sensitive fields', async () => {
  const res = await dashboardGet(ctx(req('https://preview.local/api/platform-owner/dashboard', tokens.ownerCandidate)));
  assert.equal(res.status, 200);
  const body = await jsonOf(res);
  assert.equal(body.ok, true);
  assert.equal(body.owner.email, PLATFORM_OWNER_EMAIL);
  assert.equal(typeof body.overview.totalCustomers, 'number');
  assert.equal(typeof body.finance.profitAndLoss.netProfit, 'number');

  const serialized = JSON.stringify(body);
  const forbiddenKeys = [
    'user_email',
    'user_phone',
    'customer_name',
    'customer_phone',
    'customer_email',
    'shipping_address',
    'order_id',
    'order_number',
    'website_id',
    'owner_id',
    'payment_session_id',
    'bank_reference',
    'raw_response_json',
    'raw_webhook_json',
    'notes_json',
    'payload_json',
    'password',
    'passphrase',
    'otp',
    'authorization',
    'verification_token',
    'signature',
  ];
  for (const key of forbiddenKeys) {
    assert.equal(serialized.toLowerCase().includes(`"${key}"`), false, `leaked key: ${key}`);
  }
  for (const pii of ['customer@example.com', '9876543210', 'SECRET-ORDER-ID', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.equal(serialized.includes(pii), false, `leaked value: ${pii}`);
  }
});

await test('Owner is denied Super Admin and platform staff guards; Kalyani stays Super Admin only', async () => {
  const ownerRequest = req('https://preview.local/api/platform/admin-summary', tokens.ownerCandidate);
  const ownerAdmin = await requireAdmin(ownerRequest, env as any);
  assert.equal(ownerAdmin.ok, false);
  assert.equal(ownerAdmin.response?.status, 403);

  const ownerStaff = await requirePlatformStaff(ownerRequest, env as any);
  assert.equal(ownerStaff.ok, false);
  assert.equal(ownerStaff.response?.status, 403);

  const adminRequest = req('https://preview.local/api/platform/admin-summary', tokens.admin);
  const admin = await requireAdmin(adminRequest, env as any);
  assert.equal(admin.ok, true);
  if (admin.ok) {
    assert.equal(admin.user.isSuperAdmin, true);
    assert.equal(admin.user.isOwner, false);
    assert.equal(admin.user.platformRole, 'super_admin');
  }

  const adminOwner = await requireOwner(adminRequest, env as any);
  assert.equal(adminOwner.ok, false);
  assert.equal(adminOwner.response?.status, 403);

  const adminMe = await me('admin');
  assert.equal(adminMe.user.role, 'super_admin');
  assert.equal(adminMe.user.isPlatformOwner, false);
  assert.equal(adminMe.user.email, 'kalyanibanavath6@gmail.com');
});

await test('Customer stays end_customer with no platform Owner or Super Admin grant', async () => {
  const customerAuth = await requireUser(req('https://preview.local/api/me', tokens.customer), env as any);
  assert.equal(customerAuth.ok, true);
  if (customerAuth.ok) {
    assert.equal(customerAuth.user.platformRole, 'end_customer');
    assert.equal(customerAuth.user.isOwner, false);
    assert.equal(customerAuth.user.isSuperAdmin, false);
  }
  const customerDashboard = await dashboardGet(ctx(req('https://preview.local/api/platform-owner/dashboard', tokens.customer)));
  assert.equal(customerDashboard.status, 403);
});

await test('source guards keep Owner additive, read-only, tenant-safe, and free of secret handling', () => {
  const migration = read('cloudflare/d1/migrations/0023_platform_owner_singleton.sql');
  assert.match(migration, /singleton_id INTEGER PRIMARY KEY CHECK \(singleton_id = 1\)/);
  assert.match(migration, /status TEXT NOT NULL CHECK \(status IN \('active', 'suspended'\)\)/);
  assert.doesNotMatch(migration, /ALTER TABLE vv_users|DROP TABLE|profiles/i);

  const cleanupMigration = read('cloudflare/d1/migrations/0025_platform_owner_remove_provision_token.sql');
  assert.match(cleanupMigration, /DROP TABLE IF EXISTS platform_owner_provision/);

  const authSource = read('functions/api/_auth.ts');
  assert.match(authSource, /isAuthorizedPlatformOwnerRow\(ownerRow, supaUser\.id, normalizedEmail\)/);
  assert.match(authSource, /if \(role === 'platform_owner'\) return 'end_customer'/);
  assert.match(authSource, /const finalPlatformRole: PlatformRole = isOwner/);
  assert.match(authSource, /export async function requireOwner/);
  assert.match(authSource, /if \(!auth\.user\.isOwner\)/);

  const dashboardSource = read('functions/api/platform-owner/dashboard.ts');
  assert.match(dashboardSource, /requireOwner\(request, env\)/);
  assert.doesNotMatch(
    dashboardSource,
    /\b(user_email|user_phone|payment_session_id|bank_reference|raw_response_json|raw_webhook_json|notes_json|payload_json|order_id|customer_name|shipping_address|password|otp)\b/i
  );

  assert.equal(fs.existsSync('functions/api/platform-owner/provision.ts'), false);

  const client = read('src/components/BusinessOwnerDashboard.tsx');
  assert.match(client, /canAccessBusinessOwnerDashboard\(isPlatformOwner\)/);
  assert.match(client, /OWNER_EMAIL = 'vk66278@gmail\.com'/);
  assert.doesNotMatch(client, /profile\?\.role === 'platform_owner'/);
  assert.doesNotMatch(client, /platform-owner\/provision|provisionToken|provisioning/i);

  const navbar = read('src/components/Navbar.tsx');
  assert.match(navbar, /\{isPlatformOwner && \(/);
});

globalThis.fetch = originalFetch;
console.log(`\nPASS — ${passed} platform Owner checks.\n`);
