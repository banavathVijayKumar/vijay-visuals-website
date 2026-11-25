// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 14: ATOMIC AI CREDIT QUOTA REGRESSIONS
// Fully local: in-memory D1, mocked auth fetches, mocked AI providers.
// No .env, no remote D1, no real AI/email/WhatsApp/payment activity.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import {
  ensureAiUsageTable,
  executeWithAiCreditDeduction,
  getCurrentBillingPeriod,
  getTenantAiQuota,
} from '../functions/api/_aiCredits';
import { onRequestPost as generateAi } from '../functions/api/ai/generate';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

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

function createBarrier(expected: number): { arrive: () => Promise<void> } {
  let waiting = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    async arrive(): Promise<void> {
      waiting += 1;
      if (waiting >= expected) release();
      await gate;
    },
  };
}

/**
 * Holds every reservation INSERT until all concurrent callers have arrived.
 * This prevents timing luck from hiding a read-then-write quota race.
 */
function withReservationBarrier(base: D1Database, barrier: { arrive: () => Promise<void> }): D1Database {
  return {
    ...base,
    prepare(sql: string) {
      const statement = base.prepare(sql);
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound.map((v) => (v === undefined ? null : v));
          return this;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          return (statement.bind(...values) as any).first(colName);
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          return (statement.bind(...values) as any).all();
        },
        async run() {
          if (sql.includes('INSERT INTO tenant_ai_usage')) await barrier.arrive();
          return (statement.bind(...values) as any).run();
        },
      } as any;
    },
    exec: async (sql: string) => {
      if (!base.exec) throw new Error('D1 exec unavailable');
      return base.exec(sql);
    },
  } as D1Database;
}

function withFailingReservation(base: D1Database): D1Database {
  return {
    ...base,
    prepare(sql: string) {
      const statement = base.prepare(sql);
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound.map((v) => (v === undefined ? null : v));
          return this;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          return (statement.bind(...values) as any).first(colName);
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          return (statement.bind(...values) as any).all();
        },
        async run() {
          if (sql.includes('INSERT INTO tenant_ai_usage')) {
            throw new Error('D1 reservation write unavailable');
          }
          return (statement.bind(...values) as any).run();
        },
      } as any;
    },
    exec: async (sql: string) => {
      if (!base.exec) throw new Error('D1 exec unavailable');
      return base.exec(sql);
    },
  } as D1Database;
}

function seedTenant(
  db: DatabaseSync,
  opts: {
    websiteId: string;
    slug: string;
    ownerId?: string;
    credits: number;
    expired?: boolean;
    status?: string;
    websiteJson?: string;
  }
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
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    opts.websiteId,
    opts.ownerId || 'auth-owner',
    opts.slug,
    'Atomic Quota Tenant',
    opts.websiteJson || '{"planTier":"business-website"}',
    opts.status || 'published'
  );

  const periodEndSql = opts.expired ? "datetime('now', '-1 day')" : "datetime('now', '+30 days')";
  db.prepare(
    `INSERT INTO tenant_subscriptions
      (website_id, owner_id, plan_code, status, current_period_end)
     VALUES (?, ?, ?, ?, ${periodEndSql})`
  ).run(opts.websiteId, opts.ownerId || 'auth-owner', planCode, opts.status || 'active');

  return Number(
    (db.prepare('SELECT rowid AS id FROM customer_website_publications WHERE website_id = ?').get(opts.websiteId) as any).id
  );
}

async function seedUsage(
  d1: D1Database,
  opts: {
    id: string;
    websiteId: string;
    tenantRowId: number;
    userId: string;
    requestId: string;
    credits: number;
    billingPeriod?: string;
  }
): Promise<void> {
  await ensureAiUsageTable(d1);
  await d1
    .prepare(
      `INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status, idempotency_scope, created_at
       ) VALUES (?, ?, ?, ?, 'seed', ?, 'gemini', 'local', ?, ?, 'success', 'seed', datetime('now'))`
    )
    .bind(
      opts.id,
      opts.websiteId,
      opts.tenantRowId,
      opts.userId,
      opts.requestId,
      opts.credits,
      opts.billingPeriod || getCurrentBillingPeriod()
    )
    .run();
}

function makeEnv(d1: D1Database, extra: Record<string, unknown> = {}): CloudflareEnv {
  return {
    DB: d1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-local-test-key',
    ...extra,
  } as CloudflareEnv;
}

function makeContext(
  env: CloudflareEnv,
  body: unknown,
  token?: string,
  method = 'POST',
  params: Record<string, string> = {}
): PagesContext {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    request: new Request('https://preview.example.test/api/ai/generate', {
      method,
      headers,
      body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body ?? {}),
    }),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext;
}

