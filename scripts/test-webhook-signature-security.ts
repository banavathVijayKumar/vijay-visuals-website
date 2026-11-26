// ============================================================================
// VIJAY VISUALS — WEBHOOK SIGNATURE SECURITY REGRESSION SUITE
// Fully local: in-memory D1 plus synthetic signing keys. No .env, no remote
// services, no real provider requests, and no actual secret values.
//
// Run: node .\node_modules\tsx\dist\cli.mjs scripts/test-webhook-signature-security.ts
// ============================================================================

import assert from 'node:assert';
import { createHmac, webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestPost as resendWebhook } from '../functions/api/webhooks/resend';
import {
  onRequestGet as whatsappVerify,
  onRequestPost as whatsappWebhook,
} from '../functions/api/webhooks/whatsapp';
import { CloudflareEnv, D1Database, PagesContext } from '../functions/api/_shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.resolve(__dirname, '..', 'cloudflare', 'd1', 'migrations');

if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

// Synthetic test-only signing material. These are not real secrets.
const RESEND_KEY_B64 = Buffer.from('local-svix-key-material-0123456789').toString('base64');
const RESEND_SECRET = `whsec_${RESEND_KEY_B64}`;
const WHATSAPP_APP_SECRET = 'local-meta-app-secret';
const WHATSAPP_VERIFY_TOKEN = 'local-meta-verify-token';
const WHATSAPP_CLOUD_TOKEN = 'local-whatsapp-cloud-token';

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

function seedLog(db: DatabaseSync, providerMessageId: string): void {
  db.prepare(
    `INSERT INTO notification_logs
      (channel, event_type, message_preview, delivery_status, provider_message_id, error_detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('email', 'payment_confirmed', 'seed', 'sent', providerMessageId, 'seed-detail');
}

function readLog(db: DatabaseSync, providerMessageId: string): any {
  return db.prepare(
    'SELECT delivery_status, error_detail FROM notification_logs WHERE provider_message_id = ?'
  ).get(providerMessageId) as any;
}

function makeEnv(d1: D1Database, extra: Record<string, string> = {}): CloudflareEnv {
  return { DB: d1, ...extra } as CloudflareEnv;
}

function makeContext(
  request: Request,
  env: CloudflareEnv
): PagesContext {
  return {
    request,
    env,
    params: {},
    next: async () => new Response(null, { status: 204 }),
  };
}

function postRequest(rawBody: string, headers: Record<string, string> = {}): Request {
  return new Request('https://preview.example.test/api/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
}

function getRequest(query: string): Request {
  return new Request(`https://preview.example.test/api/webhooks/whatsapp${query}`, {
    method: 'GET',
  });
}

function svixSignature(rawBody: string, id: string, timestamp: string): string {
  return createHmac('sha256', Buffer.from(RESEND_KEY_B64, 'base64'))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
}

