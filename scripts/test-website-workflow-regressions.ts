// ============================================================================
// WEBSITE WORKFLOW REGRESSIONS — fully local, offline, no secrets, no payments.
// Covers OTP delivery honesty/rate limits, customer approval before publishing,
// Cashfree-only configuration, white-label copy, and approval state transitions.
// Run: npx tsx scripts/test-website-workflow-regressions.ts
// ============================================================================

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import {
  checkRateLimit,
  isValidEmailAddress,
  type CloudflareEnv,
  type D1Database,
  type PagesContext,
} from '../functions/api/_shared';
import {
  buildPaymentReceiptEmailHtml,
  buildWebsiteDeliveryEmailHtml,
  redactSensitiveLogText,
  sendTransactionalEmail,
} from '../functions/api/_email';
import { onRequestPost as sendOtp } from '../functions/api/auth/otp/send';
import { onRequestPost as resendOtp } from '../functions/api/auth/otp/resend';
import { onRequestPatch as publishTenant } from '../functions/api/owner/tenants/[tenantId]/publish';
import { onRequestPatch as decideChangeRequest } from '../functions/api/owner/tenants/[tenantId]/change-requests';
import { customerApprovalBlockedResponse } from '../functions/api/_tenantAccess';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

let passed = 0;
let failed = 0;
async function it(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err?.message || err}`);
    failed++;
  }
}

function readSource(relative: string): string {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function createD1(): { db: DatabaseSync; d1: D1Database } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(root, 'cloudflare', 'd1', 'schema.sql'), 'utf8'));
  const dir = path.join(root, 'cloudflare', 'd1', 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  const d1: D1Database = {
    prepare(sql: string) {
      let values: any[] = [];
      const stmt = {
        bind(...bound: any[]) {
          values = bound.map((v) => (v === undefined ? null : v));
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
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    CASHFREE_ENV: 'sandbox',
  } as CloudflareEnv;
}

function makeContext<P extends Record<string, string> = Record<string, string>>(
  env: CloudflareEnv,
  body: unknown,
  params: P = {} as P,
  headers: Record<string, string> = {},
  method = 'PATCH'
): PagesContext<P> {
  const allHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  return {
    request: new Request('https://preview.pages.dev/api/regression', {
      method,
      headers: allHeaders,
      body: JSON.stringify(body ?? {}),
    }),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  };
}

const originalFetch = globalThis.fetch;
let resendShouldFail = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const headers = new Headers(init?.headers || {});
  const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (url.includes('api.resend.com/emails')) {
    if (resendShouldFail) {
      return new Response(JSON.stringify({ message: 'Temporary provider outage' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ id: 'local-resend-message' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.includes('/auth/v1/user')) {
    if (token !== 'token-owner') return new Response('{}', { status: 401 });
    return new Response(
      JSON.stringify({ id: 'auth-owner', email: 'owner@example.invalid' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (url.includes('/rest/v1/profiles')) {
    return new Response(JSON.stringify([{ role: 'business_owner', full_name: 'Local Owner' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), { status: 500 });
}) as typeof fetch;

console.log('--- WEBSITE WORKFLOW REGRESSIONS ---');

// ---------------------------------------------------------------------------
// 1. Input validation and fail-closed rate limiting
// ---------------------------------------------------------------------------
await it('strict email validation rejects malformed recipients', () => {
  assert.equal(isValidEmailAddress('owner@example.com'), true);
  assert.equal(isValidEmailAddress('owner@example'), false);
  assert.equal(isValidEmailAddress('owner @example.com'), false);
  assert.equal(isValidEmailAddress('a@b.c'), false);
  assert.equal(isValidEmailAddress(123), false);
});

await it('checkRateLimit fails closed when D1 is unavailable', async () => {
  const result = await checkRateLimit({} as CloudflareEnv, 'otp_send_ip:1.2.3.4', 20, 3600);
  assert.equal(result.allowed, false);
  assert.equal(result.unavailable, true);
});

await it('per-IP OTP throttle blocks the 21st distinct recipient', async () => {
  const { d1 } = createD1();
  const env = makeEnv(d1);
  for (let i = 0; i < 20; i++) {
    const result = await checkRateLimit(env, 'otp_send_ip:9.9.9.9', 20, 3600);
    assert.equal(result.allowed, true);
  }
  const blocked = await checkRateLimit(env, 'otp_send_ip:9.9.9.9', 20, 3600);
  assert.equal(blocked.allowed, false);
});

// ---------------------------------------------------------------------------
// 2. OTP delivery honesty — no provider means no false success
// ---------------------------------------------------------------------------
await it('OTP send returns 503 and consumes the code when email is unavailable', async () => {
  const { db, d1 } = createD1();
  const env = makeEnv(d1);
  const ctx = makeContext(env, {
    email: 'new-customer@example.invalid',
    fullName: 'New Customer',
    phone: '9876543210',
    purpose: 'registration',
  }, {}, { 'cf-connecting-ip': '1.1.1.1' }, 'POST');
  const res = await sendOtp(ctx);
  assert.equal(res.status, 503);
  const row = db.prepare(
    "SELECT consumed_at FROM auth_email_otps WHERE email = 'new-customer@example.invalid'"
  ).get() as { consumed_at: string | null } | undefined;
  assert.ok(row, 'an OTP ledger row should exist');
  assert.ok(row!.consumed_at, 'undelivered OTP must not remain redeemable');
});

await it('OTP resend returns 503 and consumes the code when email is unavailable', async () => {
  const { db, d1 } = createD1();
  const env = makeEnv(d1);
  const ctx = makeContext(env, {
    email: 'resend-customer@example.invalid',
    purpose: 'registration',
  }, {}, { 'cf-connecting-ip': '1.1.1.2' }, 'POST');
  const res = await resendOtp(ctx);
  assert.equal(res.status, 503);
  const row = db.prepare(
    "SELECT consumed_at FROM auth_email_otps WHERE email = 'resend-customer@example.invalid'"
  ).get() as { consumed_at: string | null } | undefined;
  assert.ok(row?.consumed_at, 'undelivered resent OTP must not remain redeemable');
});

// ---------------------------------------------------------------------------
// 3. Customer approval before publishing
// ---------------------------------------------------------------------------
function seedApprovableSite(db: DatabaseSync, status: string): number {
  db.prepare(
    `INSERT INTO customer_website_publications
       (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES ('site_approval', 'auth-owner', 'approval-test', 'Approval Test', '{}', 'unpublished', '', datetime('now'), datetime('now'))`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO subscription_plans
       (code, name, monthly_price_inr, yearly_price_inr, max_websites, max_products)
     VALUES ('business-website', 'Business Website', 7999, 79990, 5, 500)`
  ).run();
  db.prepare(
    `INSERT INTO tenant_lifetime_entitlements
       (website_id, owner_id, plan_code, entitlement_type, status, source)
     VALUES ('site_approval', 'auth-owner', 'business-website', 'one_time_purchase', 'active', 'test')`
  ).run();
  db.prepare(
    `INSERT INTO website_change_requests
       (request_number, website_id, owner_id, category, title, description, status)
     VALUES ('CR-APPROVAL-1', 'site_approval', 'auth-owner', 'design_changes', 'Delivery review', 'Review work', ?)`
  ).run(status);
  return Number(
    (db.prepare("SELECT id FROM website_change_requests WHERE request_number = 'CR-APPROVAL-1'").get() as { id: number }).id
  );
}

