// ============================================================================
// GMAIL OAUTH PREVIEW OTP PROVIDER — fully local mocked regression suite.
// No real OAuth token, Gmail message, OTP, email, D1 remote, or Production use.
// ============================================================================

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import { type CloudflareEnv, type D1Database, type PagesContext } from '../functions/api/_shared';
import { sendTransactionalEmail } from '../functions/api/_email';
import { GMAIL_SEND_SCOPE, isGmailOAuthConfigured } from '../functions/api/_gmailOAuth';
import { onRequestGet as healthGet } from '../functions/api/health';
import { MAX_OTP_ATTEMPTS, OTP_EXPIRY_MINUTES, RESEND_COOLDOWN_SECONDS } from '../functions/api/auth/_otpShared';

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

const SYNTHETIC = {
  clientId: 'synthetic-preview-client.apps.googleusercontent.com',
  clientSecret: 'synthetic-preview-client-secret',
  refreshToken: 'synthetic-preview-refresh-token',
  accessToken: 'synthetic-preview-access-token',
  senderEmail: 'preview-otp-sender@vijayvisuals.test',
};

function makeGmailEnv(d1: D1Database): CloudflareEnv {
  return {
    DB: d1,
    GMAIL_OAUTH_CLIENT_ID: SYNTHETIC.clientId,
    GMAIL_OAUTH_CLIENT_SECRET: SYNTHETIC.clientSecret,
    GMAIL_OAUTH_REFRESH_TOKEN: SYNTHETIC.refreshToken,
    GMAIL_SENDER_EMAIL: SYNTHETIC.senderEmail,
  } as CloudflareEnv;
}

type FetchMode = 'ok' | 'token_fail' | 'send_fail';
let fetchMode: FetchMode = 'ok';
let tokenCalls = 0;
let gmailSendCalls = 0;
let resendCalls = 0;
let lastTokenBody = '';
let lastGmailAuth = '';
let lastGmailRaw = '';

