// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 13 LOCAL REGRESSION SUITE
// Endpoint/component-level checks for reset redirects, AI tenant authorization,
// tracking privacy, validated storefront URLs, white-label metadata, and the
// real Cashfree store-order notification branch.
// Fully local: in-memory D1 and mocked provider fetches. No .env, no remote DB,
// no real email/WhatsApp/payment, no Supabase project changes.
// ============================================================================

import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import { applyStorefrontMetadata } from '../src/lib/storefrontMetadata';
import {
  loadPasswordResetHourlyBlock,
  remainingPasswordResetHourlyBlockSeconds,
  requestPasswordReset,
  savePasswordResetHourlyBlock,
} from '../src/lib/authRecovery';
import {
  authorizePasswordResetRequest,
  MAX_PASSWORD_RESET_REQUESTS_PER_HOUR,
} from '../functions/api/auth/_passwordResetRateLimit';
import { onRequestPost as resetRequestEndpoint } from '../functions/api/auth/password/reset-request';
import { onRequestPost as generateAi } from '../functions/api/ai/generate';
import { onRequestPost as contentStudioAi } from '../functions/api/ai/content-studio';
import { onRequestPost as seoAssistantAi } from '../functions/api/ai/seo-assistant';
import {
  ensureAiUsageTable,
  executeWithAiCreditDeduction,
  getCurrentBillingPeriod,
  getTenantAiQuota,
} from '../functions/api/_aiCredits';
import { resolveTenantPublicUrl } from '../functions/api/_tenantUrl';
import { onRequestGet as trackOrder } from '../functions/api/orders/track/[orderNumber]';
import {
  onRequestGet as platformNotificationsGet,
  onRequestPost as platformNotifications,
} from '../functions/api/platform/notifications';
import { onRequestPost as cashfreeWebhook } from '../functions/api/webhooks/cashfree';
import { onRequest as tenantMiddleware } from '../functions/_middleware';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';
import { buildPublicTrackingResponse } from '../src/lib/publicTracking';

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
      return {
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
    },
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
  };
  return { db, d1 };
}

/** Delays only the rate-limit write so every concurrent caller reaches the same row state. */
function createRacyResetD1(base: D1Database): D1Database {
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
          return statement.bind(...values).first<T>(colName as never);
        },
        async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
          return statement.bind(...values).all<T>();
        },
        async run() {
          if (sql.includes('INSERT INTO password_reset_rate_limits')) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
          return statement.bind(...values).run();
        },
      };
    },
    exec: async (sql: string) => {
      await base.exec?.(sql);
    },
  } as D1Database;
}

function makeContext<P extends Record<string, string> = Record<string, string>>(
  env: CloudflareEnv,
  body: unknown,
  token?: string,
  method = 'POST',
  params: P = {} as P,
  url = 'https://preview.example.test/api/test',
  extraHeaders: Record<string, string> = {}
): PagesContext<P> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    request: new Request(url, {
      method,
      headers,
      body: method === 'GET' || method === 'OPTIONS' ? undefined : JSON.stringify(body ?? {}),
    }),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  };
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function seedPublication(
  db: DatabaseSync,
  opts: {
    websiteId: string;
    slug: string;
    ownerId?: string;
    businessName?: string;
    status?: string;
    websiteJson?: string;
  }
): number {
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    opts.websiteId,
    opts.ownerId || 'auth-owner',
    opts.slug,
    opts.businessName || 'Tenant A',
    opts.websiteJson || '{"planTier":"business-website"}',
    opts.status || 'published'
  );
  return Number(
    (db.prepare('SELECT rowid AS id FROM customer_website_publications WHERE website_id = ?').get(opts.websiteId) as any).id
  );
}

function seedVerifiedDomain(
  db: DatabaseSync,
  websiteId: string,
  domain: string,
  overrides: Record<string, string> = {}
): void {
  db.prepare(
    `INSERT INTO tenant_domains
      (website_id, owner_id, domain_name, status, dns_verification_status, ssl_status, verification_token, is_primary, www_mode, www_status)
     VALUES (?, 'auth-owner', ?, ?, ?, ?, 'local-verification-token', 1, ?, ?)`
  ).run(
    websiteId,
    domain,
    overrides.status || 'live',
    overrides.dns_verification_status || 'verified',
    overrides.ssl_status || 'active',
    overrides.www_mode || 'redirect_to_root',
    overrides.www_status || 'not_configured'
  );
}

