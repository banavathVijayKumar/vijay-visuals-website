-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0020: CASHFREE SETTLEMENT KEY ENFORCEMENT
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING ROWS (INCLUDING HISTORICAL DUPLICATES)
--
-- Root cause of the three-row regression: the old webhook and verify INSERTs
-- omitted `idempotency_key`, so the column's DEFAULT '' was written. The
-- partial UNIQUE index from 0019 deliberately excludes '' keys in order to
-- preserve historical duplicates, which let those inserts create unlimited
-- rows. The application paths now supply the canonical key derived from the
-- gateway order + lossless payment ID. These triggers close the bypass for
-- all future writes without deleting, rewriting, or backfilling any row.
-- ============================================================================

-- Reject any new settlement whose key is NULL or blank/whitespace. Existing
-- rows are untouched because triggers only fire on INSERT/UPDATE operations.
CREATE TRIGGER IF NOT EXISTS trg_cashfree_settlements_require_idempotency_key
BEFORE INSERT ON cashfree_seller_settlements
WHEN NEW.idempotency_key IS NULL OR TRIM(NEW.idempotency_key) = ''
BEGIN
  SELECT RAISE(ABORT, 'cashfree_seller_settlements.idempotency_key must be a canonical non-empty key');
END;

-- Prevent clearing a canonical key on UPDATE, which would re-open the bypass.
CREATE TRIGGER IF NOT EXISTS trg_cashfree_settlements_keep_idempotency_key
BEFORE UPDATE OF idempotency_key ON cashfree_seller_settlements
WHEN NEW.idempotency_key IS NULL OR TRIM(NEW.idempotency_key) = ''
BEGIN
  SELECT RAISE(ABORT, 'cashfree_seller_settlements.idempotency_key cannot be cleared');
END;
