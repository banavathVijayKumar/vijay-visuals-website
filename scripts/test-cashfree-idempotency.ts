// Regression tests for the Cashfree numeric/string payment-ID idempotency fix.
// Run with: npx tsx scripts/test-cashfree-idempotency.ts
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCashfreeWebhookEventId,
  cashfreeNotificationIdempotencyKey,
  cashfreeSettlementIdempotencyKey,
  normalizeCashfreePaymentId,
  parseCashfreeJsonPreservingLargeIds,
} from '../functions/api/payments/_cashfreeIdentity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'cloudflare', 'd1', 'migrations');

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(` [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.error(` [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('--- CASHFREE IDEMPOTENCY REGRESSION TESTS ---');

// ---------------------------------------------------------------------------
// 1. Lossless numeric/string payment identity
// ---------------------------------------------------------------------------
// Numeric ID literal written directly so the test never passes through a lossy
// JavaScript number before the parser under test sees it.
const numericBody =
  '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"test_vv_store_TEST-ORD-696764-6E7C_d836","order_amount":1,"order_currency":"INR"},"payment":{"cf_payment_id":1479293233523053056,"bank_reference":1479293233523053056,"payment_status":"SUCCESS"}}}';
const numericParsed = parseCashfreeJsonPreservingLargeIds<any>(numericBody);
const numericId = normalizeCashfreePaymentId(numericParsed.data.payment.cf_payment_id);
check('numeric cf_payment_id preserved exactly', numericId === '1479293233523053056', numericId);

const stringBody = '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{"order_id":"test_vv_store_TEST-ORD-696764-6E7C_d836"},"payment":{"cf_payment_id":"1479293233523053056"}}}';
const stringParsed = parseCashfreeJsonPreservingLargeIds<any>(stringBody);
const stringId = normalizeCashfreePaymentId(stringParsed.data.payment.cf_payment_id);
check('string cf_payment_id preserved exactly', stringId === '1479293233523053056', stringId);
check('numeric and string IDs normalize identically', numericId === stringId);

// A JS number that already lost precision must be rejected, not persisted.
check('unsafe JS number rejected', normalizeCashfreePaymentId(1479293233523053000) === '');

const numericEventId = buildCashfreeWebhookEventId('PAYMENT_SUCCESS_WEBHOOK', numericParsed.data.order.order_id, numericId, '0');
const stringEventId = buildCashfreeWebhookEventId('PAYMENT_SUCCESS_WEBHOOK', stringParsed.data.order.order_id, stringId, '0');
check('canonical webhook event ID identical across representations', numericEventId === stringEventId, numericEventId);

const numericSettlementKey = cashfreeSettlementIdempotencyKey(numericParsed.data.order.order_id, numericId);
const stringSettlementKey = cashfreeSettlementIdempotencyKey(stringParsed.data.order.order_id, stringId);
check('canonical settlement key identical across representations', numericSettlementKey === stringSettlementKey, numericSettlementKey);

check(
  'canonical notification keys identical across representations',
  cashfreeNotificationIdempotencyKey('em', numericParsed.data.order.order_id, numericId) ===
    cashfreeNotificationIdempotencyKey('em', stringParsed.data.order.order_id, stringId)
);

// Use a fresh payment ID for new-write tests so historical duplicate rows
// inserted below cannot satisfy the uniqueness checks by accident.
const freshPaymentId = '1479293233523053999';
const freshOrderId = numericParsed.data.order.order_id;
const freshEventId = buildCashfreeWebhookEventId('PAYMENT_SUCCESS_WEBHOOK', freshOrderId, freshPaymentId, '0');
const freshSettlementKey = cashfreeSettlementIdempotencyKey(freshOrderId, freshPaymentId);

// ---------------------------------------------------------------------------
// 2. Full migration chain on a fresh in-memory SQLite DB
// ---------------------------------------------------------------------------
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const enforcementMigration = migrationFiles.find((f) => f.startsWith('0020_'));
const legacyMigrationFiles = migrationFiles.filter((f) => f !== enforcementMigration);
for (const file of legacyMigrationFiles) {
  db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
}
console.log(` [PASS] applied ${legacyMigrationFiles.length} legacy migrations including 0019`);
check('0020 settlement enforcement migration present', Boolean(enforcementMigration));

const indexRows = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='index' AND name IN (
     'idx_cf_webhook_payment_identity',
     'idx_cf_settlements_idempotency_key',
     'idx_notification_logs_idempotency_key'
   )`
).all() as { name: string }[];
check('three partial unique indexes created', indexRows.length === 3, indexRows.map((r) => r.name).join(', '));

for (const [table, column] of [
  ['payment_webhook_events', 'payment_id_normalized'],
  ['cashfree_seller_settlements', 'idempotency_key'],
  ['notification_logs', 'idempotency_key'],
] as const) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
  check(`${table}.${column} exists`, cols.some((c) => c.name === column));
}

db.exec('PRAGMA foreign_keys = OFF;');
const count = (sql: string, ...params: any[]) =>
  Number((db.prepare(sql).get(...params) as { n: number }).n);

// ---------------------------------------------------------------------------
// 3. Historical duplicates are preserved (no forced unique index conflict)
// ---------------------------------------------------------------------------
db.prepare(
  `INSERT INTO cashfree_seller_settlements
   (website_id, owner_id, store_order_id, order_number, gross_amount_inr, seller_payable_inr, notes_json, idempotency_key)
   VALUES ('prev_site_svs','owner',16,'LEGACY',1,1,'{"cfPaymentId":"1479293233523053000"}','')`
).run();
db.prepare(
  `INSERT INTO cashfree_seller_settlements
   (website_id, owner_id, store_order_id, order_number, gross_amount_inr, seller_payable_inr, notes_json, idempotency_key)
   VALUES ('prev_site_svs','owner',16,'LEGACY',1,1,'{"cfPaymentId":"1479293233523053056"}','')`
).run();
check(
  'historical settlement duplicates coexist (empty key excluded from index)',
  count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE store_order_id = 16`) === 2
);

