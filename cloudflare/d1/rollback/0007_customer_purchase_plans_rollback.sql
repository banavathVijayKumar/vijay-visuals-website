-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 ROLLBACK 0007: PLATFORM PACKAGES & ENTITLEMENTS
-- ============================================================================

DELETE FROM subscription_plans
WHERE code IN (
  'business-website',
  'starter-website',
  'ecommerce-website',
  'website-only',
  'website-plus-pwa',
  'custom-dev-enterprise'
);