function resetFetch(mode: FetchMode = 'ok') {
  fetchMode = mode;
  tokenCalls = 0;
  gmailSendCalls = 0;
  resendCalls = 0;
  lastTokenBody = '';
  lastGmailAuth = '';
  lastGmailRaw = '';
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const headers = new Headers(init?.headers || {});

  if (url.includes('oauth2.googleapis.com/token')) {
    tokenCalls++;
    lastTokenBody = String(init?.body || '');
    if (fetchMode === 'token_fail') {
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ access_token: SYNTHETIC.accessToken, expires_in: 3600, token_type: 'Bearer' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
    gmailSendCalls++;
    lastGmailAuth = headers.get('authorization') || '';
    const body = JSON.parse(String(init?.body || '{}')) as { raw?: string };
    lastGmailRaw = String(body.raw || '');
    if (fetchMode === 'send_fail') {
      return new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 403 });
    }
    return new Response(JSON.stringify({ id: 'mock-gmail-message-id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('api.resend.com/emails')) {
    resendCalls++;
    return new Response(JSON.stringify({ id: 'unexpected-resend-message-id' }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), { status: 500 });
}) as typeof fetch;

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function customerOptions(idempotencyKey = 'otp_gmail_test') {
  return {
    to: 'preview-customer@vijayvisuals.test',
    subject: 'Your verification code',
    html: '<p>Your verification code is 123456.</p>',
    text: 'Your verification code is 123456.',
    eventType: 'registration_otp',
    audience: 'customer' as const,
    idempotencyKey,
  };
}

function healthContext(env: CloudflareEnv): PagesContext {
  return {
    request: new Request('https://preview.example.test/api/health'),
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  } as PagesContext;
}

console.log('--- GMAIL OAUTH PREVIEW OTP PROVIDER (MOCKED) ---');

await it('Gmail OAuth config requires all four Preview secrets', () => {
  const { d1 } = createD1();
  const env = makeGmailEnv(d1);
  assert.equal(isGmailOAuthConfigured(env), true);

  const incomplete = { ...env, GMAIL_OAUTH_REFRESH_TOKEN: '' } as CloudflareEnv;
  assert.equal(isGmailOAuthConfigured(incomplete), false);
});

await it('customer OTP uses Gmail OAuth only, with gmail.send and no Resend call', async () => {
  resetFetch('ok');
  const { db, d1 } = createD1();
  const env = makeGmailEnv(d1);
  const result = await sendTransactionalEmail(env, customerOptions('otp_gmail_success'));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.providerMessageId, 'mock-gmail-message-id');
  assert.equal(tokenCalls, 1);
  assert.equal(gmailSendCalls, 1);
  assert.equal(resendCalls, 0);
  assert.match(lastTokenBody, /grant_type=refresh_token/);
  assert.ok(lastTokenBody.includes(`scope=${encodeURIComponent(GMAIL_SEND_SCOPE)}`));
  assert.equal(lastGmailAuth, `Bearer ${SYNTHETIC.accessToken}`);

  const mime = decodeBase64Url(lastGmailRaw);
  assert.match(mime, /^From: =\?UTF-8\?B\?/m);
  assert.match(mime, /To: preview-customer@vijayvisuals\.test/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/m);
  assert.match(mime, /Content-Type: multipart\/alternative/);
  assert.equal(mime.includes('123456'), false);

  const log = db
    .prepare("SELECT delivery_status, provider_message_id, error_detail FROM notification_logs WHERE event_type = 'registration_otp' ORDER BY id DESC LIMIT 1")
    .get() as any;
  assert.equal(log.delivery_status, 'sent');
  assert.equal(log.provider_message_id, 'mock-gmail-message-id');
  assert.equal(String(log.error_detail || ''), '');
});

await it('OAuth token exchange failure returns failed and never calls Gmail send', async () => {
  resetFetch('token_fail');
  const { d1 } = createD1();
  const result = await sendTransactionalEmail(makeGmailEnv(d1), customerOptions('otp_gmail_token_fail'));

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(tokenCalls, 1);
  assert.equal(gmailSendCalls, 0);
  assert.equal(resendCalls, 0);
  assert.equal(String(result.error || ''), 'Gmail OAuth token exchange failed.');
  assert.equal(String(result.error || '').includes(SYNTHETIC.refreshToken), false);
});

await it('Gmail API dispatch failure returns failed without claiming delivery', async () => {
  resetFetch('send_fail');
  const { d1 } = createD1();
  const result = await sendTransactionalEmail(makeGmailEnv(d1), customerOptions('otp_gmail_send_fail'));

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(tokenCalls, 1);
  assert.equal(gmailSendCalls, 1);
  assert.equal(resendCalls, 0);
  assert.equal(String(result.error || ''), 'Gmail API dispatch failed.');
});

await it('idempotency suppresses a duplicate Gmail OAuth send', async () => {
  resetFetch('ok');
  const { d1 } = createD1();
  const env = makeGmailEnv(d1);
  const first = await sendTransactionalEmail(env, customerOptions('otp_gmail_idempotent'));
  const second = await sendTransactionalEmail(env, customerOptions('otp_gmail_idempotent'));

  assert.equal(first.status, 'sent');
  assert.equal(second.status, 'idempotent_duplicate');
  assert.equal(gmailSendCalls, 1);
  assert.equal(tokenCalls, 1);
});

await it('platform audience never uses the Gmail OTP sender', async () => {
  resetFetch('ok');
  const { d1 } = createD1();
  const result = await sendTransactionalEmail(makeGmailEnv(d1), {
    ...customerOptions('platform_not_gmail'),
    audience: 'platform',
  } as any);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'setup_required');
  assert.equal(tokenCalls, 0);
  assert.equal(gmailSendCalls, 0);
  assert.equal(resendCalls, 0);
});

