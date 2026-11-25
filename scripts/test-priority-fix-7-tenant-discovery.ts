// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 7: PREVIEW CUSTOMER TENANT DISCOVERY TEST SUITE
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as meGet } from '../functions/api/me';
import { onRequestGet as overviewGet } from '../functions/api/owner/tenants/[tenantId]/overview';

let passed = 0;
let failed = 0;

async function it(desc: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

class MockD1DB {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vv_users (
        id TEXT PRIMARY KEY,
        auth_subject TEXT UNIQUE,
        email TEXT,
        full_name TEXT,
        role TEXT DEFAULT 'customer',
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS customer_website_publications (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT UNIQUE,
        owner_id TEXT,
        public_slug TEXT UNIQUE,
        business_name TEXT,
        website_json TEXT,
        status TEXT DEFAULT 'published',
        published_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        user_id TEXT,
        email TEXT,
        full_name TEXT,
        role TEXT CHECK (role IN ('business_owner', 'business_manager', 'business_staff', 'delivery_partner')),
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT,
        monthly_ai_credits INTEGER DEFAULT 100
      );

      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        owner_id TEXT,
        plan_code TEXT,
        plan_id TEXT,
        status TEXT DEFAULT 'active',
        current_period_end TEXT DEFAULT (datetime('now', '+30 days'))
      );

      CREATE TABLE IF NOT EXISTS tenant_ai_usage (
        id TEXT PRIMARY KEY,
        website_id TEXT NOT NULL,
        tenant_rowid INTEGER,
        user_id TEXT NOT NULL,
        service_slug TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'gemini',
        model TEXT NOT NULL,
        credits_deducted INTEGER NOT NULL DEFAULT 1,
        billing_period TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO subscription_plans (id, code, name, monthly_ai_credits)
      VALUES ('plan-biz', 'business-website', 'Business Website', 100);

      -- Authenticated test user
      INSERT INTO vv_users (id, auth_subject, email, full_name, role)
      VALUES ('85272889-cd3b-45fe-86de-f503be8193fc', '85272889-cd3b-45fe-86de-f503be8193fc', 'cutybs932@gmail.com', 'VIJAY KUMAR BANAVATH', 'customer');

      -- Another customer
      INSERT INTO vv_users (id, auth_subject, email, full_name, role)
      VALUES ('user_other_cust', 'user_other_cust', 'other@example.com', 'Other Customer', 'customer');

      -- Seed publications: SVS owned by test user; Royal Feast owned by other customer
      INSERT INTO customer_website_publications (rowid, website_id, owner_id, public_slug, business_name, website_json, status)
      VALUES 
        (1, 'prev_site_svs', '85272889-cd3b-45fe-86de-f503be8193fc', 'svs', 'SVS Store (Preview Test)', '{"businessName":"SVS Store","planTier":"business-website"}', 'published'),
        (2, 'prev_site_royal', 'user_royal_preview', 'royal-feast-cloud-kitchen', 'Royal Feast Cloud Kitchen', '{"businessName":"Royal Feast Cloud Kitchen","planTier":"business-website"}', 'published');

      -- Tenant membership for SVS
      INSERT INTO tenant_memberships (website_id, user_id, email, full_name, role, status)
      VALUES ('prev_site_svs', '85272889-cd3b-45fe-86de-f503be8193fc', 'cutybs932@gmail.com', 'VIJAY KUMAR BANAVATH', 'business_owner', 'active');

      -- Tenant subscription for SVS
      INSERT INTO tenant_subscriptions (website_id, owner_id, plan_code, status, current_period_end)
      VALUES ('prev_site_svs', '85272889-cd3b-45fe-86de-f503be8193fc', 'business-website', 'active', datetime('now', '+30 days'));
    `);
  }

  prepare(sql: string) {
    const db = this.db;
    return {
      bind(...params: any[]) {
        return {
          async first<T = any>(): Promise<T | null> {
            try {
              const stmt = db.prepare(sql);
              return (stmt.get(...params) as T) || null;
            } catch {
              return null;
            }
          },
          async all<T = any>(): Promise<{ results: T[] }> {
            try {
              const stmt = db.prepare(sql);
              return { results: stmt.all(...params) as T[] };
            } catch {
              return { results: [] };
            }
          },
          async run(): Promise<{ success: boolean }> {
            const stmt = db.prepare(sql);
            stmt.run(...params);
            return { success: true };
          },
        };
      },
      async first<T = any>(): Promise<T | null> {
        try {
          const stmt = db.prepare(sql);
          return (stmt.get() as T) || null;
        } catch {
          return null;
        }
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        try {
          const stmt = db.prepare(sql);
          return { results: stmt.all() as T[] };
        } catch {
          return { results: [] };
        }
      },
      async run(): Promise<{ success: boolean }> {
        const stmt = db.prepare(sql);
        stmt.run();
        return { success: true };
      },
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

async function run() {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 7 TEST SUITE');
  console.log('====================================================================\n');

  const mockDb = new MockD1DB();
  const originalFetch = globalThis.fetch;

  // Mock Supabase GoTrue and profiles API for test user
  const setupSupabaseMock = (userId: string, email: string, role = 'customer') => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: userId,
            email,
            user_metadata: { full_name: 'VIJAY KUMAR BANAVATH' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/rest/v1/profiles')) {
        return new Response(
          JSON.stringify([
            { id: userId, full_name: 'VIJAY KUMAR BANAVATH', role },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input, init);
    };
  };

  const mockEnv: any = {
    DB: mockDb,
    SUPABASE_URL: 'https://test-auth.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon_key',
  };

  console.log('[SECTION 1: /api/me DISCOVERY & DERIVED ROLE]');
  setupSupabaseMock('85272889-cd3b-45fe-86de-f503be8193fc', 'cutybs932@gmail.com', 'customer');

  await it('Authenticated test user discovers SVS tenant in ownedTenants', async () => {
    const req = new Request('http://localhost/api/me', {
      headers: { Authorization: 'Bearer test_token_svs' },
    });

    const res = await meGet({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();

    assert.strictEqual(Array.isArray(body.ownedTenants), true);
    assert.strictEqual(body.ownedTenants.length, 1, 'Must find exactly 1 owned tenant');
    assert.strictEqual(body.ownedTenants[0].slug, 'svs');
    assert(body.ownedTenants[0].name.includes('SVS Store'), 'Name must include SVS Store');
  });

  await it('Derives role "business_owner" for user with ownedTenants even if Supabase profile is customer', async () => {
    const req = new Request('http://localhost/api/me', {
      headers: { Authorization: 'Bearer test_token_svs' },
    });

    const res = await meGet({ request: req, env: mockEnv } as any);
    const body: any = await res.json();
    assert.strictEqual(body.user.role, 'business_owner', 'Role should be derived as business_owner');
    assert.strictEqual(body.user.supabaseRole, 'customer', 'Raw Supabase role remains preserved');
  });

  console.log('\n[SECTION 2: STRICT TENANT ISOLATION]');
  await it('Other customer websites (e.g. Royal Feast) are NOT returned in ownedTenants', async () => {
    const req = new Request('http://localhost/api/me', {
      headers: { Authorization: 'Bearer test_token_svs' },
    });

    const res = await meGet({ request: req, env: mockEnv } as any);
    const body: any = await res.json();
    const slugs = body.ownedTenants.map((t: any) => t.slug);
    assert(!slugs.includes('royal-feast-cloud-kitchen'), 'Must NOT include unowned tenant');
  });

  await it('User without any owned tenants receives role "customer"', async () => {
    setupSupabaseMock('user_other_cust', 'other@example.com', 'customer');

    const req = new Request('http://localhost/api/me', {
      headers: { Authorization: 'Bearer test_token_other' },
    });

    const res = await meGet({ request: req, env: mockEnv } as any);
    const body: any = await res.json();
    assert.strictEqual(body.ownedTenants.length, 0);
    assert.strictEqual(body.user.role, 'customer', 'User without tenants must remain customer');
  });

  console.log('\n[SECTION 3: BUSINESS OWNER DASHBOARD OVERVIEW ACCESS]');
  setupSupabaseMock('85272889-cd3b-45fe-86de-f503be8193fc', 'cutybs932@gmail.com', 'customer');

  await it('Owner can access SVS overview (Tenant ID: 1)', async () => {
    const req = new Request('http://localhost/api/owner/tenants/1/overview', {
      headers: { Authorization: 'Bearer test_token_svs' },
    });

    const res = await overviewGet({
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(),
    } as any);

    assert.strictEqual(res.status, 200, 'Must return 200 for owned tenant');
    const body: any = await res.json();
    assert.strictEqual(body.tenant.slug, 'svs');
  });

  await it('Owner cannot access unowned tenant overview (Tenant ID: 2 - Royal Feast)', async () => {
    const req = new Request('http://localhost/api/owner/tenants/2/overview', {
      headers: { Authorization: 'Bearer test_token_svs' },
    });

    const res = await overviewGet({
      request: req,
      env: mockEnv,
      params: { tenantId: '2' },
      next: async () => new Response(),
    } as any);

    assert.strictEqual(res.status, 403, 'Must reject unowned tenant with 403 Forbidden');
  });

  globalThis.fetch = originalFetch;

  console.log('\n====================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
