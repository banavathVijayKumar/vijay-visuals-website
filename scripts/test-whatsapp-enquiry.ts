// ============================================================================
// WHATSAPP ENQUIRY WORKFLOW REGRESSIONS — fully local, offline, no secrets.
// Covers India +91 validation, atomic lead/send claims, concurrency, durable
// retries, setup/consent recovery, public StudioLanding enquiries, auth gates,
// redaction, and mocked-only Graph API calls.
// Run: npm run test:whatsapp
// ============================================================================

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

import { validateIndiaWhatsAppNumber, maskIndiaWhatsAppNumber } from '../shared/indiaWhatsapp';
import type { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';
import { onRequestPost as quoteRequest } from '../functions/api/public/tenants/[slug]/quote-request';
import { onRequestPost as publicProjectInquiry } from '../functions/api/public/platform/project-inquiry';
import { onRequestPost as createTicket } from '../functions/api/tickets';
import { onRequestGet as listEnquiries } from '../functions/api/owner/tenants/[tenantId]/enquiries';
import { sendWhatsAppNotification } from '../functions/api/_whatsapp';

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

function seedPublishedSite(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO customer_website_publications
       (website_id, owner_id, public_slug, business_name, website_json, status, created_at, updated_at)
     VALUES ('wa-site', 'auth-owner', 'wa-shop', 'WhatsApp Test Shop', ?, 'published', datetime('now'), datetime('now'))`
  ).run(JSON.stringify({ automationWorkflows: [{ id: 4, enabled: true, triggerType: 'quote_request' }] }));
}

function seedUnpublishedSite(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO customer_website_publications
       (website_id, owner_id, public_slug, business_name, website_json, status, created_at, updated_at)
     VALUES ('hidden-site', 'auth-other', 'hidden-shop', 'Hidden Shop', '{}', 'unpublished', datetime('now'), datetime('now'))`
  ).run();
}

function count(db: DatabaseSync, table: string, where = ''): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get() as { n: number }).n);
}

function makeEnv(d1: D1Database, configured: boolean): CloudflareEnv {
  return {
    DB: d1,
    SUPABASE_URL: 'https://supabase.invalid',
    SUPABASE_ANON_KEY: 'anon-local-test-key',
    CASHFREE_ENV: 'sandbox',
    PLATFORM_ENQUIRY_TENANT_SLUG: 'wa-shop',
    ...(configured
      ? {
          WHATSAPP_CLOUD_API_TOKEN: 'local-dummy-token',
          WHATSAPP_PHONE_NUMBER_ID: 'local-dummy-phone-id',
          WHATSAPP_ENQUIRY_TEMPLATE_NAME: 'enquiry_received',
          WHATSAPP_ENQUIRY_TEMPLATE_LANGUAGE: 'en',
        }
      : {}),
  } as CloudflareEnv;
}

function makeContext<P extends Record<string, string> = Record<string, string>>(
  env: CloudflareEnv,
  body: unknown,
  params: P = {} as P,
  headers: Record<string, string> = {},
  method = 'POST'
): PagesContext<P> {
  const isRead = method === 'GET' || method === 'HEAD';
  return {
    request: new Request('https://preview.pages.dev/api/test', {
      method,
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10', ...headers },
      ...(isRead ? {} : { body: JSON.stringify(body ?? {}) }),
    }),
    env,
    params,
    next: async () => new Response(null, { status: 204 }),
  };
}

