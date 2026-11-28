// ============================================================================
// OWNER TEMPLATE PRICING REGRESSIONS — LOCAL, MOCKED, NO REMOTE WRITES
// Verifies all 36 tpl-* rows, Owner-only access, persistent save/reload,
// validation, status persistence and isolation from package/offer data.
// ============================================================================

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet, onRequestPatch } from '../functions/api/platform-owner/template-pricing';
import type { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  db.prepare(
    `INSERT INTO platform_owner
       (singleton_id, user_id, email, full_name, title, status)
     VALUES (1, ?, ?, ?, ?, ?)`
  ).run('auth-owner', 'vk66278@gmail.com', 'Vijay Kumar', 'Founder & Creative Director', 'active');

  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound.map((value) => (value === undefined ? null : value));
          return this;
        },
        async first<T = any>(col?: string): Promise<T | null> {
          const row = db.prepare(sql).get(...values) as any;
          if (!row) return null;
          return col ? (row[col] as T) : (row as T);
        },
        async all<T = any>() {
          return { results: db.prepare(sql).all(...values) as T[], success: true };
        },
        async run() {
          const info = db.prepare(sql).run(...values);
          return {
            success: true,
            meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
          };
        },
      } as any;
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  } as D1Database;
  return { db, d1 };
}

function makeToken(payload: Record<string, unknown>): string {
  return `mock.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;
}

function readToken(init?: RequestInit): Record<string, any> | null {
  const auth = new Headers(init?.headers || {}).get('Authorization') || '';
  const match = auth.match(/^Bearer\s+mock\.([A-Za-z0-9+/=]+)\.sig$/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const payload = readToken(init);
  if (url.includes('/auth/v1/user')) {
    if (!payload?.sub) return new Response('{}', { status: 401 });
    return new Response(
      JSON.stringify({
        id: payload.sub,
        email: payload.email,
        user_metadata: { full_name: payload.name || 'Local Test User' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(
      JSON.stringify([
        {
          id: payload?.sub || 'unknown',
          role: payload?.role || 'customer',
          full_name: payload?.name || 'Local Test User',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw new Error(`Unexpected local mocked URL: ${url}`);
}) as typeof fetch;

const OWNER = makeToken({ sub: 'auth-owner', email: 'vk66278@gmail.com', role: 'platform_owner' });
const SUPER_ADMIN = makeToken({ sub: 'auth-admin', email: 'admin@example.invalid', role: 'super_admin' });
const CUSTOMER = makeToken({ sub: 'auth-customer', email: 'customer@example.invalid', role: 'customer' });

const { db, d1 } = createD1();
const env: CloudflareEnv = {
  DB: d1,
  SUPABASE_URL: 'https://local-mock-supabase.invalid',
  SUPABASE_ANON_KEY: 'local-anon-key',
  VITE_SUPABASE_URL: 'https://local-mock-supabase.invalid',
  VITE_SUPABASE_ANON_KEY: 'local-anon-key',
};

function context(method: 'GET' | 'PATCH', token?: string, body?: unknown): PagesContext {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const request = new Request('https://preview.local/api/platform-owner/template-pricing', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, env, params: {}, next: async () => new Response() } as PagesContext;
}

interface ValidBody {
  templateId: string;
  priceInr: number;
  active: boolean;
  updatePeriodMonths: number;
  supportPeriodMonths: number;
  paidMaintenanceAfterSupport: boolean;
  included: string[];
  excluded: string[];
  maintenanceTerms: string;
  disclosures: string[];
}

const validBody = (overrides: Partial<ValidBody> = {}): ValidBody => ({
  templateId: 'grocery-store',
  priceInr: 1234,
  active: false,
  updatePeriodMonths: 9,
  supportPeriodMonths: 15,
  paidMaintenanceAfterSupport: true,
  included: ['editable responsive design', 'catalog editor'],
  excluded: ['domain fees', 'gateway MDR'],
  maintenanceTerms: 'Paid maintenance is quoted separately after the support period.',
  disclosures: [],
  ...overrides,
});

async function getTemplates(token?: string): Promise<Response> {
  return onRequestGet(context('GET', token));
}

async function patchTemplate(token: string | undefined, body: unknown): Promise<Response> {
  return onRequestPatch(context('PATCH', token, body));
}

async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function targetRow(): any {
  return db
    .prepare(
      `SELECT code, monthly_price_inr, yearly_price_inr, is_active, features_json, updated_at
       FROM subscription_plans WHERE code = 'tpl-grocery-store' LIMIT 1`
    )
    .get();
}

const initialNonTemplatePlans = JSON.stringify(
  db.prepare(`SELECT * FROM subscription_plans WHERE code NOT LIKE 'tpl-%' ORDER BY code`).all()
);
const initialProposalCount = Number(
  (db.prepare(`SELECT COUNT(*) AS count FROM platform_proposals`).get() as any).count
);

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err?.message || err}`);
  }
}

