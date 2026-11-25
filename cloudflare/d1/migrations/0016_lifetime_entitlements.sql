-- ============================================================================
-- Migration 0016: Explicit Lifetime Entitlements
-- Keeps tenant_subscriptions strictly monthly/yearly with real expiry.
-- Free Start and one-time website purchases are represented as lifetime
-- entitlements with no expiry column, instead of NULL/one_time subscriptions.
-- Strictly additive and repeatable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_lifetime_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  entitlement_type TEXT NOT NULL
    CHECK (entitlement_type IN ('free_start', 'one_time_purchase')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  source TEXT NOT NULL DEFAULT 'manual',
  source_reference TEXT NOT NULL DEFAULT '',
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_code) REFERENCES subscription_plans(code)
);

-- One Free Start website per owner for the lifetime of the account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_lifetime_free_owner
  ON tenant_lifetime_entitlements(owner_id)
  WHERE entitlement_type = 'free_start';

-- One active lifetime purchase per website; refunds/revocations free the slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_lifetime_purchase_website
  ON tenant_lifetime_entitlements(website_id)
  WHERE entitlement_type = 'one_time_purchase' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_tenant_lifetime_lookup
  ON tenant_lifetime_entitlements(website_id, owner_id, status);

CREATE INDEX IF NOT EXISTS idx_tenant_lifetime_owner
  ON tenant_lifetime_entitlements(owner_id, entitlement_type, status);

-- Separately maps platform payments to lifetime entitlements so the existing
-- subscription_id column keeps its original, accurate meaning.
CREATE TABLE IF NOT EXISTS platform_payment_entitlements (
  payment_id INTEGER PRIMARY KEY,
  entitlement_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_id) REFERENCES platform_payments(id) ON DELETE CASCADE,
  FOREIGN KEY (entitlement_id) REFERENCES tenant_lifetime_entitlements(id) ON DELETE CASCADE
);

-- Backfill legacy rows that tried to encode lifetime/free access as subscriptions.
INSERT OR IGNORE INTO tenant_lifetime_entitlements
  (website_id, owner_id, plan_code, entitlement_type, status, source, source_reference, acquired_at)
SELECT
  ts.website_id,
  ts.owner_id,
  ts.plan_code,
  CASE WHEN ts.plan_code = 'free-start' THEN 'free_start' ELSE 'one_time_purchase' END,
  'active',
  'legacy_backfill',
  COALESCE(ts.gateway_subscription_id, ''),
  ts.created_at
FROM tenant_subscriptions ts
WHERE (ts.plan_code = 'free-start' OR ts.billing_cycle = 'one_time' OR ts.current_period_end IS NULL)
  AND ts.id IN (
    SELECT MIN(id) FROM tenant_subscriptions GROUP BY website_id, owner_id, plan_code
  );

-- Link platform payments whose subscription_id pointed at a legacy lifetime row.
INSERT OR IGNORE INTO platform_payment_entitlements (payment_id, entitlement_id)
SELECT pp.id, tle.id
FROM platform_payments pp
JOIN tenant_subscriptions ts ON ts.id = pp.subscription_id
JOIN tenant_lifetime_entitlements tle
  ON tle.website_id = ts.website_id
 AND tle.owner_id = ts.owner_id
 AND tle.plan_code = ts.plan_code
WHERE ts.plan_code = 'free-start'
   OR ts.billing_cycle = 'one_time'
   OR ts.current_period_end IS NULL;