const graphCalls: Array<{ url: string; body: any; authorization: string }> = [];
let graphMode: 'success' | 'failure' = 'success';
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const headers = new Headers(init?.headers || {});

  if (url.includes('graph.facebook.com')) {
    const body = JSON.parse(String(init?.body || '{}'));
    graphCalls.push({ url, body, authorization: headers.get('Authorization') || '' });
    if (graphMode === 'failure') {
      return new Response(
        JSON.stringify({ error: { message: 'Provider rejected +919876543210 template' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.localtest001' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/auth/v1/user')) {
    const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (token === 'token-owner') {
      return new Response(JSON.stringify({ id: 'auth-owner', email: 'owner@example.invalid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (token === 'token-other') {
      return new Response(JSON.stringify({ id: 'auth-other', email: 'other@example.invalid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 401 });
  }

  if (url.includes('/rest/v1/profiles')) {
    const token = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const role = token === 'token-owner' ? 'business_owner' : 'customer';
    return new Response(JSON.stringify([{ role, full_name: 'Local Test User' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: `Unexpected mocked URL: ${url}` }), { status: 500 });
}) as typeof fetch;

const quoteBody = {
  name: 'Test Customer',
  phone: '+91 98765 43210',
  email: 'customer@example.invalid',
  requirement: 'Need 50 custom gift boxes in Hyderabad.',
  whatsappOptIn: true,
};

const projectBody = {
  customerName: 'Project Customer',
  customerEmail: 'project@example.invalid',
  customerPhone: '+91 98765 43210',
  subject: 'Custom website',
  message: 'Need a website with catalogue.',
  whatsappOptIn: true,
};

console.log('--- WHATSAPP ENQUIRY WORKFLOW ---');

await it('valid Indian +91 numbers normalize safely without changing the subscriber part', () => {
  for (const raw of ['+91 98765 43210', '+919876543210', '919876543210', '09876543210', '9876543210']) {
    const result = validateIndiaWhatsAppNumber(raw);
    assert.equal(result.ok, true, raw);
    assert.equal(result.value!.e164, '+919876543210', raw);
    assert.equal(result.value!.digits, '919876543210', raw);
  }
  assert.equal(maskIndiaWhatsAppNumber('+919876543210'), '+91******3210');
});

await it('invalid numbers are rejected, never silently repaired', () => {
  const invalid = ['+1 98765 43210', '+91 12345 67890', '12345', '987654321', 'abc9876543210', '+9198765432109'];
  for (const raw of invalid) {
    assert.equal(validateIndiaWhatsAppNumber(raw).ok, false, raw);
  }
});

await it('quote request rejects an invalid WhatsApp number before any persistence or send', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await quoteRequest(
    makeContext(makeEnv(d1, true), { ...quoteBody, phone: '+1 98765 43210' }, { slug: 'wa-shop' })
  );
  assert.equal(res.status, 400);
  assert.equal(count(db, 'crm_contacts_leads'), 0);
  assert.equal(graphCalls.length, before);
});

await it('marketingConsent alone never authorizes a WhatsApp send', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await quoteRequest(
    makeContext(
      makeEnv(d1, true),
      { ...quoteBody, whatsappOptIn: false, marketingConsent: true },
      { slug: 'wa-shop' }
    )
  );
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'blocked_no_consent');
  assert.equal(graphCalls.length, before);
  assert.equal(count(db, 'whatsapp_send_claims'), 0);
});

await it('missing credentials marks setup_required but preserves the enquiry without claiming a send key', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await quoteRequest(makeContext(makeEnv(d1, false), quoteBody, { slug: 'wa-shop' }));
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'setup_required');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 0);
  assert.equal(graphCalls.length, before);
  const log = db
    .prepare("SELECT delivery_status, recipient_contact, error_detail FROM notification_logs WHERE event_type = 'enquiry_whatsapp'")
    .get() as { delivery_status: string; recipient_contact: string; error_detail: string };
  assert.equal(log.delivery_status, 'setup_required');
  assert.ok(!log.recipient_contact.includes('9876543210'));
  assert.ok(!log.error_detail.includes('9876543210'));
});

await it('missing approved template name/language blocks sending and keeps setup_required', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const env = makeEnv(d1, true);
  delete env.WHATSAPP_ENQUIRY_TEMPLATE_LANGUAGE;
  const before = graphCalls.length;
  const res = await quoteRequest(makeContext(env, quoteBody, { slug: 'wa-shop' }));
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'setup_required');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 0);
  assert.equal(graphCalls.length, before);
});

await it('no explicit WhatsApp opt-in blocks messaging but still saves the enquiry', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await quoteRequest(
    makeContext(makeEnv(d1, true), { ...quoteBody, whatsappOptIn: false }, { slug: 'wa-shop' })
  );
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'blocked_no_consent');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 0);
  assert.equal(graphCalls.length, before);
});

