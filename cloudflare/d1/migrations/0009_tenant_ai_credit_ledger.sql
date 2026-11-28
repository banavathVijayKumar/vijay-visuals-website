-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0009: TENANT AI CREDIT LEDGER
-- Implements tenant-aware usage tracking, idempotent request handling,
-- and server-side monthly quota enforcement.
-- TESTED ON PREVIEW ONLY — DO NOT APPLY TO REMOTE PRODUCTION WITHOUT USER AUTHORIZATION.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Create tenant_ai_usage ledger table
CREATE TABLE IF NOT EXISTS tenant_ai_usage (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  tenant_rowid INTEGER,
  user_id TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  credits_deducted INTEGER NOT NULL DEFAULT 1,
  billing_period TEXT NOT NULL, -- Format: YYYY-MM
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked', 'reserved')),
  prompt_snippet TEXT,
  error_message TEXT,
  idempotency_scope TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes for efficient monthly aggregation, tenant isolation, and idempotency
CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_website_period 
  ON tenant_ai_usage(website_id, billing_period, status);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_request_id 
  ON tenant_ai_usage(request_id);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_request_scope
  ON tenant_ai_usage(request_id, idempotency_scope);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_tenant_period 
  ON tenant_ai_usage(tenant_rowid, billing_period, status);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_user_period 
  ON tenant_ai_usage(user_id, billing_period);
