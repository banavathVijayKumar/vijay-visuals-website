// ============================================================================
// VIJAY VISUALS — LIFETIME ENTITLEMENTS, FREE START QUOTAS & PAID EXPIRY TEST
// Applies the real numbered migrations to a clean in-memory SQLite database,
// then exercises the shared entitlement helpers through a D1-shaped adapter.
// No remote D1, no network, no secrets.
// ============================================================================

import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductQuota,
  checkTenantSubscriptionEntitlement,
  provisionLifetimeEntitlement,
} from '../functions/api/_tenantAccess';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'cloudflare', 'd1', 'migrations');

let passed = 0;
let failed = 0;

async function it(desc: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

class LocalD1Adapter {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      this.db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string) {
    const db = this.db;
    return {
      bind(...params: any[]) {
        return {
          get<T = any>(): T | undefined {
            return db.prepare(sql).get(...params) as T | undefined;
          },
          all<T = any>(): T[] {
            return db.prepare(sql).all(...params) as T[];
          },
          run(): { success: boolean; meta?: { last_row_id?: number } } {
            const info = db.prepare(sql).run(...params);
            return {
              success: true,
              meta: { last_row_id: Number((info as any).lastInsertRowid || 0) },
            };
          },
          async first<T = any>(): Promise<T | null> {
            return (db.prepare(sql).get(...params) as T) || null;
          },
        };
      },
    };
  }
}

function makeEnv(db: LocalD1Adapter): any {
  return { DB: db } as any;
}

async function statusOf(response: Response | undefined): Promise<number> {
  return response ? response.status : 0;
}

console.log('--- LIFETIME ENTITLEMENT / FREE START / EXPIRY TEST ---');

const db = new LocalD1Adapter();
const env = makeEnv(db);

// Seed two website drafts owned by different owners.
db.prepare(
  `INSERT INTO customer_website_publications
   (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, '', datetime('now'), datetime('now'))`
)
  .bind('free_site_a', 'owner_a', 'free-a', 'Free A', JSON.stringify({ planTier: 'free_start', planCode: 'free-start' }), 'unpublished')
  .run();

db.prepare(
  `INSERT INTO customer_website_publications
   (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, '', datetime('now'), datetime('now'))`
)
  .bind('free_site_b', 'owner_a', 'free-b', 'Free B', JSON.stringify({ planTier: 'free_start', planCode: 'free-start' }), 'unpublished')
  .run();

db.prepare(
  `INSERT INTO customer_website_publications
   (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, '', datetime('now'), datetime('now'))`
)
  .bind('paid_site', 'owner_b', 'paid-site', 'Paid Site', '{}', 'published')
  .run();

// --- Free Start lifetime entitlement ---------------------------------------
await it('Free Start provisions an explicit lifetime entitlement (no expiry column)', async () => {
  const result = await provisionLifetimeEntitlement(env, {
    websiteId: 'free_site_a',
    ownerId: 'owner_a',
    planCode: 'free-start',
    entitlementType: 'free_start',
    source: 'test_free_start_publish',
    sourceReference: 'free-a',
  });
  assert.equal(result.ok, true);

  const row = (await env.DB.prepare(
    `SELECT id, entitlement_type, status FROM tenant_lifetime_entitlements
     WHERE website_id = ? AND owner_id = ? LIMIT 1`
  )
    .bind('free_site_a', 'owner_a')
    .first()) as { id: number; entitlement_type: string; status: string } | null;
  assert.ok(row, 'lifetime entitlement row exists');
  assert.equal(row.entitlement_type, 'free_start');
  assert.equal(row.status, 'active');

  const columns = db.prepare(`PRAGMA table_info(tenant_lifetime_entitlements)`).bind().all() as any[];
  const names = columns.map((c) => c.name);
  assert.ok(!names.includes('current_period_end'), 'no expiry column on lifetime entitlements');
  assert.ok(!names.includes('expires_at'), 'no expiry column on lifetime entitlements');
});

await it('Only one Free Start entitlement is allowed per owner', async () => {
  const result = await provisionLifetimeEntitlement(env, {
    websiteId: 'free_site_b',
    ownerId: 'owner_a',
    planCode: 'free-start',
    entitlementType: 'free_start',
    source: 'test_free_start_publish',
  });
  assert.equal(result.ok, false);
  assert.equal(await statusOf(result.error), 409);

  const count = db.prepare(
    `SELECT COUNT(*) AS c FROM tenant_lifetime_entitlements WHERE owner_id = ? AND entitlement_type = 'free_start'`
  ).bind('owner_a').get() as { c: number };
  assert.equal(count.c, 1);
});

