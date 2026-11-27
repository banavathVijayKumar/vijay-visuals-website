// ============================================================================
// VIJAY VISUALS — PRIORITY FIX 1 VERIFICATION TEST SUITE
// Tests the Razorpay & Route module seller payout account endpoint & middleware:
// 1. Endpoint contract: GET /api/owner/tenants/:tenantId/payout-account
// 2. Returns strictly valid JSON (never HTML index.html fallback)
// 3. Response shape matches OwnerOperationsSuite requirements:
//    - account (SellerPayoutAccountRecord | null)
//    - transfers (SellerTransferRecord[])
//    - codSummary ({ codCollectedInr: number, codPendingInr: number })
//    - razorpay ({ configured: boolean, mode: string, message: string, webhookConfigured: boolean })
// 4. Tenant isolation: Tenant B cannot access Tenant A's payout account (HTTP 403)
// 5. Unauthenticated requests are rejected (HTTP 401 JSON)
// 6. Security: Full bank account numbers are never exposed; only last 4 digits
// 7. Input validation: Invalid last 4 or invalid IFSC rejected (HTTP 400 JSON)
// 8. Global middleware safeguard: Any unmatched /api/* route returns 404 JSON, never HTML
// ============================================================================

import {
  onRequestGet,
  onRequestPut,
  onRequestOptions,
} from '../functions/api/owner/tenants/[tenantId]/payout-account';
import { onRequest as middlewareOnRequest } from '../functions/_middleware';

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
console.log('VIJAY VISUALS — PRIORITY FIX 1 (RAZORPAY & ROUTE PAYOUT) VERIFICATION');
console.log('====================================================================\n');

