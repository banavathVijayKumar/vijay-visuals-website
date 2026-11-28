-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0028: ORDER RETURN REQUESTS
-- Additive, idempotent Preview-only source. Not applied by this local task.
-- No existing table or enum is rebuilt; store_orders already supports
-- return_requested/returned and refunded payment status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_return_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  customer_user_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'completed')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT NOT NULL DEFAULT '',
  decision_note TEXT NOT NULL DEFAULT '',
  refund_reference TEXT NOT NULL DEFAULT '',
  restocked INTEGER NOT NULL DEFAULT 0 CHECK (restocked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_return_requests_website_created
  ON order_return_requests(website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON order_return_requests(status, requested_at DESC);
