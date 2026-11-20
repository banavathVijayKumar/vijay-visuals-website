-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0003: COMPLETE SAAS PLATFORM MODULES
-- STRICTLY ADDITIVE — PRESERVES ALL 9 ORIGINAL TABLES + 0002 DOMAIN TABLES
-- Target database: vijay-visuals-marketplace (binding: DB)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- A. 7-ROLE RBAC, PLATFORM STAFF, TENANT MEMBERSHIPS & PAYROLL/ATTENDANCE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  staff_role TEXT NOT NULL DEFAULT 'support_agent' CHECK (staff_role IN ('support_agent', 'onboarding_specialist', 'operations_manager')),
  permissions_json TEXT NOT NULL DEFAULT '["view_tickets","assist_onboarding","view_domains"]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  assigned_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('business_owner', 'business_manager', 'business_staff', 'delivery_partner')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  monthly_salary_inr INTEGER NOT NULL DEFAULT 0,
  commission_percent REAL NOT NULL DEFAULT 0,
  invited_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (website_id, user_id),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_website ON tenant_memberships(website_id, role);

CREATE TABLE IF NOT EXISTS staff_attendance_payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  membership_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'half_day', 'absent', 'leave')),
  check_in_at TEXT,
  check_out_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (membership_id, work_date),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES tenant_memberships(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- B. ONBOARDING PROFILES, BRANCHES, WEBSITE REVISIONS & TEMPLATES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_profiles (
  website_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  gst_number TEXT NOT NULL DEFAULT '',
  address_line TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  branches_json TEXT NOT NULL DEFAULT '[]',
  working_hours_json TEXT NOT NULL DEFAULT '{}',
  social_links_json TEXT NOT NULL DEFAULT '{}',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT NOT NULL DEFAULT '',
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0, 1)),
  handover_checklist_json TEXT NOT NULL DEFAULT '{"account_verified":false,"domain_configured":false,"payments_tested":false,"data_export_tested":false}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_owner ON business_profiles(owner_id);

CREATE TABLE IF NOT EXISTS website_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  revision_type TEXT NOT NULL DEFAULT 'draft' CHECK (revision_type IN ('draft', 'published', 'restored')),
  summary TEXT NOT NULL DEFAULT '',
  website_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_website_revisions_website ON website_revisions(website_id, version_number DESC);

CREATE TABLE IF NOT EXISTS website_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  preview_image_url TEXT NOT NULL DEFAULT '',
  default_sections_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO website_templates (id, name, category, description, default_sections_json)
VALUES
  ('tpl-retail-boutique', 'Retail & Fashion Boutique', 'retail', 'Mobile-first storefront with catalog, variants, WhatsApp inquiry, and branch map.', '["hero","featured_products","categories","testimonials","location_map","contact"]'),
  ('tpl-local-services', 'Local Services & Clinic', 'services', 'Appointment booking, service pricing table, GST info, and customer reviews.', '["hero","services","booking_form","gallery","faq","location_map"]'),
  ('tpl-restaurant-cafe', 'Restaurant & Cloud Kitchen', 'food', 'Menu showcase, combo offers, delivery zones, and direct order flow.', '["hero","menu","offers","gallery","location_map","contact"]'),
  ('tpl-b2b-wholesale', 'B2B Wholesale & Distributor', 'wholesale', 'Bulk catalog, inquiry quotes, GST billing details, and warehouse locations.', '["hero","catalog","bulk_quote","about","location_map","contact"]');

-- ----------------------------------------------------------------------------
-- C. SUBSCRIPTIONS, DUAL-FLOW PAYMENTS & RAZORPAY WEBHOOK IDEMPOTENCY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_inr INTEGER NOT NULL,
  yearly_price_inr INTEGER NOT NULL,
  setup_fee_inr INTEGER NOT NULL DEFAULT 0,
  gst_percent INTEGER NOT NULL DEFAULT 18,
  max_websites INTEGER NOT NULL DEFAULT 1,
  max_custom_domains INTEGER NOT NULL DEFAULT 1,
  max_products INTEGER NOT NULL DEFAULT 50,
  max_staff INTEGER NOT NULL DEFAULT 2,
  storage_quota_mb INTEGER NOT NULL DEFAULT 250,
  monthly_ai_credits INTEGER NOT NULL DEFAULT 50,
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO subscription_plans
  (code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, max_websites, max_custom_domains, max_products, max_staff, storage_quota_mb, monthly_ai_credits, features_json)
