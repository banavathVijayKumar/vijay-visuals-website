// ============================================================================
// PREVIEW BACKUP / RESTORE DRILL — LOCAL ISOLATED TEST DATA ONLY
// Exports a synthetic tenant fixture, computes a checksum, mutates/deletes it,
// restores from the export and verifies the checksum plus a restore audit row.
// No remote D1, no Production data, no secrets, no network, no deployment.
// ============================================================================

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'cloudflare', 'd1', 'schema.sql');
const migrationsDir = path.join(root, 'cloudflare', 'd1', 'migrations');

const BACKUP_TABLES = [
  'customer_website_publications',
  'store_orders',
  'platform_payments',
  'vv_audit_log',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];
type Backup = Record<BackupTable, Array<Record<string, unknown>>>;

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(schemaPath, 'utf8'));
for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
}

function exportBackup(): Backup {
  const result = {} as Backup;
  for (const table of BACKUP_TABLES) {
    result[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Array<
      Record<string, unknown>
    >;
  }
  return result;
}

function checksum(backup: Backup): string {
  return createHash('sha256').update(JSON.stringify(backup)).digest('hex');
}

function restoreBackup(backup: Backup): void {
  // Foreign keys are OFF only for the restore transaction boundaries; the
  // fixture is reinserted in parent-before-child order.
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    for (const table of BACKUP_TABLES) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    for (const table of BACKUP_TABLES) {
      const rows = backup[table];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
      );
      for (const row of rows) {
        insert.run(...columns.map((column) => (row[column] ?? null) as any));
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

console.log('================================================================');
console.log('PREVIEW BACKUP / RESTORE DRILL (LOCAL, ISOLATED)');
console.log('================================================================');

db.prepare(
  `INSERT INTO customer_website_publications
    (website_id, owner_id, public_slug, business_name, website_json, status)
   VALUES (?, ?, ?, ?, ?, 'published')`
).run(
  'preview_drill_site_001',
  'preview_drill_owner_001',
  'preview-drill-store',
  'Preview Drill Store',
  '{}'
);

db.prepare(
  `INSERT INTO store_orders
    (order_number, website_id, owner_id, customer_name, customer_phone, customer_email,
     total_inr, payment_status, gateway_order_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  'PREVIEW-DRILL-1001',
  'preview_drill_site_001',
  'preview_drill_owner_001',
  'Local Test Customer',
  '',
  '',
  250,
  'paid',
  'preview_drill_order_1001'
);

db.prepare(
  `INSERT INTO platform_payments
    (website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
     base_amount_inr, gst_amount_inr, amount_inr, currency, razorpay_mode,
     razorpay_order_id, signature_verified, status)
   VALUES (?, ?, 'website_purchase', 'business-website', 'Business Website Package',
           'one_time', 250, 0, 250, 'INR', 'test', ?, 1, 'paid')`
).run(
  'preview_drill_site_001',
  'preview_drill_owner_001',
  'cf_preview_drill_order_1001'
);

db.prepare(
  `INSERT INTO vv_audit_log
    (id, actor_user_id, action, entity_type, entity_id, metadata_json)
   VALUES (?, ?, ?, ?, ?, ?)`
).run(
  'aud_preview_drill_seed',
  'preview_drill_owner_001',
  'preview_backup_drill_seed',
  'preview_drill',
  'preview_drill_site_001',
  '{}'
);

const original = exportBackup();
const originalChecksum = checksum(original);
assert.equal(original.store_orders.length, 1);
assert.equal(original.platform_payments.length, 1);
console.log(`  PASS  exported isolated fixture (${originalChecksum.slice(0, 12)}…)`);

db.prepare("UPDATE store_orders SET total_inr = 1 WHERE order_number = 'PREVIEW-DRILL-1001'").run();
db.prepare("DELETE FROM platform_payments WHERE razorpay_order_id = ?").run(
  'cf_preview_drill_order_1001'
);
db.prepare("DELETE FROM vv_audit_log WHERE id = 'aud_preview_drill_seed'").run();

const mutated = exportBackup();
assert.notEqual(checksum(mutated), originalChecksum);
assert.equal(mutated.store_orders[0].total_inr, 1);
assert.equal(mutated.platform_payments.length, 0);
console.log('  PASS  mutation changed checksum without touching external data');

restoreBackup(original);
const restored = exportBackup();
assert.equal(checksum(restored), originalChecksum);
assert.equal(restored.store_orders[0].total_inr, 250);
assert.equal(restored.platform_payments[0].signature_verified, 1);
console.log('  PASS  restore reproduced the exact exported checksum');

db.prepare(
  `INSERT INTO vv_audit_log
    (id, actor_user_id, action, entity_type, entity_id, metadata_json)
   VALUES (?, ?, ?, ?, ?, ?)`
).run(
  'aud_preview_drill_restore',
  'preview_drill_owner_001',
  'preview_backup_drill_restore_verified',
  'preview_drill',
  'preview_drill_site_001',
  JSON.stringify({ checksum: originalChecksum })
);

const auditCount = Number(
  (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM vv_audit_log WHERE action = 'preview_backup_drill_restore_verified'"
      )
      .get() as any
  ).count
);
assert.equal(auditCount, 1);
console.log('  PASS  restore audit row recorded');

console.log('================================================================');
console.log('RESULT: 4 passed, 0 failed — no Production or remote D1 access');
console.log('================================================================');
