-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0002: DOMAIN MANAGEMENT SYSTEM
-- STRICTLY ADDITIVE — DOES NOT DROP OR ALTER ANY OF THE 9 EXISTING D1 TABLES
-- Target database: vijay-visuals-marketplace (binding: DB)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Customer Connected & Requested Domains (globally unique hostname prevents takeover)
CREATE TABLE IF NOT EXISTS tenant_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  domain_name TEXT NOT NULL UNIQUE,
  domain_source TEXT NOT NULL DEFAULT 'external_owned' CHECK (domain_source IN ('external_owned', 'registrar_purchase')),
  registrar_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_dns' CHECK (
    status IN (
      'pending_dns',
      'dns_verifying',
      'dns_verified',
      'ssl_pending',
      'live',
      'dns_error',
      'ssl_error',
      'suspended',
      'disconnected',
      'expiring_soon',
      'expired',
      'rejected'
    )
  ),
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
  www_mode TEXT NOT NULL DEFAULT 'redirect_to_root' CHECK (www_mode IN ('redirect_to_root', 'redirect_to_www', 'both')),
  www_status TEXT NOT NULL DEFAULT 'pending' CHECK (www_status IN ('pending', 'verified', 'mismatch', 'not_configured')),
  dns_verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (dns_verification_status IN ('pending', 'verified', 'failed')),
  dns_verified_at TEXT,
  verification_token TEXT NOT NULL,
  dns_target TEXT NOT NULL DEFAULT 'vijay-visuals-site.pages.dev',
  ssl_status TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'provisioning', 'active', 'failed', 'not_checked')),
  ssl_issuer TEXT NOT NULL DEFAULT '',
  ssl_expires_at TEXT,
  purchase_status TEXT NOT NULL DEFAULT 'not_applicable',
  registrar_order_id TEXT NOT NULL DEFAULT '',
  expiry_date TEXT,
  renewal_date TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),
  auto_renew_supported INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew_supported IN (0, 1)),
  last_checked_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_website ON tenant_domains(website_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_owner ON tenant_domains(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_status ON tenant_domains(status);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_expiry ON tenant_domains(expiry_date);

-- 2. Immutable Domain Audit & Lifecycle Events
CREATE TABLE IF NOT EXISTS domain_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT NOT NULL DEFAULT 'system',
  reason TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (domain_id) REFERENCES tenant_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_events_domain ON domain_events(domain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_events_owner ON domain_events(owner_id, created_at DESC);

-- 3. Domain Notifications & Idempotent Renewal Milestones (30d/15d/7d/3d/0d)
CREATE TABLE IF NOT EXISTS domain_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  milestone_key TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  channels_json TEXT NOT NULL DEFAULT '{"in_app":"delivered","email":"setup_required_smtp","whatsapp":"setup_required_whatsapp"}',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (domain_id) REFERENCES tenant_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_notifications_owner ON domain_notifications(owner_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_notifications_idempotent_milestone
  ON domain_notifications(domain_id, milestone_key)
  WHERE milestone_key IS NOT NULL;

-- 4. Live DNS-over-HTTPS & Edge HTTPS Health Checks
CREATE TABLE IF NOT EXISTS domain_health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL,
  website_id TEXT NOT NULL,
  check_source TEXT NOT NULL DEFAULT 'cloudflare_doh',
  txt_matched INTEGER NOT NULL DEFAULT 0 CHECK (txt_matched IN (0, 1)),
  cname_matched INTEGER NOT NULL DEFAULT 0 CHECK (cname_matched IN (0, 1)),
  a_record_matched INTEGER NOT NULL DEFAULT 0 CHECK (a_record_matched IN (0, 1)),
  www_matched INTEGER NOT NULL DEFAULT 0 CHECK (www_matched IN (0, 1)),
  https_reachable INTEGER NOT NULL DEFAULT 0 CHECK (https_reachable IN (0, 1)),
  http_status INTEGER,
  observed_records_json TEXT NOT NULL DEFAULT '{}',
  error_summary TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (domain_id) REFERENCES tenant_domains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_health_checks_domain ON domain_health_checks(domain_id, checked_at DESC);

-- 5. Transparent Indicative TLD Pricing & GST Configuration (Super Admin Configurable)
CREATE TABLE IF NOT EXISTS domain_pricing_config (
  extension TEXT PRIMARY KEY,
  registration_inr INTEGER NOT NULL,
  renewal_inr INTEGER NOT NULL,
  gst_percent INTEGER NOT NULL DEFAULT 18,
  service_fee_inr INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  pricing_source TEXT NOT NULL DEFAULT 'indicative_estimate_requires_registrar_api',
  notes TEXT NOT NULL DEFAULT 'Indicative reference pricing only. Connect a live registrar API for real-time checkout prices.',
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO domain_pricing_config
  (extension, registration_inr, renewal_inr, gst_percent, service_fee_inr, is_enabled, pricing_source, notes)
VALUES
  ('.com', 999, 1199, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative reference rate. Verify final checkout price at your chosen registrar.'),
  ('.in', 599, 749, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative reference rate for Indian businesses. Verify at registrar.'),
  ('.co.in', 499, 649, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative reference rate. Verify at registrar.'),
  ('.org', 1099, 1299, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative reference rate. Verify at registrar.'),
  ('.shop', 399, 2699, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative first-year promo vs renewal estimate. Verify at registrar.'),
  ('.store', 499, 3499, 18, 0, 1, 'indicative_estimate_requires_registrar_api', 'Indicative first-year promo vs renewal estimate. Verify at registrar.');
