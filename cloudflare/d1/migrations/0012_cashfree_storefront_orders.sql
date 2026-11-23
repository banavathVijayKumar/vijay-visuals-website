-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0012: CASHFREE STOREFRONT & SETTLEMENTS
-- STRICTLY ADDITIVE & SAFE — PRESERVES ALL HISTORICAL DATA (0001..0011)
-- 1. Updates store_orders payment_method to support 'cashfree_online'
-- 2. Creates cashfree_seller_settlements ledger for merchant split reconciliation
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- 1. Migrate store_orders to allow 'cashfree_online' while preserving historical records
CREATE TABLE IF NOT EXISTS store_orders_dg_tmp (
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
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'cashfree_online', 'razorpay_online', 'upi_manual')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  gateway_order_id TEXT NOT NULL DEFAULT '',
  gateway_payment_id TEXT NOT NULL DEFAULT '',
  order_status TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN ('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned')),
  return_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

INSERT INTO store_orders_dg_tmp (
  id, order_number, website_id, owner_id, customer_user_id, customer_name,
  customer_phone, customer_email, shipping_address, items_json, subtotal_inr,
  discount_inr, gst_inr, shipping_inr, total_inr, coupon_code, payment_method,
  payment_status, gateway_order_id, gateway_payment_id, order_status, return_reason,
  created_at, updated_at
)
SELECT
  id, order_number, website_id, owner_id, customer_user_id, customer_name,
  customer_phone, customer_email, shipping_address, items_json, subtotal_inr,
  discount_inr, gst_inr, shipping_inr, total_inr, coupon_code, payment_method,
  payment_status, gateway_order_id, gateway_payment_id, order_status, return_reason,
  created_at, updated_at
FROM store_orders;

DROP TABLE store_orders;

ALTER TABLE store_orders_dg_tmp RENAME TO store_orders;

CREATE INDEX IF NOT EXISTS idx_store_orders_website ON store_orders(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_orders_customer ON store_orders(customer_user_id, created_at DESC);

-- 2. Create Cashfree Seller Settlement & Easy Split Ledger
CREATE TABLE IF NOT EXISTS cashfree_seller_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  store_order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  gross_amount_inr REAL NOT NULL CHECK (gross_amount_inr > 0),
  platform_fee_inr REAL NOT NULL DEFAULT 0 CHECK (platform_fee_inr >= 0),
  seller_payable_inr REAL NOT NULL CHECK (seller_payable_inr >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  settlement_status TEXT NOT NULL DEFAULT 'pending_activation' CHECK (
    settlement_status IN ('pending_activation', 'on_hold', 'reconciled', 'settled', 'refunded')
  ),
  settlement_mode TEXT NOT NULL DEFAULT 'cashfree_split_pending' CHECK (
    settlement_mode IN ('cashfree_split_pending', 'cashfree_split_active', 'manual_direct')
  ),
  cashfree_split_id TEXT,
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (store_order_id) REFERENCES store_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cf_settlements_website ON cashfree_seller_settlements(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cf_settlements_order ON cashfree_seller_settlements(store_order_id);
CREATE INDEX IF NOT EXISTS idx_cf_settlements_status ON cashfree_seller_settlements(settlement_status);

PRAGMA foreign_keys = ON;
