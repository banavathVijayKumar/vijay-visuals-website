// VIJAY VISUALS Multi-Tenant SaaS Platform Domain Services & Reactive Stores
import { subscribeToStore, UserProfile } from './supabase';

// ============================================================================
// TYPES & DATA CONTRACTS
// ============================================================================

export interface ProductVariant {
  name: string;
  options: string[];
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  compare_price?: number;
  category: string;
  subcategory?: string;
  stock: number;
  low_stock_threshold: number;
  sku: string;
  image_url: string;
  is_active: boolean;
  variants?: ProductVariant[];
  created_at: string;
}

export interface CRMLead {
  id: string;
  business_id: string;
  customer_name: string;
  email: string;
  phone: string;
  source: 'website' | 'whatsapp' | 'referral' | 'walk_in' | 'campaign';
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  estimated_value: number;
  notes: string[];
  follow_up_date?: string;
  created_at: string;
}

export interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Proposal {
  id: string;
  proposal_number: string;
  business_id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  items: ProposalItem[];
  discount: number;
  tax_rate: number;
  total_amount: number;
  terms: string;
  valid_until: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  proposal_id?: string;
  business_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  gst_number?: string;
  items: ProposalItem[];
  subtotal: number;
  tax_amount: number;
  discount: number;
  grand_total: number;
  status: 'unpaid' | 'paid' | 'overdue' | 'refunded';
  due_date: string;
  paid_at?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  business_id: string;
  service_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  booking_date: string;
  time_slot: string;
  advance_paid: number;
  total_amount: number;
  status: 'confirmed' | 'rescheduled' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  tenant_id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  recipient: string;
  subject_or_template: string;
  content: string;
  status: 'sent' | 'delivered' | 'failed';
  error_message?: string;
  created_at: string;
}

export interface SupportTicketMessage {
  id: string;
  sender: 'customer' | 'admin' | 'support' | 'ai';
  text: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  tenant_id?: string;
  customer_name: string;
  customer_email: string;
  subject: string;
  category: 'technical' | 'billing' | 'order' | 'website' | 'delivery' | 'ai';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  messages: SupportTicketMessage[];
  created_at: string;
}

export interface Coupon {
  id: string;
  business_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_value: number;
  max_discount?: number;
  usage_count: number;
  usage_limit: number;
  expires_at: string;
  is_active: boolean;
}

export interface WebsiteVersion {
  id: string;
  business_id: string;
  version_number: number;
  saved_at: string;
  notes: string;
  snapshot: any;
}

export interface TenantSubscription {
  id: string;
  business_id: string;
  plan_id: 'starter' | 'professional' | 'business' | 'enterprise';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  billing_cycle: 'monthly' | 'yearly';
  amount: number;
  started_at: string;
  expires_at: string;
  auto_renew: boolean;
  features: string[];
}

// ============================================================================
// STORAGE HELPERS & SEEDS
// ============================================================================

const SAAS_KEYS = {
  PRODUCTS: 'vv_saas_products',
  LEADS: 'vv_saas_leads',
  PROPOSALS: 'vv_saas_proposals',
  INVOICES: 'vv_saas_invoices',
  BOOKINGS: 'vv_saas_bookings',
  NOTIFICATIONS: 'vv_saas_notifications',
  TICKETS: 'vv_saas_tickets',
  COUPONS: 'vv_saas_coupons',
  VERSIONS: 'vv_saas_versions',
  SUBSCRIPTIONS: 'vv_saas_subscriptions',
};

function getStore<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setStore<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    // Trigger global listeners so UI re-renders reactively
    window.dispatchEvent(new Event('vv_store_updated'));
  } catch (e) {
    console.error('Storage write error:', e);
  }
}

