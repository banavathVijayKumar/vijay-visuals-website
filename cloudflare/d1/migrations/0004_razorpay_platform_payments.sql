-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0004: RAZORPAY DUAL-FLOW LEDGER
-- STRICTLY ADDITIVE — PRESERVES ALL 9 ORIGINAL TABLES + 0002 + 0003 TABLES
-- Separates Flow 1 (Platform Website/Plan Payments -> Vijay Visuals Account)
-- from Flow 2 (Shop Owner Customer Store Payments -> Seller Linked Account)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Flow 1: Vijay Visuals Platform Payments (Website Purchases, Subscriptions, Domain Fees)
CREATE TABLE IF NOT EXISTS platform_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT,
  owner_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'platform_subscription' CHECK (
    purpose IN ('platform_subscription', 'website_purchase', 'domain_service', 'addon')
  ),
  plan_code TEXT NOT NULL DEFAULT '',
  plan_name TEXT NOT NULL DEFAULT '',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('one_time', 'monthly', 'yearly')),
  base_amount_inr INTEGER NOT NULL CHECK (base_amount_inr >= 0),
  setup_fee_inr INTEGER NOT NULL DEFAULT 0 CHECK (setup_fee_inr >= 0),
  gst_amount_inr INTEGER NOT NULL DEFAULT 0 CHECK (gst_amount_inr >= 0),
  amount_inr INTEGER NOT NULL CHECK (amount_inr > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  razorpay_mode TEXT NOT NULL DEFAULT 'test' CHECK (razorpay_mode IN ('test', 'live')),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  subscription_id INTEGER,
  refund_id TEXT,
  receipt TEXT NOT NULL DEFAULT '',
  notes_json TEXT NOT NULL DEFAULT '{}',
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_payments_owner ON platform_payments(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_payments_website ON platform_payments(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_payments_status ON platform_payments(status);

-- 2. Flow 2: Shop Owner Customer Store Payments (Strictly Routed to Seller Linked Account)
CREATE TABLE IF NOT EXISTS seller_payment_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  seller_owner_id TEXT NOT NULL,
  store_order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  buyer_user_id TEXT,
  seller_linked_account_id TEXT NOT NULL,
  gross_amount_inr INTEGER NOT NULL CHECK (gross_amount_inr > 0),
  platform_fee_inr INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_inr >= 0),
  seller_net_amount_inr INTEGER NOT NULL CHECK (seller_net_amount_inr > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  razorpay_mode TEXT NOT NULL DEFAULT 'test' CHECK (razorpay_mode IN ('test', 'live')),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_transfer_id TEXT,
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'paid_pending_transfer', 'routed', 'settled', 'failed', 'reversed')
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (store_order_id) REFERENCES store_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seller_transfers_website ON seller_payment_transfers(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_transfers_order ON seller_payment_transfers(store_order_id);