await it('unrelated customer email does not use the Gmail OTP sender', async () => {
  resetFetch('ok');
  const { d1 } = createD1();
  const env = {
    ...makeGmailEnv(d1),
    RESEND_API_KEY: 'synthetic-resend-key',
    RESEND_FROM: 'Vijay Visuals <notifications@vijayvisuals.test>',
  } as CloudflareEnv;
  const result = await sendTransactionalEmail(env, {
    ...customerOptions('customer_order_email'),
    eventType: 'order_notification',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(resendCalls, 1);
  assert.equal(tokenCalls, 0);
  assert.equal(gmailSendCalls, 0);
});

await it('Production-style Resend configuration remains on the existing provider path', async () => {
  resetFetch('ok');
  const { d1 } = createD1();
  const env = {
    DB: d1,
    RESEND_API_KEY: 'synthetic-resend-key',
    RESEND_FROM: 'Vijay Visuals <notifications@vijayvisuals.test>',
  } as CloudflareEnv;
  const result = await sendTransactionalEmail(env, customerOptions('otp_resend_unchanged'));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(resendCalls, 1);
  assert.equal(tokenCalls, 0);
  assert.equal(gmailSendCalls, 0);
});

await it('health endpoint exposes only a safe Gmail OAuth boolean', async () => {
  const { d1 } = createD1();
  const env = makeGmailEnv(d1);
  const response = await healthGet(healthContext(env));
  const bodyText = await response.text();
  const payload = JSON.parse(bodyText);

  assert.equal(response.status, 200);
  assert.equal(payload.hasGmailOAuth, true);
  assert.equal(payload.integrations.gmailOAuth, true);
  assert.equal(bodyText.includes(SYNTHETIC.clientId), false);
  assert.equal(bodyText.includes(SYNTHETIC.clientSecret), false);
  assert.equal(bodyText.includes(SYNTHETIC.refreshToken), false);
  assert.equal(bodyText.includes(SYNTHETIC.accessToken), false);
  assert.equal(bodyText.includes(SYNTHETIC.senderEmail), false);
});

await it('source guards keep Gmail narrow and OTP security constants unchanged', () => {
  const emailSource = readSource('functions/api/_email.ts');
  const gmailSource = readSource('functions/api/_gmailOAuth.ts');
  const sharedSource = readSource('functions/api/_shared.ts');
  const otpShared = readSource('functions/api/auth/_otpShared.ts');
  const sendSource = readSource('functions/api/auth/otp/send.ts');
  const resendSource = readSource('functions/api/auth/otp/resend.ts');

  assert.match(
    emailSource,
    /audience === 'customer' && registrationOtpEvent &&\s*isGmailOAuthConfigured\(env\)/
  );
  assert.match(emailSource, /eventType === 'registration_otp'/);
  assert.match(emailSource, /eventType === 'registration_otp_resend'/);
  assert.ok(emailSource.indexOf('gmailOtpConfigured') < emailSource.indexOf('if (resendApiKey)'));
  assert.match(gmailSource, /export const GMAIL_SEND_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/gmail\.send'/);
  assert.equal(gmailSource.includes('console.'), false);
  assert.equal(gmailSource.includes('gmail.readonly'), false);
  assert.equal(gmailSource.includes('gmail.modify'), false);
  assert.equal(gmailSource.includes('mail.google.com'), false);
  assert.equal(gmailSource.includes('RAZORPAY'), false);

  for (const secret of [
    'GMAIL_OAUTH_CLIENT_ID',
    'GMAIL_OAUTH_CLIENT_SECRET',
    'GMAIL_OAUTH_REFRESH_TOKEN',
    'GMAIL_SENDER_EMAIL',
  ]) {
    assert.match(sharedSource, new RegExp(`${secret}\\?: string;`));
  }

  assert.equal(OTP_EXPIRY_MINUTES, 10);
  assert.equal(RESEND_COOLDOWN_SECONDS, 60);
  assert.equal(MAX_OTP_ATTEMPTS, 5);
  assert.match(otpShared, /SHA-256/);
  assert.match(otpShared, /timingSafeEqual/);
  assert.match(sendSource, /audience:\s*'customer'/);
  assert.match(resendSource, /audience:\s*'customer'/);
});

globalThis.fetch = originalFetch;

console.log(`\nTOTAL passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
