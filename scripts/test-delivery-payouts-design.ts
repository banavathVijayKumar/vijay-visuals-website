// ============================================================================
// LOCAL DELIVERY PAYOUTS DESIGN VERIFIER
// Static + arithmetic checks only. No provider SDK, credentials, network,
// remote D1, migration, payment, payout, or Production access.
// ============================================================================

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getDeliveryCommissionPct,
  getRiderDeliveryCountsByPartner,
} from '../functions/api/delivery/_riderEarnings';
import type { CloudflareEnv, D1Database } from '../functions/api/_shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('Network calls are disabled in the payouts design verifier.');
};

console.log('\n====================================================================');
console.log('DELIVERY PAYOUTS DESIGN VERIFIER');
console.log('====================================================================\n');

await test('no payout schema exists locally and no migration is introduced', () => {
  const sqlFiles = [
    path.join(root, 'cloudflare', 'd1', 'schema.sql'),
    ...listFiles(path.join(root, 'cloudflare', 'd1', 'migrations')).filter((f) => f.endsWith('.sql')),
  ];
  const sql = sqlFiles.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n').toLowerCase();

  for (const table of [
    'cashfree_payouts',
    'rider_payout_accounts',
    'rider_payout_batches',
    'rider_payout_transfers',
    'payout_events',
  ]) {
    assert.equal(sql.includes(table), false, `Unexpected local payout table: ${table}`);
  }
});

await test('no Cashfree Payouts client or provider endpoint exists locally', () => {
  const apiFiles = listFiles(path.join(root, 'functions', 'api')).filter((f) => f.endsWith('.ts'));
  const normalized = apiFiles.map((f) => f.replaceAll('\\', '/'));

  assert.deepEqual(
    normalized.filter((f) => /(^|\/)payouts(\/|$)/.test(f)),
    [],
    'No payouts endpoint directory may exist before explicit approval.'
  );

  for (const file of apiFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const forbidden of [
      'cashfree.payouts',
      'payouts/balance',
      'payouts/transfers',
      '/payouts/transfers',
      'x-idempotency-key:payout',
    ]) {
      assert.equal(
        source.toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `Unexpected Payouts call in ${path.relative(root, file)}`
      );
    }
  }
});

await test('rate-card display helpers read only existing D1 fields', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE customer_website_publications (website_id TEXT, website_json TEXT);
    CREATE TABLE finance_ledger (website_id TEXT, category TEXT, reference_id TEXT, amount_inr REAL);
  `);
  db.prepare('INSERT INTO customer_website_publications VALUES (?, ?)').run(
    'site-1',
    JSON.stringify({ deliveryCommissionPct: 10 })
  );
  for (const reference of [
    'rider_earnings:site-1:10:1',
    'rider_earnings:site-1:11:1',
    'rider_earnings:site-1:12:2',
    'unrelated:reference',
  ]) {
    db.prepare('INSERT INTO finance_ledger VALUES (?, ?, ?, ?)').run('site-1', 'rider_earnings', reference, 100);
  }

  const d1 = {
    prepare(sql: string) {
      let values: any[] = [];
      return {
        bind(...bound: any[]) {
          values = bound;
          return this;
        },
        async first<T = any>() {
          return (db.prepare(sql).get(...values) as T) ?? null;
        },
        async all<T = any>() {
          return { results: db.prepare(sql).all(...values) as T[], success: true };
        },
        async run() {
          const info = db.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(info.changes), last_row_id: 0 } };
        },
      } as any;
    },
  } as D1Database;
  const env = { DB: d1 } as CloudflareEnv;

  assert.equal(await getDeliveryCommissionPct(env, 'site-1'), 10);
  assert.equal(await getDeliveryCommissionPct(env, 'missing'), 0);
  const counts = await getRiderDeliveryCountsByPartner(env);
  assert.equal(counts.get('site-1|1'), 2);
  assert.equal(counts.get('site-1|2'), 1);
});

await test('₹80,000/month feasibility table uses labelled assumptions only', () => {
  const targetInr = 80_000;
  const workingDays = 26; // assumption, not stored in code
  const hoursPerDay = 8; // given target
  const scenarios = [
    { pct: 5, avgOrderInr: 500, expectedOrders: 124, expectedMinutes: 3.9 },
    { pct: 10, avgOrderInr: 500, expectedOrders: 62, expectedMinutes: 7.7 },
    { pct: 15, avgOrderInr: 500, expectedOrders: 42, expectedMinutes: 11.4 },
    { pct: 20, avgOrderInr: 500, expectedOrders: 31, expectedMinutes: 15.5 },
  ];

  for (const scenario of scenarios) {
    const requiredGmv = targetInr / (scenario.pct / 100);
    const ordersPerDay = Math.ceil(requiredGmv / (workingDays * scenario.avgOrderInr));
    const minutesPerOrder = Math.round(((hoursPerDay * 60) / ordersPerDay) * 10) / 10;
    assert.equal(ordersPerDay, scenario.expectedOrders);
    assert.equal(minutesPerOrder, scenario.expectedMinutes);
  }

  const doc = fs.readFileSync(path.join(root, 'docs', 'DELIVERY_PAYOUTS_DESIGN.md'), 'utf8');
  assert.match(doc, /design only/i);
  assert.ok(doc.includes('₹80,000'));
  assert.match(doc, /assumptions/i);
  assert.match(doc, /provider-confirmed/i);
});

globalThis.fetch = originalFetch;
console.log(`\n${passed} checks passed. No network, provider call, migration, payout, or Production access was used.\n`);