function aiParams(
  websiteId: string,
  tenantRowId: number,
  requestId: string,
  executeAiCall: () => Promise<string>,
  overrides: Record<string, unknown> = {}
) {
  return {
    websiteId,
    tenantRowId,
    userId: `user_${websiteId}`,
    serviceSlug: 'priority-fix-14:test',
    requestId,
    creditsNeeded: 1,
    fallbackPlanTier: 'starter-website',
    executeAiCall,
    ...overrides,
  };
}

function previousBillingPeriod(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.includes('/auth/v1/user')) {
    const auth = new Headers(init?.headers || {}).get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const subject = token === 'token-owner' ? 'auth-owner' : token === 'token-other' ? 'auth-other' : '';
    if (!subject) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ id: subject, email: `${subject}@example.invalid` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(JSON.stringify([{ id: 'local', role: 'business_owner', full_name: 'Local Owner' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), { status: 500 });
}) as typeof fetch;

async function run(): Promise<void> {
  console.log('\n====================================================================');
  console.log('VIJAY VISUALS — PRIORITY FIX 14: ATOMIC AI QUOTA REGRESSIONS');
  console.log('====================================================================\n');

  await it('1. normal request within allowance succeeds', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-normal', slug: 'normal', credits: 3 });
    let providerCalls = 0;
    const result = await executeWithAiCreditDeduction(
      makeEnv(d1),
      aiParams('web-normal', rowId, 'normal-1', async () => {
        providerCalls++;
        return 'normal output';
      })
    );
    assert.equal(result.output, 'normal output');
    assert.equal(result.creditsUsed, 1);
    assert.equal(result.creditsRemaining, 2);
    assert.equal(providerCalls, 1);
    assert.equal(result.quota.allowance, 3);
  });

  await it('2. request exceeding allowance is rejected before provider call', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-exceed', slug: 'exceed', credits: 1 });
    let providerCalls = 0;
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-exceed', rowId, 'exceed-1', async () => {
          providerCalls++;
          return 'must not run';
        }, { creditsNeeded: 2 })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.status, 403);
    assert.equal(error?.code, 'AI_QUOTA_EXHAUSTED');
    assert.equal(providerCalls, 0);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-exceed', rowId);
    assert.equal(quota.used, 0);
  });

  await it('3. two simultaneous requests competing for the final credit cannot both consume it', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-final', slug: 'final', credits: 1 });
    const barrier = createBarrier(2);
    const racyD1 = withReservationBarrier(d1, barrier);
    let providerCalls = 0;
    const tasks = [1, 2].map((n) =>
      executeWithAiCreditDeduction(
        makeEnv(racyD1),
        aiParams('web-final', rowId, `final-${n}`, async () => {
          providerCalls++;
          return `output-${n}`;
        })
      )
    );
    const settled = await Promise.allSettled(tasks);
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
    assert.equal(settled.filter((s) => s.status === 'rejected').length, 1);
    const rejection = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rejection.reason as any)?.code, 'AI_QUOTA_EXHAUSTED');
    assert.equal(providerCalls, 1);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-final', rowId);
    assert.equal(quota.used, 1);
    assert.equal(quota.remaining, 0);
  });

  await it('4. many simultaneous requests cannot exceed monthly quota', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-many', slug: 'many', credits: 5 });
    const barrier = createBarrier(12);
    const racyD1 = withReservationBarrier(d1, barrier);
    let providerCalls = 0;
    const tasks = Array.from({ length: 12 }, (_, idx) =>
      executeWithAiCreditDeduction(
        makeEnv(racyD1),
        aiParams('web-many', rowId, `many-${idx}`, async () => {
          providerCalls++;
          return `output-${idx}`;
        })
      )
    );
    const settled = await Promise.allSettled(tasks);
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 5);
    assert.equal(settled.filter((s) => s.status === 'rejected').length, 7);
    assert.equal(providerCalls, 5);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-many', rowId);
    assert.equal(quota.used, 5);
    assert.equal(quota.remaining, 0);
  });

  await it('5. requests with different IDs cannot bypass quota sequentially', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-distinct', slug: 'distinct', credits: 2 });
    let providerCalls = 0;
    for (const id of ['distinct-1', 'distinct-2']) {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-distinct', rowId, id, async () => {
          providerCalls++;
          return id;
        })
      );
    }
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-distinct', rowId, 'distinct-3', async () => {
          providerCalls++;
          return 'must not run';
        })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.code, 'AI_QUOTA_EXHAUSTED');
    assert.equal(providerCalls, 2);
  });

  await it('6. duplicate same request ID does not double-charge', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-duplicate', slug: 'duplicate', credits: 4 });
    let providerCalls = 0;
    const call = () =>
      executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-duplicate', rowId, 'duplicate-1', async () => {
          providerCalls++;
          return 'cached output';
        })
      );
    const first = await call();
    const second = await call();
    assert.equal(first.creditsUsed, 1);
    assert.equal(second.creditsUsed, 0);
    assert.equal(second.isDuplicate, true);
    assert.equal(second.output, 'cached output');
    assert.equal(providerCalls, 1);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-duplicate', rowId);
    assert.equal(quota.used, 1);
  });

  await it("7. replay across tenants cannot reuse another tenant's response or reservation", async () => {
    const { db, d1 } = createD1();
    const rowA = seedTenant(db, { websiteId: 'web-replay-a', slug: 'replay-a', credits: 4, ownerId: 'auth-owner' });
    const rowB = seedTenant(db, { websiteId: 'web-replay-b', slug: 'replay-b', credits: 4, ownerId: 'auth-other' });
    let providerCalls = 0;
    const first = await executeWithAiCreditDeduction(
      makeEnv(d1),
      aiParams('web-replay-a', rowA, 'shared-replay-id', async () => {
        providerCalls++;
        return 'tenant A output';
      }, { userId: 'auth-owner' })
    );
    assert.equal(first.output, 'tenant A output');
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-replay-b', rowB, 'shared-replay-id', async () => {
          providerCalls++;
          return 'must not run';
        }, { userId: 'auth-other' })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.status, 409);
    assert.equal(providerCalls, 1);
    const quotaB = await getTenantAiQuota(makeEnv(d1), 'web-replay-b', rowB);
    assert.equal(quotaB.used, 0);
  });

  await it('8. subscription allowance works correctly', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-subscription', slug: 'subscription', credits: 7 });
    const result = await executeWithAiCreditDeduction(
      makeEnv(d1),
      aiParams('web-subscription', rowId, 'subscription-1', async () => 'ok')
    );
    assert.equal(result.quota.allowance, 7);
    assert.equal(result.quota.planCode, 'plan_web_subscription');
    assert.equal(result.creditsRemaining, 6);
  });

  await it('9. purchased plan monthly credits are enforced exactly', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-purchased', slug: 'purchased', credits: 10 });
    let providerCalls = 0;
    for (let i = 0; i < 10; i++) {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-purchased', rowId, `purchased-${i}`, async () => {
          providerCalls++;
          return 'ok';
        })
      );
    }
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-purchased', rowId, 'purchased-11', async () => {
          providerCalls++;
          return 'must not run';
        })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.code, 'AI_QUOTA_EXHAUSTED');
    assert.equal(providerCalls, 10);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-purchased', rowId);
    assert.equal(quota.used, 10);
  });

  await it('10. expired entitlement is not incorrectly counted', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, {
      websiteId: 'web-expired',
      slug: 'expired',
      credits: 500,
      expired: true,
      websiteJson: '{"planTier":"starter-website"}',
    });
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-expired', rowId, 'starter-website');
    assert.equal(quota.allowance, 25);
    for (let i = 0; i < 25; i++) {
      await seedUsage(d1, {
        id: `expired_seed_${i}`,
        websiteId: 'web-expired',
        tenantRowId: rowId,
        userId: 'user_web-expired',
        requestId: `expired-seed-${i}`,
        credits: 1,
      });
    }
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(d1),
        aiParams('web-expired', rowId, 'expired-call', async () => 'must not run', {
          fallbackPlanTier: 'starter-website',
        })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.code, 'AI_QUOTA_EXHAUSTED');
  });

  await it('11. invalid tenant cannot reserve credits', async () => {
    const { d1 } = createD1();
    const response = await generateAi(
      makeContext(makeEnv(d1), { tenantId: 'missing-tenant', prompt: 'test' }, 'token-owner')
    );
    const payload = await readJson(response);
    assert.equal(response.status, 404);
    assert.match(String(payload?.error || payload), /not found/i);
    const rows = (await d1.prepare('SELECT id FROM tenant_ai_usage').all()).results;
    assert.equal(rows.length, 0);
  });

  await it('12. unauthorized cross-tenant request cannot reserve credits', async () => {
    const { db, d1 } = createD1();
    seedTenant(db, { websiteId: 'web-owner-only', slug: 'owner-only', credits: 5, ownerId: 'auth-owner' });
    const response = await generateAi(
      makeContext(makeEnv(d1), { tenantId: 'web-owner-only', prompt: 'test' }, 'token-other')
    );
    assert.equal(response.status, 403);
    const rows = (await d1.prepare('SELECT id FROM tenant_ai_usage').all()).results;
    assert.equal(rows.length, 0);
  });

  await it('13. database reservation failure does not call AI provider', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-ledger-fail', slug: 'ledger-fail', credits: 5 });
    const failingD1 = withFailingReservation(d1);
    let providerCalls = 0;
    let error: any = null;
    try {
      await executeWithAiCreditDeduction(
        makeEnv(failingD1),
        aiParams('web-ledger-fail', rowId, 'ledger-fail-1', async () => {
          providerCalls++;
          return 'must not run';
        })
      );
    } catch (err) {
      error = err;
    }
    assert.equal(error?.status, 503);
    assert.equal(error?.code, 'AI_LEDGER_UNAVAILABLE');
    assert.equal(providerCalls, 0);
  });

  await it('14. provider failure and retry do not double-charge', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-provider-fail', slug: 'provider-fail', credits: 3 });
    let providerCalls = 0;
    const env = makeEnv(d1);
    let firstError: any = null;
    try {
      await executeWithAiCreditDeduction(
        env,
        aiParams('web-provider-fail', rowId, 'provider-fail-1', async () => {
          providerCalls++;
          throw new Error('provider unavailable');
        })
      );
    } catch (err) {
      firstError = err;
    }
    assert.equal(firstError?.message, 'provider unavailable');
    let quota = await getTenantAiQuota(env, 'web-provider-fail', rowId);
    assert.equal(quota.used, 0);

    let replayError: any = null;
    try {
      await executeWithAiCreditDeduction(
        env,
        aiParams('web-provider-fail', rowId, 'provider-fail-1', async () => {
          providerCalls++;
          return 'must not run';
        })
      );
    } catch (err) {
      replayError = err;
    }
    assert.equal(replayError?.status, 409);
    assert.equal(providerCalls, 1);

    const retry = await executeWithAiCreditDeduction(
      env,
      aiParams('web-provider-fail', rowId, 'provider-fail-2', async () => {
        providerCalls++;
        return 'retry succeeded';
      })
    );
    assert.equal(retry.output, 'retry succeeded');
    assert.equal(retry.creditsUsed, 1);
    assert.equal(providerCalls, 2);
    quota = await getTenantAiQuota(env, 'web-provider-fail', rowId);
    assert.equal(quota.used, 1);
  });

  await it('15. monthly period boundary behavior is correct', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-period', slug: 'period', credits: 1 });
    await seedUsage(d1, {
      id: 'previous_period_usage',
      websiteId: 'web-period',
      tenantRowId: rowId,
      userId: 'user_web-period',
      requestId: 'previous-period-request',
      credits: 25,
      billingPeriod: previousBillingPeriod(),
    });
    const result = await executeWithAiCreditDeduction(
      makeEnv(d1),
      aiParams('web-period', rowId, 'current-period-request', async () => 'current month output')
    );
    assert.equal(result.output, 'current month output');
    assert.equal(result.creditsUsed, 1);
    const quota = await getTenantAiQuota(makeEnv(d1), 'web-period', rowId);
    assert.equal(quota.used, 1);
    assert.equal(quota.billingPeriod, getCurrentBillingPeriod());
  });

  await it('16. existing quota and credit accounting helpers remain compatible', async () => {
    const { db, d1 } = createD1();
    const rowId = seedTenant(db, { websiteId: 'web-compat', slug: 'compat', credits: 4 });
    const env = makeEnv(d1);
    await executeWithAiCreditDeduction(env, aiParams('web-compat', rowId, 'compat-1', async () => 'one'));
    await executeWithAiCreditDeduction(env, aiParams('web-compat', rowId, 'compat-1', async () => 'one'));
    try {
      await executeWithAiCreditDeduction(env, aiParams('web-compat', rowId, 'compat-fail', async () => {
        throw new Error('failed provider');
      }));
    } catch {
      // Expected provider failure; must not be charged.
    }
    const quota = await getTenantAiQuota(env, 'web-compat', rowId);
    assert.equal(quota.allowance, 4);
    assert.equal(quota.used, 1);
    assert.equal(quota.remaining, 3);
    const sum = (await d1
      .prepare(
        `SELECT COALESCE(SUM(credits_deducted), 0) AS total
         FROM tenant_ai_usage
         WHERE website_id = ? AND billing_period = ?`
      )
      .bind('web-compat', getCurrentBillingPeriod())
      .first<{ total: number }>())?.total;
    assert.equal(Number(sum), quota.used);
  });

  globalThis.fetch = originalFetch;
  console.log('\n====================================================================');
  console.log(`PRIORITY FIX 14 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  globalThis.fetch = originalFetch;
  console.error('Fatal test error:', err);
  process.exit(1);
});