db.prepare(
  `INSERT INTO payment_webhook_events (event_id, event_type, flow_type, reference_id, payment_id_normalized)
   VALUES ('PAYMENT_SUCCESS_WEBHOOK:1479293233523053000','PAYMENT_SUCCESS_WEBHOOK','seller_order','ord','')`
).run();
db.prepare(
  `INSERT INTO payment_webhook_events (event_id, event_type, flow_type, reference_id, payment_id_normalized)
   VALUES ('PAYMENT_SUCCESS_WEBHOOK:1479293233523053056','PAYMENT_SUCCESS_WEBHOOK','seller_order','ord','')`
).run();
check(
  'historical webhook event duplicates coexist',
  count(`SELECT COUNT(*) AS n FROM payment_webhook_events`) === 2
);

db.prepare(
  `INSERT INTO notification_logs (recipient_contact, channel, event_type, delivery_status, provider_message_id, idempotency_key)
   VALUES ('preview-test@example.invalid','email','payment_confirmed','failed','idemp_pay_em_a','')`
).run();
db.prepare(
  `INSERT INTO notification_logs (recipient_contact, channel, event_type, delivery_status, provider_message_id, idempotency_key)
   VALUES ('preview-test@example.invalid','email','payment_confirmed','failed','idemp_pay_em_b','')`
).run();
check(
  'historical notification duplicates coexist',
  count(`SELECT COUNT(*) AS n FROM notification_logs WHERE event_type = 'payment_confirmed'`) === 2
);

// Apply the additive enforcement migration only AFTER legacy duplicates exist,
// proving it preserves them instead of demanding a backfill/deletion.
if (enforcementMigration) {
  db.exec(fs.readFileSync(path.join(migrationsDir, enforcementMigration), 'utf8'));
  console.log(` [PASS] applied ${enforcementMigration} after seeding legacy duplicates`);
}
const triggerRows = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='cashfree_seller_settlements' ORDER BY name`
).all() as { name: string }[];
check(
  'settlement key guard triggers created',
  triggerRows.map((r) => r.name).join(',') ===
    'trg_cashfree_settlements_keep_idempotency_key,trg_cashfree_settlements_require_idempotency_key',
  triggerRows.map((r) => r.name).join(', ')
);
check(
  'historical settlement duplicates preserved after 0020',
  count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE store_order_id = 16`) === 2
);

const settlementBaseSql = `
  INSERT INTO cashfree_seller_settlements
   (website_id, owner_id, store_order_id, order_number, gross_amount_inr, seller_payable_inr, notes_json, idempotency_key)
  VALUES ('prev_site_svs','owner',18,'KEY-GUARD',1,1,'{}',?)`;
const settlementNoKeySql = `
  INSERT INTO cashfree_seller_settlements
   (website_id, owner_id, store_order_id, order_number, gross_amount_inr, seller_payable_inr, notes_json)
  VALUES ('prev_site_svs','owner',18,'KEY-GUARD',1,1,'{}')`;