await it('concurrent duplicate quote requests create one lead and one Graph call', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const [first, second] = await Promise.all([
    quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' })),
    quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' })),
  ]);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 1);
  assert.equal(count(db, "notification_logs WHERE event_type = 'enquiry_whatsapp'"), 1);
  assert.equal(graphCalls.length - before, 1);
});

await it('concurrent dispatch calls with the same key use one atomic claim and one Graph call', async () => {
  const { db, d1 } = createD1();
  const env = makeEnv(d1, true);
  const before = graphCalls.length;
  const options = {
    toPhone: '+919876543210',
    messageText: 'Concurrent claim test.',
    eventType: 'enquiry_whatsapp',
    websiteId: 'wa-site',
    idempotencyKey: 'direct_concurrent_key',
    recipientContactLabel: '+91******3210',
  };
  const [first, second] = await Promise.all([
    sendWhatsAppNotification(env, options),
    sendWhatsAppNotification(env, options),
  ]);
  assert.equal(graphCalls.length - before, 1);
  const statuses = [first.status, second.status];
  assert.equal(statuses.filter((s) => s === 'sent').length, 1);
  assert.equal(statuses.filter((s) => s === 'idempotent_duplicate' || s === 'in_progress').length, 1);
  const state = db
    .prepare("SELECT state FROM whatsapp_send_claims WHERE claim_key = 'direct_concurrent_key'")
    .get() as { state: string };
  assert.equal(state.state, 'sent');
});

await it('an uncertain processing claim is never automatically resent', async () => {
  const { db, d1 } = createD1();
  db.prepare(
    `INSERT INTO whatsapp_send_claims (claim_key, recipient_contact, event_type, state, created_at, updated_at)
     VALUES ('stuck_key', '+91******3210', 'enquiry_whatsapp', 'processing', datetime('now'), datetime('now'))`
  ).run();
  const before = graphCalls.length;
  const result = await sendWhatsAppNotification(makeEnv(d1, true), {
    toPhone: '+919876543210',
    messageText: 'Stuck claim test.',
    eventType: 'enquiry_whatsapp',
    websiteId: 'wa-site',
    idempotencyKey: 'stuck_key',
    recipientContactLabel: '+91******3210',
  });
  assert.equal(result.status, 'in_progress');
  assert.equal(graphCalls.length, before);
  const state = db
    .prepare("SELECT state FROM whatsapp_send_claims WHERE claim_key = 'stuck_key'")
    .get() as { state: string };
  assert.equal(state.state, 'processing');
});

await it('a terminal failed claim is not automatically retried', async () => {
  const { d1 } = createD1();
  const env = makeEnv(d1, true);
  const options = {
    toPhone: '+919876543210',
    messageText: 'Failed claim test.',
    eventType: 'enquiry_whatsapp',
    websiteId: 'wa-site',
    idempotencyKey: 'failed_claim_key',
    recipientContactLabel: '+91******3210',
  };
  graphMode = 'failure';
  const first = await sendWhatsAppNotification(env, options);
  graphMode = 'success';
  const before = graphCalls.length;
  const second = await sendWhatsAppNotification(env, options);
  assert.equal(first.status, 'failed');
  assert.equal(second.status, 'failed');
  assert.equal(graphCalls.length, before);
});