const originalFetch = globalThis.fetch;
let resendPayload: any = null;
let whatsappPayload: any = null;
let recoverCalls: Array<{ email: string; redirectTo: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (url.includes('/auth/v1/recover')) {
    const payload = JSON.parse(String(init?.body || '{}')) as { email?: string; redirect_to?: string };
    recoverCalls.push({ email: payload.email || '', redirectTo: payload.redirect_to || '' });
    return new Response('{}', { status: 200 });
  }
  if (url.includes('/auth/v1/user')) {
    const auth = new Headers(init?.headers || {}).get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const subject =
      token === 'token-owner'
        ? 'auth-owner'
        : token === 'token-other'
          ? 'auth-other'
          : token === 'token-customer'
            ? 'auth-customer'
            : token === 'token-admin'
              ? 'auth-admin'
              : '';
    if (!subject) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ id: subject, email: `${subject}@example.invalid` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/rest/v1/profiles')) {
    const auth = new Headers(init?.headers || {}).get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const role =
      token === 'token-admin'
        ? 'super_admin'
        : token === 'token-customer'
          ? 'customer'
          : 'business_owner';
    return new Response(JSON.stringify([{ id: token, role, full_name: 'Local Test User' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('api.resend.com/emails')) {
    resendPayload = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ id: 'local_resend_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('graph.facebook.com')) {
    whatsappPayload = { url, body: JSON.parse(String(init?.body || '{}')) };
    return new Response(JSON.stringify({ messages: [{ id: 'local_wa_id' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

function coreEnv(d1: D1Database, extra: Record<string, unknown> = {}): CloudflareEnv {
  return {
    DB: d1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-local-test-key',
    ...extra,
  } as CloudflareEnv;
}

// ---------------------------------------------------------------------------
// A. Password reset boundary
// ---------------------------------------------------------------------------
async function runPasswordResetBoundaryTests(): Promise<void> {
  console.log('\nA. Password reset redirect/configuration boundary');

  await it('client redirect value is not even sent to the first-party endpoint', async () => {
    recoverCalls = [];
    const { d1 } = createD1();
    const env = coreEnv(d1, { PASSWORD_RESET_ALLOWED_ORIGINS: 'https://preview.example.test' });
    let capturedBody: any = null;
    const result = await requestPasswordReset(
      null,
      'owner@example.invalid',
      'https://attacker.example.test/callback?next=admin',
      async (input, init) => {
        assert.equal(input, '/api/auth/password/reset-request');
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return resetRequestEndpoint(makeContext(env, capturedBody, undefined, 'POST'));
      }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(capturedBody).sort(), ['email']);
    assert.equal(recoverCalls.length, 1);
    assert.equal(recoverCalls[0].redirectTo, 'https://preview.example.test/');
  });

  await it('missing allowlist fails closed without consuming quota or calling Supabase', async () => {
    recoverCalls = [];
    const { db, d1 } = createD1();
    const env = coreEnv(d1);
    const result = await requestPasswordReset(
      null,
      'no-allowlist@example.invalid',
      'https://attacker.example.test',
      async (_input, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        return resetRequestEndpoint(makeContext(env, body, undefined, 'POST'));
      }
    );
    assert.equal(result.ok, false);
    assert.equal(recoverCalls.length, 0);
    assert.equal(
      Number(db.prepare('SELECT COUNT(*) AS n FROM password_reset_rate_limits').get()?.n || 0),
      0
    );
  });

  await it('missing rate-limit table fails closed as unavailable', async () => {
    recoverCalls = [];
    const brokenD1 = {
      prepare() {
        throw new Error('no such table: password_reset_rate_limits');
      },
    } as unknown as D1Database;
    const env = coreEnv(brokenD1, { PASSWORD_RESET_ALLOWED_ORIGINS: 'https://preview.example.test' });
    const response = await resetRequestEndpoint(
      makeContext(env, { email: 'missing-table@example.invalid' }, undefined, 'POST')
    );
    const body = await readJson(response);
    assert.equal(response.status, 503);
    assert.equal(body.code, 'RATE_LIMIT_UNAVAILABLE');
    assert.equal(recoverCalls.length, 0);
  });

  await it('hourly block countdown uses the real server window end', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return values.has(key) ? values.get(key)! : null;
      },
      setItem(key: string, value: string) {
        values.set(key, String(value));
      },
    };
    const now = 1_800_000_000_000;
    const blockedUntil = now + 37 * 60 * 1000;
    savePasswordResetHourlyBlock(blockedUntil, storage);
    assert.equal(loadPasswordResetHourlyBlock(storage, now), blockedUntil);
    assert.equal(remainingPasswordResetHourlyBlockSeconds(loadPasswordResetHourlyBlock(storage, now), now), 2220);
    assert.equal(loadPasswordResetHourlyBlock(storage, blockedUntil + 1), null);
  });

  await it('secret-free store still enforces the atomic hourly maximum', async () => {
    const { db, d1 } = createD1();
    const env = coreEnv(d1);
    const email = 'hash-only@example.invalid';
    const now = 1_900_000_000_000;
    for (let i = 0; i < MAX_PASSWORD_RESET_REQUESTS_PER_HOUR; i++) {
      const allowed = await authorizePasswordResetRequest(env, email, now + i * 61_000);
      assert.equal(allowed.allowed, true);
    }
    const blocked = await authorizePasswordResetRequest(
      env,
      email,
      now + MAX_PASSWORD_RESET_REQUESTS_PER_HOUR * 61_000
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.code, 'HOURLY_LIMIT');
    assert.ok((blocked.remainingSeconds || 0) > 0);
    const row = db.prepare('SELECT email_hash FROM password_reset_rate_limits LIMIT 1').get() as any;
    assert.equal(row.email_hash.length, 64);
    assert.equal(row.email_hash.includes('hash-only'), false);
  });

  await it('concurrent requests share one conditional UPSERT and only one is allowed', async () => {
    const { d1 } = createD1();
    const env = coreEnv(createRacyResetD1(d1));
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => authorizePasswordResetRequest(env, 'race@example.invalid', now))
    );
    assert.equal(results.filter((r) => r.allowed).length, 1);
    assert.equal(results.filter((r) => !r.allowed && r.code === 'COOLDOWN').length, 4);
  });

  await it('non-loopback HTTP callback origins are rejected before consuming quota', async () => {
    recoverCalls = [];
    const { d1, db } = createD1();
    const env = coreEnv(d1, {
      PASSWORD_RESET_ALLOWED_ORIGINS: 'http://insecure.example.test',
    });
    const response = await resetRequestEndpoint(
      makeContext(env, { email: 'owner@example.invalid' }, undefined, 'POST')
    );
    assert.equal(response.status, 503);
    assert.equal(recoverCalls.length, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM password_reset_rate_limits').get() as any).n, 0);
  });

  await it('documentation states the direct GoTrue limitation honestly', async () => {
    const doc = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'PASSWORD_RESET_SECURITY.md'), 'utf8');
    assert.match(doc, /does \*\*not\*\* enforce/i);
    assert.match(doc, /GoTrue `?\/auth\/v1\/recover`? directly/i);
    assert.match(doc, /provider-side protection is still required/i);
    assert.match(doc, /PASSWORD_RESET_ALLOWED_ORIGINS/i);
  });
}

// ---------------------------------------------------------------------------
// B. AI tenant authorization
// ---------------------------------------------------------------------------
async function runAiAuthorizationTests(): Promise<void> {
  console.log('\nB. AI tenant authorization and quota isolation');

  const handlerFor = (kind: 'generate' | 'content') =>
    kind === 'generate' ? generateAi : contentStudioAi;
  const bodyFor = (kind: 'generate' | 'content', overrides: Record<string, unknown> = {}) =>
    kind === 'generate'
      ? { tenantId: 'web-ai', prompt: 'Write a short product description', ...overrides }
      : { tenantId: 'web-ai', mode: 'seo_metadata', topic: 'handmade jewelry', ...overrides };

  for (const kind of ['generate', 'content'] as const) {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-ai',
      slug: 'ai-store',
      ownerId: 'auth-owner',
      businessName: 'Tenant A',
      websiteJson: '{"planTier":"starter-website"}',
    });
    const env = coreEnv(d1);

    await it(`${kind}: unauthenticated call is rejected`, async () => {
      const response = await handlerFor(kind)(
        makeContext(env, bodyFor(kind), undefined, 'POST')
      );
      assert.equal(response.status, 401);
    });

    await it(`${kind}: owner succeeds and client role/plan/owner spoofing is ignored`, async () => {
      const response = await handlerFor(kind)(
        makeContext(env, bodyFor(kind, {
          role: 'super_admin',
          ownerId: 'auth-other',
          planTier: 'enterprise',
        }), 'token-owner', 'POST')
      );
      const body = await readJson(response);
      assert.equal(response.status, 200);
      assert.equal(body.creditsUsed, 1);
      assert.match(body.output, /Tenant A/);
      assert.equal(body.output.includes('VIJAY VISUALS'), false);
      assert.equal(body.quota.planCode, 'starter-website');
      assert.equal(body.quota.websiteId, 'web-ai');
    });

    await it(`${kind}: non-owner receives 403 cross-tenant rejection`, async () => {
      const response = await handlerFor(kind)(
        makeContext(env, bodyFor(kind, { ownerId: 'auth-owner' }), 'token-other', 'POST')
      );
      assert.equal(response.status, 403);
      const body = await readJson(response);
      assert.match(String(body.error || body.message || ''), /permission|forbidden/i);
    });

    await it(`${kind}: unknown tenant identifier receives 404`, async () => {
      const response = await handlerFor(kind)(
        makeContext(env, bodyFor(kind, { tenantId: 'not-a-real-tenant' }), 'token-owner', 'POST')
      );
      assert.equal(response.status, 404);
    });

    await it(`${kind}: super admin can use an authorized tenant context`, async () => {
      const response = await handlerFor(kind)(
        makeContext(env, bodyFor(kind), 'token-admin', 'POST')
      );
      assert.equal(response.status, 200);
      assert.equal((await readJson(response)).creditsUsed, 1);
    });
  }

  await it('omitted tenantId resolves only the authenticated user\'s D1-owned tenant', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-implicit',
      slug: 'implicit-store',
      ownerId: 'auth-owner',
      businessName: 'Implicit Tenant',
      websiteJson: '{"planTier":"starter-website"}',
    });
    const env = coreEnv(d1);
    const response = await generateAi(
      makeContext(env, {
        prompt: 'Write a short product description',
        ownerId: 'auth-other',
        role: 'super_admin',
        planTier: 'enterprise',
      }, 'token-owner', 'POST')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.quota.websiteId, 'web-implicit');
    assert.equal(body.quota.planCode, 'starter-website');
    assert.match(body.output, /Implicit Tenant/);
  });

  await it('implicit AI tenant lookup skips drafts and selects the published site', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-older-draft',
      slug: 'older-draft',
      ownerId: 'auth-owner',
      status: 'unpublished',
      businessName: 'Old Draft',
    });
    seedPublication(db, {
      websiteId: 'web-live',
      slug: 'live-store',
      ownerId: 'auth-owner',
      status: 'published',
      businessName: 'Live Tenant',
    });
    const env = coreEnv(d1);
    const response = await generateAi(
      makeContext(env, { prompt: 'Write copy' }, 'token-owner', 'POST')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.quota.websiteId, 'web-live');
    assert.match(body.output, /Live Tenant/);
  });

  await it('a replayed server-scoped requestId never executes a second AI call', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-idem', slug: 'idem-store', ownerId: 'auth-owner' });
    ensureAiUsageTable(d1);
    const env = coreEnv(d1);
    let providerCalls = 0;
    const params = {
      websiteId: 'web-idem',
      tenantRowId: 1,
      userId: 'auth-owner',
      serviceSlug: 'generate:copy',
      requestId: 'replay-safe-1',
      creditsNeeded: 1,
      fallbackPlanTier: 'starter-website',
    };
    const first = await executeWithAiCreditDeduction(env, {
      ...params,
      executeAiCall: async () => {
        providerCalls++;
        return 'Original output';
      },
    });
    const replay = await executeWithAiCreditDeduction(env, {
      ...params,
      executeAiCall: async () => {
        providerCalls++;
        return 'Must not run';
      },
    });
    assert.equal(first.creditsUsed, 1);
    assert.equal(replay.creditsUsed, 0);
    assert.equal(replay.isDuplicate, true);
    assert.equal(replay.output, 'Original output');
    assert.equal(providerCalls, 1);
  });

  await it('a requestId from another tenant cannot be replayed for free AI', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-tenant-a', slug: 'tenant-a', ownerId: 'auth-owner' });
    seedPublication(db, { websiteId: 'web-tenant-b', slug: 'tenant-b', ownerId: 'auth-other' });
    ensureAiUsageTable(d1);
    const env = coreEnv(d1);
    let providerCalls = 0;
    await executeWithAiCreditDeduction(env, {
      websiteId: 'web-tenant-a',
      userId: 'auth-owner',
      serviceSlug: 'generate:copy',
      requestId: 'shared-key-1',
      creditsNeeded: 1,
      executeAiCall: async () => {
        providerCalls++;
        return 'Tenant A output';
      },
    });
    let crossTenantError: any = null;
    try {
      await executeWithAiCreditDeduction(env, {
        websiteId: 'web-tenant-b',
        userId: 'auth-other',
        serviceSlug: 'generate:copy',
        requestId: 'shared-key-1',
        creditsNeeded: 1,
        executeAiCall: async () => {
          providerCalls++;
          return 'Must not run';
        },
      });
    } catch (error) {
      crossTenantError = error;
    }
    assert.equal(crossTenantError?.status, 409);
    assert.equal(providerCalls, 1);
  });

  await it('AI ledger write failure fails closed before the provider call', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-ledger', slug: 'ledger-store', ownerId: 'auth-owner' });
    const base = coreEnv(d1);
    const failingDb: D1Database = {
      ...d1,
      prepare(sql: string) {
        const statement = d1.prepare(sql);
        let values: any[] = [];
        return {
          bind(...bound: any[]) {
            values = bound.map((v) => (v === undefined ? null : v));
            return this;
          },
          async first<T = any>(colName?: string): Promise<T | null> {
            return statement.bind(...values).first<T>(colName as never);
          },
          async all<T = any>(): Promise<{ results: T[]; success: boolean }> {
            return statement.bind(...values).all<T>();
          },
          async run() {
            if (sql.includes('INSERT INTO tenant_ai_usage')) throw new Error('D1 write unavailable');
            return statement.bind(...values).run();
          },
        };
      },
      exec: async (sql: string) => {
        await d1.exec?.(sql);
      },
    } as D1Database;
    let providerCalls = 0;
    let ledgerError: any = null;
    try {
      await executeWithAiCreditDeduction({ ...base, DB: failingDb }, {
        websiteId: 'web-ledger',
        userId: 'auth-owner',
        serviceSlug: 'generate:copy',
        requestId: 'ledger-failure-1',
        creditsNeeded: 1,
        executeAiCall: async () => {
          providerCalls++;
          return 'Must not run';
        },
      });
    } catch (error) {
      ledgerError = error;
    }
    assert.equal(ledgerError?.status, 503);
    assert.equal(providerCalls, 0);
  });

  await it('authenticated user without an owned tenant gets 404 for implicit AI access', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-someone-else',
      slug: 'someone-else-store',
      ownerId: 'auth-owner',
    });
    const env = coreEnv(d1);
    const response = await generateAi(
      makeContext(env, { prompt: 'Write copy' }, 'token-customer', 'POST')
    );
    const body = await readJson(response);
    assert.equal(response.status, 404);
    assert.equal(body.code, 'TENANT_NOT_FOUND');
  });

  await it('unpublished website is rejected before any AI credit is consumed', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-inactive',
      slug: 'inactive-store',
      ownerId: 'auth-owner',
      status: 'unpublished',
    });
    const env = coreEnv(d1);
    for (const handler of [generateAi, contentStudioAi]) {
      const response = await handler(
        makeContext(env, {
          tenantId: 'web-inactive',
          prompt: 'test',
          topic: 'test',
        }, 'token-owner', 'POST')
      );
      const body = await readJson(response);
      assert.equal(response.status, 403);
      assert.equal(body.code, 'TENANT_INACTIVE');
    }
    assert.equal(
      Number(db.prepare('SELECT COUNT(*) AS n FROM tenant_ai_usage').get()?.n || 0),
      0
    );
  });

  await it('only active, unexpired subscription rows can raise the AI allowance', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-sub-expired',
      slug: 'sub-expired',
      ownerId: 'auth-owner',
      websiteJson: '{"planTier":"starter-website"}',
    });
    db.prepare(
      `INSERT INTO tenant_subscriptions
        (website_id, owner_id, plan_code, status, current_period_end)
       VALUES (?, 'auth-owner', 'enterprise', 'active', datetime('now', '-1 day'))`
    ).run('web-sub-expired');
    const expiredQuota = await getTenantAiQuota(
      coreEnv(d1),
      'web-sub-expired',
      undefined,
      'starter-website'
    );
    assert.notEqual(expiredQuota.planCode, 'enterprise');
    assert.equal(expiredQuota.allowance, 25);

    seedPublication(db, {
      websiteId: 'web-sub-current',
      slug: 'sub-current',
      ownerId: 'auth-owner',
      websiteJson: '{"planTier":"starter-website"}',
    });
    db.prepare(
      `INSERT INTO tenant_subscriptions
        (website_id, owner_id, plan_code, status, current_period_end)
       VALUES (?, 'auth-owner', 'starter', 'active', datetime('now', '+30 days'))`
    ).run('web-sub-current');
    const currentQuota = await getTenantAiQuota(
      coreEnv(d1),
      'web-sub-current',
      undefined,
      'starter-website'
    );
    assert.equal(currentQuota.planCode, 'starter');
    assert.equal(currentQuota.allowance, 50);
  });

  await it('SEO assistant also enforces published status and server-side tenant access', async () => {
    const { d1, db } = createD1();
    seedPublication(db, {
      websiteId: 'web-seo-draft',
      slug: 'seo-draft',
      ownerId: 'auth-owner',
      status: 'unpublished',
    });
    const env = coreEnv(d1);
    const inactive = await seoAssistantAi(
      makeContext(env, { tenantId: 'web-seo-draft', task: 'audit' }, 'token-owner', 'POST')
    );
    assert.equal(inactive.status, 403);
    assert.equal((await readJson(inactive)).code, 'TENANT_INACTIVE');

    seedPublication(db, {
      websiteId: 'web-seo-live',
      slug: 'seo-live',
      ownerId: 'auth-owner',
      status: 'published',
    });
    const crossTenant = await seoAssistantAi(
      makeContext(env, { tenantId: 'web-seo-live' }, 'token-other', 'POST')
    );
    assert.equal(crossTenant.status, 403);
  });

  await it('exhausted server-derived quota blocks both AI endpoints', async () => {
    const { d1, db } = createD1();
    const rowId = seedPublication(db, {
      websiteId: 'web-quota',
      slug: 'quota-store',
      ownerId: 'auth-owner',
      websiteJson: '{"planTier":"starter-website"}',
    });
    await ensureAiUsageTable(d1);
    db.prepare(
      `INSERT INTO tenant_ai_usage
        (id, website_id, tenant_rowid, user_id, service_slug, request_id, provider, model, credits_deducted, billing_period, status)
       VALUES ('used_all', 'web-quota', ?, 'auth-owner', 'seed', 'seed_quota', 'gemini', 'local', 25, ?, 'success')`
    ).run(rowId, getCurrentBillingPeriod());
    const env = coreEnv(d1);
    for (const [handler, body] of [
      [generateAi, { tenantId: 'web-quota', prompt: 'test' }],
      [contentStudioAi, { tenantId: 'web-quota', topic: 'test' }],
    ] as const) {
      const response = await handler(makeContext(env, body, 'token-owner', 'POST'));
      const payload = await readJson(response);
      assert.equal(response.status, 403);
      assert.equal(payload.code, 'AI_QUOTA_EXHAUSTED');
    }
  });
}