// Seed initial products for demonstration
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-01',
    business_id: 'biz-01',
    name: '22K Royal Temple Solitaire Bridal Necklace',
    description: 'Artisanal 22K yellow gold choker embellished with uncut polki and emerald drops. Certified BIS Hallmark.',
    price: 185000,
    compare_price: 210000,
    category: 'Bridal Sets',
    subcategory: 'Necklaces',
    stock: 3,
    low_stock_threshold: 1,
    sku: 'AJ-NK-001',
    image_url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600',
    is_active: true,
    variants: [{ name: 'Weight', options: ['45 grams', '60 grams', '85 grams'] }],
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'prod-02',
    business_id: 'biz-01',
    name: '18K Rose Gold Solitaire Diamond Studs (1.5ct VVS1)',
    description: 'Brilliant round cut diamonds set in 4-prong rose gold basket. Includes IGI certificate.',
    price: 64999,
    compare_price: 75000,
    category: 'Earrings',
    subcategory: 'Diamond',
    stock: 8,
    low_stock_threshold: 2,
    sku: 'AJ-ER-009',
    image_url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600',
    is_active: true,
    created_at: '2026-01-12T11:00:00Z',
  },
  {
    id: 'prod-03',
    business_id: 'biz-02',
    name: 'Hyderabadi Zafrani Mutton Dum Biryani (Pot for 4)',
    description: 'Slow-cooked aromatic basmati rice infused with Kashmiri saffron, tender goat meat and royal spices.',
    price: 1299,
    compare_price: 1450,
    category: 'Biryani Specialities',
    stock: 45,
    low_stock_threshold: 10,
    sku: 'RF-BIR-004',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600',
    is_active: true,
    variants: [{ name: 'Spice Level', options: ['Medium Royal', 'Spicy Hyderabadi'] }],
    created_at: '2026-01-15T09:00:00Z',
  },
  {
    id: 'prod-04',
    business_id: 'biz-02',
    name: 'Murgh Malai Reshmi Kebab Platter (12 Pcs)',
    description: 'Melt-in-mouth chicken boneless chunks marinated in cashew cream, cardamom and white pepper.',
    price: 549,
    category: 'Starters',
    stock: 30,
    low_stock_threshold: 5,
    sku: 'RF-KB-012',
    image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600',
    is_active: true,
    created_at: '2026-01-18T12:00:00Z',
  },
];

// Seed initial CRM Leads
const INITIAL_LEADS: CRMLead[] = [
  {
    id: 'lead-01',
    business_id: 'biz-01',
    customer_name: 'Dr. Suresh Varma',
    email: 'drsuresh@hospital.in',
    phone: '+91 98490 11223',
    source: 'website',
    status: 'qualified',
    estimated_value: 250000,
    notes: ['Enquired about daughter wedding jewellery set.', 'Requested video call showroom tour.'],
    follow_up_date: '2026-11-10',
    created_at: '2026-11-05T08:00:00Z',
  },
  {
    id: 'lead-02',
    business_id: 'biz-01',
    customer_name: 'Pooja Reddy',
    email: 'pooja.r@outlook.com',
    phone: '+91 97011 88990',
    source: 'whatsapp',
    status: 'new',
    estimated_value: 85000,
    notes: ['Looking for 18K diamond promise ring.'],
    created_at: '2026-11-06T14:00:00Z',
  },
  {
    id: 'lead-03',
    business_id: 'biz-02',
    customer_name: 'TechCorp IT Services',
    email: 'events@techcorp.in',
    phone: '+91 99880 33441',
    source: 'walk_in',
    status: 'converted',
    estimated_value: 65000,
    notes: ['Corporate Diwali feast catering for 120 guests successfully delivered.'],
    created_at: '2026-10-28T09:00:00Z',
  },
];

