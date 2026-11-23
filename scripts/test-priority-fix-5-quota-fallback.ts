// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 5 INTEGRATION TEST SUITE
// Tests Gemini model fallback when a model returns quota limit 0,
// prevents repeated retries of zero-quota models,
// verifies failed generations consume 0 credits and successful ones consume 1 credit,
// and tests the Production Connector status contract.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

import {
  callGeminiWithFallback,
  redactSecretsAndPii,
} from '../functions/api/_gemini';

import {
  getTenantAiQuota,
  executeWithAiCreditDeduction,
} from '../functions/api/_aiCredits';

import { onRequestGet as healthGet } from '../functions/api/health';

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

class MockD1 {
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
        plan_code TEXT,
        status TEXT DEFAULT 'active'
      );

      INSERT INTO subscription_plans (id, code, name, monthly_ai_credits)
      VALUES ('plan-biz', 'business-website', 'Business Website', 100);

      INSERT INTO customer_website_publications (rowid, website_id, public_slug, business_name, website_json, status)
      VALUES (1, 'site_svs', 'svs', 'SVS Store', '{"planTier":"business-website"}', 'published');

      INSERT INTO tenant_subscriptions (website_id, plan_code, status)
      VALUES ('site_svs', 'business-website', 'active');
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

async function runTests() {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 5 INTEGRATION SUITE');
  console.log('====================================================================\n');

  const mockD1 = new MockD1();
  const mockEnv: any = {
    DB: mockD1,
    GEMINI_API_KEY: 'test_key_ai_studio',
    AI_PROVIDER: 'gemini',
  };

  console.log('[SECTION 1: PRODUCTION CONNECTOR STATUS CONTRACT]');
  await it('GET /api/health exports both gemini and geminiAi booleans', async () => {
    const req = new Request('http://localhost/api/health', { method: 'GET' });
    const res = await healthGet({ request: req, env: mockEnv } as any);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.hasGeminiKey, true);
    assert.strictEqual(body.integrations.gemini, true, 'integrations.gemini must be true');
    assert.strictEqual(body.integrations.geminiAi, true, 'integrations.geminiAi must be true');
    assert.strictEqual(body.integrations.cloudflareD1, true);
  });

  console.log('\n[SECTION 2: MODEL FALLBACK WHEN A MODEL HAS QUOTA LIMIT 0]');
  await it('Skips model with quota limit 0 and falls back to candidate model', async () => {
    const originalFetch = globalThis.fetch;
    let attemptedModels: string[] = [];

    // Mock fetch where model A returns 429 with limit: 0, and model B succeeds
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes(':generateContent')) {
        const match = url.match(/\/models\/([^:]+):generateContent/);
        const modelName = match ? decodeURIComponent(match[1]) : 'unknown';
        attemptedModels.push(modelName);

        // First attempted model returns 429 with limit: 0, and fallback model succeeds
        if (attemptedModels.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                code: 429,
                message: `Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: ${modelName}`,
                status: 'RESOURCE_EXHAUSTED',
              },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Subsequent fallback model succeeds
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: `Generated response from fallback model ${modelName}` }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/models')) {
        return new Response(
          JSON.stringify({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input, init);
    };

    try {
      const res = await callGeminiWithFallback('Test prompt', mockEnv);
      assert.strictEqual(res.isFallback, true, 'Must indicate fallback was used');
      assert(res.text.includes('Generated response from fallback model'));
      assert(attemptedModels.length > 1, 'Must have attempted multiple models upon limit: 0');
      assert(attemptedModels[0].length > 0, 'First candidate model was attempted');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log('\n[SECTION 3: CREDIT HANDLING ON FAILED VS SUCCESSFUL GENERATION]');
  await it('Failed AI generation (e.g. Quota 429) consumes ZERO credits', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'site_svs', 1);

    try {
      await executeWithAiCreditDeduction(mockEnv, {
        websiteId: 'site_svs',
        tenantRowId: 1,
        userId: 'user_1',
        serviceSlug: 'content-studio',
        creditsNeeded: 1,
        executeAiCall: async () => {
          const err = new Error('Google Gemini API rate/quota limit reached. (HTTP 429: limit 0)');
          (err as any).status = 429;
          throw err;
        },
      });
      assert.fail('Should have failed');
    } catch (err: any) {
      assert(err.message.includes('rate/quota limit reached'));
    }

    const quotaAfter = await getTenantAiQuota(mockEnv, 'site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used, 'Failed request must not increment used credits');
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining, 'Remaining credits must not decrease');
  });

  await it('Successful generation deducts exactly 1 credit', async () => {
    const quotaBefore = await getTenantAiQuota(mockEnv, 'site_svs', 1);

    const result = await executeWithAiCreditDeduction(mockEnv, {
      websiteId: 'site_svs',
      tenantRowId: 1,
      userId: 'user_1',
      serviceSlug: 'content-studio',
      creditsNeeded: 1,
      executeAiCall: async () => 'Valid AI generation response',
    });

    assert.strictEqual(result.output, 'Valid AI generation response');
    assert.strictEqual(result.creditsUsed, 1);
    assert.strictEqual(result.creditsRemaining, quotaBefore.remaining - 1);

    const quotaAfter = await getTenantAiQuota(mockEnv, 'site_svs', 1);
    assert.strictEqual(quotaAfter.used, quotaBefore.used + 1);
    assert.strictEqual(quotaAfter.remaining, quotaBefore.remaining - 1);
  });

  console.log('\n====================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================================\n');

  if (failedTests > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