// ---------------------------------------------------------------------------
// C. Public tracking privacy
// ---------------------------------------------------------------------------
async function runTrackingPrivacyTests(): Promise<void> {
  console.log('\nC. Public tracking privacy and neutral fallbacks');

  const { d1, db } = createD1();
  seedPublication(db, {
    websiteId: 'web-track',
    slug: 'track-store',
    ownerId: 'auth-owner',
    businessName: 'Tenant A',
    websiteJson: '{"phone":"+91 90000 00000"}',
  });
  db.prepare(
    `INSERT INTO store_orders
      (order_number, website_id, owner_id, customer_name, customer_phone, customer_email,
       shipping_address, items_json, total_inr, payment_method, payment_status,
       gateway_payment_id, order_status)
     VALUES ('TRACK-1001', 'web-track', 'auth-owner', 'Asha Rao', '9876543210',
       'asha@example.invalid', '12 Test Street, Hyderabad', '[{"name":"UDP"}]', 1200,
       'cod', 'paid', 'pay_FULL_GATEWAY_REFERENCE_9876', 'confirmed')`
  ).run();

  const env = coreEnv(d1);

  await it('unauthenticated tracking exposes only masked customer and payment data', async () => {
    const response = await trackOrder(
      makeContext(env, {}, undefined, 'GET', { orderNumber: 'TRACK-1001' }, 'https://preview.example.test/api/orders/track/TRACK-1001')
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.order.isPiiMasked, true);
    assert.equal(body.tenantName, 'Tenant A');
    assert.equal(body.order.customerName.includes('Asha'), false);
    assert.equal(body.order.customerPhone.includes('9876543210'), false);
    assert.equal(body.order.paymentReference, '••••••9876');
    assert.equal(body.order.paymentReference.includes('FULL_GATEWAY'), false);
    assert.equal(Object.hasOwn(body.order, 'tenantId'), false);
    assert.equal(Object.hasOwn(body.order, 'websiteId'), false);
    assert.equal(Object.hasOwn(body.order, 'id'), false);
    assert.equal(JSON.stringify(body).includes('Vijay Visuals'), false);
  });

  await it('verified tracking still masks gateway references', async () => {
    const response = await trackOrder(
      makeContext(env, {}, undefined, 'GET', { orderNumber: 'TRACK-1001' }, 'https://preview.example.test/api/orders/track/TRACK-1001?phone=9876543210')
    );
    const body = await readJson(response);
    assert.equal(body.order.isPiiMasked, false);
    assert.equal(body.order.customerName, 'Asha Rao');
    assert.equal(body.order.paymentReference, '••••••9876');
    assert.equal(JSON.stringify(body).includes('pay_FULL_GATEWAY_REFERENCE'), false);
  });

  await it('customer UI source no longer renders raw payment references or internal attribution IDs', async () => {
    const invoice = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'InvoiceModal.tsx'), 'utf8');
    const tracker = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'OrderTrackerModal.tsx'), 'utf8');
    const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
    const storefrontMap = fs.readFileSync(
      path.resolve(__dirname, '..', 'src', 'components', 'StorefrontMapPreview.tsx'),
      'utf8'
    );
    assert.match(invoice, /maskPaymentReference\(order\.paymentReference\)/);
    assert.equal(invoice.includes('{order.paymentReference}'), false);
    assert.equal(tracker.includes('gmp_mcp_codeassist'), false);
    assert.equal(tracker.includes('VV-123456-789'), false);
    assert.equal(storefrontMap.includes('gmp_mcp_codeassist'), false);
    assert.equal(app.includes('gmp_mcp_codeassist'), false);
    assert.equal(app.includes('Vijay Visuals Store'), false);
  });

  await it('legacy Express tracker helper returns a masked customer-only shape', async () => {
    const payload = buildPublicTrackingResponse(
      {
        orderNumber: 'TRACK-9001',
        customerName: 'Ananya Rao',
        customerPhone: '+919876543210',
        customerEmail: 'ananya@example.invalid',
        shippingAddress: 'Flat 4, Rose Apartments, Banjara Hills, Hyderabad',
        itemsJson: '[{"name":"Saree","qty":1}]',
        subtotal: 1990,
        discount: 0,
        deliveryFee: 50,
        total: 2040,
        paymentMethod: 'upi_reference',
        paymentReference: 'cashfree_order_90001',
        paymentStatus: 'paid',
        status: 'out_for_delivery',
        invoiceNumber: 'INV-9001',
        isWholesale: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      { name: 'Kalyani Silks', phone: '+914000000000' }
    );
    assert.equal(payload.order.id, 0);
    assert.equal(payload.order.tenantId, 0);
    assert.equal(payload.order.customerUserId, null);
    assert.equal(payload.order.deliveryPartnerId, null);
    assert.equal(payload.deliveryPartner, null);
    assert.equal(payload.order.customerName, 'A***** R**');
    assert.equal(payload.order.customerPhone, '******3210');
    assert.equal(payload.order.customerEmail, 'a***a@example.invalid');
    assert.match(payload.order.shippingAddress, /^Protected Address/);
    assert.equal(payload.order.paymentReference, '••••••0001');
    assert.equal(JSON.stringify(payload).includes('cashfree_order_90001'), false);
    assert.equal(JSON.stringify(payload).includes('+919876543210'), false);
    assert.equal(payload.tenantName, 'Kalyani Silks');

    const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    assert.match(serverSource, /res\.json\(buildPublicTrackingResponse\(order, tenant\)\)/);
    assert.equal(serverSource.includes('deliveryPartner: partner'), false);
  });
}