await it('provider send failure is recorded honestly with redacted error details', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  graphMode = 'failure';
  try {
    const res = await quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' }));
    assert.equal(res.status, 201);
    const body: any = await res.json();
    assert.equal(body.whatsapp.status, 'failed');
    assert.equal(count(db, 'crm_contacts_leads'), 1);
  } finally {
    graphMode = 'success';
  }
  const log = db
    .prepare('SELECT delivery_status, error_detail, recipient_contact FROM notification_logs ORDER BY id DESC LIMIT 1')
    .get() as { delivery_status: string; error_detail: string; recipient_contact: string };
  assert.equal(log.delivery_status, 'failed');
  assert.ok(!log.error_detail.includes('9876543210'));
  assert.ok(!log.recipient_contact.includes('9876543210'));
});

await it('successful workflow dispatch uses the approved template and masked log identity', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' }));
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'sent');
  assert.equal(graphCalls.length - before, 1);
  const call = graphCalls[graphCalls.length - 1];
  assert.equal(call.url, 'https://graph.facebook.com/v20.0/local-dummy-phone-id/messages');
  assert.equal(call.body.type, 'template');
  assert.equal(call.body.template.name, 'enquiry_received');
  assert.equal(call.body.template.language.code, 'en');
  assert.ok(call.authorization.startsWith('Bearer local-dummy-token'));
  const log = db
    .prepare('SELECT delivery_status, provider_message_id, recipient_contact FROM notification_logs ORDER BY id DESC LIMIT 1')
    .get() as { delivery_status: string; provider_message_id: string; recipient_contact: string };
  assert.equal(log.delivery_status, 'sent');
  assert.equal(log.provider_message_id, 'wamid.localtest001');
  assert.ok(!log.recipient_contact.includes('9876543210'));
});

await it('retry after more than 10 minutes stays deduplicated with no second Graph call', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const first = await quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' }));
  db.prepare("UPDATE crm_contacts_leads SET created_at = datetime('now', '-1 hour') WHERE id = 1").run();
  const retry = await quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' }));
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  const retryBody: any = await retry.json();
  assert.equal(retryBody.whatsapp.status, 'idempotent_duplicate');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(graphCalls.length - before, 1);
});

await it('setup_required followed by valid configuration sends exactly once on the same lead', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const first = await quoteRequest(makeContext(makeEnv(d1, false), quoteBody, { slug: 'wa-shop' }));
  const firstBody: any = await first.json();
  assert.equal(firstBody.whatsapp.status, 'setup_required');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(graphCalls.length, before);

  const second = await quoteRequest(makeContext(makeEnv(d1, true), quoteBody, { slug: 'wa-shop' }));
  const secondBody: any = await second.json();
  assert.equal(secondBody.whatsapp.status, 'sent');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 1);
  assert.equal(graphCalls.length - before, 1);
  const statuses = db
    .prepare("SELECT delivery_status FROM notification_logs WHERE event_type = 'enquiry_whatsapp' ORDER BY id ASC")
    .all() as Array<{ delivery_status: string }>;
  assert.deepEqual(statuses.map((s) => s.delivery_status).sort(), ['sent', 'setup_required']);
});

await it('blocked_no_consent followed by explicit consent sends exactly once on the same lead', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const first = await quoteRequest(
    makeContext(makeEnv(d1, true), { ...quoteBody, whatsappOptIn: false }, { slug: 'wa-shop' })
  );
  assert.equal((await first.json() as any).whatsapp.status, 'blocked_no_consent');
  assert.equal(graphCalls.length, before);

  const second = await quoteRequest(
    makeContext(makeEnv(d1, true), { ...quoteBody, whatsappOptIn: true }, { slug: 'wa-shop' })
  );
  assert.equal((await second.json() as any).whatsapp.status, 'sent');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 1);
  assert.equal(graphCalls.length - before, 1);
});

await it('anonymous StudioLanding project enquiry saves and dispatches through the public endpoint', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const res = await publicProjectInquiry(makeContext(makeEnv(d1, true), projectBody));
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.whatsapp.status, 'sent');
  assert.equal(body.tenant, 'wa-shop');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(count(db, 'whatsapp_send_claims'), 1);
  assert.equal(graphCalls.length - before, 1);
});

