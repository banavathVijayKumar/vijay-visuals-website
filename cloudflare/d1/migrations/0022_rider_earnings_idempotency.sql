-- ============================================================================
-- Rider earnings idempotency (preview/local hardening).
--
-- finance_ledger rows for rider earnings already use a deterministic
-- reference_id. The application checks for an existing row and uses a
-- conditional INSERT, but a durable database constraint closes the
-- concurrent-insert race as well. When this migration is not yet applied the
-- application-level in-flight guard and conditional INSERT still apply.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_website_category_reference
  ON finance_ledger(website_id, category, reference_id);
