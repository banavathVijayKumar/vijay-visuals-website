// ============================================================================
// VIJAY VISUALS — CONSOLIDATED PRIORITY FIX LOCAL TESTS
// Covers draft snapshots, password recovery, package entitlement, white-label
// delivery, publish responses, and OTP/email log redaction. Fully local: in-memory
// D1 and mocked Supabase/Resend.
// No remote D1, no .env, no real email, no user creation, no payment.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { onRequestGet as getVersions, onRequestPost as saveVersion } from '../functions/api/owner/tenants/[tenantId]/versions';
import { onRequestPatch as publishWebsite } from '../functions/api/owner/tenants/[tenantId]/publish';
import { onRequestGet as getPackageStatus } from '../functions/api/customer/package-status';
import { onRequestGet as getPaymentHistory } from '../functions/api/payments/platform/history';
import { onRequest as handleTenantMiddleware } from '../functions/_middleware';
import { onRequestGet as resolveDomain } from '../functions/api/domains/resolve';
import { parseTenantDeliveryHostname } from '../shared/tenantHost';
import {
  buildOrderConfirmationEmailHtml,
  buildPaymentReceiptEmailHtml,
  buildStorePaymentReceiptEmailHtml,
  buildStorePaymentWhatsAppText,
  resolveEmailSender,
  resolveVerifiedTenantSender,
  sendTransactionalEmail,
  redactSensitiveLogText,
} from '../functions/api/_email';
import { onRequestPost as sendOtp } from '../functions/api/auth/otp/send';
import { onRequestPost as resendOtp } from '../functions/api/auth/otp/resend';
import { onRequestPost as resetRequestEndpoint } from '../functions/api/auth/password/reset-request';
import {
  authorizePasswordResetRequest,
  hashPasswordResetEmail,
  MAX_PASSWORD_RESET_REQUESTS_PER_HOUR,
} from '../functions/api/auth/_passwordResetRateLimit';
import {
  AUTH_PROVIDER_ERROR_MESSAGE,
  PASSWORD_RESET_COOLDOWN_STORAGE_KEY,
  PASSWORD_RESET_GENERIC_MESSAGE,
  PASSWORD_RECOVERY_INVALID_MESSAGE,
  PASSWORD_UPDATE_SUCCESS_MESSAGE,
  completePasswordRecovery,
  getPasswordResetRedirectUrl,
  isRecoverySession,
  loadPasswordResetRequestTimestamp,
  remainingResetCooldownSeconds,
  requestPasswordReset,
  restorePasswordResetCooldown,
  savePasswordResetRequestTimestamp,
  type CooldownStorage,
  type PasswordRecoveryClient,
} from '../src/lib/authRecovery';
import { formatVerifiedPaymentLabel, isVerifiedPayment } from '../src/lib/paymentDisplay';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) {
  (globalThis as any).crypto = webcrypto;
}

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
  };
  return { db, d1 };
}

