-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0026: PREVIEW COMPLETION TABLES
-- Additive, idempotent compatibility tables for API surfaces that already
-- exist in the codebase but had no D1 storage on the Preview deployment.
-- Applied only to the isolated Preview D1 database during this task.
-- ============================================================================

-- Customer feedback / feature requests consumed by /api/feedback.
CREATE TABLE IF NOT EXISTS platform_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  tenant_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'feedback',
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_feedback_created
  ON platform_feedback(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_tenant
  ON platform_feedback(tenant_id);

-- Multi-branch business locations consumed by owner location CRUD, live order
-- branch preview, and delivery origin distance ranking.
CREATE TABLE IF NOT EXISTS business_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL DEFAULT 'Main Branch',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  full_address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'India',
  latitude REAL,
  longitude REAL,
  place_id TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT 'Mon–Sat: 9:30 AM – 8:30 PM',
  location_source TEXT NOT NULL DEFAULT 'manual',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_business_locations_website_primary
  ON business_locations(website_id, is_primary DESC, id ASC);

-- Durable audit ledger consumed by writeAuditLog() and the Super Admin
-- ecosystem history feed. Historical rows are never modified or deleted here.
CREATE TABLE IF NOT EXISTS vv_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vv_audit_log_created
  ON vv_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vv_audit_log_entity
  ON vv_audit_log(entity_type, entity_id);

-- Public platform announcements created by /api/admin/announcements.
CREATE TABLE IF NOT EXISTS platform_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT 'Super Admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_active
  ON platform_announcements(active, created_at DESC);