function authHeaders(): Record<string, string> {
  return { Authorization: 'Bearer token-owner' };
}

await it('publish is blocked while a customer review is pending', async () => {
  const { db, d1 } = createD1();
  const requestId = seedApprovableSite(db, 'review_ready');
  const env = makeEnv(d1);
  const blocked = await customerApprovalBlockedResponse(env, 'site_approval');
  assert.ok(blocked, 'approval gate must block');
  assert.equal(blocked!.status, 409);

  const res = await publishTenant(
    makeContext(env, { published: true }, { tenantId: 'site_approval' }, authHeaders())
  );
  assert.equal(res.status, 409);
  const body: any = await res.json();
  assert.equal(body.code, 'CUSTOMER_APPROVAL_REQUIRED');
  assert.equal(body.requestId, requestId);
});

await it('customer acceptance completes the request and unblocks publishing', async () => {
  const { db, d1 } = createD1();
  const requestId = seedApprovableSite(db, 'review_ready');
  const env = makeEnv(d1);

  const decision = await decideChangeRequest(
    makeContext(
      env,
      { requestId, decision: 'accept_review', customerNotes: 'Approved for launch' },
      { tenantId: 'site_approval' },
      authHeaders()
    )
  );
  assert.equal(decision.status, 200);
  const status = db.prepare('SELECT status FROM website_change_requests WHERE id = ?').get(requestId) as {
    status: string;
  };
  assert.equal(status.status, 'completed');

  assert.equal(await customerApprovalBlockedResponse(env, 'site_approval'), null);
  const res = await publishTenant(
    makeContext(env, { published: true }, { tenantId: 'site_approval' }, authHeaders())
  );
  assert.equal(res.status, 200);
  const pub = db.prepare(
    "SELECT status FROM customer_website_publications WHERE website_id = 'site_approval'"
  ).get() as { status: string };
  assert.equal(pub.status, 'published');
});

