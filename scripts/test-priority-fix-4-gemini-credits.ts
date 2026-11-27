// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 4 INTEGRATION TEST SUITE
// Tests Gemini AI resilience, model fallback, secrets redaction,
// server-side credit metering, tenant isolation, and all AI endpoints.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getPackageMonthlyAiCredits,
  getTenantAiQuota,
  executeWithAiCreditDeduction,
  ensureAiUsageTable,
  getCurrentBillingPeriod,
} from '../functions/api/_aiCredits';

import {
  redactSecretsAndPii,
  normalizeGeminiContents,
} from '../functions/api/_gemini';

import { mapPublicationToTenant } from '../functions/api/_tenantMapper';
import { onRequestPost as contentStudioPost } from '../functions/api/ai/content-studio';
import { onRequestPost as generatePost } from '../functions/api/ai/generate';
import { onRequestPost as seoAssistantPost } from '../functions/api/ai/seo-assistant';
import { onRequestPost as ownerAiPost } from '../functions/api/owner/tenants/[tenantId]/ai-assistant';
import { onRequestGet as diagnosticGet } from '../functions/api/ai/diagnostic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

let passedTests = 0;
let failedTests = 0;

function it(description: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  ✓ ${description}`);
          passedTests++;
        })
        .catch((err) => {
          console.error(`  ✗ FAIL: ${description}`);
          console.error(`    ${err.message}`);
          failedTests++;
        });
    } else {
      console.log(`  ✓ ${description}`);
      passedTests++;
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

// Set up mock in-memory D1 wrapper
class MockD1 {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
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

      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE,
        name TEXT,
        monthly_ai_credits INTEGER DEFAULT 100
      );

      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        plan_code TEXT,
        plan_id TEXT,
        status TEXT DEFAULT 'active',
        current_period_end TEXT DEFAULT (datetime('now', '+30 days'))
      );

      CREATE TABLE IF NOT EXISTS store_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        name TEXT,
        price_inr REAL,
        stock_qty INTEGER DEFAULT 10,
        low_stock_threshold INTEGER DEFAULT 5,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS store_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        total_inr REAL,
        order_status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        website_id TEXT,
        user_id TEXT,
        role TEXT DEFAULT 'business_owner',
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS api_rate_limits (
        rate_key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO subscription_plans (id, code, name, monthly_ai_credits) VALUES
        ('plan-starter', 'starter-website', 'Starter', 25),
        ('plan-biz', 'business-website', 'Business', 100),
        ('plan-web', 'website-only', 'Website Only', 250),
        ('plan-ecom', 'ecommerce-website', 'E-Commerce', 500),
        ('plan-pwa', 'website-plus-pwa', 'Website + PWA', 750),
        ('plan-ent', 'custom-dev-enterprise', 'Enterprise', 5000);
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
              const row = stmt.get(...params);
              return (row as T) || null;
            } catch (err) {
              return null;
            }
          },
          async all<T = any>(): Promise<{ results: T[] }> {
            try {
              const stmt = db.prepare(sql);
              const results = stmt.all(...params) as T[];
              return { results };
            } catch (err) {
              return { results: [] };
            }
          },
          async run(): Promise<{ success: boolean; meta: { changes: number } }> {
            const stmt = db.prepare(sql);
            const info = stmt.run(...params);
            return { success: true, meta: { changes: Number(info.changes || 0) } };
          },
        };
      },
      async first<T = any>(): Promise<T | null> {
        try {
          const stmt = db.prepare(sql);
          const row = stmt.get();
          return (row as T) || null;
        } catch {
          return null;
        }
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        try {
          const stmt = db.prepare(sql);
          const results = stmt.all() as T[];
          return { results };
        } catch {
          return { results: [] };
        }
      },
      async run(): Promise<{ success: boolean; meta: { changes: number } }> {
        const stmt = db.prepare(sql);
        const info = stmt.run();
        return { success: true, meta: { changes: Number(info.changes || 0) } };
      },
    };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
}

async function runPriorityFix4Tests() {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 4 INTEGRATION TEST SUITE');
  console.log('====================================================================\n');

  const mockD1 = new MockD1();
  const mockEnv: any = {
    DB: mockD1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    GEMINI_API_KEY: 'mock_test_gemini_key_12345',
    GEMINI_MODEL: 'gemini-1.5-flash',
    AI_PROVIDER: 'gemini',
  };

  // Seed two distinct tenants: Tenant A (Business, 100 credits) and Tenant B (E-Commerce, 500 credits)
  await mockD1.exec(`
    INSERT INTO customer_website_publications (rowid, website_id, owner_id, public_slug, business_name, website_json, status)
    VALUES
      (1, 'site_tenant_a', 'user_owner_a', 'tenant-a-store', 'Tenant A Enterprises', '{"planTier":"business-website","category":"Electronics"}', 'published'),
      (2, 'site_tenant_b', 'user_owner_b', 'tenant-b-boutique', 'Tenant B Silks', '{"planTier":"ecommerce-website","category":"Fashion"}', 'published');

    INSERT INTO tenant_subscriptions (website_id, plan_code, status, current_period_end)
    VALUES
      ('site_tenant_a', 'business-website', 'active', datetime('now', '+30 days')),
      ('site_tenant_b', 'ecommerce-website', 'active', datetime('now', '+30 days'));

    INSERT INTO tenant_memberships (website_id, user_id, role, status)
    VALUES
      ('site_tenant_a', 'user_owner_a', 'business_owner', 'active'),
      ('site_tenant_b', 'user_owner_b', 'business_owner', 'active');
  `);

  console.log('[SECTION 1: PACKAGE AI CREDIT ALLOWANCE MAPPING]');
  it('Starter Website package resolves to exactly 25 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('starter-website'), 25);
    assert.strictEqual(getPackageMonthlyAiCredits('starter'), 25);
  });

  it('Business Website package resolves to exactly 100 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('business-website'), 100);
    assert.strictEqual(getPackageMonthlyAiCredits('business'), 100);
  });

  it('Website-Only package resolves to exactly 250 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('website-only'), 250);
    assert.strictEqual(getPackageMonthlyAiCredits('pro'), 250);
  });

  it('E-Commerce Website package resolves to exactly 500 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('ecommerce-website'), 500);
    assert.strictEqual(getPackageMonthlyAiCredits('ecommerce'), 500);
  });

  it('Website + PWA package resolves to exactly 750 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('website-plus-pwa'), 750);
    assert.strictEqual(getPackageMonthlyAiCredits('pwa'), 750);
  });

  it('Custom Dev Enterprise package resolves to exactly 5000 monthly credits', () => {
    assert.strictEqual(getPackageMonthlyAiCredits('custom-dev-enterprise'), 5000);
    assert.strictEqual(getPackageMonthlyAiCredits('enterprise'), 5000);
  });

  it('Tenant mapper never hardcodes aiCreditsLimit to 0', () => {
    const row = {
      website_id: 'site_tenant_a',
      owner_id: 'user_owner_a',
      public_slug: 'tenant-a-store',
      business_name: 'Tenant A Enterprises',
      website_json: JSON.stringify({ planTier: 'business-website' }),
      status: 'published',
    };
    const tenant = mapPublicationToTenant(row, JSON.parse(row.website_json));
    assert.strictEqual(tenant.aiCreditsLimit, 100, 'Must map Business tier to 100 credits, not 0');
    assert.strictEqual(tenant.aiCreditsUsed, 0);
  });

  it('Tenant mapper uses enrichment credits when provided from D1 overview', () => {
    const row = {
      website_id: 'site_tenant_a',
      owner_id: 'user_owner_a',
      public_slug: 'tenant-a-store',
      business_name: 'Tenant A Enterprises',
      website_json: JSON.stringify({ planTier: 'business-website' }),
      status: 'published',
    };
    const tenant = mapPublicationToTenant(row, JSON.parse(row.website_json), {
      aiCredits: { limit: 100, used: 14 },
    });
    assert.strictEqual(tenant.aiCreditsLimit, 100);
    assert.strictEqual(tenant.aiCreditsUsed, 14);
  });

  console.log('\n[SECTION 2: SECRETS REDACTION & ERROR INTEGRITY]');
  it('Redacts Gemini API keys, Bearer tokens, phone numbers and emails safely', () => {
    const raw = 'Error on AIzaSyTestKey1234567890abcdefghijklm with token Bearer eyJhbGci. Contact 9876543210 or admin@example.com.';
    const redacted = redactSecretsAndPii(raw);
    assert(!redacted.includes('AIzaSyTestKey1234567890abcdefghijklm'));
    assert(!redacted.includes('9876543210'));
    assert(!redacted.includes('admin@example.com'));
    assert(redacted.includes('[REDACTED_GEMINI_KEY]'));
    assert(redacted.includes('[REDACTED_PHONE]'));
    assert(redacted.includes('[REDACTED_EMAIL]'));
  });

  it('Normalizes Gemini prompt contents without data corruption', () => {
    const normalized = normalizeGeminiContents('Generate blog title');
    assert.strictEqual(normalized.contents.length, 1);
    assert.strictEqual(normalized.contents[0].parts[0].text, 'Generate blog title');
  });

  console.log('\n[SECTION 3: SERVER-SIDE CREDIT METERING & DEDUCTION]');
  await it('Retrieves verified D1 subscription plan allowances for tenants', async () => {
    const quotaA = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1, 'business-website');
    assert.strictEqual(quotaA.allowance, 100, 'Tenant A must have 100 credits');
    assert.strictEqual(quotaA.used, 0);
    assert.strictEqual(quotaA.remaining, 100);

    const quotaB = await getTenantAiQuota(mockEnv, 'site_tenant_b', 2, 'ecommerce-website');
    assert.strictEqual(quotaB.allowance, 500, 'Tenant B must have 500 credits');
    assert.strictEqual(quotaB.remaining, 500);
  });

  await it('Deducts credits upon successful AI generation and records in tenant_ai_usage', async () => {
    const result = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'site_tenant_a',
      tenantRowId: 1,
      userId: 'user_owner_a',
      serviceSlug: 'content-studio:blog',
      creditsNeeded: 1,
      promptSnippet: 'Write an article on modern electronics retail in India',
      executeAiCall: async () => 'Generated mock blog article successfully.',
    });

    assert.strictEqual(result.output, 'Generated mock blog article successfully.');
    assert.strictEqual(result.creditsUsed, 1);
    assert.strictEqual(result.creditsRemaining, 99);

    const updatedQuota = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    assert.strictEqual(updatedQuota.used, 1, 'Tenant A used count should be 1');
    assert.strictEqual(updatedQuota.remaining, 99, 'Tenant A remaining should be 99');
  });

  await it('Failed AI generation consumes ZERO credits', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'site_tenant_a',
        tenantRowId: 1,
        userId: 'user_owner_a',
        serviceSlug: 'content-studio:seo',
        creditsNeeded: 1,
        executeAiCall: async () => {
          throw new Error('Upstream simulated Google Gemini connection reset');
        },
      });
      assert.fail('Should have thrown error');
    } catch (err: any) {
      assert(err.message.includes('simulated Google Gemini connection reset'));
    }

    const quotaAfter = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used, 'Failed request must not increment used credits');
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining, 'Remaining credits must not decrease');
  });

  await it('Prevents double-charging with idempotent request IDs', async () => {
    const fixedReqId = 'req_idempotent_test_001';
    const quotaBefore = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);

    // Call 1 with fixedReqId
    const res1 = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'site_tenant_a',
      tenantRowId: 1,
      userId: 'user_owner_a',
      serviceSlug: 'generate:product_description',
      requestId: fixedReqId,
      creditsNeeded: 1,
      executeAiCall: async () => 'Product description result',
    });
    assert.strictEqual(res1.creditsUsed, 1);
    assert.strictEqual(res1.isDuplicate, false);

    // Call 2 with identical fixedReqId (e.g. rapid user double-click or network retry)
    const res2 = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'site_tenant_a',
      tenantRowId: 1,
      userId: 'user_owner_a',
      serviceSlug: 'generate:product_description',
      requestId: fixedReqId,
      creditsNeeded: 1,
      executeAiCall: async () => 'Product description result',
    });
    assert.strictEqual(res2.creditsUsed, 0, 'Duplicate request must NOT be charged');
    assert.strictEqual(res2.isDuplicate, true, 'Must flag as duplicate');

    const quotaAfter = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used + 1, 'Only 1 credit should be deducted in total');
  });

  console.log('\n[SECTION 4: STRICT TENANT ISOLATION]');
  await it('Tenant A usage does NOT affect Tenant B allowance or balance', async () => {
    const quotaBBefore = await getTenantAiQuota(mockEnv, 'site_tenant_b', 2);
    assert.strictEqual(quotaBBefore.allowance, 500);
    assert.strictEqual(quotaBBefore.used, 0);

    // Tenant A consumes multiple credits
    for (let i = 0; i < 5; i++) {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'site_tenant_a',
        tenantRowId: 1,
        userId: 'user_owner_a',
        serviceSlug: 'test:loop',
        creditsNeeded: 1,
        executeAiCall: async () => 'Tenant A call',
      });
    }

    const quotaAAfter = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    const quotaBAfter = await getTenantAiQuota(mockEnv, 'site_tenant_b', 2);

    assert(quotaAAfter.used >= 7, 'Tenant A used count should have increased');
    assert.strictEqual(quotaBAfter.used, 0, 'Tenant B used count MUST remain 0');
    assert.strictEqual(quotaBAfter.remaining, 500, 'Tenant B allowance must be 100% untouched');
  });

  console.log('\n[SECTION 5: QUOTA EXHAUSTION & CONCURRENCY PROTECTION]');
  await it('Rejects requests with HTTP 403 when monthly AI quota is reached', async () => {
    // Artificially exhaust Tenant A's quota by inserting a large usage record in the current billing period
    const billingPeriod = getCurrentBillingPeriod();
    await mockD1.exec(`
      INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status
      ) VALUES (
        'usage_exhaust_test', 'site_tenant_a', 1, 'user_owner_a', 'manual_fill',
        'req_exhaust_test', 'gemini', 'gemini-1.5-flash', 100, '${billingPeriod}', 'success'
      );
    `);

    const quota = await getTenantAiQuota(mockEnv, 'site_tenant_a', 1);
    assert.strictEqual(quota.isExhausted, true, 'Quota should now be exhausted');
    assert.strictEqual(quota.remaining, 0);

    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'site_tenant_a',
        tenantRowId: 1,
        userId: 'user_owner_a',
        serviceSlug: 'content-studio:test',
        creditsNeeded: 1,
        executeAiCall: async () => 'Should not be called',
      });
      assert.fail('Should have been blocked with 403');
    } catch (err: any) {
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.code, 'AI_QUOTA_EXHAUSTED');
      assert(err.message.includes('Monthly AI credits limit reached'));
    }
  });

  console.log('\n[SECTION 6: ENDPOINT AUTH & ROUTE TESTS]');
  await it('POST /api/ai/seo-assistant requires authentication', async () => {
    const unauthReq = new Request('http://localhost/api/ai/seo-assistant', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 1, task: 'keywords' }),
    });
    const res = await seoAssistantPost({ request: unauthReq, env: mockEnv } as any);
    assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
  });

  await it('POST /api/ai/content-studio requires authentication', async () => {
    const unauthReq = new Request('http://localhost/api/ai/content-studio', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 1, topic: 'Diwali offer' }),
    });
    const res = await contentStudioPost({ request: unauthReq, env: mockEnv } as any);
    assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
  });

  await it('POST /api/ai/generate requires authentication', async () => {
    const unauthReq = new Request('http://localhost/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Write product description' }),
    });
    const res = await generatePost({ request: unauthReq, env: mockEnv } as any);
    assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
  });

  await it('POST /api/owner/tenants/:tenantId/ai-assistant requires authentication', async () => {
    const unauthReq = new Request('http://localhost/api/owner/tenants/1/ai-assistant', {
      method: 'POST',
      body: JSON.stringify({ question: 'How are my sales?' }),
    });
    const res = await ownerAiPost({ request: unauthReq, env: mockEnv, params: { tenantId: '1' } } as any);
    assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
  });

  await it('GET /api/ai/diagnostic requires staff and reports safely without leaking keys', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const headers = new Headers(init?.headers || {});
      const jsonHeaders = { 'Content-Type': 'application/json' };
      if (url.includes('/auth/v1/user')) {
        const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (token !== 'token-staff') return new Response('{}', { status: 401, headers: jsonHeaders });
        return new Response(JSON.stringify({ id: 'auth-staff', email: 'staff@example.invalid' }), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ id: 'auth-staff', role: 'platform_staff', full_name: 'Staff' }]), {
          status: 200,
          headers: jsonHeaders,
        });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }],
            candidates: [{ content: { parts: [{ text: 'OK' }] } }],
          }),
          { status: 200, headers: jsonHeaders }
        );
      }
      return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), {
        status: 500,
        headers: jsonHeaders,
      });
    }) as typeof fetch;

    try {
      const anonymous = new Request('http://localhost/api/ai/diagnostic', { method: 'GET' });
      const anonymousRes = await diagnosticGet({ request: anonymous, env: mockEnv } as any);
      assert.strictEqual(anonymousRes.status, 401, 'Unauthenticated diagnostic must be rejected');

      const staffReq = new Request('http://localhost/api/ai/diagnostic', {
        method: 'GET',
        headers: { Authorization: 'Bearer token-staff' },
      });
      const res = await diagnosticGet({ request: staffReq, env: mockEnv } as any);
      assert.strictEqual(res.status, 200);
      const body: any = await res.json();
      assert.strictEqual(body.hasGeminiKey, true);
      assert.strictEqual(body.provider, 'gemini');
      assert.strictEqual(body.configuredCandidateModel, 'gemini-1.5-flash');
      assert(!JSON.stringify(body).includes('mock_test_gemini_key_12345'), 'Must NEVER leak key in diagnostic payload');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log('\n====================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPriorityFix4Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
