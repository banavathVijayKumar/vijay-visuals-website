// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 9: WORKFLOW EXECUTION AUDIT TEST SUITE
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as runWorkflow } from '../functions/api/workflows/[id]/run';
import { onRequestPatch as toggleWorkflow } from '../functions/api/workflows/[id]';
import { onRequestPatch as decideLog } from '../functions/api/automation-logs/[id]/decision';

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
        published_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        user_id TEXT,
        role TEXT,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS store_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        stock_qty INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER NOT NULL DEFAULT 5,
        price_inr INTEGER NOT NULL DEFAULT 1000
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        supplier_id INTEGER,
        po_number TEXT NOT NULL,
        items_json TEXT NOT NULL DEFAULT '[]',
        total_cost_inr INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS vv_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_role TEXT,
        action TEXT,
        target_type TEXT,
        target_id TEXT,
        details_json TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO customer_website_publications (rowid, website_id, owner_id, public_slug, business_name, website_json, status)
      VALUES 
        (1, 'prev_site_svs', 'user_svs_owner', 'svs', 'SVS Store', '{"businessName":"SVS Store"}', 'published'),
        (2, 'prev_site_tenant_b', 'user_other_owner', 'tenant-b', 'Tenant B Store', '{"businessName":"Tenant B Store"}', 'published');

      INSERT INTO store_products (website_id, name, sku, stock_qty, low_stock_threshold, price_inr)
      VALUES 
        ('prev_site_svs', 'Kanchipuram Silk Saree', 'SVS-SAREE-01', 2, 5, 12500),
        ('prev_site_svs', 'Gold Zari Brocade Dupatta', 'SVS-DUP-02', 1, 3, 4200);
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
          async run(): Promise<{ success: boolean; meta?: any }> {
            const stmt = db.prepare(sql);
            const info = stmt.run(...params);
            return { success: true, meta: { last_row_id: Number(info.lastInsertRowid) } };
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

  query(sql: string, ...params: any[]): any {
    return this.db.prepare(sql).all(...params);
  }
}

