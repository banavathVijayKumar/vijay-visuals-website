-- ============================================================================
-- VIJAY VISUALS — ROLLBACK FOR MIGRATION 0005
-- SAFE ROLLBACK: NEVER DROPS ORIGINAL 9 TABLES OR 0002 / 0003 / 0004 TABLES
-- ============================================================================

DROP TABLE IF EXISTS notification_logs;
DROP TABLE IF EXISTS platform_proposals;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS customer_addresses;
DROP TABLE IF EXISTS store_coupons;
DROP TABLE IF EXISTS review_photos;
DROP INDEX IF EXISTS idx_product_reviews_unique_purchase;
DROP TABLE IF EXISTS product_reviews;