await it('public project inquiry ignores request-supplied tenant slugs and uses only the configured desk', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  seedUnpublishedSite(db);
  const before = graphCalls.length;
  const res = await publicProjectInquiry(
    makeContext(makeEnv(d1, true), { ...projectBody, tenantSlug: 'hidden-shop' })
  );
  assert.equal(res.status, 201);
  const body: any = await res.json();
  assert.equal(body.tenant, 'wa-shop');
  assert.equal(count(db, 'crm_contacts_leads'), 1);
  assert.equal(graphCalls.length - before, 1);
});

await it('public project inquiry fails closed when the official desk is not configured', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const env = makeEnv(d1, true);
  delete env.PLATFORM_ENQUIRY_TENANT_SLUG;
  const before = graphCalls.length;
  const res = await publicProjectInquiry(makeContext(env, projectBody));
  assert.equal(res.status, 503);
  assert.equal((await res.json() as any).code, 'PLATFORM_DESK_NOT_CONFIGURED');
  assert.equal(count(db, 'crm_contacts_leads'), 0);
  assert.equal(graphCalls.length, before);
});

await it('authenticated ticket endpoint remains protected but still works for valid users', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const ticketBody = {
    customerName: 'Ticket Customer',
    customerEmail: 'ticket@example.invalid',
    customerPhone: '+91 98765 43210',
    subject: 'Authenticated ticket',
    message: 'Please help with my catalogue.',
    category: 'general_assistance',
    whatsappOptIn: false,
  };
  const anonymous = await createTicket(makeContext(makeEnv(d1, true), ticketBody));
  assert.equal(anonymous.status, 401);
  assert.equal(count(db, 'support_tickets'), 0);

  const authorized = await createTicket(
    makeContext(makeEnv(d1, true), ticketBody, {}, { Authorization: 'Bearer token-owner' })
  );
  assert.equal(authorized.status, 201);
  assert.equal(count(db, 'support_tickets'), 1);
});

await it('StudioLanding inquiry validates WhatsApp input before public persistence', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  const before = graphCalls.length;
  const invalid = await publicProjectInquiry(
    makeContext(makeEnv(d1, true), { ...projectBody, customerPhone: '+1 98765 43210' })
  );
  assert.equal(invalid.status, 400);
  assert.equal(count(db, 'crm_contacts_leads'), 0);
  assert.equal(graphCalls.length, before);
});

await it('admin enquiry visibility requires auth and tenant isolation, and masks phone numbers', async () => {
  const { db, d1 } = createD1();
  seedPublishedSite(db);
  await quoteRequest(makeContext(makeEnv(d1, false), quoteBody, { slug: 'wa-shop' }));

  const anonymous = await listEnquiries(makeContext(makeEnv(d1, false), {}, { tenantId: 'wa-site' }, {}, 'GET'));
  assert.equal(anonymous.status, 401);

  const forbidden = await listEnquiries(
    makeContext(makeEnv(d1, false), {}, { tenantId: 'wa-site' }, { Authorization: 'Bearer token-other' }, 'GET')
  );
  assert.equal(forbidden.status, 403);

  const allowed = await listEnquiries(
    makeContext(makeEnv(d1, false), {}, { tenantId: 'wa-site' }, { Authorization: 'Bearer token-owner' }, 'GET')
  );
  assert.equal(allowed.status, 200);
  const body: any = await allowed.json();
  assert.equal(body.enquiries.length, 1);
  assert.equal(body.enquiries[0].phoneMasked, '+91******3210');
  assert.equal(body.enquiries[0].whatsapp.status, 'setup_required');
  assert.ok(!JSON.stringify(body).includes('9876543210'));
});

globalThis.fetch = originalFetch;

console.log(`\nWhatsApp enquiry regressions: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