async function run() {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 9: WORKFLOW EXECUTION AUDIT TEST SUITE');
  console.log('====================================================================\n');

  const mockDb = new MockD1DB();
  const originalFetch = globalThis.fetch;

  let activeUser = {
    id: 'user_svs_owner',
    email: 'svs@test.com',
    role: 'customer',
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: activeUser.id,
          email: activeUser.email,
          user_metadata: { full_name: 'SVS Test Owner' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/rest/v1/profiles')) {
      return new Response(
        JSON.stringify([
          { id: activeUser.id, full_name: 'SVS Test Owner', role: activeUser.role },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return originalFetch(input, init);
  };

  const mockEnv: any = {
    DB: mockDb,
    AI_PROVIDER: 'gemini',
    SUPABASE_URL: 'https://test-auth.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon_key',
    // Deliberately omit WHATSAPP_CLOUD_API_TOKEN to verify credential checking
  };

  function createRequest(url: string, method: string, body?: any) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', 'Bearer test_token');
    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  console.log('[SECTION 1: WORKFLOW 2 — LOW STOCK AUTO-ALERT & DRAFT PO GENERATION]');
  activeUser = { id: 'user_svs_owner', email: 'svs@test.com', role: 'customer' };
  let generatedPoNumber = '';
  let approvalLogId = 0;

  await it('Workflow 2 creates a REAL draft purchase order in purchase_orders table', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2/run', 'POST', {
      tenantId: 1,
    });

    const res = await runWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.log.status, 'awaiting_approval');
    assert(data.log.summary.includes('Draft Purchase Order PO-'));
    assert(data.log.summary.includes('Never submitted automatically'));
    approvalLogId = data.log.id;

    // Verify D1 purchase_orders table has the draft record
    const pos = mockDb.query("SELECT * FROM purchase_orders WHERE website_id = 'prev_site_svs'");
    assert.strictEqual(pos.length, 1);
    assert.strictEqual(pos[0].status, 'draft', 'Status MUST be draft');
    assert(pos[0].po_number.startsWith('PO-'));
    generatedPoNumber = pos[0].po_number;
    assert.strictEqual(pos[0].total_cost_inr > 0, true);

    const items = JSON.parse(pos[0].items_json);
    assert.strictEqual(items.length, 2, 'Should include both low stock items');
    assert(items.some((i: any) => i.sku === 'SVS-SAREE-01'));
    assert(items.some((i: any) => i.sku === 'SVS-DUP-02'));
  });

  console.log('\n[SECTION 2: MANUAL APPROVAL GATE & SAFE DECISION HANDLING]');
  await it('Manual Approval Gate holds action until approved; approval does NOT dispatch to vendor', async () => {
    const req = createRequest(
      `https://master.vijay-visuals-site.pages.dev/api/automation-logs/${approvalLogId}/decision`,
      'PATCH',
      { decision: 'approved', tenantId: 1 }
    );

    const res = await decideLog({
      request: req,
      env: mockEnv,
      params: { id: String(approvalLogId) },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.status, 'approved');
    assert(data.log.summary.includes('APPROVED - Ready for supplier dispatch via vendor portal'));

    // Check PO is STILL in draft state (vendor dispatch remains manual and un-submitted)
    const pos = mockDb.query("SELECT status FROM purchase_orders WHERE po_number = ?", generatedPoNumber);
    assert.strictEqual(pos[0].status, 'draft');
  });

  await it('Manual Approval Gate rejection marks draft PO as cancelled', async () => {
    // Trigger another run
    const runReq = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2/run', 'POST', {
      tenantId: 1,
    });
    const runRes = await runWorkflow({
      request: runReq,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });
    const runData = await runRes.json() as any;
    const secondLogId = runData.log.id;
    const poNum2 = runData.draftPo.poNumber;

    // Reject it
    const req = createRequest(
      `https://master.vijay-visuals-site.pages.dev/api/automation-logs/${secondLogId}/decision`,
      'PATCH',
      { decision: 'rejected', tenantId: 1 }
    );

    const res = await decideLog({
      request: req,
      env: mockEnv,
      params: { id: String(secondLogId) },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const pos = mockDb.query("SELECT status FROM purchase_orders WHERE po_number = ?", poNum2);
    assert.strictEqual(pos[0].status, 'cancelled');
  });

  console.log('\n[SECTION 3: EXTERNAL INTEGRATIONS HONEST STATUS (NO FALSE POSITIVES)]');
  await it('Workflow 1 (WhatsApp) reports status: blocked when credentials are missing', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/1/run', 'POST', {
      tenantId: 1,
    });

    const res = await runWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '1' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.log.status, 'blocked');
    assert(data.log.summary.includes('requires external credentials'));
    assert(data.log.summary.includes('Message was not dispatched'));
  });

  await it('Workflow 3 (Invoice WhatsApp Delivery) reports status: blocked when credentials are missing', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/3/run', 'POST', {
      tenantId: 1,
    });

    const res = await runWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '3' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.log.status, 'blocked');
    assert(data.log.summary.includes('requires external credentials'));
  });

  console.log('\n[SECTION 4: STRICT TENANT ISOLATION & AUTHORIZATION]');
  activeUser = { id: 'user_intruder', email: 'intruder@test.com', role: 'customer' };

  await it('Unauthorized user cannot run another tenant workflow (HTTP 403 Forbidden)', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2/run', 'POST', {
      tenantId: 1, // Intruder targeting SVS tenant
    });

    const res = await runWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json() as any;
    assert(data.error.includes('Forbidden'));
  });

  await it('Unauthorized user cannot toggle another tenant workflow (HTTP 403 Forbidden)', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2', 'PATCH', {
      enabled: false,
      tenantId: 1,
    });

    const res = await toggleWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 403);
  });

  console.log('\n[SECTION 5: WORKFLOW TOGGLING & PAUSE PROTECTION]');
  activeUser = { id: 'user_svs_owner', email: 'svs@test.com', role: 'customer' };

  await it('Authorized owner can toggle workflow active / paused state cleanly', async () => {
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2', 'PATCH', {
      enabled: false,
      tenantId: 1,
    });

    const res = await toggleWorkflow({
      request: req,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.strictEqual(data.enabled, false);

    // Running a paused workflow should be rejected
    const runReq = createRequest('https://master.vijay-visuals-site.pages.dev/api/workflows/2/run', 'POST', {
      tenantId: 1,
    });
    const runRes = await runWorkflow({
      request: runReq,
      env: mockEnv,
      params: { id: '2' },
      next: async () => new Response(''),
    });
    assert.strictEqual(runRes.status, 400);
    const runData = await runRes.json() as any;
    assert(runData.error.includes('paused'));
  });

  console.log('\n====================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
