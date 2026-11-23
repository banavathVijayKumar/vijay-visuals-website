// ============================================================================
// VIJAY VISUALS — MASTER CONSOLIDATED UPGRADE TEST SUITE
// Tests Modules 1 through 12 across isolated Preview environment
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as resolveDomain } from '../functions/api/domains/resolve';
import { onRequestGet as getTickets, onRequestPost as createTicket, onRequestPatch as replyTicket } from '../functions/api/tickets';
import { onRequestGet as getChangeRequests, onRequestPost as createChangeRequest, onRequestPatch as decideChangeRequest } from '../functions/api/owner/tenants/[tenantId]/change-requests';
import { onRequestGet as adminGetChangeRequests, onRequestPatch as adminQuoteChangeRequest } from '../functions/api/admin/change-requests';
import { onRequestGet as getDevTasks, onRequestPost as createDevTask, onRequestPatch as updateDevTask } from '../functions/api/admin/developer-tasks';
import { onRequestGet as getVersions, onRequestPost as createVersion } from '../functions/api/owner/tenants/[tenantId]/versions';
import { onRequestPost as restoreVersion } from '../functions/api/owner/tenants/[tenantId]/versions/[versionId]/restore';

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

      CREATE TABLE IF NOT EXISTS tenant_domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT NOT NULL,
        domain_name TEXT NOT NULL UNIQUE,
        is_primary INTEGER NOT NULL DEFAULT 1,
        dns_verification_status TEXT NOT NULL DEFAULT 'verified',
        ssl_status TEXT NOT NULL DEFAULT 'active',
        status TEXT NOT NULL DEFAULT 'live',
        www_mode TEXT NOT NULL DEFAULT 'both',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        user_id TEXT,
        role TEXT,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        owner_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general_assistance',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'open',
        assigned_staff_id TEXT,
        messages_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS website_change_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_number TEXT NOT NULL UNIQUE,
        website_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        category TEXT NOT NULL,
        is_bug_fix INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        attachments_json TEXT NOT NULL DEFAULT '[]',
        ai_summary TEXT NOT NULL DEFAULT '',
        quotation_inr INTEGER NOT NULL DEFAULT 0,
        estimated_hours REAL NOT NULL DEFAULT 0,
        delivery_days INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'submitted',
        customer_notes TEXT NOT NULL DEFAULT '',
        admin_notes TEXT NOT NULL DEFAULT '',
        approved_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS developer_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_number TEXT NOT NULL UNIQUE,
        website_id TEXT NOT NULL,
        change_request_id INTEGER,
        ticket_id INTEGER,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'assigned',
        assigned_developer_id TEXT NOT NULL,
        assigned_developer_name TEXT NOT NULL,
        estimated_hours REAL NOT NULL DEFAULT 0,
        actual_hours REAL NOT NULL DEFAULT 0,
        deadline TEXT,
        internal_notes TEXT NOT NULL DEFAULT '',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        activity_log_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS website_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        revision_type TEXT NOT NULL DEFAULT 'draft',
        summary TEXT NOT NULL DEFAULT '',
        website_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS backup_audit_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        website_id TEXT,
        initiated_by TEXT NOT NULL,
        status TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS vv_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT,
        actor_role TEXT,
        action TEXT,
        target_type TEXT,
        target_id TEXT,
        details_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO customer_website_publications (rowid, website_id, owner_id, public_slug, business_name, website_json, status)
      VALUES 
        (1, 'prev_site_svs', 'user_svs', 'svs', 'SVS Store', '{"businessName":"SVS Store"}', 'published'),
        (2, 'prev_site_tenant_b', 'user_other', 'tenant-b', 'Tenant B Store', '{"businessName":"Tenant B Store"}', 'published');

      INSERT INTO tenant_domains (website_id, domain_name, is_primary, dns_verification_status, ssl_status, status)
      VALUES 
        ('prev_site_svs', 'www.svsstore.in', 1, 'verified', 'active', 'live');
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
  console.log('VIJAY VISUALS — MASTER CONSOLIDATED UPGRADE TEST SUITE');
  console.log('====================================================================\n');

  const mockDb = new MockD1DB();
  const originalFetch = globalThis.fetch;

  let activeUser = {
    id: 'user_svs',
    email: 'svs@test.com',
    fullName: 'SVS Store Owner',
    role: 'customer',
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: activeUser.id,
          email: activeUser.email,
          user_metadata: { full_name: activeUser.fullName },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('/rest/v1/profiles')) {
      return new Response(
        JSON.stringify([
          { id: activeUser.id, full_name: activeUser.fullName, role: activeUser.role },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return originalFetch(input, init);
  };

  const mockEnv: any = {
    DB: mockDb,
    SUPABASE_URL: 'https://test-auth.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon_key',
    PLATFORM_HOSTNAMES: 'vijay-visuals-site.pages.dev,master.vijay-visuals-site.pages.dev',
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

  // --------------------------------------------------------------------------
  console.log('[MODULE 1: INDEPENDENT CUSTOMER WEBSITE DELIVERY]');
  // --------------------------------------------------------------------------
  await it('Automatic Delivery Subdomain resolution (svs.vijayvisuals.in)', async () => {
    const req = new Request('https://vijay-visuals-site.pages.dev/api/domains/resolve?host=svs.vijayvisuals.in');
    const res = await resolveDomain({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.matched, true);
    assert.strictEqual(data.websiteId, 'prev_site_svs');
    assert.strictEqual(data.tenantSlug, 'svs');
    assert.strictEqual(data.isDefaultDeliverySubdomain, true);
    assert.strictEqual(data.deliveryUrl, 'https://svs.vijayvisuals.in');
  });

  await it('Connected custom domain resolution (www.svsstore.in)', async () => {
    const req = new Request('https://vijay-visuals-site.pages.dev/api/domains/resolve?host=www.svsstore.in');
    const res = await resolveDomain({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.matched, true);
    assert.strictEqual(data.websiteId, 'prev_site_svs');
    assert.strictEqual(data.customDomainConnected, true);
  });

  // --------------------------------------------------------------------------
  console.log('\n[MODULE 3: CUSTOMER SUPPORT CENTER]');
  // --------------------------------------------------------------------------
  let createdTicketId = 0;
  await it('Customer can create a support ticket with categorized workflow', async () => {
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/tickets', 'POST', {
      subject: 'Update store hero banner for festive season',
      category: 'logo_banner',
      priority: 'high',
      message: 'Please replace hero banner with Diwali festive collection asset.',
      tenantId: 1,
    });
    const res = await createTicket({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 201);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.ticket.status, 'open');
    assert.strictEqual(data.ticket.priority, 'high');
    assert.strictEqual(data.ticket.category, 'logo_banner');
    assert(data.ticket.ticketNumber.startsWith('TKT-'));
    createdTicketId = data.ticket.id;
  });

  await it('Staff can reply to support ticket and update status', async () => {
    activeUser = { id: 'admin_1', email: 'admin@vijayvisuals.in', fullName: 'Vijay Support Staff', role: 'super_admin' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/tickets', 'PATCH', {
      ticketId: createdTicketId,
      message: 'Banner has been drafted. Please review in your builder.',
      status: 'review',
    });
    const res = await replyTicket({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.ticket.status, 'review');
    assert.strictEqual(data.ticket.messages.length, 2);
  });

  // --------------------------------------------------------------------------
  console.log('\n[MODULE 4: WEBSITE CHANGE REQUEST & QUOTATION SYSTEM]');
  // --------------------------------------------------------------------------
  let changeRequestId = 0;
  await it('Customer submits change request; auto-classifies free bug fix vs feature quotation', async () => {
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/change-requests', 'POST', {
      title: 'Checkout button error on mobile devices',
      category: 'bug_fix',
      description: 'The checkout button fails to click on iOS Safari devices.',
    });
    const res = await createChangeRequest({
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(''),
    });
    assert.strictEqual(res.status, 201);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.changeRequest.isBugFix, true, 'Bug report must be identified as free bug fix');
    assert.strictEqual(data.changeRequest.quotationInr, 0, 'Free bug fix must cost 0 INR');
    assert(data.changeRequest.requestNumber.startsWith('CR-'));
    changeRequestId = data.changeRequest.id;
  });

  await it('Admin prepares quotation for paid feature request', async () => {
    // Create a feature request
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/change-requests', 'POST', {
      title: 'Add Wholesale B2B Tier Pricing Calculator',
      category: 'custom_feature',
      description: 'Need multi-tier volume discounts for wholesale buyers.',
    });
    const res = await createChangeRequest({
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(''),
    });
    const data: any = await res.json();
    const featId = data.changeRequest.id;

    // Admin prepares quotation
    activeUser = { id: 'admin_1', email: 'admin@vijayvisuals.in', fullName: 'Vijay Admin', role: 'super_admin' };
    const quoteReq = createRequest('https://master.vijay-visuals-site.pages.dev/api/admin/change-requests', 'PATCH', {
      requestId: featId,
      quotationInr: 4500,
      estimatedHours: 6,
      deliveryDays: 2,
      adminNotes: 'Includes B2B volume pricing table & bulk cart discount logic.',
      status: 'quoted',
    });
    const quoteRes = await adminQuoteChangeRequest({ request: quoteReq, env: mockEnv } as any);
    assert.strictEqual(quoteRes.status, 200);
    const quoteData: any = await quoteRes.json();
    assert.strictEqual(quoteData.quotationInr, 4500);
    assert.strictEqual(quoteData.status, 'quoted');

    // Customer approves quotation without auto-charge
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const approveReq = createRequest('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/change-requests', 'PATCH', {
      requestId: featId,
      decision: 'approved',
    });
    const approveRes = await decideChangeRequest({
      request: approveReq,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(''),
    });
    assert.strictEqual(approveRes.status, 200);
    const approveData: any = await approveRes.json();
    assert.strictEqual(approveData.status, 'approved');
  });

  // --------------------------------------------------------------------------
  console.log('\n[MODULE 5: DEVELOPER TASK MANAGEMENT]');
  // --------------------------------------------------------------------------
  let devTaskId = 0;
  await it('Staff can assign developer task with deadlines and estimated hours', async () => {
    activeUser = { id: 'admin_1', email: 'admin@vijayvisuals.in', fullName: 'Lead Architect', role: 'super_admin' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/admin/developer-tasks', 'POST', {
      websiteId: 'prev_site_svs',
      changeRequestId,
      title: 'Fix iOS Safari mobile click event on checkout CTA',
      priority: 'high',
      assignedDeveloperName: 'Rohit Sharma (Frontend Dev)',
      estimatedHours: 3,
      deadline: '2026-11-30',
    });
    const res = await createDevTask({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 201);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.task.taskNumber.startsWith('TSK-'));
    devTaskId = data.task.id;
  });

  await it('Developer logs work hours and completes task', async () => {
    activeUser = { id: 'admin_1', email: 'rohit@vijayvisuals.in', fullName: 'Rohit Sharma', role: 'super_admin' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/admin/developer-tasks', 'PATCH', {
      taskId: devTaskId,
      hoursToAdd: 2.5,
      status: 'completed',
      internalNotes: 'Patched touchstart/click event listener on mobile button.',
    });
    const res = await updateDevTask({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.actualHours, 2.5);
    assert.strictEqual(data.status, 'completed');
  });

  // --------------------------------------------------------------------------
  console.log('\n[MODULE 6: BACKUP, VERSION HISTORY & RESTORE]');
  // --------------------------------------------------------------------------
  let createdVersionNum = 0;
  await it('Customer can create manual pre-change backup with SHA-256 checksum', async () => {
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/versions', 'POST', {
      label: 'Pre-Festival Mega Sale Snapshot',
      beforeMajorChange: true,
    });
    const res = await createVersion({
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(''),
    });
    assert.strictEqual(res.status, 201);
    const data: any = await res.json();
    assert.strictEqual(data.ok, true);
    assert(data.checksumSha256.length === 64, 'Checksum must be 64-char SHA-256');
    assert(data.note.includes('[Pre-Change Backup]'));
    assert(data.retentionPolicy.maxSnapshotsRetained > 0);
    createdVersionNum = data.versionNumber;
  });

  await it('Customer can restore previously saved website configuration version', async () => {
    // Get version ID from D1
    const revs = mockDb.query("SELECT id FROM website_revisions WHERE website_id = 'prev_site_svs' ORDER BY version_number DESC LIMIT 1");
    const vId = revs[0].id;

    const req = createRequest(`https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/versions/${vId}/restore`, 'POST');
    const res = await restoreVersion({
      request: req,
      env: mockEnv,
      params: { tenantId: '1', versionId: String(vId) },
      next: async () => new Response(''),
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.restoredVersion, createdVersionNum);
  });

  // --------------------------------------------------------------------------
  console.log('\n[MODULE 9: SECURITY & STRICT TENANT ISOLATION]');
  // --------------------------------------------------------------------------
  await it('Intruder cannot access another tenant change requests (HTTP 403 Forbidden)', async () => {
    activeUser = { id: 'intruder', email: 'intruder@test.com', fullName: 'Intruder', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/change-requests', 'GET');
    const res = await getChangeRequests({
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
      next: async () => new Response(''),
    });
    assert.strictEqual(res.status, 403);
  });

  await it('Non-staff cannot access developer task management (HTTP 403 Forbidden)', async () => {
    activeUser = { id: 'user_svs', email: 'svs@test.com', fullName: 'SVS Owner', role: 'customer' };
    const req = createRequest('https://master.vijay-visuals-site.pages.dev/api/admin/developer-tasks', 'GET');
    const res = await getDevTasks({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 403);
  });

  console.log('\n====================================================================');
  console.log(`MASTER CONSOLIDATED TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
