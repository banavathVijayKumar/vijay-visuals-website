// ============================================================================
// VIJAY VISUALS — MASTER PRIORITY FIX 3 VERIFICATION SUITE
// Tests all dashboard modules, AI Center, AI Automation Center, Workflows,
// Delivery Portal, Customer Dashboard, Operations Suite, and Security.
// ============================================================================

import { onRequestGet as meGet } from '../functions/api/me';
import { onRequestGet as overviewGet } from '../functions/api/owner/tenants/[tenantId]/overview';
import { onRequestPost as contentStudioPost } from '../functions/api/ai/content-studio';
import { onRequestPost as aiGeneratePost } from '../functions/api/ai/generate';
import { onRequestPost as workflowsPost } from '../functions/api/tenants/[slug]/workflows';
import { onRequestPatch as workflowTogglePatch } from '../functions/api/workflows/[id]';
import { onRequestPost as workflowRunPost } from '../functions/api/workflows/[id]/run';
import { onRequestPatch as logDecisionPatch } from '../functions/api/automation-logs/[id]/decision';
import {
  onRequestGet as onboardingGet,
  onRequestPut as onboardingPut,
} from '../functions/api/owner/tenants/[tenantId]/onboarding';
import { onRequestPost as aiAssistantPost } from '../functions/api/owner/tenants/[tenantId]/ai-assistant';
import {
  onRequestGet as crmGet,
  onRequestPost as crmPost,
} from '../functions/api/owner/tenants/[tenantId]/crm';
import { onRequestPatch as crmLeadPatch } from '../functions/api/owner/crm/[id]';
import {
  onRequestGet as financeGet,
  onRequestPost as financePost,
} from '../functions/api/owner/tenants/[tenantId]/finance';
import { onRequestGet as supplyChainGet } from '../functions/api/owner/tenants/[tenantId]/supply-chain';
import { onRequestPost as warehousesPost } from '../functions/api/owner/tenants/[tenantId]/warehouses';
import { onRequestPost as suppliersPost } from '../functions/api/owner/tenants/[tenantId]/suppliers';
import { onRequestPost as attendancePost } from '../functions/api/owner/tenants/[tenantId]/attendance';
import {
  onRequestGet as pluginsGet,
  onRequestPost as pluginsPost,
} from '../functions/api/owner/tenants/[tenantId]/plugins';
import { onRequestGet as deliveryPortalGet } from '../functions/api/delivery/portal';
import { onRequestPatch as deliveryAvailabilityPatch } from '../functions/api/delivery/partners/[id]/availability';
import { onRequestPatch as deliveryStatusPatch } from '../functions/api/delivery/orders/[id]/status';
import { onRequestPatch as deliveryPodPatch } from '../functions/api/delivery/orders/[id]/pod';
import { onRequestPatch as customerConsentPatch } from '../functions/api/customer/consent';
import { onRequestGet as customerPrivacyExportGet } from '../functions/api/customer/privacy-export';

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
console.log('VIJAY VISUALS — MASTER PRIORITY FIX 3 VERIFICATION SUITE');
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
      if (normalized.includes('where rowid = ? or website_id = ? or public_slug = ?') ||
          normalized.includes('where rowid = ? or website_id = ?') ||
          normalized.includes('where website_id = ? or public_slug = ?') ||
          normalized.includes('where public_slug = ? or website_id = ?')) {
        const id = this.params[0];
        const found = this.db.publications.find(
          (p) =>
            String(p.rowid) === String(id) ||
            p.website_id === String(id) ||
            p.public_slug === String(id).toLowerCase()
        );
        return { results: (found ? [found] : []) as T[] };
      }
      if (normalized.includes('where owner_id = ? or owner_id = ?')) {
        const owner1 = this.params[0];
        const owner2 = this.params[1];
        const found = this.db.publications.filter(
          (p) => p.owner_id === owner1 || p.owner_id === owner2
        );
        return { results: found as T[] };
      }
      // Select all publications (Super Admin or full scan)
      return { results: this.db.publications as T[] };
    }

    // Query store_orders
    if (normalized.includes('from store_orders')) {
      if (normalized.includes('where id = ?')) {
        const orderId = Number(this.params[0]);
        return { results: this.db.orders.filter((o) => Number(o.id) === orderId) as T[] };
      }
      const websiteId = this.params[0];
      const found = websiteId ? this.db.orders.filter((o) => o.website_id === websiteId) : this.db.orders;
      if (normalized.includes('count(*)')) {
        return { results: [{ count: found.length }] as T[] };
      }
      return { results: found as T[] };
    }

    // Query store_products
    if (normalized.includes('from store_products')) {
      const websiteId = this.params[0];
      const found = websiteId ? this.db.products.filter((p) => p.website_id === websiteId) : this.db.products;
      if (normalized.includes('count(*)')) {
        return { results: [{ count: found.length }] as T[] };
      }
      return { results: found as T[] };
    }

    // Query appointments
    if (normalized.includes('from appointments')) {
      const websiteId = this.params[0];
      const found = websiteId ? this.db.appointments.filter((a) => a.website_id === websiteId) : this.db.appointments;
      if (normalized.includes('count(*)')) {
        return { results: [{ count: found.length }] as T[] };
      }
      return { results: found as T[] };
    }

    // Query delivery assignments (assignment-scoped authorization)
    if (normalized.includes('from delivery_assignments')) {
      const orderId = Number(this.params[0]);
      const websiteId = String(this.params[1] || '');
      const found = this.db.assignments.filter(
        (a) => Number(a.order_id) === orderId && String(a.website_id) === websiteId
      );
      return { results: found as T[] };
    }

    // Query tenant_memberships
    if (normalized.includes('from tenant_memberships')) {
      if (
        (normalized.includes('where id = ?') || normalized.includes('where website_id = ?')) &&
        normalized.includes("role = 'delivery_partner'") &&
        normalized.includes("status = 'active'") &&
        normalized.includes('user_id = ?')
      ) {
        const scope = String(this.params[0] ?? '');
        const userId = String(this.params[1] ?? '');
        const authSubject = String(this.params[2] ?? '');
        const email = String(this.params[3] ?? '');
        const found = this.db.memberships.filter(
          (m) =>
            m.role === 'delivery_partner' &&
            m.status === 'active' &&
            (String(m.id) === scope || m.website_id === scope) &&
            (m.user_id === userId || m.user_id === authSubject || m.email === email)
        );
        return { results: found as T[] };
      }
      if (normalized.includes('where id = ?') && !normalized.includes('user_id = ?')) {
        const membershipId = Number(this.params[0]);
        return { results: this.db.memberships.filter((m) => Number(m.id) === membershipId) as T[] };
      }
      if (normalized.includes('tm.role = \'delivery_partner\'') || normalized.includes('where tm.role =')) {
        const userId = this.params[0];
        const email = this.params[2];
        const found = this.db.memberships
          .filter((m) => m.role === 'delivery_partner' && (m.user_id === userId || m.email === email))
          .map((m) => ({
            ...m,
            business_name: 'Royal Feast Cloud Kitchen',
            public_slug: 'royal-feast-cloud-kitchen',
          }));
        return { results: found as T[] };
      }
      const websiteId = this.params[0];
      const found = websiteId && !websiteId.startsWith('user_')
        ? this.db.memberships.filter((m) => m.website_id === websiteId)
        : this.db.memberships;
      if (normalized.includes('count(*)')) {
        return { results: [{ count: found.length }] as T[] };
      }
      return { results: found as T[] };
    }

    // Query crm_contacts_leads
    if (normalized.includes('from crm_contacts_leads')) {
      if (normalized.includes('where id = ?')) {
        const id = Number(this.params[0]);
        const found = this.db.leads.filter((l) => Number(l.id) === id);
        return { results: found as T[] };
      }
      const websiteId = this.params[0];
      const found = this.db.leads.filter((l) => l.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query finance_ledger
    if (normalized.includes('from finance_ledger')) {
      const websiteId = this.params[0];
      const found = this.db.finances.filter((f) => f.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query inventory_warehouses
    if (normalized.includes('from inventory_warehouses')) {
      const websiteId = this.params[0];
      const found = this.db.warehouses.filter((w) => w.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query inventory_suppliers
    if (normalized.includes('from inventory_suppliers')) {
      const websiteId = this.params[0];
      const found = this.db.suppliers.filter((s) => s.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query staff_attendance_payroll
    if (normalized.includes('from staff_attendance_payroll')) {
      const websiteId = this.params[0];
      const found = this.db.attendances.filter((a) => a.website_id === websiteId);
      return { results: found as T[] };
    }

    // Query seller_payout_accounts
    if (normalized.includes('from seller_payout_accounts')) {
      const websiteId = this.params[0];
      const found = this.db.payouts.filter((p) => p.website_id === websiteId);
      return { results: found as T[] };
    }

    return { results: [] };
  }

  async run(): Promise<{ meta: { changes: number; last_row_id: number } }> {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.startsWith('update customer_website_publications')) {
      const websiteJson = this.params[0];
      const websiteId = this.params[1];
      const pub = this.db.publications.find((p) => p.website_id === websiteId);
      if (pub) {
        pub.website_json = websiteJson;
        return { meta: { changes: 1, last_row_id: pub.rowid } };
      }
    }

    if (normalized.startsWith('insert into crm_contacts_leads')) {
      const newId = this.db.leads.length + 1;
      this.db.leads.push({
        id: newId,
        website_id: this.params[0],
        owner_id: this.params[1],
        full_name: this.params[2],
        phone: this.params[3],
        email: this.params[4],
        source: this.params[5],
        stage: this.params[6],
        loyalty_points: this.params[7],
        marketing_consent: this.params[8],
      });
      return { meta: { changes: 1, last_row_id: newId } };
    }

    if (normalized.startsWith('insert into finance_ledger')) {
      const newId = this.db.finances.length + 1;
      this.db.finances.push({
        id: newId,
        website_id: this.params[0],
        owner_id: this.params[1],
        entry_type: this.params[2],
        category: this.params[3],
        amount_inr: this.params[4],
        gst_inr: this.params[5],
        reference_id: this.params[6],
        notes: this.params[7],
      });
      return { meta: { changes: 1, last_row_id: newId } };
    }

    if (normalized.startsWith('insert into inventory_warehouses')) {
      const newId = this.db.warehouses.length + 1;
      this.db.warehouses.push({
        id: newId,
        website_id: this.params[0],
        owner_id: this.params[1],
        name: this.params[2],
        address: this.params[3],
        manager_name: this.params[4],
      });
      return { meta: { changes: 1, last_row_id: newId } };
    }

    if (normalized.startsWith('insert into inventory_suppliers')) {
      const newId = this.db.suppliers.length + 1;
      this.db.suppliers.push({
        id: newId,
        website_id: this.params[0],
        owner_id: this.params[1],
        name: this.params[2],
        contact_phone: this.params[3],
        gst_number: this.params[4],
        notes: this.params[5],
      });
      return { meta: { changes: 1, last_row_id: newId } };
    }

    if (normalized.startsWith('insert into staff_attendance_payroll')) {
      const newId = this.db.attendances.length + 1;
      this.db.attendances.push({
        id: newId,
        website_id: this.params[0],
        membership_id: this.params[1],
        work_date: this.params[2],
        status: this.params[3],
        notes: this.params[4],
      });
      return { meta: { changes: 1, last_row_id: newId } };
    }

    if (normalized.startsWith('update store_orders') || normalized.startsWith('update crm_contacts_leads') || normalized.startsWith('update tenant_memberships')) {
      return { meta: { changes: 1, last_row_id: 1 } };
    }

    return { meta: { changes: 1, last_row_id: 1 } };
  }
}

class MockD1Database {
  public publications: any[] = [];
  public orders: any[] = [];
  public products: any[] = [];
  public appointments: any[] = [];
  public memberships: any[] = [];
  public assignments: any[] = [];
  public leads: any[] = [];
  public finances: any[] = [];
  public warehouses: any[] = [];
  public suppliers: any[] = [];
  public attendances: any[] = [];
  public payouts: any[] = [];

  prepare(sql: string) {
    return new MockD1Statement(sql, this);
  }
}

function createMockEnv(db: MockD1Database) {
  return {
    DB: db as any,
    SUPABASE_URL: 'https://mock-supa.supabase.co',
    SUPABASE_ANON_KEY: 'mock-anon-key',
  };
}

function makeJwt(payload: Record<string, any>): string {
  const tokenPayload = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `mock.${tokenPayload}.sig`;
}

// Mock fetch for Supabase Auth in unit tests
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes('/auth/v1/user')) {
    const authHeader =
      (init?.headers as Record<string, string>)?.[
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
            user_metadata: { full_name: payload.email?.split('@')[0] || 'Test User' },
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
    const authHeader =
      (init?.headers as Record<string, string>)?.[
        'Authorization'
      ] || (init?.headers as Headers)?.get?.('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+mock\.([A-Za-z0-9+/=]+)\.sig/);
    let role = 'customer';
    if (match) {
      try {
        const payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
        role = payload.role || payload.app_metadata?.role || 'customer';
      } catch {}
    }
    return new Response(
      JSON.stringify([
        {
          role,
          is_super_admin: role === 'super_admin',
          full_name: 'Test User',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return originalFetch(input, init);
};

async function runTests() {
  const db = new MockD1Database();

  // Populate mock data with 4 production tenants
  db.publications = [
    {
      rowid: 1,
      website_id: 'web_royal_feast',
      owner_id: '85272889-cd3b-45fe-86de-f503be8193fc',
      public_slug: 'royal-feast-cloud-kitchen',
      business_name: 'Royal Feast Cloud Kitchen',
      status: 'published',
      website_json: JSON.stringify({
        category: 'restaurant',
        phone: '+91 9876543210',
        address: 'Banjara Hills, Hyderabad',
        automationWorkflows: [
          {
            id: 101,
            name: 'Order SMS Confirmation',
            triggerType: 'order_placed',
            actionType: 'send_sms',
            enabled: true,
            requiresApproval: false,
          },
        ],
        automationLogs: [],
      }),
    },
    {
      rowid: 2,
      website_id: 'web_ajay',
      owner_id: '85272889-cd3b-45fe-86de-f503be8193fc',
      public_slug: 'ajay',
      business_name: 'Ajay Photography Studio',
      status: 'published',
      website_json: JSON.stringify({ category: 'photography', phone: '+91 9876543211' }),
    },
    {
      rowid: 3,
      website_id: 'web_kalyani',
      owner_id: '85272889-cd3b-45fe-86de-f503be8193fc',
      public_slug: 'kalyani',
      business_name: 'Kalyani Sarees',
      status: 'published',
      website_json: JSON.stringify({ category: 'fashion', phone: '+91 9876543212' }),
    },
    {
      rowid: 4,
      website_id: 'web_kalyani_silks',
      owner_id: '85272889-cd3b-45fe-86de-f503be8193fc',
      public_slug: 'kalyani-silks-boutique',
      business_name: 'Kalyani Silks Boutique',
      status: 'published',
      website_json: JSON.stringify({ category: 'fashion', phone: '+91 9876543213' }),
    },
  ];

  db.products = [
    {
      id: 1,
      website_id: 'web_royal_feast',
      name: 'Hyderabadi Dum Biryani',
      price_inr: 350,
      stock_qty: 45,
      low_stock_threshold: 10,
      is_active: 1,
    },
    {
      id: 2,
      website_id: 'web_royal_feast',
      name: 'Paneer Butter Masala',
      price_inr: 280,
      stock_qty: 3,
      low_stock_threshold: 5,
      is_active: 1,
    },
  ];

  db.orders = [
    {
      id: 1,
      website_id: 'web_royal_feast',
      order_number: 'ORD-1001',
      total_inr: 1050,
      order_status: 'delivered',
      payment_method: 'upi',
      payment_status: 'paid',
      customer_name: 'Rahul Sharma',
      customer_phone: '9876500001',
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      website_id: 'web_royal_feast',
      order_number: 'ORD-1002',
      total_inr: 630,
      order_status: 'ready_for_pickup',
      payment_method: 'cod',
      payment_status: 'pending',
      customer_name: 'Priya Reddy',
      customer_phone: '9876500002',
      created_at: new Date().toISOString(),
    },
  ];

  db.memberships = [
    {
      id: 10,
      website_id: 'web_royal_feast',
      user_id: 'user_driver_1',
      full_name: 'Ramu Delivery',
      email: 'ramu@delivery.com',
      role: 'delivery_partner',
      status: 'active',
      permissions_json: JSON.stringify(['deliveryApproval:owner_approved', 'availability:online']),
    },
  ];

  db.assignments = [
    {
      id: 1,
      website_id: 'web_royal_feast',
      order_id: 2,
      delivery_partner_user_id: 10,
      status: 'assigned',
      last_lat: null,
      last_lng: null,
      updated_at: new Date().toISOString(),
    },
  ];

  const env = createMockEnv(db);

  // Tokens
  const superAdminToken = makeJwt({
    sub: 'user_super_admin_1',
    email: 'admin@vijayvisuals.com',
    role: 'super_admin',
    app_metadata: { role: 'super_admin' },
  });

  const tenantOwnerToken = makeJwt({
    sub: '85272889-cd3b-45fe-86de-f503be8193fc',
    email: 'owner@royalfeast.com',
    role: 'business_owner',
    app_metadata: { role: 'business_owner' },
  });

  const driverToken = makeJwt({
    sub: 'user_driver_1',
    email: 'ramu@delivery.com',
    role: 'delivery_partner',
    app_metadata: { role: 'delivery_partner' },
  });

  // TEST 1: Super Admin /api/me returns all 4 active customer websites (fixes false empty state)
  {
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/me', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const res = await meGet({ request: req, env, params: {}, next: async () => new Response() });
    assert(res.status === 200, 'Super admin /api/me returns HTTP 200');
    const data = await res.json();
    assert(data.user.role === 'super_admin', 'User mapped to super_admin role');
    assert(data.ownedTenants.length === 4, 'Super admin receives all 4 active customer websites');
    assert(data.ownedTenants.some((t: any) => t.slug === 'royal-feast-cloud-kitchen'), 'royal-feast tenant present');
    assert(data.ownedTenants.some((t: any) => t.slug === 'kalyani-silks-boutique'), 'kalyani-silks-boutique tenant present');
  }

  // TEST 2: Delivery Partner /api/me returns delivery profile
  {
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/me', {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const res = await meGet({ request: req, env, params: {}, next: async () => new Response() });
    assert(res.status === 200, 'Driver /api/me returns HTTP 200');
    const data = await res.json();
    assert(data.deliveryProfiles.length > 0, 'Driver receives active deliveryProfile');
    assert(data.deliveryProfiles[0].websiteId === 'web_royal_feast', 'Driver mapped to correct tenant');
  }

  // TEST 3: /api/owner/tenants/:tenantId/overview returns workflows and logs
  {
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/overview', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const res = await overviewGet({ request: req, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(res.status === 200, 'Overview returns HTTP 200');
    const data = await res.json();
    assert(Array.isArray(data.workflows), 'Overview response includes workflows array');
    assert(Array.isArray(data.logs), 'Overview response includes logs array');
    assert(data.workflows.length > 0, 'Workflows array is non-empty');
    assert(data.stats.totalRevenue === 1680, 'Correct revenue calculated');
    assert(data.stats.lowStockCount === 1, 'Correct low stock count calculated');
  }

  // TEST 4: AI Content Studio generates multi-mode copy
  {
    const modes = ['seo_metadata', 'blog_article', 'ad_campaign', 'poster_brief'];
    for (const m of modes) {
      const req = new Request('https://master.vijay-visuals-site.pages.dev/api/ai/content-studio', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenantOwnerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: 1, mode: m, topic: 'Royal Biryani Weekend Special', language: 'en' }),
      });
      const res = await contentStudioPost({ request: req, env, params: {}, next: async () => new Response() });
      assert(res.status === 200, `AI Content Studio (${m}) returns HTTP 200`);
      const data = await res.json();
      assert(typeof data.output === 'string' && data.output.length > 50, `AI Content Studio (${m}) returns valid output`);
      assert(data.creditsUsed === 1, `AI Content Studio (${m}) reports 1 credit used`);
    }
  }

  // TEST 5: /api/ai/generate includes creditsUsed
  {
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/ai/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: 'product_description', prompt: 'Hyderabadi Dum Biryani authentic spices' }),
    });
    const res = await aiGeneratePost({ request: req, env, params: {}, next: async () => new Response() });
    assert(res.status === 200, 'AI generate returns HTTP 200');
    const data = await res.json();
    assert(data.creditsUsed === 1, 'AI generate returns creditsUsed: 1');
  }

  // TEST 6: Workflow creation, toggle, and execution
  {
    // A. Create workflow
    const createReq = new Request('https://master.vijay-visuals-site.pages.dev/api/tenants/1/workflows', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Auto WhatsApp Invoice',
        triggerType: 'order_delivered',
        conditionText: 'payment_status = paid',
        actionType: 'manual_invoice_review',
        requiresApproval: true,
        scheduleCron: 'realtime',
      }),
    });
    const createRes = await workflowsPost({ request: createReq, env, params: { slug: '1' }, next: async () => new Response() });
    assert(createRes.status === 200, 'Create workflow returns HTTP 200');
    const createData = await createRes.json();
    const wfId = createData.workflow.id;
    assert(createData.workflow.name === 'Auto WhatsApp Invoice', 'Workflow name stored correctly');

    // B. Toggle workflow
    const toggleReq = new Request(`https://master.vijay-visuals-site.pages.dev/api/workflows/${wfId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled: true }),
    });
    const toggleRes = await workflowTogglePatch({ request: toggleReq, env, params: { id: String(wfId) }, next: async () => new Response() });
    assert(toggleRes.status === 200, 'Toggle workflow returns HTTP 200');

    // C. Run workflow
    const runReq = new Request(`https://master.vijay-visuals-site.pages.dev/api/workflows/${wfId}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
      },
    });
    const runRes = await workflowRunPost({ request: runReq, env, params: { id: String(wfId) }, next: async () => new Response() });
    assert(runRes.status === 200, 'Run workflow returns HTTP 200');
    const runData = await runRes.json();
    assert(runData.log.status === 'awaiting_approval', 'Approval-gated workflow creates awaiting_approval log');
    const logId = runData.log.id;

    // D. Owner Decision on Gated Log
    const decisionReq = new Request(`https://master.vijay-visuals-site.pages.dev/api/automation-logs/${logId}/decision`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'approved' }),
    });
    const decisionRes = await logDecisionPatch({ request: decisionReq, env, params: { id: String(logId) }, next: async () => new Response() });
    assert(decisionRes.status === 200, 'Log decision returns HTTP 200');
    const decisionData = await decisionRes.json();
    assert(decisionData.status === 'approved', 'Log status updated to approved');
  }

  // TEST 7: 12-Step Guided Onboarding Wizard
  {
    // A. GET steps
    const getReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/onboarding', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const getRes = await onboardingGet({ request: getReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(getRes.status === 200, 'Onboarding GET returns HTTP 200');
    const getData = await getRes.json();
    assert(getData.totalSteps === 12, 'Checklist has exactly 12 steps');
    assert(getData.steps.length === 12, 'Returned steps length is 12');
    assert(getData.steps[0].autoCompleted === true, 'Step 1 auto-completed from contact info');
    assert(getData.steps[2].autoCompleted === true, 'Step 3 auto-completed from products');
    assert(getData.steps[9].autoCompleted === true, 'Step 10 auto-completed from orders');
    assert(getData.steps[11].autoCompleted === true, 'Step 12 auto-completed because published');

    // B. PUT step progress
    const putReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/onboarding', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    });
    const putRes = await onboardingPut({ request: putReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(putRes.status === 200, 'Onboarding PUT returns HTTP 200');
  }

  // TEST 8: Grounded AI Assistant Q&A
  {
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/ai-assistant', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'How is my revenue and biryani stock doing today?' }),
    });
    const res = await aiAssistantPost({ request: req, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(res.status === 200, 'AI Assistant returns HTTP 200');
    const data = await res.json();
    assert(typeof data.answer === 'string' && data.answer.length > 20, 'AI Assistant returns answer');
    assert(data.creditsUsed === 1, 'AI Assistant uses 1 credit');
  }

  // TEST 9: CRM Leads List, Create & Stage Update
  {
    // A. POST Lead
    const postReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/crm', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Suresh Kumar',
        phone: '9848022338',
        email: 'suresh@example.com',
        source: 'instagram',
        stage: 'new',
        loyaltyPoints: 100,
        marketingConsent: true,
      }),
    });
    const postRes = await crmPost({ request: postReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(postRes.status === 200, 'Create CRM lead returns HTTP 200');
    const postData = await postRes.json();
    assert(postData.lead.name === 'Suresh Kumar', 'Lead name recorded correctly');

    // B. GET Leads
    const getReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/crm', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const getRes = await crmGet({ request: getReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(getRes.status === 200, 'Get CRM leads returns HTTP 200');
    const getData = await getRes.json();
    assert(getData.leads.length > 0, 'Leads returned in array');

    // C. PATCH Lead stage
    const patchReq = new Request(`https://master.vijay-visuals-site.pages.dev/api/owner/crm/${postData.lead.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stage: 'qualified', loyaltyPoints: 150 }),
    });
    const patchRes = await crmLeadPatch({ request: patchReq, env, params: { id: String(postData.lead.id) }, next: async () => new Response() });
    assert(patchRes.status === 200, 'Patch CRM lead returns HTTP 200');
  }

  // TEST 10: Finance Ledger & Aggregates
  {
    // A. POST Finance Entry
    const postReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/finance', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recordType: 'expense',
        partyName: 'Deccan Spices Wholesale',
        category: 'raw_materials',
        amountInr: 250,
        gstRatePct: 5,
        gstAmountInr: 12,
        notes: 'Cardamom & Basmati bulk spices',
      }),
    });
    const postRes = await financePost({ request: postReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(postRes.status === 200, 'Create finance entry returns HTTP 200');

    // B. GET Finance
    const getReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/finance', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const getRes = await financeGet({ request: getReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(getRes.status === 200, 'Get finance returns HTTP 200');
    const getData = await getRes.json();
    assert(Array.isArray(getData.records), 'Records array present');
    assert(getData.summary.totalSales === 1680, 'Sales summary verified');
    assert(getData.summary.netProfit === 1430, 'Net profit accurately calculated (1680 - 250 = 1430)');
  }

  // TEST 11: Supply Chain & Warehouses
  {
    // A. POST Warehouse
    const whReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/warehouses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hitec City Kitchen Hub', city: 'Madhapur', capacityUnits: 1500, managerName: 'Kishore' }),
    });
    const whRes = await warehousesPost({ request: whReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(whRes.status === 200, 'Create warehouse returns HTTP 200');

    // B. POST Supplier
    const supReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/suppliers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Fresh Farm Meat Co', contactPhone: '9849011223', gstin: '36ABCDE1234F1Z5' }),
    });
    const supRes = await suppliersPost({ request: supReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(supRes.status === 200, 'Create supplier returns HTTP 200');

    // C. POST Attendance
    const attReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/attendance', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ staffId: 10, status: 'present', salaryPaidInr: 800 }),
    });
    const attRes = await attendancePost({ request: attReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(attRes.status === 200, 'Record attendance returns HTTP 200');

    // D. GET Supply Chain
    const scReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/supply-chain', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const scRes = await supplyChainGet({ request: scReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(scRes.status === 200, 'Get supply-chain returns HTTP 200');
    const scData = await scRes.json();
    assert(scData.warehouses.length > 0, 'Warehouses returned');
    assert(scData.suppliers.length > 0, 'Suppliers returned');
    assert(scData.attendance.length > 0, 'Attendance returned');
  }

  // TEST 12: Plugins Management
  {
    // A. POST Plugin
    const postReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/plugins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pluginCode: 'whatsapp_checkout', pluginName: 'WhatsApp Quick Checkout', enabled: true }),
    });
    const postRes = await pluginsPost({ request: postReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(postRes.status === 200, 'Configure plugin returns HTTP 200');

    // B. GET Plugins
    const getReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/plugins', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const getRes = await pluginsGet({ request: getReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(getRes.status === 200, 'Get plugins returns HTTP 200');
    const getData = await getRes.json();
    assert(getData.installed.some((p: any) => p.pluginCode === 'whatsapp_checkout'), 'whatsapp_checkout plugin installed');
  }

  // TEST 13: Delivery Fleet Portal, Availability, Status & POD
  {
    // A. GET Portal
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/delivery/portal', {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const res = await deliveryPortalGet({ request: req, env, params: {}, next: async () => new Response() });
    assert(res.status === 200, 'Delivery portal returns HTTP 200');
    const data = await res.json();
    assert(data.partners.length > 0, 'Delivery partners array non-empty');

    // B. PATCH Partner Availability
    const availReq = new Request('https://master.vijay-visuals-site.pages.dev/api/delivery/partners/10/availability', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${driverToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ available: true }),
    });
    const availRes = await deliveryAvailabilityPatch({ request: availReq, env, params: { id: '10' }, next: async () => new Response() });
    assert(availRes.status === 200, 'Update delivery availability returns HTTP 200');

    // C. PATCH Order Status
    const stReq = new Request('https://master.vijay-visuals-site.pages.dev/api/delivery/orders/2/status', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${driverToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'out_for_delivery' }),
    });
    const stRes = await deliveryStatusPatch({ request: stReq, env, params: { id: '2' }, next: async () => new Response() });
    assert(stRes.status === 200, 'Update delivery order status returns HTTP 200');

    // D. Legacy POD is retired; delivery completion requires /secure-pod.
    const podRes = await deliveryPodPatch();
    assert(podRes.status === 410, 'Legacy POD returns HTTP 410 Gone');
    const podBody = (await podRes.json()) as Record<string, any>;
    assert(podBody.code === 'SECURE_POD_REQUIRED', 'Legacy POD points to secure POD');
  }

  // TEST 14: Customer Consent & Privacy Data Export
  {
    // A. Consent PATCH
    const consentReq = new Request('https://master.vijay-visuals-site.pages.dev/api/customer/consent', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tenantOwnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ marketingConsent: false, unsubscribed: true }),
    });
    const consentRes = await customerConsentPatch({ request: consentReq, env, params: {}, next: async () => new Response() });
    assert(consentRes.status === 200, 'Customer consent returns HTTP 200');

    // B. Privacy Export GET
    const exportReq = new Request('https://master.vijay-visuals-site.pages.dev/api/customer/privacy-export', {
      headers: { Authorization: `Bearer ${tenantOwnerToken}` },
    });
    const exportRes = await customerPrivacyExportGet({ request: exportReq, env, params: {}, next: async () => new Response() });
    assert(exportRes.status === 200, 'Customer privacy export returns HTTP 200');
    const exportData = await exportRes.json();
    assert(exportData.profile.email === 'owner@royalfeast.com', 'Profile included in export');
  }

  // TEST 15: Security & Isolation checks
  {
    // Cross tenant access forbidden for non-superadmin
    const otherUserToken = makeJwt({
      sub: 'user_unauthorized_stranger',
      email: 'stranger@example.com',
      app_metadata: { role: 'business_owner' },
    });
    const req = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/overview', {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    const res = await overviewGet({ request: req, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(res.status === 403, 'Cross-tenant access correctly denied with HTTP 403');
    const data = await res.json();
    assert(typeof data.error === 'string', 'Returns JSON error body, never HTML');

    // Unauthenticated request rejected
    const unauthReq = new Request('https://master.vijay-visuals-site.pages.dev/api/owner/tenants/1/overview');
    const unauthRes = await overviewGet({ request: unauthReq, env, params: { tenantId: '1' }, next: async () => new Response() });
    assert(unauthRes.status === 401, 'Unauthenticated access denied with HTTP 401');
    const unauthData = await unauthRes.json();
    assert(typeof unauthData.error === 'string', 'Returns JSON error body, never HTML');
  }

  console.log('\n====================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
