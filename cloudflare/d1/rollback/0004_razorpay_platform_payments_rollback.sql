-- ============================================================================
-- VIJAY VISUALS — ROLLBACK FOR MIGRATION 0004 (RAZORPAY PAYMENT LEDGER ONLY)
-- SAFE ROLLBACK: NEVER DROPS ORIGINAL 9 TABLES OR 0002 / 0003 TABLES
-- ============================================================================

DROP TABLE IF EXISTS seller_payment_transfers;
DROP TABLE IF EXISTS platform_payments;
