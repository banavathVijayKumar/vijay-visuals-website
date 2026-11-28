-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 ROLLBACK 0029: TEMPLATE MARKETPLACE PRICING
-- Removes only inactive/zero-price placeholder tpl-* SKUs created by 0029.
-- Rows already configured by the Owner are retained to avoid silent data loss;
-- review and remove them deliberately if a full rollback is required.
-- ============================================================================

DELETE FROM subscription_plans
WHERE code LIKE 'tpl-%'
  AND is_active = 0
  AND monthly_price_inr = 0
  AND yearly_price_inr = 0;
