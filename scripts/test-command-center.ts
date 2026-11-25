// ============================================================================
// VIJAY VISUALS — COMMAND CENTER API VERIFICATION TEST SUITE
// Tests the Business Command Center endpoint:
// 1. Endpoint contract: GET /api/owner/tenants/:tenantId/command-center
// 2. Returns strictly valid JSON (never SPA HTML index.html fallback)
// 3. Response shape matches BusinessCommandCenter.tsx requirements:
//    - range (string)
//    - generatedAt (string)
//    - metrics (CommandCenterMetrics with 20 KPI fields)
//    - lowStockProducts (array of low stock items)
//    - topProducts (array of top-selling items)
//    - upcomingAppointments (array of active bookings)
//    - alerts (array of actionable notifications)
// 4. Authenticated owner access succeeds (HTTP 200 OK)
// 5. Unauthenticated request rejected (HTTP 401 Unauthorized JSON)
// 6. Cross-tenant isolation enforced (HTTP 403 Forbidden JSON)
// 7. Non-existent tenant rejected (HTTP 404 Not Found JSON)
// 8. Range filters verified: today, 7d, 30d, all, custom
// ============================================================================

import {
  onRequestGet,
  onRequestOptions,
} from '../functions/api/owner/tenants/[tenantId]/command-center';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${details || 'Assertion failed'}`);
    failed++;
  }
}

console.log('\n====================================================================');
console.log('VIJAY VISUALS — BUSINESS COMMAND CENTER API VERIFICATION SUITE');
console.log('====================================================================\n');

// Mock D1 Database
class MockD1Statement {
  private sql: string;
  private params: any[];
  private db: MockD1Database;

  constructor(sql: string, db: MockD1Database) {
    this.sql = sql;
    this.params = [];
    this.db = db;
  }

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = Record<string, any>>(): Promise<T | null> {
    const res = await this.all<T>();
    return res.results?.[0] || null;
  }

  async all<T = Record<string, any>>(): Promise<{ results: T[] }> {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();

    // Query customer_website_publications
    if (normalized.includes('from customer_website_publications')) {
      const id = this.params[0];
      const found = this.db.publications.find(
        (p) => String(p.id) === String(id) || String(p.rowid) === String(id) || p.website_id === id || p.public_slug === id
      );
      return { results: (found ? [found] : []) as T[] };
    }

    // Query store_orders
    if (normalized.includes('from store_orders')) {
      const websiteId = this.params[0];
      const found = this.db.orders.filter((o) => o.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query store_products
    if (normalized.includes('from store_products')) {
      const websiteId = this.params[0];
      const found = this.db.products.filter((p) => p.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query finance_ledger
    if (normalized.includes('from finance_ledger')) {
      const websiteId = this.params[0];
      const found = this.db.finance.filter((f) => f.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query purchase_orders
    if (normalized.includes('from purchase_orders')) {
      const websiteId = this.params[0];
      const found = this.db.purchaseOrders.filter((po) => po.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query crm_contacts_leads
    if (normalized.includes('from crm_contacts_leads')) {
      const websiteId = this.params[0];
      const found = this.db.leads.filter((l) => l.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query appointments
    if (normalized.includes('from appointments')) {
      const websiteId = this.params[0];
      const found = this.db.appointments.filter((a) => a.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query staff_attendance_payroll
    if (normalized.includes('from staff_attendance_payroll')) {
      const websiteId = this.params[0];
      const found = this.db.attendance.filter((att) => att.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query platform_staff count
    if (normalized.includes('from platform_staff')) {
      const websiteId = this.params[0];
      const active = this.db.staff.filter((s) => s.website_id === websiteId && s.is_active === 1);
      return { results: [{ active_count: active.length }] as T[] };
    }

    // Query seller_payout_accounts
    if (normalized.includes('from seller_payout_accounts')) {
      const websiteId = this.params[0];
      const found = this.db.payoutAccounts.filter((pa) => pa.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query tenant_domains
    if (normalized.includes('from tenant_domains')) {
      const websiteId = this.params[0];
      const found = this.db.domains.filter((d) => d.website_id === websiteId);
      return { results: found as T[] };
    }

    return { results: [] };
  }
}

class MockD1Database {
  publications: any[] = [];
  orders: any[] = [];
  products: any[] = [];
  finance: any[] = [];
  purchaseOrders: any[] = [];
  leads: any[] = [];
  appointments: any[] = [];
  attendance: any[] = [];
  staff: any[] = [];
  payoutAccounts: any[] = [];
  domains: any[] = [];

  prepare(sql: string) {
    return new MockD1Statement(sql, this);
  }
}

// Fixtures
const mockDb = new MockD1Database();

const now = new Date();
// Date-only columns are compared against the route's UTC `todayIso`, while
// timestamp columns are compared against a local-midnight `startOfToday`.
// Seed both explicitly so the fixture is stable across timezone boundaries.
const todayIso = now.toISOString().slice(0, 10);
const yesterdayIso = new Date(now.getTime() - 86400 * 1000).toISOString().slice(0, 10);
const localTodayIso = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');

// Tenant 5: Sri Venkateswara Sweets (Owner: user_owner_5)
mockDb.publications.push({
  id: 5,
  rowid: 5,
  website_id: 'web_tenant_5',
  public_slug: 'svs-foods',
  business_name: 'Sri Venkateswara Foods',
  owner_id: 'user_owner_5',
  status: 'published',
  package_tier: 'business-website',
  website_json: JSON.stringify({ businessName: 'Sri Venkateswara Foods' }),
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

// Tenant 9: Other Owner (Owner: user_owner_9)
mockDb.publications.push({
  id: 9,
  rowid: 9,
  website_id: 'web_tenant_9',
  public_slug: 'other-boutique',
  business_name: 'Other Boutique',
  owner_id: 'user_owner_9',
  status: 'published',
  package_tier: 'starter-website',
  website_json: JSON.stringify({ businessName: 'Other Boutique' }),
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

// Seed data for Tenant 5
// Products (including 1 low stock)
mockDb.products.push(
  {
    id: 501,
    website_id: 'web_tenant_5',
    name: 'Kaju Katli Special',
    price_inr: 450,
    stock_qty: 3,
    low_stock_threshold: 5, // low stock!
    is_active: 1,
  },
  {
    id: 502,
    website_id: 'web_tenant_5',
    name: 'Motichoor Laddu Box',
    price_inr: 300,
    stock_qty: 25,
    low_stock_threshold: 10,
    is_active: 1,
  }
);

// Orders for Tenant 5
mockDb.orders.push(
  {
    id: 1001,
    order_number: 'ORD-5001',
    website_id: 'web_tenant_5',
    customer_name: 'Ramesh Kumar',
    customer_phone: '9876543210',
    customer_email: 'ramesh@example.com',
    items_json: JSON.stringify([
      { name: 'Kaju Katli Special', quantity: 2, price: 450 },
      { name: 'Motichoor Laddu Box', quantity: 1, price: 300 },
    ]),
    total_inr: 1200,
    payment_method: 'cod',
    payment_status: 'paid',
    order_status: 'delivered',
    created_at: `${localTodayIso}T10:00:00`, // today
  },
  {
    id: 1002,
    order_number: 'ORD-5002',
    website_id: 'web_tenant_5',
    customer_name: 'Suresh Rao',
    customer_phone: '9876543211',
    customer_email: 'suresh@example.com',
    items_json: JSON.stringify([{ name: 'Motichoor Laddu Box', quantity: 2, price: 300 }]),
    total_inr: 600,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'placed',
    created_at: `${localTodayIso}T11:00:00`, // today, pending
  },
  {
    id: 1003,
    order_number: 'ORD-5003',
    website_id: 'web_tenant_5',
    customer_name: 'Anil Verma',
    customer_phone: '9876543212',
    customer_email: 'anil@example.com',
    items_json: JSON.stringify([{ name: 'Kaju Katli Special', quantity: 1, price: 450 }]),
    total_inr: 450,
    payment_method: 'online',
    payment_status: 'pending',
    order_status: 'cancelled',
    created_at: `${yesterdayIso}T12:00:00`, // cancelled
  }
);

// Finance records
mockDb.finance.push({
  id: 1,
  website_id: 'web_tenant_5',
  entry_type: 'expense',
  amount_inr: 250,
  gst_inr: 45,
  entry_date: todayIso,
  created_at: `${localTodayIso}T09:00:00`,
});

// Purchase orders
mockDb.purchaseOrders.push({
  id: 1,
  website_id: 'web_tenant_5',
  total_cost_inr: 500,
  status: 'placed',
  payment_status: 'pending',
  created_at: `${localTodayIso}T08:00:00`,
});

// Leads
mockDb.leads.push({
  id: 1,
  website_id: 'web_tenant_5',
  customer_name: 'Kavitha Reddy',
  customer_phone: '9988776655',
  stage: 'contacted',
  next_followup_date: todayIso,
  created_at: `${localTodayIso}T07:00:00`,
});

// Appointments
mockDb.appointments.push({
  id: 1,
  website_id: 'web_tenant_5',
  customer_name: 'Priya Sharma',
  service_name: 'Catering Consultation',
  scheduled_start: `${todayIso}T15:00:00`,
  status: 'confirmed',
});

// Staff & Attendance
mockDb.staff.push({ id: 1, website_id: 'web_tenant_5', is_active: 1 });
mockDb.attendance.push({
  id: 1,
  website_id: 'web_tenant_5',
  staff_id: 1,
  attendance_date: todayIso,
  status: 'present',
});

// Payout account (verified)
mockDb.payoutAccounts.push({
  id: 1,
  website_id: 'web_tenant_5',
  kyc_status: 'verified',
  linked_account_id: 'acc_Verified123',
});

const mockEnv = {
  DB: mockDb as any,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'mock-anon-key-xyz',
};

// Mock fetch for Supabase Auth in unit tests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes('/auth/v1/user')) {
    const authHeader = (init?.headers as Record<string, string>)?.[
      'Authorization'
    ] || (init?.headers as Headers)?.get?.('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+mock\.([A-Za-z0-9+/=]+)\.sig/);
    if (match) {
      try {
        const payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
        return new Response(
          JSON.stringify({
            id: payload.sub,
            email: payload.email,
            user_metadata: { full_name: 'Test Business Owner' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch {}
    }
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.includes('/rest/v1/profiles')) {
    return new Response(
      JSON.stringify([
        {
          role: 'business_owner',
          is_super_admin: false,
          full_name: 'Test Business Owner',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return originalFetch(input, init);
};

function createRequest(url: string, method = 'GET', user?: { id: string; email: string; role?: string }) {
  const headers = new Headers();
  headers.set('Host', 'master.vijay-visuals-site.pages.dev');
  if (user) {
    const tokenPayload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        app_metadata: { role: user.role || 'authenticated' },
        user_metadata: { role: user.role || 'business_owner' },
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64');
    headers.set('Authorization', `Bearer mock.${tokenPayload}.sig`);
  }
  return new Request(url, { method, headers });
}

async function runTests() {
  console.log('--- TEST 1: OPTIONS /api/owner/tenants/:tenantId/command-center ---');
  {
    const res = await onRequestOptions();
    assert(res.status === 204, 'OPTIONS returns 204 No Content');
    assert(res.headers.get('Access-Control-Allow-Methods') !== null, 'CORS headers present');
  }

  console.log('\n--- TEST 2: GET Authenticated Owner Access (Tenant ID: 5) ---');
  {
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center?range=30d',
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '5' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 200, 'GET /command-center returns HTTP 200 OK');

    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), 'Content-Type is application/json (Zero HTML)');

    const data: any = await res.json();
    assert(typeof data.range === 'string', 'data.range is present');
    assert(data.range === 'Last 30 Days', 'data.range formatted as Last 30 Days');
    assert(typeof data.generatedAt === 'string', 'data.generatedAt is ISO timestamp');

    // Metrics validation
    const m = data.metrics;
    assert(m !== undefined && typeof m === 'object', 'data.metrics is present');
    assert(m.todaySalesInr === 1800, `todaySalesInr is ₹1,800 (1200 + 600, excl cancelled 450) - Got ${m.todaySalesInr}`);
    assert(m.periodSalesInr === 1800, `periodSalesInr is ₹1,800 - Got ${m.periodSalesInr}`);
    assert(m.totalOrders === 3, `totalOrders is 3 - Got ${m.totalOrders}`);
    assert(m.completedOrders === 1, `completedOrders is 1 (delivered) - Got ${m.completedOrders}`);
    assert(m.pendingOrders === 1, `pendingOrders is 1 (placed) - Got ${m.pendingOrders}`);
    assert(m.cancelledOrders === 1, `cancelledOrders is 1 - Got ${m.cancelledOrders}`);
    assert(m.pendingPaymentsInr === 600, `pendingPaymentsInr is ₹600 (non-cancelled pending payment) - Got ${m.pendingPaymentsInr}`);
    assert(m.recordedExpensesInr === 250, `recordedExpensesInr is ₹250 - Got ${m.recordedExpensesInr}`);
    assert(m.purchaseCostsInr === 500, `purchaseCostsInr is ₹500 - Got ${m.purchaseCostsInr}`);
    assert(m.supplierOutstandingInr === 500, `supplierOutstandingInr is ₹500 - Got ${m.supplierOutstandingInr}`);
    assert(m.estimatedProfitInr === 1050, `estimatedProfitInr is ₹1,050 (1800 - 250 - 500) - Got ${m.estimatedProfitInr}`);
    assert(m.hasCostOrExpenseData === true, 'hasCostOrExpenseData is true');
    assert(typeof m.profitDisclaimer === 'string' && m.profitDisclaimer.length > 20, 'profitDisclaimer is descriptive');
    assert(m.lowStockCount === 1, `lowStockCount is 1 - Got ${m.lowStockCount}`);
    assert(m.newCustomersCount === 3, `newCustomersCount is 3 - Got ${m.newCustomersCount}`);
    assert(m.newEnquiriesCount === 1, `newEnquiriesCount is 1 - Got ${m.newEnquiriesCount}`);
    assert(m.pendingDeliveriesCount === 1, `pendingDeliveriesCount is 1 - Got ${m.pendingDeliveriesCount}`);
    assert(m.upcomingAppointmentsCount === 1, `upcomingAppointmentsCount is 1 - Got ${m.upcomingAppointmentsCount}`);
    assert(m.staffAttendanceToday.present === 1, 'staffAttendanceToday.present is 1');
    assert(m.staffAttendanceToday.totalActiveStaff === 1, 'staffAttendanceToday.totalActiveStaff is 1');

    // Low stock products array
    assert(Array.isArray(data.lowStockProducts) && data.lowStockProducts.length === 1, 'lowStockProducts array returned');
    assert(data.lowStockProducts[0].name === 'Kaju Katli Special', 'Low stock product name matches');
    assert(data.lowStockProducts[0].stock === 3, 'Low stock product stock is 3');

    // Top products array
    assert(Array.isArray(data.topProducts) && data.topProducts.length >= 1, 'topProducts array returned');
    assert(data.topProducts[0].revenueInr > 0, 'Top product has revenue');

    // Upcoming appointments array
    assert(Array.isArray(data.upcomingAppointments) && data.upcomingAppointments.length === 1, 'upcomingAppointments array returned');
    assert(data.upcomingAppointments[0].customerName === 'Priya Sharma', 'Appointment customer matches');

    // Alerts array
    assert(Array.isArray(data.alerts) && data.alerts.length >= 1, 'alerts array returned');
    const lowStockAlert = data.alerts.find((a: any) => a.actionTab === 'inventory_po');
    assert(lowStockAlert !== undefined, 'Low stock alert present');
  }

  console.log('\n--- TEST 3: Unauthenticated Request Returns HTTP 401 JSON ---');
  {
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center',
      'GET'
      // No token
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '5' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 401, 'Unauthenticated request returns HTTP 401');
    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), '401 response is strictly application/json');
    const errBody: any = await res.json();
    assert(typeof errBody.error === 'string', 'Error message in JSON response');
  }

  console.log('\n--- TEST 4: Cross-Tenant Access Isolation (HTTP 403 Forbidden) ---');
  {
    // User 9 (Owner of Tenant 9) attempts to access Tenant 5
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center',
      'GET',
      { id: 'user_owner_9', email: 'owner@other-boutique.com' }
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '5' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 403, 'Cross-tenant access returns HTTP 403 Forbidden');
    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), '403 response is strictly application/json');
    const errBody: any = await res.json();
    assert(typeof errBody.error === 'string', 'Tenant access denied error in JSON');
  }

  console.log('\n--- TEST 5: Non-Existent Tenant Returns HTTP 404 JSON ---');
  {
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/99999/command-center',
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '99999' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 404, 'Non-existent tenant returns HTTP 404 Not Found');
    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), '404 response is strictly application/json');
    const errBody: any = await res.json();
    assert(errBody.error.includes('not found'), 'Not found message in JSON');
  }

  console.log('\n--- TEST 6: Date Range Filters (today, 7d, all, custom) ---');
  {
    // 6A: today range
    const reqToday = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center?range=today',
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const resToday = await onRequestGet({ request: reqToday, env: mockEnv, params: { tenantId: '5' } } as any);
    assert(resToday.status === 200, 'range=today returns 200');
    const dataToday: any = await resToday.json();
    assert(dataToday.range === 'Today', 'data.range is Today');

    // 6B: 7d range
    const req7d = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center?range=7d',
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const res7d = await onRequestGet({ request: req7d, env: mockEnv, params: { tenantId: '5' } } as any);
    assert(res7d.status === 200, 'range=7d returns 200');
    const data7d: any = await res7d.json();
    assert(data7d.range === 'Last 7 Days', 'data.range is Last 7 Days');

    // 6C: all range
    const reqAll = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center?range=all',
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const resAll = await onRequestGet({ request: reqAll, env: mockEnv, params: { tenantId: '5' } } as any);
    assert(resAll.status === 200, 'range=all returns 200');
    const dataAll: any = await resAll.json();
    assert(dataAll.range === 'All Time', 'data.range is All Time');

    // 6D: custom range
    const reqCustom = createRequest(
      `https://master.vijay-visuals-site.pages.dev/api/owner/tenants/5/command-center?range=custom&from=${yesterdayIso}&to=${todayIso}`,
      'GET',
      { id: 'user_owner_5', email: 'owner@svs-foods.com' }
    );
    const resCustom = await onRequestGet({ request: reqCustom, env: mockEnv, params: { tenantId: '5' } } as any);
    assert(resCustom.status === 200, 'range=custom returns 200');
    const dataCustom: any = await resCustom.json();
    assert(dataCustom.range.includes(yesterdayIso), 'Custom range label contains fromDate');
  }

  console.log('\n====================================================================');
  console.log(`COMMAND CENTER RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