async function run(): Promise<void> {
  console.log('====================================================================');
  console.log('OWNER TEMPLATE PRICING REGRESSIONS (LOCAL, MOCKED)');
  console.log('====================================================================');

  await it('unauthenticated GET is denied with HTTP 401', async () => {
    const res = await getTemplates();
    assert.equal(res.status, 401);
  });

  await it('unauthenticated PATCH is denied with HTTP 401', async () => {
    const res = await patchTemplate(undefined, validBody());
    assert.equal(res.status, 401);
  });

  await it('Owner GET returns all 36 tpl-* rows', async () => {
    const res = await getTemplates(OWNER);
    assert.equal(res.status, 200);
    const data = await json<{ templates: any[]; category?: string; billingCycle?: string }>(res);
    assert.equal(data.templates.length, 36);
    assert.equal(new Set(data.templates.map((row) => row.code)).size, 36);
    assert.ok(data.templates.every((row) => String(row.code).startsWith('tpl-')));
    assert.equal(data.category, 'template');
    assert.equal(data.billingCycle, 'one_time');
  });

  await it('all 36 rows start inactive and zero price', async () => {
    const data = await json<{ templates: any[] }>(await getTemplates(OWNER));
    assert.ok(data.templates.every((row) => row.active === false));
    assert.ok(data.templates.every((row) => row.priceInr === 0));
    assert.ok(data.templates.every((row) => Array.isArray(row.included) && row.included.length > 0));
    assert.ok(data.templates.every((row) => Array.isArray(row.excluded) && row.excluded.length > 0));
    assert.ok(data.templates.every((row) => typeof row.maintenanceTerms === 'string'));
  });

  await it('Super Admin GET is denied with HTTP 403', async () => {
    const res = await getTemplates(SUPER_ADMIN);
    assert.equal(res.status, 403);
    const data = await json<{ error: string }>(res);
    assert.match(data.error, /Business Owner privileges/);
  });

  await it('Customer GET is denied with HTTP 403', async () => {
    assert.equal((await getTemplates(CUSTOMER)).status, 403);
  });

  await it('Super Admin PATCH is denied and writes nothing', async () => {
    const before = JSON.stringify(targetRow());
    const res = await patchTemplate(SUPER_ADMIN, validBody({ priceInr: 9999 }));
    assert.equal(res.status, 403);
    assert.equal(JSON.stringify(targetRow()), before);
  });

  await it('Customer PATCH is denied and writes nothing', async () => {
    const before = JSON.stringify(targetRow());
    const res = await patchTemplate(CUSTOMER, validBody({ priceInr: 9999 }));
    assert.equal(res.status, 403);
    assert.equal(JSON.stringify(targetRow()), before);
  });

  await it('Owner PATCH saves a disposable test price and settings', async () => {
    const res = await patchTemplate(OWNER, validBody());
    assert.equal(res.status, 200);
    const row = targetRow();
    assert.equal(Number(row.monthly_price_inr), 1234);
    assert.equal(Number(row.yearly_price_inr), 1234);
    assert.equal(Number(row.is_active), 0);
    const features = JSON.parse(row.features_json);
    assert.equal(features.updatePeriodMonths, 9);
    assert.equal(features.supportPeriodMonths, 15);
    assert.equal(features.paidMaintenanceAfterSupport, true);
    assert.deepEqual(features.included, ['editable responsive design', 'catalog editor']);
    assert.deepEqual(features.excluded, ['domain fees', 'gateway MDR']);
    assert.match(features.maintenanceTerms, /quoted separately/);
  });

  await it('saved values reload from the server GET', async () => {
    const data = await json<{ templates: any[] }>(await getTemplates(OWNER));
    const row = data.templates.find((item) => item.code === 'tpl-grocery-store');
    assert.ok(row);
    assert.equal(row.priceInr, 1234);
    assert.equal(row.active, false);
    assert.equal(row.updatePeriodMonths, 9);
    assert.equal(row.supportPeriodMonths, 15);
    assert.equal(row.paidMaintenanceAfterSupport, true);
    assert.deepEqual(row.included, ['editable responsive design', 'catalog editor']);
    assert.deepEqual(row.excluded, ['domain fees', 'gateway MDR']);
    assert.match(row.maintenanceTerms, /quoted separately/);
  });

  await it('active=true persists through PATCH and GET', async () => {
    const res = await patchTemplate(OWNER, validBody({ active: true }));
    assert.equal(res.status, 200);
    assert.equal(Number(targetRow().is_active), 1);
    const data = await json<{ templates: any[] }>(await getTemplates(OWNER));
    const row = data.templates.find((item) => item.code === 'tpl-grocery-store');
    assert.equal(row?.active, true);
  });

  await it('active=false persists through PATCH and GET', async () => {
    const res = await patchTemplate(OWNER, validBody({ active: false }));
    assert.equal(res.status, 200);
    assert.equal(Number(targetRow().is_active), 0);
    const data = await json<{ templates: any[] }>(await getTemplates(OWNER));
    const row = data.templates.find((item) => item.code === 'tpl-grocery-store');
    assert.equal(row?.active, false);
  });

  const beforeInvalid = JSON.stringify(targetRow());

  await it('negative price is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ priceInr: -1 }))).status, 400);
  });

  await it('non-integer price is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ priceInr: 12.5 }))).status, 400);
  });

  await it('price above the server cap is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ priceInr: 5_000_001 }))).status, 400);
  });

  await it('invalid update period is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ updatePeriodMonths: 121 }))).status, 400);
  });

  await it('invalid support period is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ supportPeriodMonths: -1 }))).status, 400);
  });

  await it('non-boolean active state is rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ active: 'yes' } as any))).status, 400);
  });

  await it('empty included features are rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ included: [] }))).status, 400);
  });

  await it('empty exclusions are rejected with HTTP 400', async () => {
    assert.equal((await patchTemplate(OWNER, validBody({ excluded: [] }))).status, 400);
  });

  await it('lifetime promise in included features is rejected with HTTP 400', async () => {
    const res = await patchTemplate(
      OWNER,
      validBody({ included: ['lifetime free updates'] })
    );
    assert.equal(res.status, 400);
  });

  await it('misleading maintenance promise is rejected with HTTP 400', async () => {
    const res = await patchTemplate(
      OWNER,
      validBody({ maintenanceTerms: 'Unlimited maintenance forever.' })
    );
    assert.equal(res.status, 400);
  });

  await it('misleading disclosure promise is rejected with HTTP 400', async () => {
    const res = await patchTemplate(
      OWNER,
      validBody({ disclosures: ['guaranteed ranking'] })
    );
    assert.equal(res.status, 400);
  });

  await it('unknown template SKU is rejected with HTTP 404', async () => {
    const res = await patchTemplate(OWNER, validBody({ templateId: 'not-a-template' }));
    assert.equal(res.status, 404);
  });

  await it('invalid requests did not mutate the selected row', async () => {
    assert.equal(JSON.stringify(targetRow()), beforeInvalid);
  });

  await it('package pricing rows remain unchanged', async () => {
    const after = JSON.stringify(
      db.prepare(`SELECT * FROM subscription_plans WHERE code NOT LIKE 'tpl-%' ORDER BY code`).all()
    );
    assert.equal(after, initialNonTemplatePlans);
  });

  await it('existing offer/proposal rows remain unchanged', async () => {
    const count = Number(
      (db.prepare(`SELECT COUNT(*) AS count FROM platform_proposals`).get() as any).count
    );
    assert.equal(count, initialProposalCount);
  });

  console.log('--------------------------------------------------------------------');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('====================================================================');

  globalThis.fetch = originalFetch;
  if (failed > 0) process.exit(1);
}

void run();
