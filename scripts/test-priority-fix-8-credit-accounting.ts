// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 8: AI CREDIT ACCOUNTING AUDIT TEST SUITE
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import {
  executeWithAiCreditDeduction,
  getTenantAiQuota,
  getCurrentBillingPeriod,
} from '../functions/api/_aiCredits';

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
      CREATE TABLE IF NOT EXISTS customer_website_publications (
        rowid INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT UNIQUE,
        public_slug TEXT UNIQUE,
        business_name TEXT,
        website_json TEXT,
        status TEXT DEFAULT 'published'
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
        status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked', 'reserved')),
        prompt_snippet TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_website_period 
        ON tenant_ai_usage(website_id, billing_period, status);
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_request_id 
        ON tenant_ai_usage(request_id);

      INSERT INTO subscription_plans (id, code, name, monthly_ai_credits)
      VALUES 
        ('plan-biz', 'business-website', 'Business Website', 100),
        ('plan-starter', 'starter-website', 'Starter Website', 25);

      INSERT INTO customer_website_publications (rowid, website_id, public_slug, business_name, website_json, status)
      VALUES 
        (1, 'prev_site_svs', 'svs', 'SVS Store', '{"planTier":"business-website"}', 'published'),
        (2, 'prev_site_tenant_b', 'tenant-b', 'Tenant B Store', '{"planTier":"starter-website"}', 'published');

      INSERT INTO tenant_subscriptions (website_id, plan_code, status, current_period_end)
      VALUES 
        ('prev_site_svs', 'business-website', 'active', datetime('now', '+30 days')),
        ('prev_site_tenant_b', 'starter-website', 'active', datetime('now', '+30 days'));
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

  query(sql: string, ...params: any[]): any {
    return this.db.prepare(sql).all(...params);
  }
}

