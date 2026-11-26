// ============================================================================
// VIJAY VISUALS — LAUNCH BLOCKER SECURITY REGRESSIONS
// Fully local: in-memory D1, mocked Supabase/Gemini fetches. No secrets, no
// remote services, no payments, and no deployment actions.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import {
  applyCorsHeaders,
  checkRateLimit,
  handleOptions,
  rateLimitResponse,
  CloudflareEnv,
  D1Database,
  PagesContext,
} from '../functions/api/_shared';
import {
  ensureAiUsageTable,
  executeWithAiCreditDeduction,
  getCurrentBillingPeriod,
  getTenantAiQuota,
} from '../functions/api/_aiCredits';
import { onRequestPost as setupAssistant } from '../functions/api/ai/setup-assistant';
import { onRequestGet as aiDiagnostic } from '../functions/api/ai/diagnostic';
import { onRequestPost as platformPayments } from '../functions/api/platform/payments';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }

  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      const statement = {
        bind(...bound: any[]) {
          values = bound.map((v) => (v === undefined ? null : v));
          return this;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          const row = db.prepare(sql).get(...values) as any;
          if (!row) return null;
          return colName ? (row[colName] as T) : (row as T);
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          return { results: db.prepare(sql).all(...values) as T[], success: true };
        },
        async run(): Promise<{ success: boolean; meta: any }> {
          const info = db.prepare(sql).run(...values);
          return { success: true, meta: { last_row_id: info.lastInsertRowid, changes: info.changes } };
        },
      };
      return statement as any;
    },
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
  } as D1Database;
  return { db, d1 };
}

function makeEnv(d1?: D1Database, extra: Record<string, unknown> = {}): CloudflareEnv {
  return {
    ...(d1 ? { DB: d1 } : {}),
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    GEMINI_API_KEY: 'local-gemini-key',
    GEMINI_MODEL: 'test-model',
    ...extra,
  } as CloudflareEnv;
}

