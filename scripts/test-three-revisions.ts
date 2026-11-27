// ============================================================================
// REVISION REGRESSIONS — legacy tracking PII, lifecycle notification wiring,
// and role-scoped dashboard tabs. Local mocks only; no network or DB writes.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';

import { onRequestGet as commerceGet } from '../functions/api/platform/commerce.ts';
import { dispatchLifecycleNotification } from '../functions/api/_lifecycleNotifications.ts';
import {
  canViewDashboardTab,
  getAllowedDashboardTabs,
  type DashboardRoleTab,
} from '../src/lib/dashboardAccess.ts';

const read = (p: string) => fs.readFileSync(p, 'utf8');
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

type Row = Record<string, any>;

class MockStatement {
  private params: any[] = [];
  constructor(private sql: string, private db: MockD1) {}
  bind(...params: any[]) {
    this.params = params;
    return this;
  }
  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: [] as T[] };
  }
  async first<T = Row>(): Promise<T | null> {
    const n = this.sql.replace(/\s+/g, ' ').toLowerCase();
    if (n.includes('from store_orders')) {
      const match = this.db.orders.find(
        (o) => String(o.order_number).toUpperCase() === String(this.params[0] || '').toUpperCase()
      );
      return (match as T) ?? null;
    }
    if (n.includes('from shipments')) return null;
    return null;
  }
  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const n = this.sql.replace(/\s+/g, ' ').toLowerCase();
    if (n.includes('insert into notification_logs')) {
      this.db.logs.push({
        website_id: this.params[0],
        recipient_user_id: this.params[1],
        recipient_contact: this.params[2],
        channel: 'in_app',
        event_type: this.params[3],
        subject: this.params[4],
        message_preview: this.params[5],
        consent_verified: 1,
        delivery_status: 'delivered',
        error_detail: this.params[6],
      });
    }
    return { meta: { changes: 1, last_row_id: this.db.logs.length } };
  }
}

class MockD1 {
  orders: Row[] = [
    {
      id: 10,
      order_number: 'VV-REV-001',
      website_id: 'site-1',
      customer_name: 'Ananya Rao',
      customer_phone: '9876543210',
      subtotal_inr: 1990,
      discount_inr: 0,
      gst_inr: 0,
      shipping_inr: 50,
      total_inr: 2040,
      payment_method: 'cod',
      payment_status: 'pending',
      order_status: 'placed',
      created_at: '2026-11-27 10:00:00',
      updated_at: '2026-11-27 10:00:00',
    },
  ];
  logs: Row[] = [];
  prepare(sql: string) {
    return new MockStatement(sql, this);
  }
}

const db = new MockD1();
const env: Record<string, any> = { DB: db };

let externalCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalCalls += 1;
  throw new Error('External provider call is not allowed in this revision test.');
};

const ctx = (url: string) =>
  ({ request: new Request(url), env, params: {}, next: async () => new Response() }) as any;

console.log('\n====================================================================');
console.log('REVISION REGRESSIONS — PII / NOTIFICATIONS / ROLE TABS');
console.log('====================================================================\n');

await test('legacy track_order no longer exposes raw customer name', async () => {
  const res = await commerceGet(
    ctx(
      'https://preview.local/api/platform/commerce?scope=track_order&orderNumber=VV-REV-001&phoneLast4=3210'
    )
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.customerName, undefined);
  assert.equal(body.order.customerNameMasked, 'A***** R**');
  assert.equal(JSON.stringify(body).includes('Ananya Rao'), false);
});

await test('legacy track_order still rejects mismatched phone digits', async () => {
  const res = await commerceGet(
    ctx(
      'https://preview.local/api/platform/commerce?scope=track_order&orderNumber=VV-REV-001&phoneLast4=9999'
    )
  );
  assert.equal(res.status, 403);
});

await test('lifecycle dispatch records durable in-app alert with no provider readiness', async () => {
  db.logs.length = 0;
  const result = await dispatchLifecycleNotification(env as any, {
    websiteId: 'site-1',
    eventType: 'new_order_owner_alert',
    subject: 'New order #VV-REV-001',
    message: 'New order received. Review in the owner dashboard.',
    recipientUserId: 'owner-1',
  });
  assert.equal(result.recorded, true);
  assert.equal(result.status, 'in_app');
  assert.deepEqual(result.externalChannelsReady, []);
  assert.equal(db.logs.length, 1);
  assert.equal(db.logs[0].event_type, 'new_order_owner_alert');
  assert.equal(db.logs[0].channel, 'in_app');
  assert.equal(db.logs[0].consent_verified, 1);
  assert.equal(db.logs[0].delivery_status, 'delivered');
  assert.match(String(db.logs[0].error_detail), /email=setup_required_email/);
  assert.match(String(db.logs[0].error_detail), /whatsapp=setup_required_whatsapp/);
  assert.equal(externalCalls, 0);
});