async function run() {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 8: AI CREDIT ACCOUNTING AUDIT');
  console.log('====================================================================\n');

  const mockDb = new MockD1DB();
  const mockEnv: any = {
    DB: mockDb,
    GEMINI_API_KEY: 'test_key',
    AI_PROVIDER: 'gemini',
  };

  console.log('[SECTION 1: INITIAL QUOTA & ACCURATE DEDUCTION]');
  await it('Initial SVS tenant quota starts with 0 used of 100 allowance', async () => {
    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.allowance, 100);
    assert.strictEqual(quota.used, 0);
    assert.strictEqual(quota.remaining, 100);
    assert.strictEqual(quota.isExhausted, false);
  });

  await it('First successful generation deducts exactly 1 credit (0/100 -> 1/100)', async () => {
    const res = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'prev_site_svs',
      tenantRowId: 1,
      userId: 'user_svs',
      serviceSlug: 'content-studio:blog_article',
      requestId: 'req_gen_001',
      creditsNeeded: 1,
      executeAiCall: async () => 'Article content generated.',
    });

    assert.strictEqual(res.output, 'Article content generated.');
    assert.strictEqual(res.creditsUsed, 1, 'API response must report 1 credit used');
    assert.strictEqual(res.creditsRemaining, 99, 'Remaining must be 99');
    assert.strictEqual(res.isDuplicate, false);

    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.used, 1, 'D1 quota used must be exactly 1');
    assert.strictEqual(quota.remaining, 99, 'D1 quota remaining must be exactly 99');

    // Verify ledger record in D1
    const records = mockDb.query("SELECT credits_deducted, status FROM tenant_ai_usage WHERE request_id = 'req_gen_001'");
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].credits_deducted, 1);
    assert.strictEqual(records[0].status, 'success');
  });

  await it('Second successful generation deducts exactly 1 credit (1/100 -> 2/100)', async () => {
    const res = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'prev_site_svs',
      tenantRowId: 1,
      userId: 'user_svs',
      serviceSlug: 'owner-ai-assistant',
      requestId: 'req_gen_002',
      creditsNeeded: 1,
      executeAiCall: async () => 'Business assistant advice.',
    });

    assert.strictEqual(res.creditsUsed, 1);
    assert.strictEqual(res.creditsRemaining, 98);

    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.used, 2, 'D1 quota used must be exactly 2');
    assert.strictEqual(quota.remaining, 98);
  });

  console.log('\n[SECTION 2: FAILED / TIMED-OUT GENERATION ZERO-DEDUCTION SAFETY]');
  await it('Failed upstream Gemini call deducts ZERO credits (ledger records 0, status failed)', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);

    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'prev_site_svs',
        tenantRowId: 1,
        userId: 'user_svs',
        serviceSlug: 'content-studio:seo_metadata',
        requestId: 'req_fail_003',
        creditsNeeded: 1,
        executeAiCall: async () => {
          throw new Error('Google Gemini API HTTP 503 Overloaded');
        },
      });
      assert.fail('Should have thrown error');
    } catch (err: any) {
      assert(err.message.includes('503 Overloaded'));
    }

    const quotaAfter = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used, 'Failed request must NOT increment used credits');
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining, 'Remaining credits must not decrease');

    // Verify ledger record shows credits_deducted = 0 and status = 'failed'
    const records = mockDb.query("SELECT credits_deducted, status, error_message FROM tenant_ai_usage WHERE request_id = 'req_fail_003'");
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].credits_deducted, 0, 'Ledger credits_deducted must be 0 for failed call');
    assert.strictEqual(records[0].status, 'failed');
    assert(records[0].error_message.includes('503 Overloaded'));
  });

  await it('Stale reservation (> 2 min ago) auto-expires and consumes ZERO credits', async () => {
    // Manually insert an orphaned reservation from 10 minutes ago
    mockDb.exec(`
      INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status, created_at
      ) VALUES (
        'stale_001', 'prev_site_svs', 1, 'user_svs', 'orphaned:test', 'req_orphaned_stale',
        'gemini', 'gemini-flash', 1, '${getCurrentBillingPeriod()}', 'reserved', datetime('now', '-10 minutes')
      );
    `);

    // getTenantAiQuota should auto-expire the stale reservation
    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.used, 2, 'Stale reservation must NOT be counted in used credits');

    const staleRecord = mockDb.query("SELECT credits_deducted, status FROM tenant_ai_usage WHERE id = 'stale_001'");
    assert.strictEqual(staleRecord[0].status, 'failed');
    assert.strictEqual(staleRecord[0].credits_deducted, 0);
  });

  console.log('\n[SECTION 3: IDEMPOTENCY & DUPLICATE / CONCURRENT SAFETY]');
  await it('Duplicate request with exact same requestId returns creditsUsed: 0 without re-charging', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);

    const dupRes = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'prev_site_svs',
      tenantRowId: 1,
      userId: 'user_svs',
      serviceSlug: 'content-studio:blog_article',
      requestId: 'req_gen_001', // Replaying request 1
      creditsNeeded: 1,
      executeAiCall: async () => 'Article content replayed.',
    });

    assert.strictEqual(dupRes.isDuplicate, true, 'Must identify as duplicate');
    assert.strictEqual(dupRes.creditsUsed, 0, 'Duplicate request must cost 0 credits');

    const quotaAfter = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used, 'Quota used must not increment on duplicate replay');
  });

  await it('Concurrent requests with different requestIds deduct cleanly without lost updates', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);

    const tasks = [
      executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'prev_site_svs',
        tenantRowId: 1,
        userId: 'user_svs',
        serviceSlug: 'parallel:1',
        requestId: 'req_concurrent_001',
        creditsNeeded: 1,
        executeAiCall: async () => 'Parallel response 1',
      }),
      executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'prev_site_svs',
        tenantRowId: 1,
        userId: 'user_svs',
        serviceSlug: 'parallel:2',
        requestId: 'req_concurrent_002',
        creditsNeeded: 1,
        executeAiCall: async () => 'Parallel response 2',
      }),
    ];

    const results = await Promise.all(tasks);
    assert.strictEqual(results[0].creditsUsed, 1);
    assert.strictEqual(results[1].creditsUsed, 1);

    const quotaAfter = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used + 2, 'Both concurrent calls must be recorded (2 credits total)');
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining - 2);
  });

  console.log('\n[SECTION 4: QUOTA EXHAUSTION & TENANT ISOLATION]');
  await it('Rejects request with HTTP 403 when remaining credits reach 0', async () => {
    // Tenant B has 25 credit allowance
    const quotaB = await getTenantAiQuota(mockEnv, 'prev_site_tenant_b', 2);
    assert.strictEqual(quotaB.allowance, 25);
    assert.strictEqual(quotaB.used, 0);

    // Consume all 25 credits for Tenant B
    mockDb.exec(`
      INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status
      ) VALUES (
        'exhaust_001', 'prev_site_tenant_b', 2, 'user_b', 'bulk:run', 'req_exhaust_b',
        'gemini', 'gemini-flash', 25, '${getCurrentBillingPeriod()}', 'success'
      );
    `);

    const quotaBAfter = await getTenantAiQuota(mockEnv, 'prev_site_tenant_b', 2);
    assert.strictEqual(quotaBAfter.remaining, 0);
    assert.strictEqual(quotaBAfter.isExhausted, true);

    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'prev_site_tenant_b',
        tenantRowId: 2,
        userId: 'user_b',
        serviceSlug: 'generate:test',
        requestId: 'req_b_blocked',
        creditsNeeded: 1,
        executeAiCall: async () => 'Should not be called',
      });
      assert.fail('Should have been rejected with 403');
    } catch (err: any) {
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.code, 'AI_QUOTA_EXHAUSTED');
    }

    // Verify SVS tenant was completely unaffected by Tenant B's exhaustion
    const svsQuota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(svsQuota.used, 4, 'SVS tenant usage must remain 4');
    assert.strictEqual(svsQuota.remaining, 96, 'SVS tenant remaining must remain 96');
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
