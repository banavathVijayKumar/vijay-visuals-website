-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0011: CASHFREE PAYMENT GATEWAY LEDGER
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING TABLES (0001..0010)
-- Flow: Independent, secure Cashfree PG Sandbox/Production ledger and idempotency
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cashfree_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  cf_order_id TEXT,
  payment_session_id TEXT,
  entity_type TEXT NOT NULL DEFAULT 'platform_package' CHECK (
    entity_type IN ('platform_package', 'storefront_order', 'change_request_quote')
  ),
  reference_id TEXT NOT NULL,
  website_id TEXT,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_phone TEXT,
  base_amount_inr REAL NOT NULL CHECK (base_amount_inr >= 0),
  gst_amount_inr REAL NOT NULL DEFAULT 0 CHECK (gst_amount_inr >= 0),
  amount_inr REAL NOT NULL CHECK (amount_inr > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (
    status IN ('CREATED', 'PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')
  ),
  cf_payment_id TEXT,
  payment_method TEXT,
  payment_time TEXT,
  bank_reference TEXT,
  notes_json TEXT NOT NULL DEFAULT '{}',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  raw_webhook_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cashfree_payments_user ON cashfree_payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashfree_payments_website ON cashfree_payments(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashfree_payments_status ON cashfree_payments(status);
CREATE INDEX IF NOT EXISTS idx_cashfree_payments_session ON cashfree_payments(payment_session_id);