// ---------------------------------------------------------------------------
// D. Validated white-label URLs, metadata and notifications
// ---------------------------------------------------------------------------
class FakeElement {
  tagName: string;
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  textNode = '';

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }
  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
  get parentNode(): FakeElement | null {
    return this.parent;
  }
  get content(): string {
    return this.getAttribute('content') || '';
  }
  set content(value: string) {
    this.setAttribute('content', value);
  }
  get href(): string {
    return this.getAttribute('href') || '';
  }
  set href(value: string) {
    this.setAttribute('href', value);
  }
  get id(): string {
    return this.getAttribute('id') || '';
  }
  set id(value: string) {
    this.setAttribute('id', value);
  }
  get type(): string {
    return this.getAttribute('type') || '';
  }
  set type(value: string) {
    this.setAttribute('type', value);
  }
  get textContent(): string {
    return this.textNode;
  }
  set textContent(value: string) {
    this.textNode = String(value || '');
  }
}

class FakeDocument {
  title = '';
  head = new FakeElement('head');

  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const metaName = selector.match(/^meta\[name="([^"]+)"\]$/);
    const metaProperty = selector.match(/^meta\[property="([^"]+)"\]$/);
    const linkRel = selector.match(/^link\[rel="([^"]+)"\]$/);
    const scriptType = selector.match(/^script\[type="([^"]+)"\]$/);
    return this.head.children.filter((el) => {
      if (metaName) return el.tagName === 'meta' && el.getAttribute('name') === metaName[1];
      if (metaProperty) return el.tagName === 'meta' && el.getAttribute('property') === metaProperty[1];
      if (linkRel) return el.tagName === 'link' && el.getAttribute('rel') === linkRel[1];
      if (scriptType) return el.tagName === 'script' && el.getAttribute('type') === scriptType[1];
      return false;
    });
  }
}