// Mock in-memory D1 Database for test
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
        (p) => String(p.id) === String(id) || p.website_id === id || p.public_slug === id
      );
      return { results: (found ? [found] : []) as T[] };
    }

    // Query seller_payout_accounts
    if (normalized.includes('from seller_payout_accounts')) {
      const websiteId = this.params[0];
      const found = this.db.sellerPayoutAccounts.filter((a) => a.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query seller_payment_transfers
    if (normalized.includes('from seller_payment_transfers')) {
      const websiteId = this.params[0];
      const found = this.db.transfers.filter((t) => t.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query store_orders for COD summary
    if (normalized.includes('from store_orders')) {
      const websiteId = this.params[0];
      const matching = this.db.orders.filter((o) => o.website_id === websiteId);
      const codCollected = matching
        .filter((o) => o.payment_method === 'cod' && o.payment_status === 'paid')
        .reduce((sum, o) => sum + (o.total_inr || 0), 0);
      const codPending = matching
        .filter((o) => o.payment_method === 'cod' && o.payment_status !== 'paid' && o.order_status !== 'cancelled')
        .reduce((sum, o) => sum + (o.total_inr || 0), 0);
      return {
        results: [{ cod_collected: codCollected, cod_pending: codPending }] as T[],
      };
    }

    // Audit log table
    if (normalized.includes('into vv_audit_log')) {
      return { results: [] };
    }

    return { results: [] };
  }

  async run() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('update seller_payout_accounts')) {
      const [holder, ifsc, last4, notes, websiteId] = this.params;
      const acc = this.db.sellerPayoutAccounts.find((a) => a.website_id === websiteId);
      if (acc) {
        acc.account_holder_name = holder;
        acc.bank_ifsc = ifsc;
        acc.bank_account_last4 = last4;
        acc.notes = notes;
        acc.updated_at = new Date().toISOString();
      }
    } else if (normalized.includes('insert into seller_payout_accounts')) {
      const [websiteId, ownerId, holder, ifsc, last4, notes] = this.params;
      this.db.sellerPayoutAccounts.push({
        id: this.db.sellerPayoutAccounts.length + 1,
        website_id: websiteId,
        owner_id: ownerId,
        provider: 'razorpay_route',
        linked_account_id: '',
        account_holder_name: holder,
        bank_ifsc: ifsc,
        bank_account_last4: last4,
        upi_id: '',
        kyc_status: 'under_review',
        settlement_mode: 'direct_seller_account',
        platform_commission_percent: 0,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return { success: true };
  }
}

class MockD1Database {
  publications: any[] = [];
  sellerPayoutAccounts: any[] = [];
  transfers: any[] = [];
  orders: any[] = [];

  prepare(sql: string) {
    return new MockD1Statement(sql, this);
  }
}

// Setup mock fixtures
const mockDb = new MockD1Database();

// Tenant 1: Owned by user-100
mockDb.publications.push({
  id: 1,
  rowid: 1,
  website_id: 'web_tenant_1',
  public_slug: 'svs',
  business_name: 'Sri Venkateswara Sweets',
  owner_id: 'user_owner_100',
  status: 'published',
  package_tier: 'business-website',
  website_json: JSON.stringify({ businessName: 'Sri Venkateswara Sweets' }),
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

// Tenant 2: Owned by user-200
mockDb.publications.push({
  id: 2,
  rowid: 2,
  website_id: 'web_tenant_2',
  public_slug: 'kalyani',
  business_name: 'Kalyani Textiles',
  owner_id: 'user_owner_200',
  status: 'published',
  package_tier: 'ecommerce-website',
  website_json: JSON.stringify({ businessName: 'Kalyani Textiles' }),
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

// Mock existing payout account for Tenant 1
mockDb.sellerPayoutAccounts.push({
  id: 101,
  website_id: 'web_tenant_1',
  owner_id: 'user_owner_100',
  provider: 'razorpay_route',
  linked_account_id: 'acc_RzpRouteTenant1',
  account_holder_name: 'Venkateswara Enterprises',
  bank_ifsc: 'HDFC0001234',
  bank_account_last4: '4321',
  upi_id: 'svs@upi',
  kyc_status: 'verified',
  settlement_mode: 'direct_seller_account',
  platform_commission_percent: 5,
  notes: JSON.stringify({
    legalBusinessName: 'Sri Venkateswara Foods LLP',
    panNumber: 'AAACV1234F',
    gstin: '36AAACV1234F1Z5',
  }),
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
});

// Mock transfers for Tenant 1
mockDb.transfers.push({
  id: 501,
  website_id: 'web_tenant_1',
  seller_owner_id: 'user_owner_100',
  store_order_id: 10,
  order_number: 'ORD-10',
  buyer_user_id: 'cust_1',
  seller_linked_account_id: 'acc_RzpRouteTenant1',
  gross_amount_inr: 1500,
  platform_fee_inr: 75,
  seller_net_amount_inr: 1425,
  currency: 'INR',
  razorpay_mode: 'test',
  razorpay_order_id: 'order_rzp_1',
  razorpay_payment_id: 'pay_rzp_1',
  razorpay_transfer_id: 'trf_rzp_1',
  signature_verified: 1,
  status: 'routed',
  created_at: '2026-02-05T10:00:00Z',
});

// Mock store orders for Tenant 1 COD summary
mockDb.orders.push(
  {
    id: 1,
    website_id: 'web_tenant_1',
    total_inr: 800,
    payment_method: 'cod',
    payment_status: 'paid',
    order_status: 'delivered',
  },
  {
    id: 2,
    website_id: 'web_tenant_1',
    total_inr: 450,
    payment_method: 'cod',
    payment_status: 'pending',
    order_status: 'placed',
  }
);

const mockEnv = {
  DB: mockDb as any,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'mock-anon-key-xyz',
  RAZORPAY_KEY_ID: 'rzp_test_PlatformMasterKey',
  RAZORPAY_KEY_SECRET: 'testSecretKey123',
  RAZORPAY_WEBHOOK_SECRET: 'webhookSecretXYZ',
  RAZORPAY_ROUTE_ENABLED: 'true',
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
            user_metadata: { full_name: 'Test Owner' },
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

// Helper: build request with mock bearer auth
function createRequest(url: string, method = 'GET', user?: { id: string; email: string; role?: string }, body?: any) {
  const headers = new Headers();
  headers.set('Host', 'master.vijay-visuals-site.pages.dev');
  if (user) {
    // Encoded mock bearer token recognized by test harness
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
  if (body) {
    headers.set('Content-Type', 'application/json');
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function runTests() {
  console.log('--- TEST 1: OPTIONS /api/owner/tenants/:tenantId/payout-account ---');
  {
    const res = await onRequestOptions();
    assert(res.status === 204, 'OPTIONS returns 204 No Content');
    assert(res.headers.get('Access-Control-Allow-Methods') !== null, 'CORS Access-Control-Allow-Methods present');
  }

  console.log('\n--- TEST 2: GET payout-account: Authorized Owner Contract Verification ---');
  {
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'GET',
      { id: 'user_owner_100', email: 'owner@svs.com' }
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 200, 'GET /payout-account returns HTTP 200 OK');

    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), 'Content-Type is strictly application/json (NOT text/html)');

    const data: any = await res.json();
    assert(data.account !== null, 'Seller payout account is returned');
    assert(data.account.tenantId === 1, 'account.tenantId matches requested tenant');
    assert(data.account.legalBusinessName === 'Sri Venkateswara Foods LLP', 'account.legalBusinessName matches saved notes');
    assert(data.account.panNumber === 'AAACV1234F', 'account.panNumber is correctly mapped');
    assert(data.account.gstin === '36AAACV1234F1Z5', 'account.gstin is correctly mapped');
    assert(data.account.bankAccountHolder === 'Venkateswara Enterprises', 'account.bankAccountHolder is correctly mapped');
    assert(data.account.bankAccountLast4 === '4321', 'account.bankAccountLast4 contains ONLY last 4 digits');
    assert(data.account.ifscCode === 'HDFC0001234', 'account.ifscCode is correctly mapped');
    assert(data.account.razorpayAccountId === 'acc_RzpRouteTenant1', 'account.razorpayAccountId is returned');
    assert(data.account.kycStatus === 'verified', 'account.kycStatus is verified');
    assert(data.account.routeEnabled === true, 'account.routeEnabled matches env setting');

    // Transfers
    assert(Array.isArray(data.transfers) && data.transfers.length === 1, 'Transfers ledger array is returned');
    assert(data.transfers[0].grossAmountInr === 1500, 'Transfer gross amount is 1500');
    assert(data.transfers[0].platformCommissionInr === 75, 'Transfer platform fee is 75');
    assert(data.transfers[0].sellerNetAmountInr === 1425, 'Transfer seller net amount is 1425');

    // COD Summary
    assert(data.codSummary !== undefined, 'codSummary object is returned');
    assert(data.codSummary.codCollectedInr === 800, 'codCollectedInr is ₹800');
    assert(data.codSummary.codPendingInr === 450, 'codPendingInr is ₹450');

    // Cashfree status (legacy "razorpay" key is only a compatibility alias)
    assert(data.razorpay !== undefined, 'Legacy status alias is present');
    assert(data.cashfree.configured === false, 'Cashfree is unconfigured in mock env');
    assert(data.cashfree.mode === 'unconfigured', 'Cashfree mode is unconfigured');
    assert(data.cashfree.webhookConfigured === false, 'Cashfree webhook is not configured');
  }

  console.log('\n--- TEST 3: Unauthenticated Request Returns HTTP 401 JSON ---');
  {
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'GET'
      // No user / No auth header
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 401, 'Unauthenticated request returns HTTP 401 Unauthorized');
    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), '401 response is strictly application/json (NOT text/html)');
    const body: any = await res.json();
    assert(typeof body.error === 'string', '401 response contains error message in JSON');
  }

  console.log('\n--- TEST 4: Cross-Tenant Access Isolation (HTTP 403 Forbidden) ---');
  {
    // User 200 (Owner of Tenant 2) attempts to access Tenant 1
    const req = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'GET',
      { id: 'user_owner_200', email: 'owner@kalyani.com' }
    );
    const context: any = {
      request: req,
      env: mockEnv,
      params: { tenantId: '1' },
    };

    const res = await onRequestGet(context);
    assert(res.status === 403, 'Cross-tenant request returns HTTP 403 Forbidden');
    const contentType = res.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), '403 response is strictly application/json');
    const body: any = await res.json();
    assert(typeof body.error === 'string', '403 response contains isolation error in JSON');
  }

  console.log('\n--- TEST 5: Input Validation & Security for KYC Submission (PUT/POST) ---');
  {
    // Test 5A: Invalid last 4 digits (e.g. 5 digits or non-digits)
    const reqBadLast4 = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'PUT',
      { id: 'user_owner_100', email: 'owner@svs.com' },
      {
        legalBusinessName: 'Valid Name',
        bankAccountHolder: 'Valid Holder',
        bankAccountLast4: '12345', // Invalid: 5 digits
        ifscCode: 'HDFC0001234',
      }
    );
    const resBadLast4 = await onRequestPut({
      request: reqBadLast4,
      env: mockEnv,
      params: { tenantId: '1' },
    } as any);
    assert(resBadLast4.status === 400, 'Rejects last4 with > 4 digits (HTTP 400)');
    const errBody: any = await resBadLast4.json();
    assert(errBody.error.includes('last 4 digits'), 'Clear last4 validation error message');

    // Test 5B: Invalid IFSC code (too short)
    const reqBadIfsc = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'PUT',
      { id: 'user_owner_100', email: 'owner@svs.com' },
      {
        legalBusinessName: 'Valid Name',
        bankAccountHolder: 'Valid Holder',
        bankAccountLast4: '1234',
        ifscCode: 'HDFC', // Invalid: < 8 chars
      }
    );
    const resBadIfsc = await onRequestPut({
      request: reqBadIfsc,
      env: mockEnv,
      params: { tenantId: '1' },
    } as any);
    assert(resBadIfsc.status === 400, 'Rejects invalid IFSC code (HTTP 400)');

    // Test 5C: Valid update
    const reqValid = createRequest(
      'https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/payout-account',
      'PUT',
      { id: 'user_owner_100', email: 'owner@svs.com' },
      {
        legalBusinessName: 'Sri Venkateswara Foods Private Limited',
        panNumber: 'AAACV1234F',
        gstin: '36AAACV1234F1Z5',
        bankAccountHolder: 'Sri Venkateswara Foods PVT LTD',
        bankAccountLast4: '9876',
        ifscCode: 'ICIC0000001',
      }
    );
    const resValid = await onRequestPut({
      request: reqValid,
      env: mockEnv,
      params: { tenantId: '1' },
    } as any);
    assert(resValid.status === 200, 'Valid KYC submission returns HTTP 200');
    const validBody: any = await resValid.json();
    assert(validBody.success === true, 'Success flag returned');
    assert(validBody.account.bankAccountLast4 === '9876', 'Last 4 digits updated');
    assert(validBody.account.ifscCode === 'ICIC0000001', 'IFSC code updated');
  }

  console.log('\n--- TEST 6: Global Middleware Safeguard against HTML Fallback ---');
  {
    // Test 6A: Requesting a NON-EXISTENT API route through the middleware
    // Simulating Cloudflare Pages fallback where next() would return index.html
    const reqMissingApi = new Request(
      'https://master.vijay-visuals-site.pages.dev/api/non-existent-module/test',
      { headers: { Host: 'master.vijay-visuals-site.pages.dev' } }
    );

    const mockPagesSpaNext = async () => {
      // This is what Cloudflare Pages serves by default when an API route is missing
      return new Response('<!DOCTYPE html><html><head><title>Vijay Visuals</title></head><body><div id="root"></div></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    };

    const middlewareContext: any = {
      request: reqMissingApi,
      env: mockEnv,
      next: mockPagesSpaNext,
    };

    const interceptedRes = await middlewareOnRequest(middlewareContext);
    assert(interceptedRes.status === 404, 'Middleware intercepts unhandled API route with HTTP 404 (NOT 200)');
    const contentType = interceptedRes.headers.get('Content-Type') || '';
    assert(contentType.includes('application/json'), 'Intercepted response is application/json (NOT text/html)');

    const body: any = await interceptedRes.json();
    assert(body.error.includes('API route not found: /api/non-existent-module/test'), 'Error specifies unhandled route');

    // Test 6B: Requesting a NON-API route (like /site/svs or /login) should still serve SPA HTML normally
    const reqSpaPage = new Request('https://master.vijay-visuals-site.pages.dev/site/svs', {
      headers: { Host: 'master.vijay-visuals-site.pages.dev' },
    });
    const spaContext: any = {
      request: reqSpaPage,
      env: mockEnv,
      next: mockPagesSpaNext,
    };
    const spaRes = await middlewareOnRequest(spaContext);
    assert(spaRes.status === 200, 'Frontend SPA page routes still serve index.html (HTTP 200)');
    const spaType = spaRes.headers.get('Content-Type') || '';
    assert(spaType.includes('text/html'), 'Frontend page response remains text/html');
  }

  console.log('\n====================================================================');
  console.log(`PRIORITY FIX 1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
