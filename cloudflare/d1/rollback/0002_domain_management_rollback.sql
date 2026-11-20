-- ============================================================================
-- VIJAY VISUALS — ROLLBACK FOR MIGRATION 0002 (DOMAIN MANAGEMENT ONLY)
-- SAFE ROLLBACK: NEVER DROPS ANY OF THE 9 ORIGINAL PRODUCTION D1 TABLES
-- ============================================================================

DROP INDEX IF EXISTS idx_domain_notifications_idempotent_milestone;
DROP TABLE IF EXISTS domain_health_checks;
DROP TABLE IF EXISTS domain_notifications;
DROP TABLE IF EXISTS domain_events;
DROP TABLE IF EXISTS domain_pricing_config;
DROP TABLE IF EXISTS tenant_domains;
