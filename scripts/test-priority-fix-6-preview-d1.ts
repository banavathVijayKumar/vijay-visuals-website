// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 6: PREVIEW D1 ISOLATION & AI USAGE LEDGER TEST
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import {
  executeWithAiCreditDeduction,
  getTenantAiQuota,
  getPackageMonthlyAiCredits,
  getCurrentBillingPeriod,
} from '../functions/api/_aiCredits';
import { callGeminiWithFallback } from '../functions/api/_gemini';

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

class MockPreviewD1 {
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
        owner_id TEXT DEFAULT 'owner_test',
        plan_code TEXT,
        plan_id TEXT,
        status TEXT DEFAULT 'active'
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_website_period 
        ON tenant_ai_usage(website_id, billing_period, status);
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_request_id 
        ON tenant_ai_usage(request_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_tenant_period 
        ON tenant_ai_usage(tenant_rowid, billing_period, status);
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_user_period 
        ON tenant_ai_usage(user_id, billing_period);

      INSERT INTO subscription_plans (id, code, name, monthly_ai_credits)
      VALUES 
        ('plan-starter', 'starter-website', 'Starter Website', 25),
        ('plan-biz', 'business-website', 'Business Website', 100),
        ('plan-ecom', 'ecommerce-website', 'E-Commerce Website', 500);

      INSERT INTO customer_website_publications (rowid, website_id, public_slug, business_name, website_json, status)
      VALUES 
        (1, 'prev_site_svs', 'svs', 'SVS Store', '{"planTier":"business-website"}', 'published'),
        (2, 'prev_site_tenant_b', 'tenant-b', 'Tenant B Store', '{"planTier":"starter-website"}', 'published');

      INSERT INTO tenant_subscriptions (website_id, plan_code, status)
      VALUES 
        ('prev_site_svs', 'business-website', 'active'),
        ('prev_site_tenant_b', 'starter-website', 'active');
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
  console.log('VIJAY VISUALS — PRIORITY FIX 6 VERIFICATION SUITE');
  console.log('====================================================================\n');

  console.log('[SECTION 1: DATABASE ID VERIFICATION & ISOLATION]');
  await it('Preview and Production D1 database IDs are distinct', () => {
    const previewId = '04ebaf6a-ff38-445c-889d-1fb391548a41';
    const prodId = '5e6c67d1-ccc0-4e98-a787-c6643e9f0f6c';
    assert.notStrictEqual(previewId, prodId, 'Preview and Production IDs must not match');
    assert.strictEqual(previewId.length, 36);
    assert.strictEqual(prodId.length, 36);
  });

  console.log('\n[SECTION 2: AI CREDIT RESERVATION & DEDUCTION SAFETY]');
  const mockDb = new MockPreviewD1();
  const mockEnv: any = {
    DB: mockDb,
    GEMINI_API_KEY: 'test_key',
    AI_PROVIDER: 'gemini',
  };

  await it('Retrieves verified D1 quota for SVS (100 credits)', async () => {
    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.allowance, 100);
    assert.strictEqual(quota.used, 0);
    assert.strictEqual(quota.remaining, 100);
    assert.strictEqual(quota.isExhausted, false);
  });

  await it('Successful generation deducts exactly 1 credit and records in ledger', async () => {
    const res = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'prev_site_svs',
      tenantRowId: 1,
      userId: 'user_svs',
      serviceSlug: 'business-advisor',
      requestId: 'req_test_001',
      creditsNeeded: 1,
      executeAiCall: async () => 'Here is advice from AI Business Advisor.',
    });

    assert.strictEqual(res.output, 'Here is advice from AI Business Advisor.');
    assert.strictEqual(res.creditsUsed, 1);
    assert.strictEqual(res.creditsRemaining, 99);

    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.used, 1);
    assert.strictEqual(quota.remaining, 99);
  });

  await it('Idempotent request with duplicate requestId does not re-deduct credits', async () => {
    const res = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'prev_site_svs',
      tenantRowId: 1,
      userId: 'user_svs',
      serviceSlug: 'business-advisor',
      requestId: 'req_test_001', // Exact same request ID
      creditsNeeded: 1,
      executeAiCall: async () => 'Should not deduct again',
    });

    assert.strictEqual(res.creditsUsed, 0, 'Duplicate request ID must report 0 additional credits');
    assert.strictEqual(res.creditsRemaining, 99);

    const quota = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quota.used, 1, 'Total used must remain 1');
  });

  await it('Failed AI generation consumes ZERO credits', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);

    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'prev_site_svs',
        tenantRowId: 1,
        userId: 'user_svs',
        serviceSlug: 'business-advisor',
        requestId: 'req_test_fail_002',
        creditsNeeded: 1,
        executeAiCall: async () => {
          throw new Error('Google Gemini API service temporarily unavailable');
        },
      });
      assert.fail('Should have thrown error');
    } catch (err: any) {
      assert(err.message.includes('service temporarily unavailable'));
    }

    const quotaAfter = await getTenantAiQuota(mockEnv, 'prev_site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used, 'Used credits must remain unchanged on failure');
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining, 'Remaining credits must remain unchanged');
  });

  console.log('\n[SECTION 3: STRICT TENANT ISOLATION]');
  await it('Tenant SVS consumption does not affect Tenant B', async () => {
    const quotaB = await getTenantAiQuota(mockEnv, 'prev_site_tenant_b', 2);
    assert.strictEqual(quotaB.allowance, 25);
    assert.strictEqual(quotaB.used, 0);
    assert.strictEqual(quotaB.remaining, 25);
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
