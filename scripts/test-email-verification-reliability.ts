// ============================================================================
// EMAIL VERIFICATION RELIABILITY — fully local mocked regression suite.
// No real email, OTP, Supabase user, payment, D1 remote, or Production access.
// Covers delivery honesty, OTP security, provisioning gates, public browsing,
// and mobile/desktop registration UI guards.
// ============================================================================

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import {
  type CloudflareEnv,
  type D1Database,
  type PagesContext,
} from '../functions/api/_shared';
import { onRequestGet as healthGet } from '../functions/api/health';
import {
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  MAX_OTP_ATTEMPTS,
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
} from '../functions/api/auth/_otpShared';
import { onRequestPost as sendOtp } from '../functions/api/auth/otp/send';
import { onRequestPost as resendOtp } from '../functions/api/auth/otp/resend';
import { onRequestPost as verifyOtp } from '../functions/api/auth/otp/verify';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err?.message || err}`);
  }
}

function readSource(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(root, 'cloudflare', 'd1', 'schema.sql'), 'utf8'));
  const migrations = path.join(root, 'cloudflare', 'd1', 'migrations');
  for (const file of fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
  }

  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      const stmt = {
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
      };
      return stmt as any;
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  } as D1Database;
  return { db, d1 };
}

function makeEnv(d1: D1Database): CloudflareEnv {
  return {
    DB: d1,
    RESEND_API_KEY: 'local-mock-resend-key',
    RESEND_FROM: 'Vijay Visuals <notifications@vijayvisuals.com>',
    VITE_SUPABASE_URL: 'https://synthetic-preview.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'synthetic-anon-key-for-offline-tests',
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${'x'.repeat(60)}`,
    CASHFREE_ENV: 'sandbox',
  } as CloudflareEnv;
}

const params = {} as Record<string, string>;

function postContext(
  env: CloudflareEnv,
  body: unknown,
  ip: string,
  method = 'POST'
): PagesContext {
  return {
    request: new Request('https://preview.example.test/api/regression', {
      method,
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body ?? {}),
    }),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext;
}