function serializeElement(el: FakeElement): string {
  const attrs = Array.from(el.attributes.entries())
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  return `<${el.tagName} ${attrs}>${el.textContent}${el.children.map(serializeElement).join('')}</${el.tagName}>`;
}

function seedPlatformHead(doc: FakeDocument): void {
  const add = (tag: string, attrs: Record<string, string>, text = '') => {
    const el = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    el.textContent = text;
    doc.head.appendChild(el);
  };
  doc.title = 'VIJAY VISUALS · Creative Studio';
  add('meta', { property: 'og:site_name', content: 'VIJAY VISUALS' });
  add('meta', { name: 'twitter:title', content: 'VIJAY VISUALS' });
  add('meta', { property: 'og:locale', content: 'en_IN' });
  add('meta', { name: 'google-site-verification', content: 'platform-verification-token' });
  add('meta', { name: 'description', content: 'Platform description' });
  add('link', { rel: 'canonical', href: 'https://vijay-visuals-site.pages.dev/' });
  add('script', { type: 'application/ld+json' }, '{"name":"VIJAY VISUALS"}');
}

async function runWhiteLabelTests(): Promise<void> {
  console.log('\nD. Validated URLs, metadata white-labeling and notifications');

  await it('verified D1 domain is used; pending domain is never advertised as live', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-url', slug: 'tenant-a', businessName: 'Tenant A' });
    seedVerifiedDomain(db, 'web-url', 'shop.tenant-a.test');
    seedVerifiedDomain(db, 'web-url', 'pending.tenant-a.test', {
      status: 'dns_verifying',
      dns_verification_status: 'pending',
      ssl_status: 'pending',
    });
    const env = coreEnv(d1);
    const verified = await resolveTenantPublicUrl(env, { website_id: 'web-url', public_slug: 'tenant-a' });
    assert.equal(verified.url, 'https://shop.tenant-a.test/site/tenant-a');
    assert.equal(verified.isVerifiedCustomDomain, true);
    assert.equal(verified.url.includes('vijay-visuals-site.pages.dev'), false);

    const { d1: d1b, db: dbb } = createD1();
    seedPublication(dbb, { websiteId: 'web-pending', slug: 'pending-store' });
    seedVerifiedDomain(dbb, 'web-pending', 'pending.tenant-a.test', {
      status: 'dns_verifying',
      dns_verification_status: 'pending',
      ssl_status: 'pending',
    });
    const pending = await resolveTenantPublicUrl(
      coreEnv(d1b, { APP_URL: 'https://app.example.test' }),
      { website_id: 'web-pending', public_slug: 'pending-store' }
    );
    assert.equal(pending.isVerifiedCustomDomain, false);
    assert.equal(pending.url, 'https://app.example.test/site/pending-store');
  });

  await it('verified www canonical mode is honored and insecure app origins are ignored', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-www', slug: 'www-store' });
    seedVerifiedDomain(db, 'web-www', 'shop.tenant-a.test', {
      www_mode: 'redirect_to_www',
      www_status: 'verified',
    });
    const www = await resolveTenantPublicUrl(coreEnv(d1), {
      website_id: 'web-www',
      public_slug: 'www-store',
    });
    assert.equal(www.url, 'https://www.shop.tenant-a.test/site/www-store');
    assert.equal(www.domain, 'www.shop.tenant-a.test');

    seedPublication(db, { websiteId: 'web-www-unverified', slug: 'www-pending' });
    seedVerifiedDomain(db, 'web-www-unverified', 'apex.tenant-a.test', {
      www_mode: 'redirect_to_www',
    });
    const unverifiedWww = await resolveTenantPublicUrl(coreEnv(d1), {
      website_id: 'web-www-unverified',
      public_slug: 'www-pending',
    });
    assert.equal(unverifiedWww.url, 'https://apex.tenant-a.test/site/www-pending');

    const insecure = await resolveTenantPublicUrl(
      coreEnv({} as D1Database, { APP_URL: 'http://insecure.example.test' }),
      { website_id: 'web-www', public_slug: 'www-store' }
    );
    assert.equal(insecure.source, 'relative_storefront');
    assert.equal(insecure.url, '/site/www-store');
  });

  await it('without verified domain or configured origin only a relative fallback is returned', async () => {
    const resolved = await resolveTenantPublicUrl({} as CloudflareEnv, {
      website_id: 'web-unknown',
      public_slug: 'tenant-a',
    });
    assert.equal(resolved.url, '/site/tenant-a');
    assert.equal(resolved.source, 'relative_storefront');
    assert.equal(resolved.url.includes('pages.dev'), false);
  });

  await it('client storefront metadata replaces platform OG/Twitter tags and restores them on cleanup', async () => {
    const doc = new FakeDocument() as unknown as Document;
    seedPlatformHead(doc as unknown as FakeDocument);
    const cleanup = applyStorefrontMetadata(doc, {
      name: 'Tenant A',
      slug: 'tenant-a',
      description: 'Tenant description',
      canonicalUrl: 'https://tenant-a.example.test/site/tenant-a',
      bannerImage: 'https://tenant-a.example.test/banner.jpg',
      products: [{ name: 'Product A', price: 199, stock: 2 }],
    });
    const headHtml = (doc as unknown as FakeDocument).head.children.map(serializeElement).join('\n');
    assert.equal(doc.title, 'Tenant A');
    assert.equal(headHtml.includes('VIJAY VISUALS'), false);
    assert.equal(headHtml.includes('og:site_name') && headHtml.includes('content="Tenant A"'), true);
    assert.equal(headHtml.includes('twitter:title') && headHtml.includes('content="Tenant A"'), true);
    assert.equal(headHtml.includes('https://tenant-a.example.test/site/tenant-a'), true);
    assert.equal((headHtml.match(/application\/ld\+json/g) || []).length, 1);
    assert.equal(headHtml.includes('og:locale'), false);
    assert.equal(headHtml.includes('google-site-verification'), false);

    cleanup();
    const restored = (doc as unknown as FakeDocument).head.children.map(serializeElement).join('\n');
    assert.equal(doc.title, 'VIJAY VISUALS · Creative Studio');
    assert.equal(restored.includes('content="VIJAY VISUALS"'), true);
    assert.equal(restored.includes('content="en_IN"'), true);
    assert.equal(restored.includes('content="platform-verification-token"'), true);
  });

  await it('malformed tenant canonical URL does not throw and keeps storefront metadata usable', async () => {
    const doc = new FakeDocument() as unknown as Document;
    seedPlatformHead(doc as unknown as FakeDocument);
    const cleanup = applyStorefrontMetadata(doc, {
      name: 'Tenant A',
      slug: 'tenant-a',
      canonicalUrl: 'not-a-valid-url%',
      products: [],
    });
    assert.equal(doc.title, 'Tenant A');
    const headHtml = (doc as unknown as FakeDocument).head.children.map(serializeElement).join('\n');
    assert.match(headHtml, /application\/ld\+json/);
    assert.equal(headHtml.includes('VIJAY VISUALS'), false);
    cleanup();
  });

  await it('/site/{slug} on the official host replaces platform head metadata', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-site-route', slug: 'tenant-a', businessName: 'Tenant A' });
    const env = coreEnv(d1);
    const platformHtml = `<!doctype html><html><head>
      <title>VIJAY VISUALS · Creative Studio</title>
      <meta property="og:site_name" content="VIJAY VISUALS" />
      <meta name="twitter:title" content="VIJAY VISUALS" />
      <script type="application/ld+json">{"name":"VIJAY VISUALS"}</script>
    </head><body>PLATFORM SHELL</body></html>`;
    const next = async () =>
      new Response(platformHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    const response = await tenantMiddleware({
      request: new Request('https://vijay-visuals-site.pages.dev/site/tenant-a'),
      env,
      params: {},
      next,
    });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-VV-Tenant-Slug'), 'tenant-a');
    assert.equal(html.includes('VIJAY VISUALS'), false);
    assert.match(html, /og:site_name" content="Tenant A"/);
    assert.match(html, /twitter:title" content="Tenant A/);
    assert.equal((html.match(/application\/ld\+json/g) || []).length, 1);
    assert.equal(html.includes('vv-tenant-website-id'), false);

    const malformedResponse = await tenantMiddleware({
      request: new Request('https://vijay-visuals-site.pages.dev/site/%'),
      env,
      params: {},
      next,
    });
    assert.equal(await malformedResponse.text(), platformHtml);

    const unknownResponse = await tenantMiddleware({
      request: new Request('https://vijay-visuals-site.pages.dev/site/not-published'),
      env,
      params: {},
      next,
    });
    assert.equal(await unknownResponse.text(), platformHtml);
  });

  await it('tenant notification email is neutral and redacts log previews; platform admin mail keeps genuine branding', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-notify', slug: 'notify-store', businessName: 'Tenant A' });
    const env = coreEnv(d1, { RESEND_API_KEY: 'local-resend-key' });
    resendPayload = null;

    const tenantResponse = await platformNotifications(
      makeContext(env, {
        websiteId: 'web-notify',
        channel: 'email',
        eventType: 'order_confirmed',
        recipientContact: 'customer@example.invalid',
        subject: 'Code 123456 notice',
        message: 'Your one-time code is 123456 for Tenant A.',
      }, 'token-owner', 'POST')
    );
    assert.equal(tenantResponse.status, 201);
    assert.equal(resendPayload.from, 'Store Notifications <onboarding@resend.dev>');
    assert.equal(String(resendPayload.html).includes('VIJAY VISUALS'), false);
    assert.equal(String(resendPayload.html).includes('Store Notifications'), true);
    const tenantLog = db.prepare(
      "SELECT subject, message_preview FROM notification_logs WHERE website_id = 'web-notify' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    assert.ok(tenantLog);
    assert.equal(tenantLog.subject.includes('123456'), false);
    assert.equal(tenantLog.message_preview.includes('123456'), false);

    resendPayload = null;
    const platformResponse = await platformNotifications(
      makeContext(env, {
        channel: 'email',
        eventType: 'support_update',
        recipientContact: 'admin@example.invalid',
        subject: 'Platform notice',
        message: 'Genuine platform support notice.',
      }, 'token-admin', 'POST')
    );
    assert.equal(platformResponse.status, 201);
    assert.equal(resendPayload.from, 'Vijay Visuals <notifications@vijayvisuals.com>');
    assert.equal(String(resendPayload.html).includes('VIJAY VISUALS'), true);
  });

  await it('notification log API redacts legacy rows containing raw OTPs', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-logs', slug: 'logs-store', ownerId: 'auth-owner' });
    db.prepare(
      `INSERT INTO notification_logs
        (website_id, recipient_contact, channel, event_type, subject, message_preview,
         consent_verified, delivery_status, error_detail)
       VALUES ('web-logs', 'customer@example.invalid', 'email', 'otp_send',
               'Your OTP 482913', 'OTP 482913 for login', 1, 'delivered', 'provider returned 482913')`
    ).run();
    const response = await platformNotificationsGet(
      makeContext(coreEnv(d1), {}, 'token-admin', 'GET')
    );
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.logs.length, 1);
    assert.equal(JSON.stringify(body).includes('482913'), false);
    assert.match(body.logs[0].message_preview, /redacted/i);
  });

  await it('signed Cashfree store-order webhook uses the validated URL and tenant receipts only', async () => {
    const { d1, db } = createD1();
    seedPublication(db, { websiteId: 'web-cf', slug: 'cf-store', businessName: 'Tenant A' });
    seedVerifiedDomain(db, 'web-cf', 'shop.tenant-a.test');
    db.prepare(
      `INSERT INTO store_orders
        (order_number, website_id, owner_id, customer_name, customer_email, customer_phone,
         total_inr, payment_status, gateway_order_id)
       VALUES ('CF-1001', 'web-cf', 'auth-owner', 'Asha Rao', 'asha@example.invalid',
         '9876543210', 199, 'pending', 'cf_order_store_1001')`
    ).run();
    const secret = 'local-webhook-secret';
    const env = coreEnv(d1, {
      CASHFREE_WEBHOOK_SECRET: secret,
      RESEND_API_KEY: 'local-resend-key',
      RESEND_VERIFIED_SENDER_DOMAINS: 'shop.tenant-a.test',
      WHATSAPP_CLOUD_API_TOKEN: 'local-wa-token',
      WHATSAPP_PHONE_NUMBER_ID: 'local-phone-id',
      WHATSAPP_PAYMENT_TEMPLATE_NAME: 'payment_confirmed',
      WHATSAPP_PAYMENT_TEMPLATE_LANGUAGE: 'en',
    });

    const payload = {
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'cf_order_store_1001', order_amount: 199, order_currency: 'INR' },
        payment: {
          cf_payment_id: 90001,
          payment_status: 'SUCCESS',
          payment_amount: 199,
          payment_currency: 'INR',
          payment_time: '2026-11-25T10:00:00Z',
        },
        customer_details: {
          customer_name: 'Asha Rao',
          customer_email: 'asha@example.invalid',
          customer_phone: '9876543210',
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
    resendPayload = null;
    whatsappPayload = null;

    const response = await cashfreeWebhook({
      request: new Request('https://preview.example.test/api/webhooks/cashfree', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        body: rawBody,
      }),
      env,
      params: {},
      next: async () => new Response(null, { status: 204 }),
    });
    assert.equal(response.status, 200);
    const paid = db.prepare(
      "SELECT payment_status, gateway_payment_id FROM store_orders WHERE order_number = 'CF-1001'"
    ).get() as any;
    assert.equal(paid.payment_status, 'paid');
    assert.equal(paid.gateway_payment_id, '90001');

    assert.ok(resendPayload);
    assert.equal(resendPayload.from, 'Tenant A <notifications@shop.tenant-a.test>');
    assert.equal(String(resendPayload.html).includes('https://shop.tenant-a.test/site/cf-store'), true);
    assert.equal(String(resendPayload.html).includes('VIJAY VISUALS'), false);
    assert.ok(whatsappPayload);
    assert.equal(
      JSON.stringify(whatsappPayload.body).includes('https://shop.tenant-a.test/site/cf-store'),
      true
    );
    assert.equal(JSON.stringify(whatsappPayload.body).includes('VIJAY VISUALS'), false);
    const emailLog = db.prepare(
      "SELECT message_preview, error_detail FROM notification_logs WHERE event_type = 'payment_confirmed' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    assert.ok(emailLog);
    assert.equal(String(emailLog.message_preview).includes('VIJAY VISUALS'), false);
  });
}

async function main(): Promise<void> {
  console.log('================================================================');
  console.log(' PRIORITY FIX 13 — SECURITY / ISOLATION / WHITE-LABEL REGRESSIONS');
  console.log('================================================================');
  try {
    await runPasswordResetBoundaryTests();
    await runAiAuthorizationTests();
    await runTrackingPrivacyTests();
    await runWhiteLabelTests();
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('\n================================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
