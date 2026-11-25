-- ============================================================================
-- Migration 0014: In-App 6-Digit Email OTP Authentication & Verification Ledger
-- Secure, salt-hashed OTP storage with server-side expiry and rate-limiting
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_email_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'registration' CHECK (purpose IN ('registration', 'password_recovery', 'login')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  resend_available_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_auth_email_otps_lookup ON auth_email_otps(email, purpose, consumed_at);
CREATE INDEX IF NOT EXISTS idx_auth_email_otps_expiry ON auth_email_otps(expires_at);