await it('Free Start entitlement yields 15-product quota and publish rights', async () => {
  const entitlement = await checkTenantSubscriptionEntitlement(env, 'free_site_a', 'owner_a');
  assert.equal(entitlement.planCode, 'free-start');
  assert.equal(entitlement.planTier, 'free_start');
  assert.equal(entitlement.maxProducts, 15);
  assert.equal(entitlement.canPublish, true);
  assert.equal(entitlement.isFreeStart, true);
});

await it('Unpublished draft website_json alone never grants publishing entitlement', async () => {
  // owner_a has a Free Start entitlement on free_site_a, but free_site_b is a
  // different website with no entitlement. Its draft JSON must not grant access.
  const entitlement = await checkTenantSubscriptionEntitlement(env, 'free_site_b', 'owner_a');
  assert.equal(entitlement.hasActiveSubscription, false);
  assert.equal(entitlement.canPublish, false);
  assert.equal(entitlement.isFreeStart, false);
});

// --- Product quota enforcement ---------------------------------------------
await it('Free Start allows 15 products and rejects the 16th', async () => {
  // Quota is checked before insert with additional=1: 14 existing + 1 new = 15 allowed.
  for (let i = 1; i <= 14; i++) {
    db.prepare(
      `INSERT INTO store_products (website_id, owner_id, name, price_inr, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 100, 1, datetime('now'), datetime('now'))`
    )
      .bind('free_site_a', 'owner_a', `Product ${i}`)
      .run();
  }

  const ok = await assertProductQuota(env, 'free_site_a', 'owner_a');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.maxProducts, 15);

  // Insert the 15th product; the next quota check must reject.
  db.prepare(
    `INSERT INTO store_products (website_id, owner_id, name, price_inr, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 100, 1, datetime('now'), datetime('now'))`
  )
    .bind('free_site_a', 'owner_a', 'Product 15')
    .run();

  const rejected = await assertProductQuota(env, 'free_site_a', 'owner_a');
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(await statusOf(rejected.error), 403);
});

// --- One-time purchase lifetime entitlement --------------------------------
await it('One-time website package provisions a lifetime entitlement, not a subscription', async () => {
  const result = await provisionLifetimeEntitlement(env, {
    websiteId: 'paid_site',
    ownerId: 'owner_b',
    planCode: 'business-website',
    entitlementType: 'one_time_purchase',
    source: 'test_one_time_purchase',
    sourceReference: 'order_test',
  });
  assert.equal(result.ok, true);

  const rows = db.prepare(
    `SELECT COUNT(*) AS c FROM tenant_subscriptions WHERE website_id = ? AND billing_cycle = 'one_time'`
  ).bind('paid_site').get() as { c: number };
  assert.equal(rows.c, 0, 'no one_time subscription row was created');

  const entitlement = await checkTenantSubscriptionEntitlement(env, 'paid_site', 'owner_b');
  assert.equal(entitlement.planCode, 'business-website');
  assert.equal(entitlement.canPublish, true);
  assert.equal(entitlement.isFreeStart, false);
});

await it('Duplicate one-time provisioning for the same website is idempotent', async () => {
  const result = await provisionLifetimeEntitlement(env, {
    websiteId: 'paid_site',
    ownerId: 'owner_b',
    planCode: 'business-website',
    entitlementType: 'one_time_purchase',
    source: 'test_one_time_purchase_retry',
  });
  assert.equal(result.ok, true);

  const count = db.prepare(
    `SELECT COUNT(*) AS c FROM tenant_lifetime_entitlements
     WHERE website_id = ? AND entitlement_type = 'one_time_purchase' AND status = 'active'`
  ).bind('paid_site').get() as { c: number };
  assert.equal(count.c, 1);
});

// --- Paid recurring expiry --------------------------------------------------
await it('Expired paid monthly subscription does not grant publishing entitlement', async () => {
  db.prepare(
    `INSERT INTO customer_website_publications
     (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', 'unpublished', '', datetime('now'), datetime('now'))`
  ).bind('expired_site', 'owner_c', 'expired-site', 'Expired Site').run();

  db.prepare(
    `INSERT INTO tenant_subscriptions
     (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
      total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
      current_period_start, current_period_end, created_at, updated_at)
     VALUES (?, ?, ?, 'monthly', 'active', 499, 90, 589, 0, 'cashfree', 'expired_monthly',
             datetime('now','-60 days'), datetime('now','-30 days'), datetime('now'), datetime('now'))`
  ).bind('expired_site', 'owner_c', 'starter').run();

  const entitlement = await checkTenantSubscriptionEntitlement(env, 'expired_site', 'owner_c');
  assert.equal(entitlement.hasActiveSubscription, false);
  assert.equal(entitlement.canPublish, false);
});

