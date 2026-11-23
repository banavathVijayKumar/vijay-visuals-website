-- ============================================================================
-- VIJAY VISUALS — ROLLBACK SCRIPT FOR MIGRATION 0009
-- ============================================================================

DROP INDEX IF EXISTS idx_tenant_ai_usage_user_period;
DROP INDEX IF EXISTS idx_tenant_ai_usage_tenant_period;
DROP INDEX IF EXISTS idx_tenant_ai_usage_request_id;
DROP INDEX IF EXISTS idx_tenant_ai_usage_website_period;
DROP TABLE IF EXISTS tenant_ai_usage;
