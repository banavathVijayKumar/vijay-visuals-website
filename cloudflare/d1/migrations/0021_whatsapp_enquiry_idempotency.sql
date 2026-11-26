-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0021: WHATSAPP ENQUIRY IDEMPOTENCY
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING ROWS.
--
-- 1. Durable CRM lead dedupe: a canonical enquiry fingerprint is stored on the
--    lead. A partial UNIQUE index makes the INSERT/IGNORE claim atomic across
--    concurrent requests. Historical rows keep an empty fingerprint and are
--    excluded from the index.
-- 2. Atomic WhatsApp send claim: only one request may hold the "processing"
--    state for a key. "sent" and "failed" are terminal states; an uncertain
--    in-progress claim is NEVER automatically retried. This is an at-most-once
--    send claim, not an exactly-once delivery guarantee.
-- ============================================================================

ALTER TABLE crm_contacts_leads ADD COLUMN enquiry_fingerprint TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_leads_enquiry_fingerprint
  ON crm_contacts_leads(website_id, source, enquiry_fingerprint)
  WHERE enquiry_fingerprint <> '';

CREATE TABLE IF NOT EXISTS whatsapp_send_claims (
  claim_key TEXT PRIMARY KEY,
  recipient_contact TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  website_id TEXT,
  state TEXT NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'sent', 'failed')),
  provider_message_id TEXT NOT NULL DEFAULT '',
  error_detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_claims_state
  ON whatsapp_send_claims(state, updated_at);