await it('A paid but expired recurring payment row does not restore publishing entitlement', async () => {
  // Historical paid rows must not outlive the subscription period. Without the
  // one-time-only fallback guard this row would re-grant access forever.
  db.prepare(
    `INSERT INTO platform_payments
      (owner_id, website_id, purpose, plan_code, plan_name, billing_cycle,
       base_amount_inr, gst_amount_inr, amount_inr, razorpay_order_id,
       signature_verified, status)
     VALUES (?, ?, 'platform_subscription', ?, ?, 'monthly', 499, 90, 589, ?, 1, 'paid')`
  )
    .bind('owner_c', 'expired_site', 'starter', 'Starter', 'cf_expired_paid_row')
    .run();

  const entitlement = await checkTenantSubscriptionEntitlement(env, 'expired_site', 'owner_c');
  assert.equal(entitlement.hasActiveSubscription, false);
  assert.equal(entitlement.canPublish, false);
});

await it('Active paid yearly subscription grants entitlement until real period end', async () => {
  db.prepare(
    `INSERT INTO customer_website_publications
     (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', 'unpublished', '', datetime('now'), datetime('now'))`
  ).bind('active_site', 'owner_c', 'active-site', 'Active Site').run();

  db.prepare(
    `INSERT INTO tenant_subscriptions
     (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
      total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
      current_period_start, current_period_end, created_at, updated_at)
     VALUES (?, ?, ?, 'yearly', 'active', 7999, 1440, 9439, 0, 'cashfree', 'active_yearly',
             datetime('now'), datetime('now','+300 days'), datetime('now'), datetime('now'))`
  ).bind('active_site', 'owner_c', 'business-website').run();

  const entitlement = await checkTenantSubscriptionEntitlement(env, 'active_site', 'owner_c');
  assert.equal(entitlement.hasActiveSubscription, true);
  assert.equal(entitlement.canPublish, true);
  assert.equal(entitlement.planCode, 'business-website');
});

await it('Self-service trial subscription does not grant live publishing entitlement', async () => {
  db.prepare(
    `INSERT INTO customer_website_publications
     (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', 'unpublished', '', datetime('now'), datetime('now'))`
  ).bind('trial_site', 'owner_trial', 'trial-site', 'Trial Site').run();

  db.prepare(
    `INSERT INTO tenant_subscriptions
     (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
      total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
      current_period_start, current_period_end, created_at, updated_at)
     VALUES (?, ?, ?, 'monthly', 'trial', 499, 90, 589, 0, 'cashfree', 'trial_monthly',
             datetime('now'), datetime('now','+30 days'), datetime('now'), datetime('now'))`
  ).bind('trial_site', 'owner_trial', 'starter').run();

  const entitlement = await checkTenantSubscriptionEntitlement(env, 'trial_site', 'owner_trial');
  assert.equal(entitlement.hasActiveSubscription, false);
  assert.equal(entitlement.canPublish, false);
});

// --- Legacy backfill --------------------------------------------------------
await it('Legacy free-start subscriptions are backfilled as lifetime entitlements', async () => {
  db.prepare(
    `INSERT INTO customer_website_publications
     (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, '{}', 'published', '', datetime('now'), datetime('now'))`
  ).bind('legacy_site', 'owner_legacy', 'legacy-site', 'Legacy Site').run();

  // Simulate a legacy Free Start subscription row. The backfill condition
  // matches plan_code = 'free-start' regardless of period end.
  db.prepare(
    `INSERT INTO tenant_subscriptions
     (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
      total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
      current_period_start, current_period_end, created_at, updated_at)
     VALUES (?, ?, 'free-start', 'monthly', 'active', 0, 0, 0, 0, 'free_plan', 'legacy',
             datetime('now'), datetime('now','+36500 days'), datetime('now'), datetime('now'))`
  ).bind('legacy_site', 'owner_legacy').run();

  // Re-apply only the backfill portion of migration 0016 to simulate an
  // already-applied schema receiving a legacy row afterwards.
  const sql = fs.readFileSync(path.join(migrationsDir, '0016_lifetime_entitlements.sql'), 'utf8');
  const backfillSql = sql.slice(sql.indexOf('-- Backfill legacy rows'));
  db.exec(backfillSql);

  const row = db.prepare(
    `SELECT entitlement_type, status FROM tenant_lifetime_entitlements
     WHERE website_id = ? AND owner_id = ? LIMIT 1`
  ).bind('legacy_site', 'owner_legacy').get() as { entitlement_type: string; status: string } | undefined;
  assert.ok(row, 'legacy row was backfilled');
  assert.equal(row.entitlement_type, 'free_start');
});

console.log(`\n>>> LIFETIME ENTITLEMENT TEST: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
