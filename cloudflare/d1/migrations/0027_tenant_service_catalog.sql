-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0027: TENANT SERVICE CATALOG
-- Additive, idempotent Preview-only source. Not applied by this local task.
-- Dedicated authoritative storage for tenant-specific services and pricing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  price_inr INTEGER NOT NULL DEFAULT 0 CHECK (price_inr >= 0),
  compare_at_price_inr INTEGER CHECK (compare_at_price_inr IS NULL OR compare_at_price_inr >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_url TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_services_website_active
  ON tenant_services(website_id, is_active, sort_order, id);