await test('lifecycle dispatch rejects unknown events and never contacts providers', async () => {
  const bad = await dispatchLifecycleNotification(env as any, {
    websiteId: 'site-1',
    eventType: 'promotional_blast',
    subject: 'ignored',
    message: 'ignored',
  });
  assert.deepEqual(bad, { recorded: false, reason: 'invalid' });
  assert.equal(db.logs.length, 1);
  assert.equal(externalCalls, 0);
});

await test('configured providers are reported but still not contacted', async () => {
  db.logs.length = 0;
  const configuredEnv: Record<string, any> = {
    ...env,
    RESEND_API_KEY: 'mock-key',
    WHATSAPP_CLOUD_API_TOKEN: 'mock-token',
    WHATSAPP_PHONE_NUMBER_ID: 'mock-id',
  };
  const result = await dispatchLifecycleNotification(configuredEnv as any, {
    websiteId: 'site-1',
    eventType: 'order_delivered',
    subject: 'Delivered',
    message: 'Order delivered.',
    recipientContact: 'customer@example.invalid',
  });
  assert.equal(result.recorded, true);
  assert.deepEqual(result.externalChannelsReady, ['email', 'whatsapp']);
  assert.match(String(db.logs[0].error_detail), /contact_not_authorized/);
  assert.equal(externalCalls, 0);
});

await test('dashboard tabs are derived from role and ownership', () => {
  const asSet = (tabs: DashboardRoleTab[]) => new Set(tabs);
  assert.deepEqual(getAllowedDashboardTabs('customer', 0), ['customer']);

  const owner = asSet(getAllowedDashboardTabs('business_owner', 1));
  assert.equal(owner.has('owner'), true);
  assert.equal(owner.has('delivery'), false);
  assert.equal(owner.has('super_admin'), false);

  const rider = asSet(getAllowedDashboardTabs('delivery_partner', 0));
  assert.equal(rider.has('delivery'), true);
  assert.equal(rider.has('owner'), false);
  assert.equal(rider.has('super_admin'), false);

  const admin = asSet(getAllowedDashboardTabs('super_admin', 0));
  for (const tab of ['owner', 'delivery', 'customer', 'super_admin'] as DashboardRoleTab[]) {
    assert.equal(admin.has(tab), true);
  }

  const customerWithSite = asSet(getAllowedDashboardTabs('customer', 1));
  assert.equal(customerWithSite.has('owner'), true);
  assert.equal(customerWithSite.has('delivery'), false);

  assert.equal(canViewDashboardTab(['customer'], 'owner'), false);
  assert.equal(canViewDashboardTab(['customer', 'owner'], 'owner'), true);
});

await test('source guards prevent hidden-tab and notification-wiring regressions', () => {
  const hub = read('src/components/DashboardsHub.tsx');
  assert.match(hub, /getAllowedDashboardTabs\(profile\?\.role, ownedTenants\.length\)/);
  for (const tab of ['owner', 'delivery', 'customer', 'super_admin']) {
    assert.match(hub, new RegExp(`canViewTab\\('${tab}'\\)`));
  }
  assert.doesNotMatch(hub, /\{profile\.role === 'super_admin' && \(/);
  assert.match(hub, /\{roleTab === 'owner' && canViewTab\('owner'\) && \(/);
  assert.match(hub, /\{roleTab === 'delivery' && canViewTab\('delivery'\) && \(/);

  const commerce = read('functions/api/platform/commerce.ts');
  assert.match(commerce, /customerNameMasked: maskCustomerName/);
  assert.doesNotMatch(commerce, /customerName: order\.customer_name/);

  const lifecycle = read('functions/api/_lifecycleNotifications.ts');
  assert.match(lifecycle, /channel, event_type[\s\S]*'in_app'/);
  assert.doesNotMatch(lifecycle, /sendTransactionalEmail|sendWhatsAppNotification/);

  for (const file of [
    'functions/api/orders.ts',
    'functions/api/owner/orders/[id].ts',
    'functions/api/delivery/orders/[id]/status.ts',
    'functions/api/delivery/orders/[id]/pod.ts',
  ]) {
    assert.match(read(file), /dispatchLifecycleNotification/);
  }
});

globalThis.fetch = originalFetch;
console.log(`\nPASS — ${passed} revision checks.\n`);
