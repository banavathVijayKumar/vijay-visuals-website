-- ============================================================================
-- VIJAY VISUALS — SAFE ROLLBACK FOR MIGRATION 0006
-- Drops ONLY tables introduced by 0006_global_i18n_seo_growth.sql.
-- Preserves all original production tables and migrations 0002-0005.
-- ============================================================================

DROP TABLE IF EXISTS abandoned_cart_reminders;
DROP TABLE IF EXISTS referral_conversions;
DROP TABLE IF EXISTS referral_affiliate_codes;
DROP TABLE IF EXISTS public_blog_posts;
DROP TABLE IF EXISTS exchange_rates_cache;
DROP TABLE IF EXISTS tenant_global_settings;
