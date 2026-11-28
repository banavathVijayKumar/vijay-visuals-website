// ============================================================================
// LOCAL SERVICE CATALOG + RETURN LIFECYCLE REGRESSION SUITE
// Source/invariant checks only. No network, database, provider, refund, payout,
// email, Production access or secret is used.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { mapServiceRowToUi } from '../functions/api/_tenantAccess.ts';
import { customerCancelAllowed } from '../functions/api/customer/orders/[id].ts';

const rootDir = process.cwd();
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

await test('additive migrations define the service catalog and return ledger', () => {
  const services = read('cloudflare/d1/migrations/0027_tenant_service_catalog.sql');
  assert.match(services, /CREATE TABLE IF NOT EXISTS tenant_services/);
  assert.match(services, /REFERENCES customer_website_publications\(website_id\) ON DELETE CASCADE/);
  assert.match(services, /price_inr INTEGER NOT NULL DEFAULT 0 CHECK \(price_inr >= 0\)/);
  assert.match(services, /is_active INTEGER NOT NULL DEFAULT 1 CHECK \(is_active IN \(0, 1\)\)/);

  const returns = read('cloudflare/d1/migrations/0028_order_return_requests.sql');
  assert.match(returns, /CREATE TABLE IF NOT EXISTS order_return_requests/);
  assert.match(returns, /REFERENCES store_orders\(id\) ON DELETE CASCADE/);
  assert.match(returns, /CHECK \(status IN \('requested', 'approved', 'rejected', 'completed'\)\)/);
  assert.match(returns, /UNIQUE \(order_id\)/);
  assert.doesNotMatch(returns, /ALTER TABLE store_orders/i);

  const migrationTest = read('scripts/test-local-d1-migrations.ts');
  assert.match(migrationTest, /'tenant_services'/);
  assert.match(migrationTest, /'order_return_requests'/);
});

await test('service endpoint maps rows safely and rejects unsafe image URLs', () => {
  const mapped = mapServiceRowToUi(
    {
      id: 7,
      name: '<b>Portrait</b> Session',
      description: 'Studio portrait sitting',
      category: 'Photography',
      price_inr: '2500',
      compare_at_price_inr: null,
      duration_minutes: '60',
      sort_order: '2',
      image_url: 'javascript:alert(1)',
      is_active: 1,
    },
    3
  ) as Record<string, unknown>;
  assert.equal(mapped.id, 7);
  assert.equal(mapped.tenantId, 3);
  assert.equal(mapped.price, 2500);
  assert.equal(mapped.imageUrl, '');
  assert.equal(mapped.active, true);
});

await test('service CRUD is tenant-scoped and reports missing migrations honestly', () => {
  const create = read('functions/api/tenants/[slug]/services.ts');
  const update = read('functions/api/services/[id].ts');
  for (const source of [create, update]) {
    assert.match(source, /requireTenantOwnerAccess/);
    assert.match(source, /isMissingTableError/);
    assert.match(source, /MIGRATION_REQUIRED/);
    assert.match(source, /writeAuditLog/);
  }
  assert.match(create, /access\.row\.website_id/);
  assert.match(update, /WHERE id = \? AND website_id = \?/);
  assert.match(update, /searchParams\.get\('soft'\) === 'true'/);
});

await test('storefront and owner dashboard expose the dedicated service catalog', () => {
  const publicEndpoint = read('functions/api/tenants/[slug].ts');
  assert.match(publicEndpoint, /mapServiceRowToUi/);
  assert.match(publicEndpoint, /services,[\s\S]{0,120}coupons,/);

  const storefront = read('src/components/StorefrontView.tsx');
  assert.match(storefront, /id="store-services"/);
  assert.match(storefront, /Services &amp; Pricing|Services & Pricing/);
  assert.match(storefront, /setServices\(/);

  const dashboard = read('src/components/DashboardsHub.tsx');
  assert.match(dashboard, /ServiceCatalogManager/);
  assert.match(dashboard, /id: 'services', label: 'Services & Pricing'/);
});

await test('customer return request is conditional, deduplicated and audited', () => {
  const source = read('functions/api/customer/orders/[id].ts');
  assert.match(source, /WHERE id = \? AND order_status = 'delivered'/);
  assert.match(source, /RETURN_ALREADY_REQUESTED/);
  assert.match(source, /RETURN_ALREADY_DECIDED/);
  assert.match(source, /CUSTOMER_RETURN_REQUESTED/);
  assert.match(source, /refundStatus: 'not_processed'/);
  assert.equal(customerCancelAllowed({ order_status: 'paid', payment_status: 'paid' }), false);
  assert.equal(customerCancelAllowed({ order_status: 'confirmed', payment_status: 'pending' }), true);
});

await test('owner return decision never marks payment refunded or moves money', () => {
  const source = read('functions/api/owner/orders/[id]/return.ts');
  assert.match(source, /order_status = 'return_requested'/);
  assert.match(source, /nextOrderStatus = decision === 'approve' \? 'returned' : 'delivered'/);
  assert.match(source, /return_release:/);
  assert.match(source, /refundStatus: 'not_processed'/);
  assert.doesNotMatch(source, /payment_status = \?/);
  assert.doesNotMatch(source, /createCashfreeRefund|createEdgeCashfreeRefund/);
});

await test('UI decommissions fake refunds and adds real return decisions', () => {
  const modal = read('src/components/OwnerOrderDetailModal.tsx');
  assert.match(modal, /Approve Return/);
  assert.match(modal, /Reject Return/);
  assert.match(modal, /Refunds require a verified Cashfree refund flow/);
  assert.doesNotMatch(modal, /action: 'refund'/);
  assert.doesNotMatch(modal, /Payment marked refunded/);

  const dashboard = read('src/components/DashboardsHub.tsx');
  assert.match(dashboard, /Return request submitted for owner review\. No refund has been processed yet\./);
});

await test('Express mirror keeps the same cancel and return guards', () => {
  const source = read('server.ts');
  assert.match(source, /eq\(orders\.status, 'confirmed'\)/);
  assert.match(source, /eq\(orders\.status, 'delivered'\)/);
  assert.match(source, /refund: 'not_processed'/);
});

console.log(`\n${passed} passed, 0 failed`);
