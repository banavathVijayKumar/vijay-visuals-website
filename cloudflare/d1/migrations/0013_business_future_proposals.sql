-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0013
-- BUSINESS FUTURE PREVIEW, LUXURY GOLD PROPOSAL PDF & MULTI-CHANNEL DELIVERY
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING TABLES (MIGRATIONS 0001..0012)
-- ============================================================================

-- 1. Extend platform_proposals with Business Profile, Feature Allocations & Delivery Tracking
ALTER TABLE platform_proposals ADD COLUMN secure_token TEXT;
ALTER TABLE platform_proposals ADD COLUMN business_logo_url TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN cover_image_url TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN business_photos_json TEXT DEFAULT '[]';
ALTER TABLE platform_proposals ADD COLUMN products_json TEXT DEFAULT '[]';
ALTER TABLE platform_proposals ADD COLUMN business_address TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN area TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN city TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN state TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN pincode TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN opening_hours TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN social_links_json TEXT DEFAULT '{}';
ALTER TABLE platform_proposals ADD COLUMN preferred_colors_json TEXT DEFAULT '{}';
ALTER TABLE platform_proposals ADD COLUMN feature_breakdown_json TEXT DEFAULT '[]';
ALTER TABLE platform_proposals ADD COLUMN package_tier TEXT DEFAULT 'STARTER';
ALTER TABLE platform_proposals ADD COLUMN packages_comparison_json TEXT DEFAULT '{}';
ALTER TABLE platform_proposals ADD COLUMN delivery_status TEXT DEFAULT 'draft';
ALTER TABLE platform_proposals ADD COLUMN view_count INTEGER DEFAULT 0;
ALTER TABLE platform_proposals ADD COLUMN last_viewed_at TEXT;
ALTER TABLE platform_proposals ADD COLUMN approved_at TEXT;
ALTER TABLE platform_proposals ADD COLUMN rejected_at TEXT;
ALTER TABLE platform_proposals ADD COLUMN rejection_reason TEXT DEFAULT '';
ALTER TABLE platform_proposals ADD COLUMN expires_at TEXT;
ALTER TABLE platform_proposals ADD COLUMN whatsapp_share_count INTEGER DEFAULT 0;
ALTER TABLE platform_proposals ADD COLUMN email_sent_count INTEGER DEFAULT 0;
ALTER TABLE platform_proposals ADD COLUMN cashfree_order_id TEXT DEFAULT '';

-- 2. Fast lookup index on secure token for customer public proposal view
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_proposals_token ON platform_proposals(secure_token);
CREATE INDEX IF NOT EXISTS idx_platform_proposals_status ON platform_proposals(delivery_status, created_at DESC);
