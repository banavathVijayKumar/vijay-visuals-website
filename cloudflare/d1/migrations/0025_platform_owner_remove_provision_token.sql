-- ============================================================================
-- VIJAY VISUALS — D1 MIGRATION 0025: REMOVE PREVIEW OWNER PROVISION TOKEN
-- PREVIEW ONLY. DO NOT APPLY TO PRODUCTION.
-- The singleton Owner binding is complete and the token is consumed. Remove the
-- token registry so no hashed or consumed provisioning credential remains.
-- The platform_owner singleton table from 0023 is intentionally preserved.
-- ============================================================================

DROP TABLE IF EXISTS platform_owner_provision;
