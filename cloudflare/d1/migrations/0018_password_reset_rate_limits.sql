-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0018: PASSWORD RESET RATE LIMITS
-- STRICTLY ADDITIVE — local source only; no remote migration is performed here.
-- Stores only a hashed email key and timing metadata; no tokens or raw email.
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_rate_limits (
  email_hash TEXT PRIMARY KEY,
  last_requested_at INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
