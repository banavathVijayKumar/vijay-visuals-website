-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0023: PLATFORM OWNER SINGLETON
-- STRICTLY ADDITIVE — PREVIEW ONLY. DO NOT APPLY TO PRODUCTION.
-- The Owner is a platform-level role enforced by exactly one D1 row. It is not
-- vv_users.role='admin' (Super Admin) and not vv_users.role='customer'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_owner (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Founder & Creative Director',
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Expression index keeps the canonical email unique case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_owner_email ON platform_owner(LOWER(email));