function makeContext<P extends Record<string, string> = Record<string, string>>(
  env: CloudflareEnv,
  body: unknown,
  token?: string,
  method = 'POST',
  params: P = {} as P
): PagesContext<P> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    request: new Request('https://preview.example.test/api/test', {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
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

const originalFetch = globalThis.fetch;
let resendPayload: any = null;
let recoverMode: 'ok' | 'error' = 'ok';
let recoverCalls: Array<{ email: string; redirectTo: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const auth = new Headers(init?.headers || {}).get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const subject =
    token === 'token-owner'
      ? 'auth-owner'
      : token === 'token-other'
        ? 'auth-other'
        : token === 'token-customer'
          ? 'auth-customer'
          : '';

  if (url.includes('/auth/v1/recover')) {
    const payload = JSON.parse(String(init?.body || '{}')) as { email?: string; redirect_to?: string };
    recoverCalls.push({ email: payload.email || '', redirectTo: payload.redirect_to || '' });
    if (recoverMode === 'error') {
      return new Response(JSON.stringify({ message: 'provider rejected request' }), { status: 400 });
    }
    return new Response('{}', { status: 200 });
  }
  if (url.includes('/auth/v1/user')) {
    if (!subject) return new Response('{}', { status: 401 });
    return new Response(JSON.stringify({ id: subject, email: `${subject}@example.invalid` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/rest/v1/profiles')) {
    const role = token === 'token-customer' ? 'customer' : 'business_owner';
    return new Response(JSON.stringify([{ id: subject, role, full_name: 'Test Owner' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('api.resend.com/emails')) {
    resendPayload = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ id: 'email_local_test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

function seedVersionTenant(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, ?, ?, ?, ?, 'published')`
  ).run('web_draft', 'auth-owner', 'draft-store', 'Draft Store', '{"brand":{"name":"Draft Store"}}');
}

interface MockClientOptions {
  clientMissing?: boolean;
  resetError?: string;
  session?: unknown;
  sessionError?: string;
  updateError?: string;
  signOutError?: string;
}

function createMockClient(options: MockClientOptions = {}) {
  const calls = {
    resetPasswordForEmail: [] as Array<{ email: string; redirectTo: string }>,
    getSession: 0,
    updateUser: [] as string[],
    signOut: [] as string[],
  };
  if (options.clientMissing) return { client: null, calls };

  const client: PasswordRecoveryClient = {
    auth: {
      async resetPasswordForEmail(email, callback) {
        calls.resetPasswordForEmail.push({ email, redirectTo: callback.redirectTo });
        return { error: options.resetError ? { message: options.resetError } : null };
      },
      async getSession() {
        calls.getSession++;
        return {
          data: { session: (options.session ?? null) as any },
          error: options.sessionError ? { message: options.sessionError } : null,
        };
      },
      async updateUser(attributes) {
        calls.updateUser.push(attributes.password);
        return { error: options.updateError ? { message: options.updateError } : null };
      },
      async signOut(scopeOptions) {
        calls.signOut.push(scopeOptions?.scope || 'global');
        return { error: options.signOutError ? { message: options.signOutError } : null };
      },
    },
  };
  return { client, calls };
}

const validRecoverySession = { access_token: 'recovery-token', user: { id: 'auth-user' } };

async function runDraftSnapshotTests(): Promise<void> {
  console.log('\nBuilder draft snapshot regressions');
  const { db, d1 } = createD1();
  seedVersionTenant(db);
  const env: CloudflareEnv = {
    DB: d1,
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-test-key',
  };

  await it('real migration CHECK rejects legacy manual_backup literal', async () => {
    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO website_revisions
            (website_id, owner_id, version_number, revision_type, website_json, created_by)
           VALUES (?, ?, ?, 'manual_backup', ?, ?)`
        ).run('web_draft', 'auth-owner', 99, '{}', 'auth-owner'),
      /CHECK constraint failed/
    );
  });

  await it('POST version returns 201, ok:true, and a 64-char SHA-256 checksum', async () => {
    const response = await saveVersion(
      makeContext(env, { label: 'Manual snapshot', isManualBackup: true }, 'token-owner', 'POST', {
        tenantId: '1',
      })
    );
    const body = await readJson(response);
    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.match(body.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(body.note.startsWith('[Manual Backup] '), true);
  });

  await it('stored revision_type is draft and summary keeps manual-save prefix', async () => {
    const row = db.prepare('SELECT revision_type, summary FROM website_revisions ORDER BY id DESC LIMIT 1').get() as any;
    assert.equal(row.revision_type, 'draft');
    assert.equal(row.summary, '[Manual Backup] Manual snapshot');
  });

  await it('GET history includes the created version', async () => {
    const response = await getVersions(
      makeContext(env, {}, 'token-owner', 'GET', { tenantId: '1' })
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.versions.length >= 1, true);
    assert.equal(body.versions[0].status, 'draft');
  });

  await it('public slug tenant identifier also saves successfully', async () => {
    const response = await saveVersion(
      makeContext(env, { label: 'Slug snapshot' }, 'token-owner', 'POST', {
        tenantId: 'draft-store',
      })
    );
    assert.equal(response.status, 201);
    const count = db.prepare("SELECT COUNT(*) AS n FROM website_revisions WHERE website_id = 'web_draft'").get()?.n;
    assert.equal(count, 2);
  });

  await it('cross-tenant owner access remains blocked', async () => {
    const response = await saveVersion(
      makeContext(env, { label: 'Unauthorized' }, 'token-other', 'POST', { tenantId: '1' })
    );
    assert.equal(response.status, 403);
  });

  await it('audit log records create_website_backup with checksum metadata', async () => {
    const row = db
      .prepare("SELECT metadata_json FROM vv_audit_log WHERE action = 'create_website_backup' ORDER BY created_at DESC, id DESC LIMIT 1")
      .get() as any;
    assert.ok(row);
    const metadata = JSON.parse(row.metadata_json);
    assert.match(metadata.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(metadata.actorRole, 'business_owner');
  });
}

let resetEmailCounter = 0;
function uniqueResetEmail(label: string): string {
  resetEmailCounter += 1;
  return `${label}-${resetEmailCounter}-${Date.now()}@example.invalid`;
}

function createMemoryStorage(): CooldownStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

async function callResetRequest(
  env: CloudflareEnv,
  email: string,
  redirectTo = 'https://preview.example.test'
): Promise<Awaited<ReturnType<typeof requestPasswordReset>>> {
  return requestPasswordReset(null, email, redirectTo, async (input, init) => {
    assert.equal(input, '/api/auth/password/reset-request');
    const body = JSON.parse(String(init?.body || '{}'));
    return resetRequestEndpoint(makeContext(env, body, undefined, 'POST'));
  });
}

function configuredResetEnv(): CloudflareEnv {
  const { d1 } = createD1();
  return {
    DB: d1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-test-key',
  };
}

async function runPasswordRecoveryTests(): Promise<void> {
  console.log('\nPassword recovery hardening regressions');

  await it('successful requests for registered and unregistered emails receive identical generic responses', async () => {
    recoverMode = 'ok';
    recoverCalls = [];
    const env = configuredResetEnv();
    const registeredEmail = uniqueResetEmail('registered');
    const unknownEmail = uniqueResetEmail('unknown');
    const a = await callResetRequest(env, registeredEmail.toUpperCase());
    const b = await callResetRequest(env, unknownEmail);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.message, b.message);
    assert.equal(a.message, PASSWORD_RESET_GENERIC_MESSAGE);
    assert.deepEqual(recoverCalls.map((call) => call.email), [registeredEmail, unknownEmail]);
    assert.deepEqual(recoverCalls.map((call) => call.redirectTo), [
      'https://preview.example.test/',
      'https://preview.example.test/',
    ]);
  });

  await it('failed provider requests never expose raw provider text or claim success', async () => {
    recoverMode = 'error';
    recoverCalls = [];
    const result = await callResetRequest(configuredResetEnv(), uniqueResetEmail('provider-failure'));
    recoverMode = 'ok';
    assert.equal(result.ok, false);
    assert.equal(result.message, AUTH_PROVIDER_ERROR_MESSAGE);
    assert.equal(result.message.includes('rejected'), false);
    assert.equal(result.message.includes('sent'), false);
    assert.equal(recoverCalls.length, 1);
  });

  await it('missing provider configuration never reports fake success', async () => {
    const { d1 } = createD1();
    const result = await callResetRequest({ DB: d1 }, uniqueResetEmail('unconfigured'));
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('sent'), false);
  });

  await it('cooldown survives modal reopen and simulated page reload with no sensitive token stored', async () => {
    const storage = createMemoryStorage();
    const firstMount = loadPasswordResetRequestTimestamp(storage);
    assert.equal(firstMount, null);
    const requestedAt = savePasswordResetRequestTimestamp(1_700_000_000_000, storage);
    const reopenedMount = loadPasswordResetRequestTimestamp(storage);
    const pageReloadMount = loadPasswordResetRequestTimestamp(storage);
    assert.equal(reopenedMount, requestedAt);
    assert.equal(pageReloadMount, requestedAt);
    assert.equal(remainingResetCooldownSeconds(reopenedMount, requestedAt + 1_000), 59);
    assert.equal(typeof PASSWORD_RESET_COOLDOWN_STORAGE_KEY, 'string');
    assert.equal(String(requestedAt).includes('token'), false);
  });

  await it('repeated reset requests are blocked server-side with accurate remaining seconds', async () => {
    recoverMode = 'ok';
    const email = uniqueResetEmail('repeat');
    const env = configuredResetEnv();
    const first = await callResetRequest(env, email);
    const second = await callResetRequest(env, email);
    assert.equal(first.ok, true);
    assert.equal(first.remainingSeconds, 60);
    assert.equal(second.ok, false);
    assert.equal(second.code, 'RATE_LIMITED');
    assert.ok((second.remainingSeconds || 0) > 0 && (second.remainingSeconds || 0) <= 60);
    assert.match(second.message || '', /wait \d+ seconds/);
  });

  await it('server rate limit stores only an email hash and enforces the hourly maximum', async () => {
    const env = configuredResetEnv();
    const email = uniqueResetEmail('hourly');
    const hash = await hashPasswordResetEmail(email);
    assert.equal(hash.includes(email), false);
    assert.equal(hash.length, 64);

    for (let index = 0; index < MAX_PASSWORD_RESET_REQUESTS_PER_HOUR; index += 1) {
      const result = await authorizePasswordResetRequest(env, email, 1_800_000_000_000 + index * 61_000);
      assert.equal(result.allowed, true);
    }
    const blocked = await authorizePasswordResetRequest(
      env,
      email,
      1_800_000_000_000 + MAX_PASSWORD_RESET_REQUESTS_PER_HOUR * 61_000
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.code, 'HOURLY_LIMIT');

    const stored = (await env.DB!.prepare(
      'SELECT email_hash FROM password_reset_rate_limits LIMIT 1'
    ).first()) as any;
    assert.equal(String(stored.email_hash).includes(email), false);
  });

  await it('valid recovery session updates password and revokes other sessions', async () => {
    const { client, calls } = createMockClient({ session: validRecoverySession });
    const result = await completePasswordRecovery(client as PasswordRecoveryClient, 'new-password', 'new-password');
    assert.equal(result.ok, true);
    assert.equal(result.message, PASSWORD_UPDATE_SUCCESS_MESSAGE);
    assert.equal(result.sessionsRevoked, true);
    assert.deepEqual(calls.updateUser, ['new-password']);
    assert.deepEqual(calls.signOut, ['others']);
  });

  await it('invalid, expired, or used link has no recovery session and no update', async () => {
    for (const session of [null, { access_token: '' }, { user: { id: 'auth-user' } }, undefined]) {
      const { client, calls } = createMockClient({ session });
      const result = await completePasswordRecovery(client as PasswordRecoveryClient, 'new-password', 'new-password');
      assert.equal(result.ok, false);
      assert.equal(result.code, 'INVALID_RECOVERY_SESSION');
      assert.equal(result.message, PASSWORD_RECOVERY_INVALID_MESSAGE);
      assert.equal(calls.updateUser.length, 0);
      assert.equal(isRecoverySession(session), false);
    }
  });

  await it('no password update is attempted without a recovery session even if UI is forced', async () => {
    const { client, calls } = createMockClient({ sessionError: 'invalid session' });
    const result = await completePasswordRecovery(client as PasswordRecoveryClient, 'new-password', 'new-password');
    assert.equal(result.ok, false);
    assert.equal(calls.getSession, 1);
    assert.equal(calls.updateUser.length, 0);
  });

  await it('failed updateUser returns failure and does not claim success', async () => {
    const { client } = createMockClient({ session: validRecoverySession, updateError: 'weak password from provider' });
    const result = await completePasswordRecovery(client as PasswordRecoveryClient, 'new-password', 'new-password');
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('weak password'), false);
    assert.equal(result.message.includes('updated successfully'), false);
  });

  await it('short or mismatched passwords are rejected before any provider call', async () => {
    const shortClient = createMockClient({ session: validRecoverySession });
    const mismatchClient = createMockClient({ session: validRecoverySession });
    const short = await completePasswordRecovery(shortClient.client as PasswordRecoveryClient, '12345', '12345');
    const mismatch = await completePasswordRecovery(mismatchClient.client as PasswordRecoveryClient, 'abcdef', 'ghijkl');
    assert.equal(short.code, 'INVALID_PASSWORD');
    assert.equal(mismatch.code, 'PASSWORD_MISMATCH');
    assert.equal(shortClient.calls.getSession, 0);
    assert.equal(mismatchClient.calls.getSession, 0);
  });

  await it('reset cooldown is 60 seconds and expires cleanly', async () => {
    const start = 1_700_000_000_000;
    assert.equal(remainingResetCooldownSeconds(null, start), 0);
    assert.equal(remainingResetCooldownSeconds(start, start + 1_000), 59);
    assert.equal(remainingResetCooldownSeconds(start, start + 60_000), 0);
    const restored = restorePasswordResetCooldown(createMemoryStorage(), start);
    assert.equal(restored.remainingSeconds, 0);
  });

  await it('callback URL is derived from the current origin only', async () => {
    assert.equal(getPasswordResetRedirectUrl('https://a5120c49.vijay-visuals-site.pages.dev'), 'https://a5120c49.vijay-visuals-site.pages.dev/');
    assert.equal(getPasswordResetRedirectUrl('https://feat-multi-tenant-website-bu.vijay-visuals-site.pages.dev/'), 'https://feat-multi-tenant-website-bu.vijay-visuals-site.pages.dev/');
    assert.equal(getPasswordResetRedirectUrl(''), '');
  });
}

function assertNoRawOtpInLogs(db: DatabaseSync, eventType: string, rawOtp: string): void {
  const log = db
    .prepare(
      'SELECT * FROM notification_logs WHERE event_type = ? ORDER BY id DESC LIMIT 1'
    )
    .get(eventType) as Record<string, unknown> | undefined;
  assert.ok(log, `missing notification log for ${eventType}`);
  for (const [field, value] of Object.entries(log)) {
    if (typeof value === 'string') {
      assert.equal(
        value.includes(rawOtp),
        false,
        `${field} must not contain raw OTP`
      );
    }
  }
}

function extractRawOtpFromPayload(): string {
  assert.ok(resendPayload, 'Resend payload was not captured');
  const match = String(resendPayload.html).match(/\b\d{6}\b/);
  assert.ok(match, 'No 6-digit OTP found in local mock email payload');
  return match![0];
}

async function runLoggingRedactionTests(): Promise<void> {
  console.log('\nOTP and email logging redaction regressions');

  await it('redaction masks standalone numeric OTP values and keyed secrets', async () => {
    const redacted = redactSensitiveLogText('Your code is 123456; reset_token=abc123xyz');
    assert.equal(redacted.includes('123456'), false);
    assert.equal(redacted.includes('abc123xyz'), false);
    assert.match(redacted, /\[REDACTED\]/);
  });

  await it('direct email logging redacts subject, preview and error detail', async () => {
    const { db, d1 } = createD1();
    const env: CloudflareEnv = {
      DB: d1,
      RESEND_API_KEY: 'local-mock-key',
      RESEND_FROM: 'Local Test <test@example.invalid>',
    };
    const rawOtp = '482913';
    resendPayload = null;
    const result = await sendTransactionalEmail(env, {
      to: 'customer@example.invalid',
      subject: 'Your verification code',
      html: `<p>Your code is ${rawOtp}</p>`,
      text: `Your verification code is ${rawOtp}. Never share it.`,
      eventType: 'registration_otp',
      idempotencyKey: 'local_otp_redaction_test',
    });
    assert.equal(result.ok, true);
    assert.equal(resendPayload.subject, 'Your verification code');
    assertNoRawOtpInLogs(db, 'registration_otp', rawOtp);
  });

  await it('OTP send uses a generic subject and persists no raw OTP in any log field', async () => {
    const { db, d1 } = createD1();
    const env: CloudflareEnv = { DB: d1, RESEND_API_KEY: 'local-mock-key' };
    resendPayload = null;
    const response = await sendOtp(
      makeContext(env, { email: 'send-otp@example.invalid', purpose: 'registration' }, undefined, 'POST')
    );
    assert.equal(response.status, 200);
    const rawOtp = extractRawOtpFromPayload();
    assert.equal(resendPayload.subject, 'Your verification code');
    assertNoRawOtpInLogs(db, 'registration_otp', rawOtp);
  });

  await it('OTP resend uses a generic subject and persists no raw OTP in any log field', async () => {
    const { db, d1 } = createD1();
    const env: CloudflareEnv = { DB: d1, RESEND_API_KEY: 'local-mock-key' };
    const email = 'resend-otp@example.invalid';
    db.prepare(
      `INSERT INTO auth_email_otps
        (email, otp_hash, salt, purpose, metadata_json, attempts, max_attempts,
         expires_at, resend_available_at, created_at)
       VALUES (?, ?, ?, 'registration', '{}', 0, 5,
         datetime('now', '+10 minutes'), datetime('now', '-1 second'), datetime('now'))`
    ).run(email, 'local-hash', 'local-salt');

    resendPayload = null;
    const response = await resendOtp(
      makeContext(env, { email, purpose: 'registration' }, undefined, 'POST')
    );
    assert.equal(response.status, 200);
    const rawOtp = extractRawOtpFromPayload();
    assert.equal(resendPayload.subject, 'Your new verification code');
    assertNoRawOtpInLogs(db, 'registration_otp_resend', rawOtp);
  });
}

function seedPackageWebsite(
  db: DatabaseSync,
  options: {
    websiteId: string;
    slug: string;
    businessName: string;
    paymentStatus?: 'created' | 'paid' | 'failed' | 'refunded';
    entitlementStatus?: 'active' | 'revoked';
    planCode?: string;
    staleNotes?: boolean;
  }
): void {
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, 'auth-owner', ?, ?, ?, 'published')`
  ).run(
    options.websiteId,
    options.slug,
    options.businessName,
    JSON.stringify({
      seoTitle: `${options.businessName} Store`,
      logoImage: 'https://cdn.example.test/logo.png',
      primaryColor: '#D4AF37',
    })
  );

  if (options.paymentStatus) {
    db.prepare(
      `INSERT INTO platform_payments
        (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
         base_amount_inr, amount_inr, razorpay_order_id, status, signature_verified, notes_json)
       VALUES (?, 'auth-owner', 'website_purchase', ?, ?, 'one_time', ?, ?, ?, ?, ?, ?)`
    ).run(
      options.websiteId,
      options.planCode || 'starter-website',
      'Starter Website Package',
      2999,
      3539,
      `order_${options.websiteId}`,
      options.paymentStatus,
      options.paymentStatus === 'paid' ? 1 : 0,
      JSON.stringify(
        options.staleNotes
          ? { orderState: 'ACTIVE', deliveryStatus: 'ACTIVE', websiteUrl: '/site/old-slug' }
          : {}
      )
    );
  }

  if (options.entitlementStatus) {
    db.prepare(
      `INSERT INTO tenant_lifetime_entitlements
        (website_id, owner_id, plan_code, entitlement_type, status, source, source_reference)
       VALUES (?, 'auth-owner', ?, 'one_time_purchase', ?, 'local_test', ?)`
    ).run(
      options.websiteId,
      options.planCode || 'starter-website',
      options.entitlementStatus,
      options.websiteId
    );
    const paymentId = (db.prepare('SELECT id FROM platform_payments WHERE razorpay_order_id = ?').get(`order_${options.websiteId}`) as any)?.id;
    const entitlementId = (db
      .prepare('SELECT id FROM tenant_lifetime_entitlements WHERE website_id = ? ORDER BY id DESC LIMIT 1')
      .get(options.websiteId) as any)?.id;
    if (paymentId && entitlementId) {
      db.prepare('INSERT INTO platform_payment_entitlements (payment_id, entitlement_id) VALUES (?, ?)').run(
        paymentId,
        entitlementId
      );
    }
  }
}

async function runPackageStatusTests(): Promise<void> {
  console.log('\nPackage entitlement status regressions');
  const { db, d1 } = createD1();
  seedPackageWebsite(db, {
    websiteId: 'web_active',
    slug: 'active-store',
    businessName: 'Active Store',
    paymentStatus: 'paid',
    entitlementStatus: 'active',
  });
  const env: CloudflareEnv = {
    DB: d1,
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-test-key',
  };

  await it('paid verified package reports ACTIVE from entitlement, not payment alone', async () => {
    const response = await getPackageStatus(makeContext(env, {}, 'token-owner', 'GET'));
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.packageStatus, 'active');
    assert.equal(body.paymentStatus, 'paid');
    assert.equal(body.canPublish, true);
    assert.equal(body.planCode, 'starter-website');
    assert.equal(body.planName, 'Starter Website Package');
  });

  await it('pending order without entitlement never reports ACTIVE', async () => {
    const { db: pendingDb, d1: pendingD1 } = createD1();
    seedPackageWebsite(pendingDb, {
      websiteId: 'web_pending',
      slug: 'pending-store',
      businessName: 'Pending Store',
      paymentStatus: 'created',
    });
    const response = await getPackageStatus(
      makeContext({ ...env, DB: pendingD1 }, {}, 'token-owner', 'GET')
    );
    const body = await readJson(response);
    assert.equal(body.packageStatus, 'pending');
    assert.equal(body.canPublish, false);
  });

  await it('refunded payment with revoked entitlement reports REFUNDED', async () => {
    const { db: refundDb, d1: refundD1 } = createD1();
    seedPackageWebsite(refundDb, {
      websiteId: 'web_refunded',
      slug: 'refunded-store',
      businessName: 'Refunded Store',
      paymentStatus: 'refunded',
      entitlementStatus: 'revoked',
      staleNotes: true,
    });
    const statusResponse = await getPackageStatus(
      makeContext({ ...env, DB: refundD1 }, {}, 'token-owner', 'GET')
    );
    const statusBody = await readJson(statusResponse);
    assert.equal(statusBody.packageStatus, 'refunded');
    assert.equal(statusBody.canPublish, false);

    const history = await getPaymentHistory(
      makeContext({ ...env, DB: refundD1 }, {}, 'token-owner', 'GET')
    );
    const historyBody = await readJson(history);
    assert.equal(history.status, 200);
    assert.equal(historyBody.payments[0].status, 'refunded');
    assert.equal(historyBody.payments[0].entitlement_status, 'revoked');
  });

  await it('customer without a website gets NONE instead of a hardcoded active package', async () => {
    const { d1: emptyD1 } = createD1();
    const response = await getPackageStatus(
      makeContext({ ...env, DB: emptyD1 }, {}, 'token-owner', 'GET')
    );
    const body = await readJson(response);
    assert.equal(body.packageStatus, 'none');
    assert.equal(body.planName, 'No package selected');
    assert.equal(body.canPublish, false);
  });
}

async function runWhiteLabelAndDeliveryTests(): Promise<void> {
  console.log('\nWhite-label and tenant delivery URL regressions');

  await it('delivery host parsing accepts tenant prefixes and rejects platform prefixes', async () => {
    assert.deepEqual(parseTenantDeliveryHostname('tenant-a.vijayvisuals.in'), {
      slug: 'tenant-a',
      parentHost: 'vijayvisuals.in',
      isPreviewParent: false,
    });
    assert.deepEqual(parseTenantDeliveryHostname('tenant-a.vijay-visuals-site.pages.dev'), {
      slug: 'tenant-a',
      parentHost: 'vijay-visuals-site.pages.dev',
      isPreviewParent: true,
    });
    assert.equal(parseTenantDeliveryHostname('master.vijay-visuals-site.pages.dev'), null);
    assert.equal(parseTenantDeliveryHostname('a5120c49.vijay-visuals-site.pages.dev'), null);
    assert.equal(parseTenantDeliveryHostname('feat-multi-tenant-website-bu.vijay-visuals-site.pages.dev'), null);
    assert.equal(parseTenantDeliveryHostname('vijay-visuals-site.pages.dev'), null);
    assert.equal(parseTenantDeliveryHostname('tenant.other.example'), null);
  });

  const { db, d1 } = createD1();
  db.prepare(
    `INSERT INTO customer_website_publications
      (website_id, owner_id, public_slug, business_name, website_json, status)
     VALUES (?, 'auth-owner', ?, ?, ?, 'published')`
  ).run(
    'web_delivery',
    'tenant-a',
    'Tenant A',
    JSON.stringify({
      seoTitle: 'Tenant A Official Store',
      logoImage: 'https://cdn.example.test/tenant-a.png',
      primaryColor: '#D4AF37',
    })
  );
  db.prepare(
    `INSERT INTO tenant_domains
      (website_id, owner_id, domain_name, status, www_mode, dns_verification_status, ssl_status, verification_token)
     VALUES (?, 'auth-owner', ?, 'live', 'both', 'verified', 'active', ?)`
  ).run('web_delivery', 'shop.tenant-a.test', 'local-verification-token');

  const env: CloudflareEnv = {
    DB: d1,
    VITE_SUPABASE_URL: 'https://supabase.invalid',
    VITE_SUPABASE_ANON_KEY: 'anon-test-key',
  };
  const platformHtml = `<!doctype html><html><head>
    <title>VIJAY VISUALS · Creative Studio</title>
    <meta name="description" content="Platform description" />
    <link rel="canonical" href="https://vijay-visuals-site.pages.dev/" />
    <meta property="og:site_name" content="VIJAY VISUALS" />
    <meta name="twitter:title" content="VIJAY VISUALS" />
    <meta name="google-site-verification" content="platform-token" />
    <meta name="theme-color" content="#08080A" />
    <meta name="mobile-web-app-capable" content="yes" />
    <link rel="alternate" hreflang="en" href="https://vijay-visuals-site.pages.dev/?lang=en" />
    <link rel="icon" href="/official_logo_circle.png" />
    <link rel="apple-touch-icon" href="/official_logo_circle.png" />
    <script type="application/ld+json">{"name":"VIJAY VISUALS"}</script>
    <script type="application/ld+json">{"@type":"FAQPage"}</script>
    </head><body>PLATFORM SHELL</body></html>`;
  const next = async () =>
    new Response(platformHtml, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const deliveryResponse = await handleTenantMiddleware({
    request: new Request('https://tenant-a.vijay-visuals-site.pages.dev/'),
    env,
    params: {},
    next,
  });
  const deliveryHtml = await deliveryResponse.text();

  await it('published delivery subdomain resolves without a tenant_domains row', async () => {
    assert.equal(deliveryResponse.status, 200);
    assert.equal(deliveryResponse.headers.get('X-VV-Tenant-Slug'), 'tenant-a');
    assert.equal(
      deliveryResponse.headers.get('X-VV-Domain-Status'),
      'requires_wildcard_dns_tls'
    );
    assert.match(deliveryHtml, /meta name="vv-tenant-slug" content="tenant-a"/);
    assert.match(deliveryHtml, /<link rel="canonical" href="https:\/\/tenant-a\.vijay-visuals-site\.pages\.dev"/);
  });

  await it('delivery subdomain HTML replaces platform metadata instead of appending', async () => {
    assert.equal(deliveryHtml.includes('VIJAY VISUALS'), false);
    assert.equal(deliveryHtml.includes('/official_logo_circle.png'), false);
    assert.equal(deliveryHtml.includes('google-site-verification'), false);
    assert.equal(deliveryHtml.includes('theme-color" content="#08080A"'), false);
    assert.equal(deliveryHtml.includes('mobile-web-app-capable'), false);
    assert.equal(deliveryHtml.includes('hreflang="en"'), false);
    assert.equal(deliveryHtml.includes('FAQPage'), false);
    assert.match(deliveryHtml, /og:site_name" content="Tenant A"/);
    assert.match(deliveryHtml, /twitter:card" content="summary"/);
    assert.equal((deliveryHtml.match(/<title>/g) || []).length, 1);
    assert.equal((deliveryHtml.match(/<link rel="canonical"/g) || []).length, 1);
    assert.equal((deliveryHtml.match(/application\/ld\+json/g) || []).length, 1);
  });

  await it('custom domain still resolves with tenant metadata', async () => {
    const response = await handleTenantMiddleware({
      request: new Request('https://shop.tenant-a.test/'),
      env,
      params: {},
      next,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-VV-Tenant-Slug'), 'tenant-a');
    assert.match(await response.text(), /og:site_name" content="Tenant A"/);
  });

  await it('unknown deploy preview and official platform hosts remain unchanged', async () => {
    for (const url of [
      'https://a5120c49.vijay-visuals-site.pages.dev/',
      'https://feat-multi-tenant-website-bu.vijay-visuals-site.pages.dev/',
      'https://vijay-visuals-site.pages.dev/',
    ]) {
      const response = await handleTenantMiddleware({
        request: new Request(url),
        env,
        params: {},
        next,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), platformHtml);
      assert.equal(response.headers.get('X-VV-Tenant-Slug'), null);
    }
  });

  await it('unconnected custom domain blocked page has no platform branding', async () => {
    const response = await handleTenantMiddleware({
      request: new Request('https://unconnected.example.test/'),
      env,
      params: {},
      next,
    });
    const html = await response.text();
    assert.equal(response.status, 403);
    assert.equal(html.includes('Vijay Visuals'), false);
  });

  await it('customer store-order email is tenant-branded and links to the public storefront', async () => {
    const html = buildOrderConfirmationEmailHtml({
      customerName: 'A Customer',
      orderNumber: 'ORD-1',
      packageName: 'Tenant A Order',
      amountFormatted: '₹1,000',
      dashboardUrl: 'https://vijay-visuals-site.pages.dev/site/tenant-a',
      businessName: 'Tenant A',
      storeUrl: 'https://vijay-visuals-site.pages.dev/site/tenant-a',
    });
    assert.equal(html.includes('Vijay Visuals'), false);
    assert.match(html, /Tenant A/);
    assert.match(html, /Order Confirmation/);
    assert.match(html, /View Store/);
    assert.match(html, /site\/tenant-a/);
    assert.equal(html.includes('3–5 Business Days'), false);

    const platformHtml = buildOrderConfirmationEmailHtml({
      customerName: 'A Customer',
      orderNumber: 'ORD-2',
      packageName: 'Business Website Package',
      amountFormatted: '₹7,999',
      dashboardUrl: 'https://vijay-visuals-site.pages.dev/dashboard',
    });
    assert.match(platformHtml, /VIJAY VISUALS/);
  });

  await it('publish response maps the tenant and states DNS/TLS prerequisites honestly', async () => {
    const { db: publishDb, d1: publishD1 } = createD1();
    seedPackageWebsite(publishDb, {
      websiteId: 'web_publish',
      slug: 'publish-store',
      businessName: 'Publish Store',
      paymentStatus: 'paid',
      entitlementStatus: 'active',
    });
    const response = await publishWebsite(
      makeContext({ ...env, DB: publishD1 }, { published: true }, 'token-owner', 'PATCH', {
        tenantId: 'web_publish',
      })
    );
    const body = await readJson(response);
    assert.equal(response.status, 200);
    assert.equal(body.published, true);
    assert.equal(body.tenant.published, true);
    assert.equal(body.siteUrl, 'https://vijay-visuals-site.pages.dev/site/publish-store');
    assert.equal(body.deliverySubdomainUrl, 'https://publish-store.vijay-visuals-site.pages.dev');
    assert.equal(body.deliverySubdomainStatus, 'requires_wildcard_dns_tls');
    assert.match(body.deliveryNotice, /DNS and HTTPS verification/);
  });

  await it('customer-facing source has no platform credit leaks', async () => {
    const files = [
      'src/components/InvoiceModal.tsx',
      'src/components/StorefrontReviews.tsx',
      'src/components/StorefrontView.tsx',
      'src/components/OrderTrackerModal.tsx',
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      assert.equal(source.includes('Powered by Vijay Visuals'), false, file);
      assert.equal(source.includes('audited by Vijay Visuals'), false, file);
      assert.equal(source.includes('Verified Server-Side by Vijay Visuals'), false, file);
      assert.equal(source.includes('any Vijay Visuals storefront'), false, file);
    }
  });

  await it('customer email sender is neutral when no verified tenant identity is configured', async () => {
    const sender = resolveEmailSender(
      { RESEND_API_KEY: 'local-mock-key' },
      { audience: 'customer', tenantBrandName: 'Tenant A' }
    );
    assert.equal(sender.formatted, 'Store Notifications <onboarding@resend.dev>');
    assert.equal(sender.formatted.includes('Vijay Visuals'), false);

    const platformSender = resolveEmailSender({ RESEND_FROM: 'Platform <platform@example.invalid>' });
    assert.equal(platformSender.formatted, 'Platform <platform@example.invalid>');
  });

  await it('tenant sender requires real domain verification and provider allowlist agreement', async () => {
    const { db, d1 } = createD1();
    db.prepare(
      `INSERT INTO customer_website_publications
        (website_id, owner_id, public_slug, business_name, website_json, status)
       VALUES ('web_sender', 'auth-owner', 'sender-store', 'Sender Store', '{}', 'published')`
    ).run();
    db.prepare(
      `INSERT INTO tenant_domains
        (website_id, owner_id, domain_name, status, www_mode,
         dns_verification_status, ssl_status, verification_token)
       VALUES ('web_sender', 'auth-owner', 'shop.sender.test', 'live', 'both',
         'verified', 'active', 'local-token')`
    ).run();

    const allowedEnv: CloudflareEnv = {
      DB: d1,
      RESEND_VERIFIED_SENDER_DOMAINS: 'shop.sender.test, other.test',
    };
    const verified = await resolveVerifiedTenantSender(allowedEnv, 'web_sender');
    assert.deepEqual(verified, {
      email: 'notifications@shop.sender.test',
      domain: 'shop.sender.test',
    });
    const sender = resolveEmailSender(allowedEnv, {
      audience: 'customer',
      tenantBrandName: 'Vijay Visuals Impersonation',
      verifiedSenderEmail: verified?.email,
      verifiedSenderDomain: verified?.domain,
    });
    assert.equal(sender.formatted, 'Store Notifications Impersonation <notifications@shop.sender.test>');

    assert.equal(await resolveVerifiedTenantSender({ DB: d1 }, 'web_sender'), null);
    const spoofed = resolveEmailSender(
      { DB: d1 },
      {
        audience: 'customer',
        tenantBrandName: 'Sender Store',
        verifiedSenderEmail: 'billing@unverified.test',
        verifiedSenderDomain: 'unverified.test',
      }
    );
    assert.equal(spoofed.formatted, 'Store Notifications <onboarding@resend.dev>');
  });

  await it('store payment notifications are tenant-only and platform receipts stay platform-owned', async () => {
    const storeHtml = buildStorePaymentReceiptEmailHtml({
      customerName: 'A Customer',
      orderNumber: 'ORD-STORE-1',
      paymentId: 'pay_local',
      amountFormatted: '₹1,000',
      paymentTime: '2026-01-01T00:00:00Z',
      storeName: 'Sender Store',
      storeUrl: 'https://vijay-visuals-site.pages.dev/site/sender-store',
    });
    assert.equal(/Vijay Visuals/i.test(storeHtml), false);
    assert.equal(storeHtml.includes('/dashboard'), false);
    assert.equal(storeHtml.includes('3–5 Business Days'), false);
    assert.match(storeHtml, /View Store/);
    assert.match(storeHtml, /site\/sender-store/);

    const storeWa = buildStorePaymentWhatsAppText({
      storeName: 'Sender Store',
      customerName: 'A Customer',
      orderNumber: 'ORD-STORE-1',
      amountFormatted: '₹1,000',
      paymentId: 'pay_local',
      storeUrl: 'https://vijay-visuals-site.pages.dev/site/sender-store',
    });
    assert.equal(/VIJAY VISUALS/i.test(storeWa), false);
    assert.equal(storeWa.includes('/dashboard'), false);
    assert.equal(storeWa.includes('3–5'), false);
    assert.match(storeWa, /site\/sender-store/);

    const platformHtml = buildPaymentReceiptEmailHtml({
      customerName: 'A Customer',
      orderNumber: 'PLATFORM-1',
      paymentId: 'pay_platform',
      amountFormatted: '₹7,999',
      paymentTime: '2026-01-01T00:00:00Z',
      dashboardUrl: 'https://vijay-visuals-site.pages.dev/dashboard',
    });
    assert.match(platformHtml, /VIJAY VISUALS/);
    assert.match(platformHtml, /Track Project Progress/);
  });

  const resolverResponse = await handleTenantMiddleware({
    request: new Request('https://tenant-a.vijay-visuals-site.pages.dev/'),
    env,
    params: {},
    next,
  });
  assert.equal(
    resolverResponse.headers.get('X-VV-Domain-Status'),
    'requires_wildcard_dns_tls'
  );

  const domainResolution = await resolveDomain({
    request: new Request(
      'https://vijay-visuals-site.pages.dev/api/domains/resolve?host=tenant-a.vijay-visuals-site.pages.dev'
    ),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext);
  const domainBody = await readJson(domainResolution);
  assert.equal(domainBody.matched, true);
  assert.equal(domainBody.status, 'requires_wildcard_dns_tls');
  assert.equal(domainBody.sslStatus, 'pending');
}

async function runVerifiedPaymentDisplayTests(): Promise<void> {
  console.log('\nVerified payment display regressions');

  await it('verified label requires paid status and authoritative signature verification', async () => {
    const verified = {
      amountInr: 7999,
      paymentStatus: 'paid',
      signatureVerified: true,
    };
    assert.equal(isVerifiedPayment(verified), true);
    assert.equal(formatVerifiedPaymentLabel(verified), '₹7,999 verified payment');
  });

  await it('pending, failed, refunded and unverified payments are never labelled verified', async () => {
    for (const state of [
      { amountInr: 7999, paymentStatus: 'pending', signatureVerified: true },
      { amountInr: 7999, paymentStatus: 'failed', signatureVerified: true },
      { amountInr: 7999, paymentStatus: 'refunded', signatureVerified: true },
      { amountInr: 7999, paymentStatus: 'paid', signatureVerified: false },
      { amountInr: 7999, paymentStatus: 'paid', signatureVerified: null },
      { amountInr: 7999, paymentStatus: null, signatureVerified: true },
    ]) {
      assert.equal(isVerifiedPayment(state), false);
      assert.equal(formatVerifiedPaymentLabel(state), 'No verified payment recorded');
    }
  });

  await it('payment verification display stays separate from entitlement status', async () => {
    const state = {
      amountInr: 7999,
      paymentStatus: 'created',
      signatureVerified: false,
    };
    assert.equal(formatVerifiedPaymentLabel(state), 'No verified payment recorded');
    assert.equal(isVerifiedPayment(state), false);
  });
}

async function main(): Promise<void> {
  console.log('================================================================');
  console.log(' CONSOLIDATED PRIORITY FIX LOCAL TESTS');
  console.log('================================================================');
  try {
    await runDraftSnapshotTests();
    await runPasswordRecoveryTests();
    await runPackageStatusTests();
    await runVerifiedPaymentDisplayTests();
    await runWhiteLabelAndDeliveryTests();
    await runLoggingRedactionTests();
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
