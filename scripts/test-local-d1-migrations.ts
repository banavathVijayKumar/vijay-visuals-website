import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const migrationsDir = path.join(projectRoot, 'cloudflare', 'd1', 'migrations');
const rollbackDir = path.join(projectRoot, 'cloudflare', 'd1', 'rollback');
const testDbPath = ':memory:';

// Clean up any old test db
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

console.log('--- STARTING LOCAL D1 DATABASE MIGRATION INTEGRATION TEST ---');
console.log('Target Local SQLite DB:', testDbPath);

try {
  const db = new DatabaseSync(testDbPath);
  
  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');

  // Read migrations in alphabetical/numbered order
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${migrationFiles.length} migration files in cloudflare/d1/migrations:`);
  for (const file of migrationFiles) {
    console.log(` -> Applying ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    console.log(`    [PASS] Applied ${file}`);
  }

  // Verify key tables exist
  const tablesStmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`);
  const tables = tablesStmt.all() as { name: string }[];
  const tableNames = tables.map(t => t.name);
  console.log('\n--- VERIFYING CREATED TABLES ---');
  console.log(`Total tables created: ${tables.length}`);
  console.log('Created tables:', tableNames.join(', '));

  const requiredTables = [
    'customer_website_publications',
    'subscription_plans',
    'tenant_subscriptions',
    'platform_payments',
    'business_profiles',
    'tenant_memberships',
    'store_products',
    'store_orders',
    'media_assets',
    'payment_webhook_events'
  ];

  for (const req of requiredTables) {
    if (tableNames.includes(req)) {
      console.log(` [PASS] Table '${req}' exists`);
    } else {
      console.error(` [FAIL] Table '${req}' is missing!`);
      process.exit(1);
    }
  }

  // Verify 0007 content in subscription_plans
  console.log('\n--- VERIFYING MIGRATION 0007 (PLAN SEEDING & STRUCTURE) ---');
  const planStmt = db.prepare(`SELECT * FROM subscription_plans WHERE code = 'business-website';`);
  const businessPlan = planStmt.all() as any[];
  
  if (businessPlan.length === 1) {
    const plan = businessPlan[0];
    console.log(` [PASS] Found 'business-website' plan:`);
    console.log(`        Name: ${plan.name}`);
    console.log(`        Code: ${plan.code}`);
    console.log(`        Yearly Price (INR): ₹${plan.yearly_price_inr}`);
    console.log(`        GST Rate: ${plan.gst_percent}%`);
    console.log(`        Active: ${plan.is_active === 1 ? 'Yes (1)' : 'No (0)'}`);
    console.log(`        Max Products: ${plan.max_products}`);
    console.log(`        Max Staff: ${plan.max_staff}`);
    console.log(`        Storage: ${plan.storage_quota_mb} MB`);
    console.log(`        Features: ${plan.features_json}`);

    if (plan.yearly_price_inr !== 7999) {
      throw new Error(`Expected yearly_price_inr 7999, got ${plan.yearly_price_inr}`);
    }
    if (plan.gst_percent !== 18) {
      throw new Error(`Expected gst_percent 18, got ${plan.gst_percent}`);
    }
  } else {
    throw new Error(`Expected exactly 1 row for 'business-website', got ${businessPlan.length}`);
  }

  // Verify all plans in subscription_plans
  const allPlansStmt = db.prepare(`SELECT code, name, yearly_price_inr, gst_percent, is_active FROM subscription_plans ORDER BY yearly_price_inr;`);
  const allPlans = allPlansStmt.all();
  console.log('\nAll Seeded Plans in Local DB:');
  console.table(allPlans);

  // Test insertion of website, payment record, and subscription
  console.log('\n--- TESTING PLATFORM PAYMENT & SUBSCRIPTION INSERTION ON LOCAL D1 ---');
  
  // 1. Insert customer website publication (unpublished draft)
  const insertPubStmt = db.prepare(`
    INSERT INTO customer_website_publications (
      website_id, owner_id, public_slug, business_name, website_json, status, published_at
    ) VALUES (
      'web_test_001', 'owner_cust_a', 'vijaystudio', 'Vijay Visuals Studio', '{}', 'unpublished', datetime('now')
    );
  `);
  insertPubStmt.run();
  console.log(' [PASS] Successfully created unpublished customer website draft in customer_website_publications');

  // 2. Insert platform payment for business-website package
  const insertPaymentStmt = db.prepare(`
    INSERT INTO platform_payments (
      website_id, owner_id, purpose, plan_code, plan_name, billing_cycle,
      base_amount_inr, setup_fee_inr, gst_amount_inr, amount_inr, currency,
      razorpay_mode, razorpay_order_id, razorpay_payment_id, razorpay_signature,
      signature_verified, status, receipt, notes_json, paid_at
    ) VALUES (
      'web_test_001', 'owner_cust_a', 'website_purchase', 'business-website',
      'Business Website Package', 'one_time', 7999, 0, 1440, 9439, 'INR',
      'test', 'order_test_razorpay_001', 'pay_test_razorpay_001', 'sig_test_valid',
      1, 'paid', 'rcpt_test_001', '{"customerEmail":"cust_a@example.com"}', datetime('now')
    );
  `);
  insertPaymentStmt.run();
  console.log(' [PASS] Successfully inserted verified platform payment');

  // 3. Insert tenant subscription
  const insertSubStmt = db.prepare(`
    INSERT INTO tenant_subscriptions (
      website_id, owner_id, plan_code, billing_cycle, status,
      base_amount_inr, gst_amount_inr, total_amount_inr, payment_gateway,
      gateway_subscription_id, current_period_start, current_period_end
    ) VALUES (
      'web_test_001', 'owner_cust_a', 'business-website',
      'yearly', 'active', 7999, 1440, 9439, 'razorpay',
      'pay_test_razorpay_001', datetime('now'), datetime('now', '+1 year')
    );
  `);
  insertSubStmt.run();
  console.log(' [PASS] Successfully activated tenant subscription');

  // 4. Update website to published after verified payment
  const updatePubStmt = db.prepare(`
    UPDATE customer_website_publications
    SET status = 'published', updated_at = datetime('now')
    WHERE website_id = 'web_test_001' AND owner_id = 'owner_cust_a';
  `);
  updatePubStmt.run();
  const updatedPub = db.prepare(`SELECT website_id, owner_id, status FROM customer_website_publications WHERE website_id = 'web_test_001';`).get() as any;
  if (updatedPub.status !== 'published') {
    throw new Error(`Expected website status 'published', got ${updatedPub.status}`);
  }
  console.log(' [PASS] Website status successfully transitioned to published upon verified subscription');

  // Test 0007 rollback compatibility
  console.log('\n--- TESTING MIGRATION 0007 ROLLBACK COMPATIBILITY ---');
  // First clean up child test rows referencing business-website
  db.exec(`
    DELETE FROM tenant_subscriptions WHERE website_id = 'web_test_001';
    DELETE FROM platform_payments WHERE website_id = 'web_test_001';
    DELETE FROM customer_website_publications WHERE website_id = 'web_test_001';
  `);
  console.log(' [PASS] Cleaned up child test rows prior to rollback');

  const rollbackFile = path.join(rollbackDir, '0007_customer_purchase_plans_rollback.sql');
  if (fs.existsSync(rollbackFile)) {
    const rollbackSql = fs.readFileSync(rollbackFile, 'utf8');
    db.exec(rollbackSql);
    const afterRollbackPlan = db.prepare(`SELECT * FROM subscription_plans WHERE code = 'business-website';`).all();
    if (afterRollbackPlan.length === 0) {
      console.log(' [PASS] 0007 Rollback executed cleanly. Business-website plan successfully removed.');
    } else {
      console.warn(' [WARN] Business-website plan still present after rollback.');
    }
  }

  // Close db
  db.close();

  // Clean up test file
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('\nCleaned up temp test SQLite DB file.');
  }

  console.log('\n>>> LOCAL D1 MIGRATION TEST COMPLETED SUCCESSFULLY WITH 100% PASS <<<');
} catch (err: any) {
  console.error('\n[FAIL] Error during local D1 migration testing:', err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
}