function expectInsertRejected(sql: string, ...params: any[]): boolean {
  try {
    db.prepare(sql).run(...params);
    return false;
  } catch {
    return true;
  }
}
check('empty idempotency_key insert rejected', expectInsertRejected(settlementBaseSql, ''));
check('NULL idempotency_key insert rejected', expectInsertRejected(settlementBaseSql, null));
check('missing idempotency_key insert rejected', expectInsertRejected(settlementNoKeySql));
check(
  'no partial row survives rejected key inserts',
  count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE store_order_id = 18`) === 0
);

// ---------------------------------------------------------------------------
// 4. Webhook event duplicate delivery / retry
// ---------------------------------------------------------------------------
const eventInsert = db.prepare(
  `INSERT OR IGNORE INTO payment_webhook_events
   (event_id, provider, event_type, flow_type, reference_id, signature_verified, payment_id_normalized, payload_json)
   VALUES (?, 'cashfree', 'PAYMENT_SUCCESS_WEBHOOK', 'seller_order', 'ord', 1, ?, '{}')`
);
const firstEvent = eventInsert.run(freshEventId, freshPaymentId);
const retryEvent = eventInsert.run(freshEventId, freshPaymentId);
check('first webhook event inserted', Number(firstEvent.changes) === 1);
check('duplicate webhook delivery ignored', Number(retryEvent.changes) === 0);
check('only one canonical webhook event row', count(`SELECT COUNT(*) AS n FROM payment_webhook_events WHERE payment_id_normalized <> ''`) === 1);

// Different event ID but same normalized payment identity must also be ignored.
const alternateEvent = eventInsert.run(`${freshEventId}:retry-token`, freshPaymentId);
check('per-delivery retry token cannot create a second event', Number(alternateEvent.changes) === 0);

// ---------------------------------------------------------------------------
// 5. Settlement duplicate + interleaved (concurrent-equivalent) processing
// ---------------------------------------------------------------------------
const settlementInsert = db.prepare(
  `INSERT OR IGNORE INTO cashfree_seller_settlements
   (website_id, owner_id, store_order_id, order_number, gross_amount_inr, seller_payable_inr,
    notes_json, idempotency_key)
   VALUES ('prev_site_svs','owner',16,'TEST-ORD-696764-6E7C',1,1,'{}',?)`
);
// Simulate two concurrent handlers that both read "no settlement" before either writes.
const concurrentReadA = count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE idempotency_key = ?`, freshSettlementKey);
const concurrentReadB = count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE idempotency_key = ?`, freshSettlementKey);
check('both concurrent handlers observed no settlement', concurrentReadA === 0 && concurrentReadB === 0);
const concurrentWriteA = settlementInsert.run(freshSettlementKey);
const concurrentWriteB = settlementInsert.run(freshSettlementKey);
check('exactly one concurrent settlement write succeeds', Number(concurrentWriteA.changes) + Number(concurrentWriteB.changes) === 1);
check('settlement retry ignored', Number(settlementInsert.run(freshSettlementKey).changes) === 0);
check(
  'single settlement for canonical payment identity',
  count(`SELECT COUNT(*) AS n FROM cashfree_seller_settlements WHERE idempotency_key = ?`, freshSettlementKey) === 1
);

// ---------------------------------------------------------------------------
// 6. Payment confirmation notification retry behavior
// ---------------------------------------------------------------------------
const notificationInsert = db.prepare(
  `INSERT OR IGNORE INTO notification_logs
   (recipient_contact, channel, event_type, delivery_status, provider_message_id, idempotency_key)
   VALUES ('preview-test@example.invalid','email','payment_confirmed','failed',?,?)`
);
const emailKey = cashfreeNotificationIdempotencyKey('em', numericParsed.data.order.order_id, numericId);
check('first payment-confirmed email logged', Number(notificationInsert.run(`idemp_${emailKey}`, emailKey).changes) === 1);
check('duplicate email log ignored', Number(notificationInsert.run(`idemp_${emailKey}`, emailKey).changes) === 0);
check(
  'only one canonical payment-confirmed email row',
  count(`SELECT COUNT(*) AS n FROM notification_logs WHERE idempotency_key = ?`, emailKey) === 1
);
const waKey = cashfreeNotificationIdempotencyKey('wa', numericParsed.data.order.order_id, numericId);
check('distinct WhatsApp key is allowed', Number(notificationInsert.run(`idemp_${waKey}`, waKey).changes) === 1);
check(
  'email and WhatsApp logs remain distinct',
  count(`SELECT COUNT(*) AS n FROM notification_logs WHERE idempotency_key IN (?,?)`, emailKey, waKey) === 2
);

// ---------------------------------------------------------------------------
// 7. Every active application insert path uses the canonical key
// ---------------------------------------------------------------------------
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
const insertPattern = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+cashfree_seller_settlements/i;
const activeInsertPaths = collectTsFiles(path.join(projectRoot, 'functions')).filter((file) =>
  insertPattern.test(fs.readFileSync(file, 'utf8'))
);
check(
  'all active settlement insert paths discovered',
  activeInsertPaths.length === 2,
  activeInsertPaths.map((f) => path.relative(projectRoot, f)).join(', ')
);
for (const file of activeInsertPaths) {
  const src = fs.readFileSync(file, 'utf8');
  const match = src.match(insertPattern);
  const start = match?.index ?? 0;
  const sqlSegment = src.slice(start, start + 1000);
  const relative = path.relative(projectRoot, file);
  check(`${relative} INSERT includes idempotency_key`, sqlSegment.includes('idempotency_key'));
  check(
    `${relative} binds canonical settlement key`,
    sqlSegment.includes('cashfreeSettlementIdempotencyKey(orderId, cfPaymentId)')
  );
}

db.close();

if (failures > 0) {
  console.error(`\n${failures} regression check(s) FAILED.`);
  process.exit(1);
}
console.log('\nALL CASHFREE IDEMPOTENCY REGRESSION CHECKS PASSED.');