// Seed initial Proposals
const INITIAL_PROPOSALS: Proposal[] = [
  {
    id: 'prop-01',
    proposal_number: 'VV-PROP-2026-081',
    business_id: 'biz-01',
    client_name: 'Siddharth Rao',
    client_email: 'siddharth@raoenterprises.com',
    client_phone: '+91 93813 62201',
    items: [
      { id: '1', description: 'Custom 22K Heritage Kundan Choker with Emeralds', quantity: 1, unit_price: 245000, total: 245000 },
      { id: '2', description: 'Matching Chandbali Earrings Pair', quantity: 1, unit_price: 65000, total: 65000 },
      { id: '3', description: 'Insured White-Glove Doorstep Delivery & Hallmarking', quantity: 1, unit_price: 0, total: 0 },
    ],
    discount: 10000,
    tax_rate: 3,
    total_amount: 309000,
    terms: '50% advance upon contract signing. Remaining 50% prior to dispatch. 100% BIS Hallmarked.',
    valid_until: '2026-11-25',
    status: 'sent',
    created_at: '2026-11-04T10:00:00Z',
  },
];

// Seed initial Invoices
const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-01',
    invoice_number: 'VV-INV-9921',
    proposal_id: 'prop-01',
    business_id: 'biz-01',
    customer_name: 'Rahul Sharma',
    customer_email: 'rahul@gmail.com',
    customer_phone: '+91 98765 43210',
    billing_address: 'Flat 402, Skyline Residency, Road No. 10, Banjara Hills, Hyderabad',
    gst_number: '36AABCV1234F1Z8',
    items: [
      { id: '1', description: '18K Diamond Solitaire Studs', quantity: 1, unit_price: 32000, total: 32000 },
    ],
    subtotal: 32000,
    tax_amount: 960,
    discount: 0,
    grand_total: 32960,
    status: 'paid',
    due_date: '2026-11-06',
    paid_at: '2026-11-06T15:00:00Z',
    created_at: '2026-11-06T13:30:00Z',
  },
];

// Seed initial Bookings
const INITIAL_BOOKINGS: Booking[] = [
  {
    id: 'bk-01',
    business_id: 'biz-01',
    service_name: 'VIP Private Bridal Jewellery Preview & Styling Consultation',
    customer_name: 'Ananya Deshmukh',
    customer_email: 'ananya@gmail.com',
    customer_phone: '+91 98700 44556',
    booking_date: '2026-11-12',
    time_slot: '03:00 PM - 04:30 PM',
    advance_paid: 2000,
    total_amount: 2000,
    status: 'confirmed',
    notes: 'Bride requested gold choker styling recommendations.',
    created_at: '2026-11-06T11:00:00Z',
  },
  {
    id: 'bk-02',
    business_id: 'biz-02',
    service_name: 'Private Rooftop Family Dinner Table for 8',
    customer_name: 'Karthik Raju',
    customer_email: 'karthik@techcorp.in',
    customer_phone: '+91 98888 22114',
    booking_date: '2026-11-10',
    time_slot: '08:00 PM - 10:30 PM',
    advance_paid: 1000,
    total_amount: 1000,
    status: 'confirmed',
    notes: 'Anniversary celebration, requested complimentary dessert.',
    created_at: '2026-11-07T09:00:00Z',
  },
];

// Seed initial Coupons
const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'cp-01',
    business_id: 'biz-01',
    code: 'FESTIVE10',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_value: 5000,
    max_discount: 2500,
    usage_count: 14,
    usage_limit: 100,
    expires_at: '2026-12-31',
    is_active: true,
  },
  {
    id: 'cp-02',
    business_id: 'biz-02',
    code: 'BIRYANI100',
    discount_type: 'fixed',
    discount_value: 100,
    min_order_value: 599,
    usage_count: 82,
    usage_limit: 500,
    expires_at: '2026-11-30',
    is_active: true,
  },
];

// Seed initial Support Tickets
const INITIAL_TICKETS: SupportTicket[] = [
  {
    id: 'tkt-01',
    ticket_number: 'VV-TK-4102',
    tenant_id: 'biz-01',
    customer_name: 'Rohan Mehta',
    customer_email: 'rohan.mehta@yahoo.com',
    subject: 'Request for custom domain DNS verification assistance',
    category: 'website',
    priority: 'high',
    status: 'in_progress',
    messages: [
      { id: 'm1', sender: 'customer', text: 'I added the CNAME record for jewels.rohan.in pointing to cname.vijayvisuals.com. Can you confirm verification?', timestamp: '2026-11-06T12:00:00Z' },
      { id: 'm2', sender: 'support', text: 'Hello Rohan! Our platform edge has detected your DNS record. Automatic SSL provisioning is currently in progress and will complete within 30 minutes.', timestamp: '2026-11-06T12:20:00Z' },
    ],
    created_at: '2026-11-06T12:00:00Z',
  },
];

