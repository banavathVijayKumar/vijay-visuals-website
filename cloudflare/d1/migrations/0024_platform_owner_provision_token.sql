-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0024: PREVIEW-ONLY OWNER PROVISION TOKEN HASH
-- STRICTLY ADDITIVE — PREVIEW ONLY. DO NOT APPLY TO PRODUCTION.
-- Stores only a SHA-256 hash of the one-time browser token. The raw token is
-- never written to D1, source control, or any API response.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_owner_provision (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);