function makeContext(
  env: CloudflareEnv,
  body: unknown,
  token?: string,
  method = 'POST',
  headers: Record<string, string> = {}
): PagesContext {
  const allHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) allHeaders.Authorization = `Bearer ${token}`;
  return {
    request: new Request('https://vijay-visuals-site.pages.dev/api/security-test', {
      method,
      headers: allHeaders,
      body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body ?? {}),
    }),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let geminiCalls = 0;

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const headers = new Headers(init?.headers || {});

  if (url.includes('/auth/v1/user')) {
    const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const subject =
      token === 'token-owner'
        ? 'auth-owner'
        : token === 'token-other'
          ? 'auth-other'
          : token === 'token-staff'
            ? 'auth-staff'
            : '';
    if (!subject) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ id: subject, email: `${subject}@example.invalid` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/rest/v1/profiles')) {
    const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const role = token === 'token-staff' ? 'platform_staff' : 'business_owner';
    return new Response(JSON.stringify([{ id: 'local', role, full_name: 'Local Test User' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.endsWith('/v1beta/models') && !url.includes(':generateContent')) {
    return new Response(
      JSON.stringify({ models: [{ name: 'models/test-model', supportedGenerationMethods: ['generateContent'] }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.includes(':generateContent')) {
    geminiCalls++;
    const draft = {
      name: 'Test Business',
      slug: 'test-business',
      category: 'retail',
      tagline: 'A local test business',
      description: 'Generated by the local regression mock.',
    };
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(draft) }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.includes('generativelanguage.googleapis.com')) {
    return new Response(JSON.stringify({ error: { message: 'Unexpected Gemini request' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

function seedTenant(
  db: DatabaseSync,
  opts: { websiteId: string; slug: string; ownerId: string; credits: number }
): number {
  const planCode = `plan_${opts.websiteId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  db.prepare(
    `INSERT OR REPLACE INTO subscription_plans
      (code, name, monthly_price_inr, yearly_price_inr, monthly_ai_credits)
     VALUES (?, ?, 0, 0, ?)`
  ).run(planCode, `${planCode} Plan`, opts.credits);

  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, 'published')`
  ).run(
    opts.websiteId,
    opts.ownerId,
    opts.slug,
    'Security Test Tenant',
    JSON.stringify({ planTier: 'starter-website' })
  );

  db.prepare(
    `INSERT INTO tenant_subscriptions
      (website_id, owner_id, plan_code, status, current_period_end)
     VALUES (?, ?, ?, 'active', datetime('now', '+30 days'))`
  ).run(opts.websiteId, opts.ownerId, planCode);

  return Number(
    (db.prepare('SELECT rowid AS id FROM customer_website_publications WHERE website_id = ?').get(opts.websiteId) as any).id
  );
}

async function run(): Promise<void> {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — LAUNCH BLOCKER SECURITY REGRESSIONS');
  console.log('====================================================================\n');

  await it('1. CORS reflects only exact allowed origins and never wildcard', async () => {
    const env = makeEnv(undefined, { APP_URL: 'https://app.example.test/' });
    const request = (origin: string) =>
      new Request('https://vijay-visuals-site.pages.dev/api/health', { headers: { Origin: origin } });
    const response = new Response('{}', { status: 200 });

    const allowedProd = applyCorsHeaders(
      request('https://vijay-visuals-site.pages.dev'),
      response.clone(),
      env
    );
    assert.equal(allowedProd.headers.get('Access-Control-Allow-Origin'), 'https://vijay-visuals-site.pages.dev');
    assert.equal((allowedProd.headers.get('Vary') || '').toLowerCase(), 'origin');

    const allowedApp = applyCorsHeaders(request('https://app.example.test'), response.clone(), env);
    assert.equal(allowedApp.headers.get('Access-Control-Allow-Origin'), 'https://app.example.test');

    const denied = applyCorsHeaders(request('https://evil.example.test'), response.clone(), env);
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);

    // Pages can generate 404/405 responses with a platform wildcard. The edge
    // wrapper must remove it even when the browser sends no Origin header.
    const wildcardResponse = new Response('', { status: 405 });
    wildcardResponse.headers.set('Access-Control-Allow-Origin', '*');
    const noOrigin = applyCorsHeaders(
      new Request('https://vijay-visuals-site.pages.dev/api/ai/diagnostic', { method: 'POST' }),
      wildcardResponse,
      env
    );
    assert.equal(noOrigin.status, 405);
    assert.equal(noOrigin.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(noOrigin.headers.get('Access-Control-Allow-Credentials'), null);
    assert.equal((noOrigin.headers.get('Vary') || '').toLowerCase(), 'origin');

    assert.equal(handleOptions().headers.get('Access-Control-Allow-Origin'), null);
    assert.notEqual(handleOptions().headers.get('Access-Control-Allow-Origin'), '*');
  });

  await it('2. rate limiting fails closed when D1 is unavailable', async () => {
    const rl = await checkRateLimit(makeEnv(), 'test:scope', 10, 3600);
    assert.equal(rl.allowed, false);
    assert.equal(rl.unavailable, true);
    const response = rateLimitResponse(rl, 'Too many requests.');
    assert.equal(response.status, 503);
    const body = await readJson(response);
    assert.equal(body.code, 'RATE_LIMIT_UNAVAILABLE');
  });

  await it('3. D1 query failures fail closed rather than allowing the request', async () => {
    const brokenDb = {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            throw new Error('D1 unavailable');
          },
          async all() {
            throw new Error('D1 unavailable');
          },
          async run() {
            throw new Error('D1 unavailable');
          },
        };
      },
    } as unknown as D1Database;
    const rl = await checkRateLimit(makeEnv(brokenDb), 'test:scope', 10, 3600);
    assert.equal(rl.allowed, false);
    assert.equal(rl.unavailable, true);
  });

  await it('4. executeWithAiCreditDeduction never calls the provider without D1', async () => {
    let providerCalls = 0;
    await assert.rejects(
      () =>
        executeWithAiCreditDeduction(makeEnv(), {
          websiteId: 'no-d1-site',
          tenantRowId: 1,
          userId: 'auth-owner',
          serviceSlug: 'security-test',
          requestId: 'no-d1-request',
          creditsNeeded: 1,
          fallbackPlanTier: 'starter-website',
          promptSnippet: 'must not run',
          executeAiCall: async () => {
            providerCalls++;
            return 'must not run';
          },
        }),
      (err: any) => err?.code === 'AI_LEDGER_UNAVAILABLE'
    );
    assert.equal(providerCalls, 0);
  });

  await it('5. long-running reservations remain counted (no two-minute undercount)', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, {
      websiteId: 'web-timeout',
      slug: 'web-timeout',
      ownerId: 'auth-owner',
      credits: 2,
    });
    await ensureAiUsageTable(d1);
    db.prepare(
      `INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status, idempotency_scope, created_at
       ) VALUES (?, ?, ?, ?, 'security-test', ?, 'gemini', 'test-model', 1, ?, 'reserved', 'security-test',
                 datetime('now', '-30 minutes'))`
    ).run(
      'old_reservation',
      'web-timeout',
      rowId,
      'auth-owner',
      'long-running-request',
      getCurrentBillingPeriod()
    );

    const quota = await getTenantAiQuota(makeEnv(d1), 'web-timeout', rowId, 'starter-website');
    assert.equal(quota.used, 1);
    assert.equal(quota.remaining, 1);
    assert.equal(quota.isExhausted, false);
  });

  await it('6. Setup Assistant rejects a cross-tenant caller before any provider call', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, {
      websiteId: 'web-setup',
      slug: 'web-setup',
      ownerId: 'auth-owner',
      credits: 3,
    });
    const callsBefore = geminiCalls;
    const response = await setupAssistant(
      makeContext(makeEnv(d1), {
        businessBrief: 'Create a website for my retail shop in Chennai',
        tenantId: String(rowId),
        requestId: 'setup-cross-tenant',
      }, 'token-other')
    );
    assert.equal(response.status, 403);
    assert.equal(geminiCalls, callsBefore);
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM tenant_ai_usage WHERE request_id = ?')
      .get('setup-cross-tenant') as any;
    assert.equal(row.count, 0);
  });

  await it('7. authorized Setup Assistant charges exactly one D1 credit', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, {
      websiteId: 'web-setup-ok',
      slug: 'web-setup-ok',
      ownerId: 'auth-owner',
      credits: 3,
    });
    const callsBefore = geminiCalls;
    const response = await setupAssistant(
      makeContext(makeEnv(d1), {
        businessBrief: 'Create a website for my retail shop in Chennai',
        tenantId: String(rowId),
        requestId: 'setup-authorized',
      }, 'token-owner')
    );
    assert.equal(response.status, 200);
    assert.equal(geminiCalls, callsBefore + 1);
    const body = await readJson(response);
    assert.equal(body.draft.name, 'Test Business');
    assert.equal(body.creditsUsed, 1);

    const usage = db
      .prepare('SELECT status, credits_deducted FROM tenant_ai_usage WHERE request_id = ?')
      .get('setup-authorized') as any;
    assert.equal(usage.status, 'success');
    assert.equal(usage.credits_deducted, 1);

    const quota = await getTenantAiQuota(makeEnv(d1), 'web-setup-ok', rowId, 'starter-website');
    assert.equal(quota.used, 1);
  });

  await it('8. AI Diagnostic rejects unauthenticated and non-staff callers', async () => {
    const env = makeEnv();
    const anonymous = await aiDiagnostic(makeContext(env, {}, undefined, 'GET'));
    assert.equal(anonymous.status, 401);

    const customer = await aiDiagnostic(makeContext(env, {}, 'token-owner', 'GET'));
    assert.equal(customer.status, 403);
  });

  await it('9. staff-only AI Diagnostic still fails closed when rate limiting is unavailable', async () => {
    const response = await aiDiagnostic(makeContext(makeEnv(), {}, 'token-staff', 'GET'));
    assert.equal(response.status, 503);
    const body = await readJson(response);
    assert.equal(body.code, 'RATE_LIMIT_UNAVAILABLE');
  });

  await it('10. Pages Razorpay webhook is retired and writes no payment records', async () => {
    const { db, d1 } = createD1();
    const response = await platformPayments(
      makeContext(
        makeEnv(d1),
        { action: 'razorpay_webhook', event: 'payment.captured', referenceId: 'order-xyz' },
        undefined,
        'POST',
        { 'X-Razorpay-Signature': 'forged-signature' }
      )
    );
    assert.equal(response.status, 410);
    const body = await readJson(response);
    assert.match(String(body.error), /decommissioned/i);
    const count = db.prepare('SELECT COUNT(*) AS count FROM payment_webhook_events').get() as any;
    assert.equal(count.count, 0);
  });

  console.log(`\nPassed: ${passed}  Failed: ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