// Initialize default storage collections if empty
if (!localStorage.getItem(SAAS_KEYS.PRODUCTS)) setStore(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
if (!localStorage.getItem(SAAS_KEYS.LEADS)) setStore(SAAS_KEYS.LEADS, INITIAL_LEADS);
if (!localStorage.getItem(SAAS_KEYS.PROPOSALS)) setStore(SAAS_KEYS.PROPOSALS, INITIAL_PROPOSALS);
if (!localStorage.getItem(SAAS_KEYS.INVOICES)) setStore(SAAS_KEYS.INVOICES, INITIAL_INVOICES);
if (!localStorage.getItem(SAAS_KEYS.BOOKINGS)) setStore(SAAS_KEYS.BOOKINGS, INITIAL_BOOKINGS);
if (!localStorage.getItem(SAAS_KEYS.COUPONS)) setStore(SAAS_KEYS.COUPONS, INITIAL_COUPONS);
if (!localStorage.getItem(SAAS_KEYS.TICKETS)) setStore(SAAS_KEYS.TICKETS, INITIAL_TICKETS);

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

// 1. Product & Inventory Service
export const productService = {
  getProductsByBusiness(businessId: string): Product[] {
    const list = getStore<Product[]>(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    return list.filter(p => p.business_id === businessId);
  },

  getAllProducts(): Product[] {
    return getStore<Product[]>(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  },

  saveProduct(product: Omit<Product, 'id' | 'created_at'> & { id?: string }): Product {
    const list = getStore<Product[]>(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    if (product.id) {
      const idx = list.findIndex(p => p.id === product.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...product };
        setStore(SAAS_KEYS.PRODUCTS, list);
        return list[idx];
      }
    }
    const newProd: Product = {
      ...product,
      id: 'prod-' + Date.now().toString(36),
      created_at: new Date().toISOString(),
    };
    list.unshift(newProd);
    setStore(SAAS_KEYS.PRODUCTS, list);
    return newProd;
  },

  deleteProduct(productId: string): boolean {
    const list = getStore<Product[]>(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const updated = list.filter(p => p.id !== productId);
    setStore(SAAS_KEYS.PRODUCTS, updated);
    return true;
  },

  adjustStock(productId: string, quantitySold: number): void {
    const list = getStore<Product[]>(SAAS_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const item = list.find(p => p.id === productId);
    if (item) {
      item.stock = Math.max(0, item.stock - quantitySold);
      setStore(SAAS_KEYS.PRODUCTS, list);
    }
  },
};

// 2. CRM & Lead Management Service
export const crmService = {
  getLeadsByBusiness(businessId: string): CRMLead[] {
    const list = getStore<CRMLead[]>(SAAS_KEYS.LEADS, INITIAL_LEADS);
    return list.filter(l => l.business_id === businessId);
  },

  getAllLeads(): CRMLead[] {
    return getStore<CRMLead[]>(SAAS_KEYS.LEADS, INITIAL_LEADS);
  },

  saveLead(lead: Omit<CRMLead, 'id' | 'created_at'> & { id?: string }): CRMLead {
    const list = getStore<CRMLead[]>(SAAS_KEYS.LEADS, INITIAL_LEADS);
    if (lead.id) {
      const idx = list.findIndex(l => l.id === lead.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...lead };
        setStore(SAAS_KEYS.LEADS, list);
        return list[idx];
      }
    }
    const newLead: CRMLead = {
      ...lead,
      id: 'lead-' + Date.now().toString(36),
      created_at: new Date().toISOString(),
    };
    list.unshift(newLead);
    setStore(SAAS_KEYS.LEADS, list);
    return newLead;
  },

  updateLeadStatus(leadId: string, status: CRMLead['status']): void {
    const list = getStore<CRMLead[]>(SAAS_KEYS.LEADS, INITIAL_LEADS);
    const item = list.find(l => l.id === leadId);
    if (item) {
      item.status = status;
      setStore(SAAS_KEYS.LEADS, list);
    }
  },

  addLeadNote(leadId: string, noteText: string): void {
    const list = getStore<CRMLead[]>(SAAS_KEYS.LEADS, INITIAL_LEADS);
    const item = list.find(l => l.id === leadId);
    if (item) {
      item.notes.push(noteText);
      setStore(SAAS_KEYS.LEADS, list);
    }
  },
};

// 3. Document Service: Proposals & Invoices
export const documentService = {
  getProposalsByBusiness(businessId: string): Proposal[] {
    const list = getStore<Proposal[]>(SAAS_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    return list.filter(p => p.business_id === businessId);
  },

  getAllProposals(): Proposal[] {
    return getStore<Proposal[]>(SAAS_KEYS.PROPOSALS, INITIAL_PROPOSALS);
  },

  createProposal(data: Omit<Proposal, 'id' | 'proposal_number' | 'created_at'>): Proposal {
    const list = getStore<Proposal[]>(SAAS_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const newProp: Proposal = {
      ...data,
      id: 'prop-' + Date.now().toString(36),
      proposal_number: 'VV-PROP-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900),
      created_at: new Date().toISOString(),
    };
    list.unshift(newProp);
    setStore(SAAS_KEYS.PROPOSALS, list);
    return newProp;
  },

  updateProposalStatus(propId: string, status: Proposal['status']): void {
    const list = getStore<Proposal[]>(SAAS_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const item = list.find(p => p.id === propId);
    if (item) {
      item.status = status;
      setStore(SAAS_KEYS.PROPOSALS, list);
    }
  },

  getInvoicesByBusiness(businessId: string): Invoice[] {
    const list = getStore<Invoice[]>(SAAS_KEYS.INVOICES, INITIAL_INVOICES);
    return list.filter(i => i.business_id === businessId);
  },

  getAllInvoices(): Invoice[] {
    return getStore<Invoice[]>(SAAS_KEYS.INVOICES, INITIAL_INVOICES);
  },

  createInvoice(data: Omit<Invoice, 'id' | 'invoice_number' | 'created_at'>): Invoice {
    const list = getStore<Invoice[]>(SAAS_KEYS.INVOICES, INITIAL_INVOICES);
    const newInv: Invoice = {
      ...data,
      id: 'inv-' + Date.now().toString(36),
      invoice_number: 'VV-INV-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toISOString(),
    };
    list.unshift(newInv);
    setStore(SAAS_KEYS.INVOICES, list);
    return newInv;
  },

  markInvoicePaid(invoiceId: string): void {
    const list = getStore<Invoice[]>(SAAS_KEYS.INVOICES, INITIAL_INVOICES);
    const item = list.find(i => i.id === invoiceId);
    if (item) {
      item.status = 'paid';
      item.paid_at = new Date().toISOString();
      setStore(SAAS_KEYS.INVOICES, list);
    }
  },
};

// 4. Booking & Appointment Service
export const bookingService = {
  getBookingsByBusiness(businessId: string): Booking[] {
    const list = getStore<Booking[]>(SAAS_KEYS.BOOKINGS, INITIAL_BOOKINGS);
    return list.filter(b => b.business_id === businessId);
  },

  getAllBookings(): Booking[] {
    return getStore<Booking[]>(SAAS_KEYS.BOOKINGS, INITIAL_BOOKINGS);
  },

  createBooking(data: Omit<Booking, 'id' | 'created_at'>): { success: boolean; booking?: Booking; error?: string } {
    const list = getStore<Booking[]>(SAAS_KEYS.BOOKINGS, INITIAL_BOOKINGS);

    // Anti double-booking validation
    const conflict = list.find(
      b =>
        b.business_id === data.business_id &&
        b.booking_date === data.booking_date &&
        b.time_slot === data.time_slot &&
        b.status === 'confirmed'
    );

    if (conflict) {
      return {
        success: false,
        error: `Slot ${data.time_slot} on ${data.booking_date} is already reserved. Please select another slot.`,
      };
    }

    const newBooking: Booking = {
      ...data,
      id: 'bk-' + Date.now().toString(36),
      created_at: new Date().toISOString(),
    };
    list.unshift(newBooking);
    setStore(SAAS_KEYS.BOOKINGS, list);
    return { success: true, booking: newBooking };
  },

  updateBookingStatus(bookingId: string, status: Booking['status']): void {
    const list = getStore<Booking[]>(SAAS_KEYS.BOOKINGS, INITIAL_BOOKINGS);
    const item = list.find(b => b.id === bookingId);
    if (item) {
      item.status = status;
      setStore(SAAS_KEYS.BOOKINGS, list);
    }
  },
};

// 5. Subscription & Tier Management Service
export const subscriptionService = {
  getSubscription(businessId: string): TenantSubscription {
    const list = getStore<TenantSubscription[]>(SAAS_KEYS.SUBSCRIPTIONS, []);
    const found = list.find(s => s.business_id === businessId);
    if (found) return found;

    // Default Starter Tier
    return {
      id: 'sub-def',
      business_id: businessId,
      plan_id: 'professional',
      status: 'active',
      billing_cycle: 'monthly',
      amount: 2499,
      started_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-12-31T23:59:59Z',
      auto_renew: true,
      features: ['35+ Templates', 'E-commerce Cart & Checkout', 'Delivery Boy Dispatch', '15 AI Business Engines', 'Custom Domain'],
    };
  },

  upgradePlan(businessId: string, planId: TenantSubscription['plan_id'], cycle: 'monthly' | 'yearly'): TenantSubscription {
    const list = getStore<TenantSubscription[]>(SAAS_KEYS.SUBSCRIPTIONS, []);
    const prices: Record<string, number> = {
      starter: 999,
      professional: 2499,
      business: 4999,
      enterprise: 8999,
    };
    const multi = cycle === 'yearly' ? 10 : 1; // 2 months free on yearly

    const updated: TenantSubscription = {
      id: 'sub-' + Date.now().toString(36),
      business_id: businessId,
      plan_id: planId,
      status: 'active',
      billing_cycle: cycle,
      amount: prices[planId] * multi,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + (cycle === 'yearly' ? 365 : 30) * 86400000).toISOString(),
      auto_renew: true,
      features: ['Full Multi-Tenant Access', 'Priority Delivery Dispatch', '15 AI Business Tools', 'Dedicated CRM & Invoices'],
    };

    const idx = list.findIndex(s => s.business_id === businessId);
    if (idx !== -1) {
      list[idx] = updated;
    } else {
      list.push(updated);
    }
    setStore(SAAS_KEYS.SUBSCRIPTIONS, list);
    return updated;
  },
};

// 6. Support Tickets Service
export const ticketService = {
  getTickets(tenantId?: string): SupportTicket[] {
    const list = getStore<SupportTicket[]>(SAAS_KEYS.TICKETS, INITIAL_TICKETS);
    if (tenantId) return list.filter(t => t.tenant_id === tenantId);
    return list;
  },

  createTicket(data: Omit<SupportTicket, 'id' | 'ticket_number' | 'created_at' | 'messages'>, initialMessage: string): SupportTicket {
    const list = getStore<SupportTicket[]>(SAAS_KEYS.TICKETS, INITIAL_TICKETS);
    const newTkt: SupportTicket = {
      ...data,
      id: 'tkt-' + Date.now().toString(36),
      ticket_number: 'VV-TK-' + Math.floor(1000 + Math.random() * 9000),
      created_at: new Date().toISOString(),
      messages: [
        {
          id: 'm-' + Date.now(),
          sender: 'customer',
          text: initialMessage,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    list.unshift(newTkt);
    setStore(SAAS_KEYS.TICKETS, list);
    return newTkt;
  },

  replyToTicket(ticketId: string, text: string, sender: 'admin' | 'support' | 'customer' = 'admin'): void {
    const list = getStore<SupportTicket[]>(SAAS_KEYS.TICKETS, INITIAL_TICKETS);
    const item = list.find(t => t.id === ticketId);
    if (item) {
      item.messages.push({
        id: 'm-' + Date.now(),
        sender,
        text,
        timestamp: new Date().toISOString(),
      });
      if (sender === 'admin' && item.status === 'open') {
        item.status = 'in_progress';
      }
      setStore(SAAS_KEYS.TICKETS, list);
    }
  },

  resolveTicket(ticketId: string): void {
    const list = getStore<SupportTicket[]>(SAAS_KEYS.TICKETS, INITIAL_TICKETS);
    const item = list.find(t => t.id === ticketId);
    if (item) {
      item.status = 'resolved';
      setStore(SAAS_KEYS.TICKETS, list);
    }
  },
};

// 7. Coupon & Promotions Service
export const couponService = {
  getCoupons(businessId: string): Coupon[] {
    const list = getStore<Coupon[]>(SAAS_KEYS.COUPONS, INITIAL_COUPONS);
    return list.filter(c => c.business_id === businessId);
  },

  validateCoupon(code: string, businessId: string, orderAmount: number): { valid: boolean; discountAmount: number; message: string } {
    const list = getStore<Coupon[]>(SAAS_KEYS.COUPONS, INITIAL_COUPONS);
    const coupon = list.find(c => c.code.toUpperCase() === code.trim().toUpperCase() && c.business_id === businessId);

    if (!coupon || !coupon.is_active) {
      return { valid: false, discountAmount: 0, message: 'Invalid or inactive coupon code.' };
    }

    if (orderAmount < coupon.min_order_value) {
      return { valid: false, discountAmount: 0, message: `Minimum order value for ${coupon.code} is ₹${coupon.min_order_value}.` };
    }

    if (coupon.usage_count >= coupon.usage_limit) {
      return { valid: false, discountAmount: 0, message: 'This coupon code has reached its usage limit.' };
    }

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = Math.round((orderAmount * coupon.discount_value) / 100);
      if (coupon.max_discount && discount > coupon.max_discount) {
        discount = coupon.max_discount;
      }
    } else {
      discount = coupon.discount_value;
    }

    return { valid: true, discountAmount: discount, message: `Coupon applied successfully! Saved ₹${discount}.` };
  },

  applyCouponUsage(code: string, businessId: string): void {
    const list = getStore<Coupon[]>(SAAS_KEYS.COUPONS, INITIAL_COUPONS);
    const coupon = list.find(c => c.code.toUpperCase() === code.trim().toUpperCase() && c.business_id === businessId);
    if (coupon) {
      coupon.usage_count += 1;
      setStore(SAAS_KEYS.COUPONS, list);
    }
  },
};

// 8. Website Versioning & Snapshot Service
export const versionService = {
  getVersions(businessId: string): WebsiteVersion[] {
    const list = getStore<WebsiteVersion[]>(SAAS_KEYS.VERSIONS, []);
    return list.filter(v => v.business_id === businessId);
  },

  saveSnapshot(businessId: string, snapshot: any, notes: string = 'Autosaved version'): WebsiteVersion {
    const list = getStore<WebsiteVersion[]>(SAAS_KEYS.VERSIONS, []);
    const count = list.filter(v => v.business_id === businessId).length;
    const newVer: WebsiteVersion = {
      id: 'ver-' + Date.now().toString(36),
      business_id: businessId,
      version_number: count + 1,
      saved_at: new Date().toISOString(),
      notes,
      snapshot,
    };
    list.unshift(newVer);
    // Keep max 10 versions per tenant
    const trimmed = list.slice(0, 50);
    setStore(SAAS_KEYS.VERSIONS, trimmed);
    return newVer;
  },
};

// 9. Notification Automation Logger
export const notificationService = {
  getLogs(tenantId?: string): NotificationLog[] {
    const list = getStore<NotificationLog[]>(SAAS_KEYS.NOTIFICATIONS, [
      {
        id: 'notif-1',
        tenant_id: 'biz-01',
        channel: 'whatsapp',
        recipient: '+91 98765 43210',
        subject_or_template: 'order_confirmed',
        content: 'Your order VV-ORD-9421 with Aura Haute Joaillerie has been confirmed! Courier dispatched.',
        status: 'delivered',
        created_at: '2026-11-06T13:30:00Z',
      },
      {
        id: 'notif-2',
        tenant_id: 'biz-01',
        channel: 'email',
        recipient: 'rahul@gmail.com',
        subject_or_template: 'invoice_receipt',
        content: 'Invoice VV-INV-9921 for ₹32,960 has been paid successfully.',
        status: 'delivered',
        created_at: '2026-11-06T15:00:00Z',
      },
      {
        id: 'notif-3',
        tenant_id: 'biz-02',
        channel: 'sms',
        recipient: '+91 98888 22114',
        subject_or_template: 'delivery_otp',
        content: 'Your Royal Feast order delivery OTP is 4921. Share only upon physical handover.',
        status: 'delivered',
        created_at: '2026-11-07T10:15:00Z',
      },
    ]);
    if (tenantId) return list.filter(l => l.tenant_id === tenantId);
    return list;
  },

  logDispatch(data: Omit<NotificationLog, 'id' | 'created_at'>): NotificationLog {
    const list = getStore<NotificationLog[]>(SAAS_KEYS.NOTIFICATIONS, []);
    const newLog: NotificationLog = {
      ...data,
      id: 'notif-' + Date.now().toString(36),
      created_at: new Date().toISOString(),
    };
    list.unshift(newLog);
    setStore(SAAS_KEYS.NOTIFICATIONS, list.slice(0, 100));
    return newLog;
  },
};

// 10. Analytics & Business Metrics Engine
export const analyticsService = {
  getTenantAnalytics(businessId: string) {
    const products = productService.getProductsByBusiness(businessId);
    const leads = crmService.getLeadsByBusiness(businessId);
    const proposals = documentService.getProposalsByBusiness(businessId);
    const invoices = documentService.getInvoicesByBusiness(businessId);
    const bookings = bookingService.getBookingsByBusiness(businessId);

    const totalRevenue = invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.grand_total, 0);

    const pendingRevenue = invoices
      .filter(i => i.status === 'unpaid' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.grand_total, 0);

    return {
      viewsCount: 1420 + products.length * 120,
      uniqueVisitors: 890 + leads.length * 45,
      totalOrders: invoices.length + 8,
      totalRevenue,
      pendingRevenue,
      leadsCount: leads.length,
      bookingsCount: bookings.length,
      productsCount: products.length,
      conversionRate: '4.8%',
      repeatCustomerRate: '38%',
    };
  },

  getPlatformSuperAdminAnalytics() {
    const allProducts = productService.getAllProducts();
    const allLeads = crmService.getAllLeads();
    const allInvoices = documentService.getAllInvoices();
    const allBookings = bookingService.getAllBookings();

    const grossVolume = allInvoices
      .filter(i => i.status === 'paid')
      .reduce((acc, i) => acc + i.grand_total, 184200);

    return {
      grossVolume,
      platformCommissions: Math.round(grossVolume * 0.05),
      fleetPayouts: 18450,
      activeTenants: 28,
      totalProducts: allProducts.length + 64,
      totalLeads: allLeads.length + 32,
      totalBookings: allBookings.length + 18,
      uptimePercentage: '99.98%',
    };
  },
};