function freshSvixHeaders(rawBody: string): Record<string, string> {
  const id = 'msg_local_resend_001';
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${svixSignature(rawBody, id, timestamp)}`,
  };
}

function whatsappSignature(rawBody: string, secret = WHATSAPP_APP_SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

const RESEND_PAYLOAD = JSON.stringify({
  type: 'email.delivered',
  data: { email_id: 'resend-log-1' },
});

const WHATSAPP_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'local-wba',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            statuses: [{ id: 'whatsapp-log-1', status: 'delivered' }],
          },
          field: 'message_template_status_update',
        },
      ],
    },
  ],
});

async function runResendTests(): Promise<void> {
  console.log('\n--- RESEND (Svix signature verification) ---');

  await it('valid Svix signature passes and updates the notification log', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const response = await resendWebhook(
      makeContext(
        postRequest(RESEND_PAYLOAD, freshSvixHeaders(RESEND_PAYLOAD)),
        makeEnv(d1, { RESEND_WEBHOOK_SECRET: RESEND_SECRET })
      )
    );
    assert.equal(response.status, 200);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'delivered');
  });

  await it('missing signature headers are rejected without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const response = await resendWebhook(
      makeContext(postRequest(RESEND_PAYLOAD), makeEnv(d1, { RESEND_WEBHOOK_SECRET: RESEND_SECRET }))
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'sent');
    assert.equal(readLog(db, 'resend-log-1').error_detail, 'seed-detail');
  });

  await it('invalid signature is rejected without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const headers = freshSvixHeaders(RESEND_PAYLOAD);
    headers['svix-signature'] = `v1,${svixSignature('tampered', headers['svix-id'], headers['svix-timestamp'])}`;
    const response = await resendWebhook(
      makeContext(postRequest(RESEND_PAYLOAD, headers), makeEnv(d1, { RESEND_WEBHOOK_SECRET: RESEND_SECRET }))
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'sent');
  });

  await it('altered raw body is rejected even with a valid signature for the original body', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const altered = RESEND_PAYLOAD.replace('email.delivered', 'email.bounced');
    const response = await resendWebhook(
      makeContext(
        postRequest(altered, freshSvixHeaders(RESEND_PAYLOAD)),
        makeEnv(d1, { RESEND_WEBHOOK_SECRET: RESEND_SECRET })
      )
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'sent');
  });

  await it('replayed/expired timestamp is rejected without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const id = 'msg_local_replay_001';
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);
    const headers = {
      'svix-id': id,
      'svix-timestamp': staleTimestamp,
      'svix-signature': `v1,${svixSignature(RESEND_PAYLOAD, id, staleTimestamp)}`,
    };
    const response = await resendWebhook(
      makeContext(postRequest(RESEND_PAYLOAD, headers), makeEnv(d1, { RESEND_WEBHOOK_SECRET: RESEND_SECRET }))
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'sent');
  });

  await it('missing signing secret fails closed without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'resend-log-1');
    const response = await resendWebhook(
      makeContext(postRequest(RESEND_PAYLOAD, freshSvixHeaders(RESEND_PAYLOAD)), makeEnv(d1))
    );
    assert.equal(response.status, 500);
    assert.equal(readLog(db, 'resend-log-1').delivery_status, 'sent');
  });
}

async function runWhatsappTests(): Promise<void> {
  console.log('\n--- WHATSAPP (X-Hub-Signature-256 verification) ---');

  await it('valid X-Hub-Signature-256 passes and updates the notification log', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const response = await whatsappWebhook(
      makeContext(
        postRequest(WHATSAPP_PAYLOAD, { 'x-hub-signature-256': whatsappSignature(WHATSAPP_PAYLOAD) }),
        makeEnv(d1, { WHATSAPP_APP_SECRET: WHATSAPP_APP_SECRET })
      )
    );
    assert.equal(response.status, 200);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'delivered');
  });

  await it('missing signature header is rejected without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const response = await whatsappWebhook(
      makeContext(postRequest(WHATSAPP_PAYLOAD), makeEnv(d1, { WHATSAPP_APP_SECRET: WHATSAPP_APP_SECRET }))
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'sent');
    assert.equal(readLog(db, 'whatsapp-log-1').error_detail, 'seed-detail');
  });

  await it('invalid signature is rejected without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const response = await whatsappWebhook(
      makeContext(
        postRequest(WHATSAPP_PAYLOAD, {
          'x-hub-signature-256': whatsappSignature(WHATSAPP_PAYLOAD, 'wrong-app-secret'),
        }),
        makeEnv(d1, { WHATSAPP_APP_SECRET: WHATSAPP_APP_SECRET })
      )
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'sent');
  });

  await it('altered raw body is rejected even with a valid signature for the original body', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const altered = WHATSAPP_PAYLOAD.replace('"delivered"', '"failed"');
    const response = await whatsappWebhook(
      makeContext(
        postRequest(altered, { 'x-hub-signature-256': whatsappSignature(WHATSAPP_PAYLOAD) }),
        makeEnv(d1, { WHATSAPP_APP_SECRET: WHATSAPP_APP_SECRET })
      )
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'sent');
  });

  await it('Cloud API token cannot be used as the webhook signature secret', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const response = await whatsappWebhook(
      makeContext(
        postRequest(WHATSAPP_PAYLOAD, {
          'x-hub-signature-256': whatsappSignature(WHATSAPP_PAYLOAD, WHATSAPP_CLOUD_TOKEN),
        }),
        makeEnv(d1, {
          WHATSAPP_APP_SECRET: WHATSAPP_APP_SECRET,
          WHATSAPP_CLOUD_API_TOKEN: WHATSAPP_CLOUD_TOKEN,
        })
      )
    );
    assert.equal(response.status, 401);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'sent');
  });

  await it('missing app secret fails closed without log changes', async () => {
    const { db, d1 } = createD1();
    seedLog(db, 'whatsapp-log-1');
    const response = await whatsappWebhook(
      makeContext(
        postRequest(WHATSAPP_PAYLOAD, { 'x-hub-signature-256': whatsappSignature(WHATSAPP_PAYLOAD) }),
        makeEnv(d1)
      )
    );
    assert.equal(response.status, 500);
    assert.equal(readLog(db, 'whatsapp-log-1').delivery_status, 'sent');
  });

  await it('valid GET verification token returns the challenge', async () => {
    const { d1 } = createD1();
    const response = await whatsappVerify(
      makeContext(
        getRequest(
          `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(WHATSAPP_VERIFY_TOKEN)}&hub.challenge=challenge-123`
        ),
        makeEnv(d1, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN })
      )
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'challenge-123');
  });

  await it('invalid GET verification token is rejected', async () => {
    const { d1 } = createD1();
    const response = await whatsappVerify(
      makeContext(
        getRequest('?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123'),
        makeEnv(d1, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN })
      )
    );
    assert.equal(response.status, 403);
  });

  await it('hardcoded and Cloud API token fallbacks are rejected', async () => {
    const { d1 } = createD1();
    const env = makeEnv(d1, {
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: WHATSAPP_VERIFY_TOKEN,
      WHATSAPP_CLOUD_API_TOKEN: WHATSAPP_CLOUD_TOKEN,
    });
    for (const candidate of ['vijay_visuals_wa_verify', WHATSAPP_CLOUD_TOKEN]) {
      const response = await whatsappVerify(
        makeContext(
          getRequest(
            `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(candidate)}&hub.challenge=challenge-123`
          ),
          env
        )
      );
      assert.equal(response.status, 403, `unexpected acceptance of ${candidate}`);
    }
  });

  await it('GET verification fails closed when no verify token is configured', async () => {
    const { d1 } = createD1();
    const response = await whatsappVerify(
      makeContext(
        getRequest(
          `?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(WHATSAPP_VERIFY_TOKEN)}&hub.challenge=challenge-123`
        ),
        makeEnv(d1)
      )
    );
    assert.equal(response.status, 403);
  });
}

async function main(): Promise<void> {
  console.log('================================================================');
  console.log(' WEBHOOK SIGNATURE SECURITY — LOCAL REGRESSION SUITE');
  console.log('================================================================');
  await runResendTests();
  await runWhatsappTests();
  console.log('\n================================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
