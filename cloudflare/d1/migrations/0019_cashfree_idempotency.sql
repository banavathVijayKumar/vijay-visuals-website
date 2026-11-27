-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0019: CASHFREE IDEMPOTENCY HARDENING
-- STRICTLY ADDITIVE — PRESERVES ALL HISTORICAL ROWS (INCLUDING EXISTING DUPLICATES)
--
-- Historical duplicate settlements/webhook events/notifications already exist
-- in Preview. Their new idempotency columns stay empty (''), so the partial
-- UNIQUE indexes below exclude them entirely. Nothing is deleted, merged,
-- rewritten or backfilled. New writes must supply a canonical identity key.
-- ============================================================================

ALTER TABLE payment_webhook_events ADD COLUMN payment_id_normalized TEXT NOT NULL DEFAULT '';
ALTER TABLE cashfree_seller_settlements ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
ALTER TABLE notification_logs ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';

-- One webhook event per (provider, event type, normalized payment ID).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_webhook_payment_identity
  ON payment_webhook_events(provider, event_type, payment_id_normalized)
  WHERE payment_id_normalized <> '';

-- One seller settlement per normalized gateway payment/order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_settlements_idempotency_key
  ON cashfree_seller_settlements(idempotency_key)
  WHERE idempotency_key <> '';

-- One notification log per recipient/event/idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_logs_idempotency_key
  ON notification_logs(recipient_contact, event_type, idempotency_key)
  WHERE idempotency_key <> '';