VALUES
  ('starter', 'Starter', 499, 4990, 0, 18, 1, 1, 50, 2, 250, 50, '["Responsive Website","1 Custom Domain","50 Products","Basic CRM","SSL via Cloudflare"]'),
  ('business', 'Business', 1499, 14990, 0, 18, 2, 2, 500, 10, 1024, 300, '["2 Websites","2 Custom Domains","500 Products","CRM + Bookings","Inventory & GST Reports","10 Staff"]'),
  ('ecommerce', 'E-Commerce Pro', 2999, 29990, 0, 18, 3, 5, 2500, 25, 5120, 1000, '["Full E-Commerce","5 Custom Domains","2500 Products","Multi-Warehouse Inventory","Delivery Partner App","Seller Payout Routing"]'),
  ('premium', 'Premium Growth', 5999, 59990, 0, 18, 5, 10, 10000, 50, 20480, 3000, '["5 Websites","10 Custom Domains","10000 Products","Priority Support","Advanced AI Automation","Custom Integrations"]'),
  ('enterprise', 'Enterprise', 14999, 149990, 0, 18, 25, 50, 100000, 250, 102400, 15000, '["Unlimited Scale Architecture","Cloudflare for SaaS Ready","Dedicated Onboarding","Custom SLA","Multi-Branch ERP"]');

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  base_amount_inr INTEGER NOT NULL DEFAULT 0,
  gst_amount_inr INTEGER NOT NULL DEFAULT 0,
  total_amount_inr INTEGER NOT NULL DEFAULT 0,
  setup_fee_inr INTEGER NOT NULL DEFAULT 0,
  payment_gateway TEXT NOT NULL DEFAULT 'razorpay',
  gateway_subscription_id TEXT NOT NULL DEFAULT '',
  current_period_start TEXT NOT NULL DEFAULT (datetime('now')),
  current_period_end TEXT NOT NULL DEFAULT (datetime('now', '+30 days')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_code) REFERENCES subscription_plans(code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_website ON tenant_subscriptions(website_id, status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_owner ON tenant_subscriptions(owner_id);

-- Separate Seller Payout Account (Flow 2: Customer -> Seller Business, never mixed with Platform SaaS billing)
CREATE TABLE IF NOT EXISTS seller_payout_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'razorpay_route',
  linked_account_id TEXT NOT NULL DEFAULT '',
  account_holder_name TEXT NOT NULL DEFAULT '',
  bank_ifsc TEXT NOT NULL DEFAULT '',
  bank_account_last4 TEXT NOT NULL DEFAULT '',
  upi_id TEXT NOT NULL DEFAULT '',
  kyc_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (kyc_status IN ('not_configured', 'pending_kyc', 'under_review', 'verified', 'rejected')),
  settlement_mode TEXT NOT NULL DEFAULT 'direct_seller_account' CHECK (settlement_mode IN ('direct_seller_account', 'cod_only', 'manual_upi_verification')),
  platform_commission_percent REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_type TEXT NOT NULL,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('platform_subscription', 'seller_order', 'domain_service')),
  reference_id TEXT NOT NULL DEFAULT '',
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0, 1)),
  payload_json TEXT NOT NULL DEFAULT '{}',
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- D. E-COMMERCE, INVENTORY, WAREHOUSES, SUPPLIERS & DELIVERY
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
  compare_at_price_inr INTEGER,
  gst_percent INTEGER NOT NULL DEFAULT 0,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  variants_json TEXT NOT NULL DEFAULT '[]',
  images_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_products_website ON store_products(website_id, is_active);

CREATE TABLE IF NOT EXISTS store_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  customer_user_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal_inr INTEGER NOT NULL DEFAULT 0,
  discount_inr INTEGER NOT NULL DEFAULT 0,
  gst_inr INTEGER NOT NULL DEFAULT 0,
  shipping_inr INTEGER NOT NULL DEFAULT 0,
  total_inr INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'razorpay_online', 'upi_manual')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  gateway_order_id TEXT NOT NULL DEFAULT '',
  gateway_payment_id TEXT NOT NULL DEFAULT '',
  order_status TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned')),
  return_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_orders_website ON store_orders(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer ON store_orders(customer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  gst_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  supplier_id INTEGER,
  po_number TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]',
  total_cost_inr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  warehouse_id INTEGER,
  delta_qty INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_in', 'sale_out', 'return_in', 'damage_out', 'manual_adjustment')),
  reference_note TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES store_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  delivery_partner_user_id TEXT NOT NULL,
  partner_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed_attempt', 'returned')),
  cod_amount_inr INTEGER NOT NULL DEFAULT 0,
  cod_collected INTEGER NOT NULL DEFAULT 0 CHECK (cod_collected IN (0, 1)),
  proof_of_delivery_note TEXT NOT NULL DEFAULT '',
  proof_of_delivery_url TEXT NOT NULL DEFAULT '',
  last_lat REAL,
  last_lng REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES store_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_partner ON delivery_assignments(delivery_partner_user_id, status);

-- ----------------------------------------------------------------------------
-- E. CRM, BOOKINGS, FINANCE ESTIMATES & CONSENT-BASED MARKETING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_contacts_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'website',
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT NOT NULL DEFAULT '',
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  unsubscribed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  follow_up_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_website_stage ON crm_contacts_leads(website_id, stage);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL,
  scheduled_start TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  assigned_staff_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finance_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale', 'expense', 'purchase', 'refund', 'tax_adjustment')),
  category TEXT NOT NULL DEFAULT 'general',
  amount_inr INTEGER NOT NULL,
  gst_inr INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  entry_date TEXT NOT NULL DEFAULT (date('now')),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_website_date ON finance_ledger(website_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'sms')),
  message_body TEXT NOT NULL,
  audience_filter TEXT NOT NULL DEFAULT 'consented_only',
  eligible_recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'setup_required')),
  status_detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- F. MEDIA QUOTAS, SUPPORT TICKETS, BACKUP AUDIT & DURABLE RATE LIMITING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_provider TEXT NOT NULL DEFAULT 'external_url',
  public_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_assets_website ON media_assets(website_id);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT,
  owner_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  assigned_staff_id TEXT,
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_owner ON support_tickets(owner_id, status);

CREATE TABLE IF NOT EXISTS backup_audit_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('platform_d1_export', 'tenant_json_export', 'website_revision_snapshot')),
  website_id TEXT,
  initiated_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded', 'verified', 'failed')),
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