await it('requesting changes returns the request to in_progress and keeps publish blocked', async () => {
  const { db, d1 } = createD1();
  const requestId = seedApprovableSite(db, 'review_ready');
  const env = makeEnv(d1);
  const decision = await decideChangeRequest(
    makeContext(
      env,
      { requestId, decision: 'request_changes', customerNotes: 'Please revise the banner.' },
      { tenantId: 'site_approval' },
      authHeaders()
    )
  );
  assert.equal(decision.status, 200);
  const status = db.prepare('SELECT status FROM website_change_requests WHERE id = ?').get(requestId) as {
    status: string;
  };
  assert.equal(status.status, 'in_progress');
  assert.ok(await customerApprovalBlockedResponse(env, 'site_approval'));
});

await it('first-time site activation without change requests is unaffected by the approval gate', async () => {
  const { d1 } = createD1();
  assert.equal(await customerApprovalBlockedResponse(makeEnv(d1), 'brand_new_site'), null);
});

// ---------------------------------------------------------------------------
// 4. Static configuration / white-label guards
// ---------------------------------------------------------------------------
await it('Cashfree is the only configured gateway in .env.example', () => {
  const envExample = readSource('.env.example');
  assert.match(envExample, /CASHFREE_CLIENT_ID/);
  assert.match(envExample, /CASHFREE_ENV="sandbox"/);
  assert.doesNotMatch(envExample, /RAZORPAY_KEY_ID/);
});

await it('Free Start no longer inserts an invalid draft publication status', () => {
  const source = readSource('functions/api/sites/publish.ts');
  assert.doesNotMatch(source, /'draft'/);
  assert.match(source, /'unpublished', ''/);
});

await it('approval gate is applied on every publish path', () => {
  for (const file of [
    'functions/api/sites/publish.ts',
    'functions/api/owner/tenants/[tenantId]/publish.ts',
    'functions/api/tenants/[slug].ts',
    'functions/api/tenants/[slug]/publish.ts',
    'functions/api/payments/cashfree/verify.ts',
    'functions/api/webhooks/cashfree.ts',
  ]) {
    assert.match(readSource(file), /customerApprovalBlockedResponse/, file);
  }
});