function getContext(env: CloudflareEnv): PagesContext {
  return {
    request: new Request('https://preview.example.test/api/health'),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext;
}

type ResendMode = 'ok' | 'provider_reject';
let resendMode: ResendMode = 'ok';
let lastResendPayload: any = null;
let supabaseUsers: Array<{ id: string; email: string }> = [];
const providerCalls = {
  resend: 0,
  supabaseList: 0,
  supabaseCreate: 0,
  supabaseUpdate: 0,
};

function resetProviders(mode: ResendMode = 'ok', existingUsers: Array<{ id: string; email: string }> = []) {
  resendMode = mode;
  lastResendPayload = null;
  supabaseUsers = existingUsers.map((user) => ({ ...user }));
  providerCalls.resend = 0;
  providerCalls.supabaseList = 0;
  providerCalls.supabaseCreate = 0;
  providerCalls.supabaseUpdate = 0;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const method = String(init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || {});

  if (url.includes('api.resend.com/emails')) {
    providerCalls.resend++;
    lastResendPayload = JSON.parse(String(init?.body || '{}'));
    if (resendMode === 'provider_reject') {
      return new Response(
        JSON.stringify({
          name: 'validation_error',
          message:
            'You can only send testing emails to your own email address (vk66278@gmail.com). To send emails to other recipients, please verify a domain at resend.com/domains',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ id: 'local-mock-resend-message' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/auth/v1/admin/users')) {
    const body = JSON.parse(String(init?.body || '{}')) as { email?: string };
    if (method === 'GET') {
      providerCalls.supabaseList++;
      return new Response(JSON.stringify({ users: supabaseUsers }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'POST') {
      providerCalls.supabaseCreate++;
      const email = String(body.email || '').toLowerCase();
      if (supabaseUsers.some((user) => user.email.toLowerCase() === email)) {
        return new Response(
          JSON.stringify({ message: 'A user with this email address has already been registered' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const user = { id: `mock-uid-${providerCalls.supabaseCreate}`, email };
      supabaseUsers.push(user);
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'PUT' || method === 'PATCH') {
      providerCalls.supabaseUpdate++;
      const id = url.split('/').pop()?.split('?')[0] || 'mock-existing-uid';
      return new Response(
        JSON.stringify({ user: { id, email: String(body.email || '').toLowerCase() } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Ensures the mock never silently reaches a real endpoint.
  void headers;
  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

async function bodyPayload(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

function capturedOtp(): string {
  const text = String(lastResendPayload?.text || '');
  const html = String(lastResendPayload?.html || '');
  const match = text.match(/\b\d{6}\b/) || html.match(/\b\d{6}\b/);
  assert.ok(match, 'mock email payload should contain a 6-digit OTP');
  return match![0];
}

function otpRow(db: DatabaseSync, email: string): any {
  return db
    .prepare(
      `SELECT id, consumed_at, attempts, max_attempts, expires_at
       FROM auth_email_otps WHERE email = ? ORDER BY id DESC LIMIT 1`
    )
    .get(email);
}

function userCount(db: DatabaseSync): number {
  return Number((db.prepare('SELECT COUNT(*) AS count FROM vv_users').get() as any).count);
}

async function sendRegistrationOtp(email: string, ip: string) {
  const { db, d1 } = createD1();
  const env = makeEnv(d1);
  const response = await sendOtp(
    postContext(
      env,
      {
        email,
        fullName: 'Preview Test Customer',
        phone: '+910000000000',
        purpose: 'registration',
      },
      ip
    )
  );
  return { db, d1, env, response, payload: lastResendPayload };
}

function verifyContext(env: CloudflareEnv, email: string, otp: string, ip: string) {
  return postContext(
    env,
    {
      email,
      otp,
      purpose: 'registration',
      password: 'SyntheticPass123!',
    },
    ip
  );
}

console.log('--- EMAIL VERIFICATION RELIABILITY (MOCKED) ---');

await it('exact delivery-failure copy is used by both OTP endpoints and the browser', () => {
  const sendSource = readSource('functions/api/auth/otp/send.ts');
  const resendSource = readSource('functions/api/auth/otp/resend.ts');
  const modalSource = readSource('src/components/auth/AuthModal.tsx');

  assert.ok(sendSource.includes('EMAIL_DELIVERY_UNAVAILABLE_MESSAGE'));
  assert.ok(resendSource.includes('EMAIL_DELIVERY_UNAVAILABLE_MESSAGE'));
  assert.ok(modalSource.includes(EMAIL_DELIVERY_UNAVAILABLE_MESSAGE));
  assert.match(modalSource, /otpRes\.status === 503 \|\| otpData\.error === EMAIL_DELIVERY_UNAVAILABLE_MESSAGE/);
  assert.match(modalSource, /res\.status === 503 \|\| data\.error === EMAIL_DELIVERY_UNAVAILABLE_MESSAGE/);
});

await it('verification is claimed before provisioning and failed resend clears unusable code state', () => {
  const verifySource = readSource('functions/api/auth/otp/verify.ts');
  const modalSource = readSource('src/components/auth/AuthModal.tsx');

  const claimIndex = verifySource.indexOf('const consume = await env.DB.prepare(');
  const provisionIndex = verifySource.indexOf('provisionVerifiedCustomer(env, {');
  assert.ok(claimIndex > 0);
  assert.ok(provisionIndex > claimIndex);

  const resendFailureIndex = modalSource.indexOf('const deliveryUnavailable =');
  const clearDigitsIndex = modalSource.indexOf("setOtpDigits(['', '', '', '', '', '']);", resendFailureIndex);
  const clearCooldownIndex = modalSource.indexOf('setOtpCooldown(0);', resendFailureIndex);
  assert.ok(resendFailureIndex > 0);
  assert.ok(clearDigitsIndex > resendFailureIndex);
  assert.ok(clearCooldownIndex > clearDigitsIndex && clearCooldownIndex - clearDigitsIndex < 200);
  assert.match(
    modalSource,
    /verifyRes\.status === 503\s*\?\s*'Verification service is temporarily unavailable\. Please try again later\./
  );
});

await it('OTP security constants remain 10 minutes, 60 seconds, 5 attempts, hashed', () => {
  const shared = readSource('functions/api/auth/_otpShared.ts');
  assert.equal(OTP_EXPIRY_MINUTES, 10);
  assert.equal(RESEND_COOLDOWN_SECONDS, 60);
  assert.equal(MAX_OTP_ATTEMPTS, 5);
  assert.match(shared, /SHA-256/);
  assert.match(shared, /timingSafeEqual/);
});

await it('failed OTP send returns the exact message, consumes the code, and creates no account', async () => {
  resetProviders('provider_reject');
  const { db, env, response } = await sendRegistrationOtp('delivery-fail@example.invalid', '10.1.0.1');
  const payload = await bodyPayload(response);

  assert.equal(response.status, 503);
  assert.equal(payload.error, EMAIL_DELIVERY_UNAVAILABLE_MESSAGE);
  assert.equal(payload.code, 'EMAIL_DELIVERY_UNAVAILABLE');
  assert.ok(otpRow(db, 'delivery-fail@example.invalid')?.consumed_at);
  assert.equal(userCount(db), 0);
  assert.equal(providerCalls.supabaseCreate, 0);

  const verify = await verifyOtp(
    verifyContext(env, 'delivery-fail@example.invalid', '123456', '10.1.0.2')
  );
  const verifyPayload = await bodyPayload(verify);
  assert.equal(verify.status, 404);
  assert.notEqual(verifyPayload.ok, true);
  assert.equal(userCount(db), 0);
  assert.equal(providerCalls.supabaseCreate, 0);
});

await it('failed resend returns the exact message and leaves no redeemable code', async () => {
  resetProviders('provider_reject');
  const { db, d1 } = createD1();
  const env = makeEnv(d1);
  const response = await resendOtp(
    postContext(env, { email: 'resend-fail@example.invalid', purpose: 'registration' }, '10.2.0.1')
  );
  const payload = await bodyPayload(response);

  assert.equal(response.status, 503);
  assert.equal(payload.error, EMAIL_DELIVERY_UNAVAILABLE_MESSAGE);
  assert.equal(payload.code, 'EMAIL_DELIVERY_UNAVAILABLE');
  assert.ok(otpRow(db, 'resend-fail@example.invalid')?.consumed_at);
  assert.equal(userCount(db), 0);
  assert.equal(providerCalls.supabaseCreate, 0);
});

await it('successful verification provisions one confirmed customer and consumes the OTP', async () => {
  resetProviders('ok');
  const { db, env, response } = await sendRegistrationOtp('success@example.invalid', '10.3.0.1');
  assert.equal(response.status, 200);
  assert.equal(otpRow(db, 'success@example.invalid')?.consumed_at, null);

  const otp = capturedOtp();
  const verify = await verifyOtp(verifyContext(env, 'success@example.invalid', otp, '10.3.0.2'));
  const payload = await bodyPayload(verify);

  assert.equal(verify.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.verified, true);
  assert.equal(payload.profile.role, 'customer');
  assert.equal(payload.profile.emailVerified, true);
  assert.equal(providerCalls.supabaseCreate, 1);
  assert.equal(userCount(db), 1);
  assert.ok(otpRow(db, 'success@example.invalid')?.consumed_at);
});

await it('a verified OTP cannot be reused for a second account', async () => {
  resetProviders('ok');
  const { db, env } = await sendRegistrationOtp('reuse@example.invalid', '10.4.0.1');
  const otp = capturedOtp();
  const first = await verifyOtp(verifyContext(env, 'reuse@example.invalid', otp, '10.4.0.2'));
  assert.equal(first.status, 200);

  const second = await verifyOtp(verifyContext(env, 'reuse@example.invalid', otp, '10.4.0.3'));
  const payload = await bodyPayload(second);
  assert.equal(second.status, 404);
  assert.notEqual(payload.ok, true);
  assert.equal(providerCalls.supabaseCreate, 1);
  assert.equal(userCount(db), 1);
});

await it('expired OTP is rejected and invalidated without provisioning', async () => {
  resetProviders('ok');
  const { db, env } = await sendRegistrationOtp('expired@example.invalid', '10.5.0.1');
  db.prepare(
    `UPDATE auth_email_otps
     SET expires_at = datetime('now', '-1 minute')
     WHERE email = ?`
  ).run('expired@example.invalid');

  const verify = await verifyOtp(
    verifyContext(env, 'expired@example.invalid', capturedOtp(), '10.5.0.2')
  );
  const payload = await bodyPayload(verify);

  assert.equal(verify.status, 400);
  assert.equal(payload.code, 'OTP_EXPIRED');
  assert.ok(otpRow(db, 'expired@example.invalid')?.consumed_at);
  assert.equal(providerCalls.supabaseCreate, 0);
  assert.equal(userCount(db), 0);
});

await it('invalid OTP reports remaining attempts and does not create an account', async () => {
  resetProviders('ok');
  const { db, env } = await sendRegistrationOtp('invalid@example.invalid', '10.6.0.1');

  const verify = await verifyOtp(verifyContext(env, 'invalid@example.invalid', '000000', '10.6.0.2'));
  const payload = await bodyPayload(verify);

  assert.equal(verify.status, 400);
  assert.equal(payload.code, 'INVALID_OTP');
  assert.equal(payload.remainingAttempts, MAX_OTP_ATTEMPTS - 1);
  assert.equal(otpRow(db, 'invalid@example.invalid')?.consumed_at, null);
  assert.equal(providerCalls.supabaseCreate, 0);
  assert.equal(userCount(db), 0);
});

await it('five invalid attempts exhaust and consume the code', async () => {
  resetProviders('ok');
  const { db, env } = await sendRegistrationOtp('attempts@example.invalid', '10.7.0.1');

  let last = await verifyOtp(verifyContext(env, 'attempts@example.invalid', '000000', '10.7.0.2'));
  for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
    last = await verifyOtp(verifyContext(env, 'attempts@example.invalid', '000000', '10.7.0.2'));
  }
  const payload = await bodyPayload(last);

  assert.equal(last.status, 429);
  assert.equal(payload.code, 'MAX_ATTEMPTS_EXCEEDED');
  assert.ok(otpRow(db, 'attempts@example.invalid')?.consumed_at);
  assert.equal(providerCalls.supabaseCreate, 0);
  assert.equal(userCount(db), 0);
});

await it('an existing Supabase email is updated, not duplicated', async () => {
  resetProviders('ok', [
    {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'duplicate@example.invalid',
    },
  ]);
  const { db, env } = await sendRegistrationOtp('duplicate@example.invalid', '10.8.0.1');
  const verify = await verifyOtp(
    verifyContext(env, 'duplicate@example.invalid', capturedOtp(), '10.8.0.2')
  );
  const payload = await bodyPayload(verify);

  assert.equal(verify.status, 200);
  assert.equal(payload.profile.id, '00000000-0000-4000-8000-000000000001');
  assert.equal(providerCalls.supabaseCreate, 0);
  assert.equal(providerCalls.supabaseUpdate, 1);
  assert.equal(userCount(db), 1);
});

await it('60-second resend cooldown remains enforced after a successful send', async () => {
  resetProviders('ok');
  const { env } = await sendRegistrationOtp('cooldown@example.invalid', '10.9.0.1');
  const resend = await resendOtp(
    postContext(env, { email: 'cooldown@example.invalid', purpose: 'registration' }, '10.9.0.2')
  );
  const payload = await bodyPayload(resend);

  assert.equal(resend.status, 429);
  assert.match(String(payload.error), /Please wait \d+ seconds/);
  assert.ok(Number(payload.cooldownRemaining) > 0);
  assert.equal(providerCalls.resend, 1);
});

await it('OTP email goes to the customer, not the owner/admin notification inbox', async () => {
  resetProviders('ok');
  const { db } = await sendRegistrationOtp('recipient-check@example.invalid', '10.10.0.1');
  const payload = lastResendPayload;
  assert.equal(payload.to, 'recipient-check@example.invalid');
  assert.ok(!String(payload.from).includes('vk66278@gmail.com'));

  const log = db
    .prepare(
      `SELECT recipient_contact, delivery_status
       FROM notification_logs WHERE recipient_contact = ? ORDER BY id DESC LIMIT 1`
    )
    .get('recipient-check@example.invalid') as any;
  assert.equal(log?.recipient_contact, 'recipient-check@example.invalid');
  assert.equal(log?.delivery_status, 'sent');
});

await it('browser registration never calls signUp, shows no success before verify, and never asks for payment', () => {
  const modalSource = readSource('src/components/auth/AuthModal.tsx');
  const registerBranch = modalSource.indexOf("if (mode === 'register') {");
  const verifyBranch = modalSource.indexOf("if (mode === 'verify_otp') {", registerBranch + 1);
  const sendFailureGuard = modalSource.indexOf('if (!otpRes.ok || !otpData.ok)');
  const verifyFailureGuard = modalSource.indexOf('if (!verifyRes.ok || !verifyData.ok)');
  const verifyScreen = modalSource.indexOf("setMode('verify_otp')");
  const success = modalSource.indexOf('onSuccess(profile)');
  const setCurrentUser = modalSource.indexOf('authService.setCurrentUser(profile)');

  assert.equal(modalSource.includes('auth.signUp'), false);
  assert.match(modalSource, /purpose:\s*'registration',\s*password,/);
  assert.ok(registerBranch > 0 && registerBranch < verifyBranch);
  assert.ok(sendFailureGuard > 0 && sendFailureGuard < verifyScreen);
  assert.ok(verifyFailureGuard > 0 && verifyFailureGuard < setCurrentUser);
  assert.ok(verifyBranch > 0 && verifyBranch < success);
  assert.equal(/cashfree|razorpay|\/api\/payments/i.test(modalSource), false);
});

await it('public browsing remains available without authentication', async () => {
  resetProviders('ok');
  const { d1 } = createD1();
  const response = await healthGet(getContext(makeEnv(d1)));
  const payload = await bodyPayload(response);
  const index = readSource('index.html');

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'online');
  assert.match(index, /name="viewport"/);
  assert.match(index, /Vijay Visuals/);
});

await it('registration UI keeps the OTP flow usable on mobile and desktop', () => {
  const modalSource = readSource('src/components/auth/AuthModal.tsx');
  assert.match(modalSource, /max-h-\[92vh\].*overflow-y-auto/);
  assert.match(modalSource, /inputMode="numeric"/);
  assert.match(modalSource, /gap-1\.5.*sm:gap-2/);
  assert.match(modalSource, /h-12 w-10.*sm:h-13 sm:w-11/);
  assert.match(modalSource, /no-scrollbar/);
});

await it('OTP mail uses a distinct customer sender identity, not the platform owner sender', () => {
  const sendSource = readSource('functions/api/auth/otp/send.ts');
  const resendSource = readSource('functions/api/auth/otp/resend.ts');
  const emailSource = readSource('functions/api/_email.ts');
  const notificationSource = readSource('functions/api/platform/notifications.ts');

  assert.match(sendSource, /getCustomerOtpSender/);
  assert.match(resendSource, /getCustomerOtpSender/);
  assert.match(sendSource, /audience:\s*'customer'/);
  assert.match(resendSource, /audience:\s*'customer'/);
  assert.match(emailSource, /onboarding@resend\.dev/);
  assert.match(emailSource, /export function getCustomerOtpSender/);
  assert.match(notificationSource, /audience:\s*isPlatformMessage \? 'platform' : 'customer'/);
});

await it('OTP purpose and client IP are fixed server-side for send, resend, and verify', () => {
  for (const relative of [
    'functions/api/auth/otp/send.ts',
    'functions/api/auth/otp/resend.ts',
    'functions/api/auth/otp/verify.ts',
  ]) {
    const source = readSource(relative);
    assert.match(source, /const purpose = 'registration' as const/);
    assert.match(source, /getClientIp\(request\)/);
    assert.equal(source.includes('x-forwarded-for'), false);
  }
  const shared = readSource('functions/api/_shared.ts');
  assert.match(shared, /cf-connecting-ip/i);
});

await it('OTP email copy does not claim an account already exists', () => {
  const emailSource = readSource('functions/api/_email.ts');
  assert.equal(emailSource.includes('Thank you for creating an account'), false);
  assert.match(emailSource, /account is not created/i);
});

globalThis.fetch = originalFetch;

console.log(`\nTOTAL passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
