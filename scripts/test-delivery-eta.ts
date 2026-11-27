// ============================================================================
// LOCAL DELIVERY ETA REGRESSIONS
// Pure read-only estimator only. No D1 writes, Maps calls, secrets or network.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateDeliveryEta, estimateEtaForOrder } from '../functions/api/delivery/_etaEstimate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

const now = new Date('2026-01-01T12:00:00Z');

await test('small nearby order uses the 20-30 minute range', () => {
  const eta = estimateDeliveryEta({
    status: 'placed',
    createdAt: now.toISOString(),
    items: [{ name: 'Notebook', category: 'stationery', quantity: 1 }],
    availableRiders: 2,
    mapsConfigured: false,
    now,
  });
  assert.equal(eta.minMinutes, 20);
  assert.equal(eta.maxMinutes, 30);
  assert.equal(eta.nonGuaranteed, true);
  assert.equal(eta.noLiveTraffic, true);
});

await test('large quantity expands to the heavy/bulk range', () => {
  const eta = estimateDeliveryEta({
    status: 'placed',
    createdAt: now.toISOString(),
    items: [{ name: 'Rice bag', category: 'groceries', quantity: 25 }],
    availableRiders: 2,
    mapsConfigured: false,
    now,
  });
  assert.equal(eta.minMinutes, 60);
  assert.equal(eta.maxMinutes, 120);
  assert.match(eta.basis.join(' '), /bulk order/i);
});

await test('prepared food is never treated as a small nearby order', () => {
  const eta = estimateDeliveryEta({
    status: 'placed',
    createdAt: now.toISOString(),
    items: [{ name: 'Chicken curry', category: 'food', quantity: 2 }],
    availableRiders: 2,
    mapsConfigured: false,
    now,
  });
  assert.equal(eta.minMinutes, 30);
  assert.equal(eta.maxMinutes, 45);
});

await test('no available rider adds a visible buffer to the basis', () => {
  const eta = estimateDeliveryEta({
    status: 'confirmed',
    createdAt: now.toISOString(),
    items: [{ name: 'Shirt', category: 'clothing', quantity: 2 }],
    availableRiders: 0,
    mapsConfigured: false,
    now,
  });
  assert.equal(eta.minMinutes, 35);
  assert.equal(eta.maxMinutes, 60);
  assert.match(eta.basis.join(' '), /no available rider buffer added/i);
});

await test('distance allowance is added without claiming live traffic routing', () => {
  const eta = estimateDeliveryEta({
    status: 'confirmed',
    createdAt: now.toISOString(),
    items: [{ name: 'Milk', category: 'groceries', quantity: 2 }],
    availableRiders: 1,
    distanceKm: 8,
    mapsConfigured: true,
    now,
  });
  assert.equal(eta.minMinutes, 30);
  assert.equal(eta.maxMinutes, 40);
  assert.match(eta.basis.join(' '), /no live traffic routing/i);
  assert.equal(eta.mapsConfigured, true);
});

await test('later stages narrow the remaining estimate', () => {
  const placed = estimateDeliveryEta({
    status: 'preparing', createdAt: now.toISOString(), items: [{ quantity: 2 }], availableRiders: 1, now,
  });
  const transit = estimateDeliveryEta({
    status: 'out_for_delivery', createdAt: now.toISOString(), items: [{ quantity: 2 }], availableRiders: 1, now,
  });
  assert.ok(transit.maxMinutes < placed.maxMinutes);
});

await test('an overdue order is marked delayed and widened', () => {
  const eta = estimateDeliveryEta({
    status: 'confirmed',
    createdAt: '2026-01-01T10:00:00Z',
    items: [{ quantity: 2 }],
    availableRiders: 1,
    now,
  });
  assert.equal(eta.delayed, true);
  assert.match(eta.basis.join(' '), /running later than the initial estimate/i);
});

await test('delivered orders report a zero remaining range', () => {
  const eta = estimateDeliveryEta({
    status: 'delivered',
    createdAt: '2026-01-01T08:00:00Z',
    items: [{ quantity: 30 }],
    availableRiders: 0,
    now,
  });
  assert.equal(eta.minMinutes, 0);
  assert.equal(eta.maxMinutes, 0);
  assert.equal(eta.delayed, false);
});

await test('estimator emits no guaranteed-delivery language', () => {
  const eta = estimateDeliveryEta({
    status: 'confirmed',
    createdAt: now.toISOString(),
    items: [{ name: 'Chicken', category: 'meat', quantity: 25 }],
    availableRiders: 0,
    distanceKm: 12,
    mapsConfigured: true,
    now,
  });
  const serialized = JSON.stringify(eta).toLowerCase();
  assert.doesNotMatch(serialized, /guaranteed delivery|on time guaranteed|promised/i);
});

await test('read-only order estimator degrades safely without a database', async () => {
  const eta = await estimateEtaForOrder(
    { DB: null } as any,
    {
      website_id: 'demo-site',
      order_status: 'packed',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      items_json: JSON.stringify([{ name: 'Groceries', category: 'grocery', quantity: 4 }]),
    }
  );
  assert.equal(eta.estimated, true);
  assert.ok(eta.maxMinutes >= eta.minMinutes);
  assert.equal(eta.noLiveTraffic, true);
});

await test('tracking endpoints are wired to the read-only estimator', () => {
  const trackSource = fs.readFileSync(path.join(root, 'functions/api/orders/track/[orderNumber].ts'), 'utf8');
  const locationSource = fs.readFileSync(path.join(root, 'functions/api/orders/[orderNumber]/live-location.ts'), 'utf8');
  const trackerSource = fs.readFileSync(path.join(root, 'src/components/OrderTrackerModal.tsx'), 'utf8');
  assert.match(trackSource, /eta:\s*await estimateEtaForOrder\(env, order\)/);
  assert.match(locationSource, /eta:\s*await estimateEtaForOrder\(env, order\)/);
  assert.match(trackerSource, /not guaranteed/);
  assert.match(trackerSource, /No live-traffic routing is claimed/);
});

console.log(`\n${passed}/${passed} delivery ETA checks passed.`);