await it('public storefront copy contains no platform licensing/internal language', () => {
  assert.doesNotMatch(readSource('functions/api/ai/support-chat.ts'), /Vijay Visuals business storefront/);
  assert.doesNotMatch(readSource('server.ts'), /powered by Vijay Visuals/);
  const storefront = readSource('src/components/StorefrontView.tsx');
  assert.match(storefront, /pwaLicenseValid && !publicHost/);
  assert.match(storefront, /!publicHost && ' Store owners can add items/);
});

await it('delivery portal no longer exposes all transit orders across tenants', () => {
  const portal = readSource('functions/api/delivery/portal.ts');
  assert.doesNotMatch(portal, /OR order_status IN \('ready_for_pickup', 'out_for_delivery'\)/);
  assert.match(portal, /website_id IN \(\$\{websitePlaceholders\}\)/);
});

await it('hero editor fields are persisted and mapped to the storefront', () => {
  assert.match(readSource('src/components/CustomerWebsiteEditor.tsx'), /heroHeadline: heroHeadline\.trim\(\)/);
  assert.match(readSource('functions/api/tenants/[slug].ts'), /current\.heroHeadline/);
  assert.match(readSource('functions/api/tenants.ts'), /heroHeadline: sanitizeText/);
  assert.match(readSource('functions/api/_tenantMapper.ts'), /heroSubheadline:/);
  assert.match(readSource('src/components/StorefrontView.tsx'), /tenant\.heroHeadline/);
});

await it('live GPS polling requires customer verification in UI and API', () => {
  const api = readSource('functions/api/orders/[orderNumber]/live-location.ts');
  assert.match(api, /TRACKING_VERIFICATION_REQUIRED/);
  const modal = readSource('src/components/OrderTrackerModal.tsx');
  assert.match(modal, /verificationQuery\(\)/);
  assert.match(modal, /live-location\$\{verificationQuery\(\)\}/);
});

await it('failed transactional emails with an idempotency key are retryable; delivered sends dedupe', async () => {
  const { d1 } = createD1();
  const env = makeEnv(d1);
  env.RESEND_API_KEY = 'local-dummy-resend-key';
  const options = {
    to: 'retry@example.invalid',
    subject: 'Retryable receipt',
    html: '<p>Retryable receipt</p>',
    eventType: 'test_retryable_email',
    idempotencyKey: 'retryable-receipt-key',
  };

  resendShouldFail = true;
  const failedSend = await sendTransactionalEmail(env, options);
  assert.equal(failedSend.status, 'failed');

  resendShouldFail = false;
  const retriedSend = await sendTransactionalEmail(env, options);
  assert.equal(retriedSend.status, 'sent');

  const duplicate = await sendTransactionalEmail(env, options);
  assert.equal(duplicate.status, 'idempotent_duplicate');
});

await it('durable log redaction masks full Indian phone numbers', () => {
  const redacted = redactSensitiveLogText('failed for +91 93610 24823 and 9876543210');
  assert.doesNotMatch(redacted, /93610|24823|9876543210/);
  assert.match(redacted, /\[REDACTED\]/);
});

await it('payment and delivery emails escape injected HTML in customer fields', () => {
  const injection = '<script>alert(1)</script>';
  const receipt = buildPaymentReceiptEmailHtml({
    customerName: injection,
    orderNumber: injection,
    paymentId: injection,
    amountFormatted: '₹1',
    paymentTime: 'now',
    dashboardUrl: 'https://example.invalid/dashboard',
  });
  const delivery = buildWebsiteDeliveryEmailHtml({
    customerName: injection,
    businessName: injection,
    liveUrl: 'https://example.invalid/site',
    dashboardUrl: 'https://example.invalid/dashboard',
    orderNumber: injection,
  });
  assert.doesNotMatch(receipt, /<script>/);
  assert.doesNotMatch(delivery, /<script>/);
  assert.match(receipt, /&lt;script&gt;/);
  assert.match(delivery, /&lt;script&gt;/);
});

globalThis.fetch = originalFetch;

console.log(`\nWebsite workflow regressions: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
