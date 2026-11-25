-- ============================================================================
-- Migration 0017: Customer Wishlist Persistence In Cloudflare D1
-- Additive only. Supabase Auth remains the identity provider; D1 is the
-- authoritative store for wishlist items. No Supabase REST table is required.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  product_id INTEGER NOT NULL CHECK (product_id > 0),
  website_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_wishlists_user_created
  ON customer_wishlists(user_id, created_at DESC);
