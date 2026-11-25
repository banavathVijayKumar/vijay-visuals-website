-- ============================================================================
-- Migration 0015: Free Start Package & Multi-Tenant Builder Configuration
-- Enables ₹0 Free Start on Cloudflare Pages subdomains (/site/:slug)
-- with explicit free-tier resource bounds and one-click custom domain upgrade path.
-- Safe to run multiple times (INSERT OR IGNORE, CREATE INDEX IF NOT EXISTS).
-- ============================================================================

-- subscription_plans columns: code, name, monthly_price_inr, yearly_price_inr,
--   setup_fee_inr, gst_percent, max_websites, max_products, features_json,
--   is_active, updated_at  (no created_at column in this table)
INSERT OR IGNORE INTO subscription_plans (
  code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent,
  max_websites, max_products, features_json, is_active, updated_at
) VALUES (
  'free-start',
  'Free Start Package',
  0,
  0,
  0,
  0,
  1,
  15,
  '["1 Mobile-responsive business website across 35 industry templates","Free subdomain (/site/your-brand) on Cloudflare Pages","Up to 15 catalog products","WhatsApp direct enquiry & lead form","Standard Cloudflare edge delivery (100MB media storage)","Upgrade to custom domain & payment gateway anytime"]',
  1,
  datetime('now')
);

-- idx_tenant_domains_website already exists — IF NOT EXISTS is a no-op.
CREATE INDEX IF NOT EXISTS idx_tenant_domains_website ON tenant_domains(website_id);

-- idx_seller_payout_website does NOT yet exist — will be created.
CREATE INDEX IF NOT EXISTS idx_seller_payout_website ON seller_payout_accounts(website_id);

-- idx_tenant_subscriptions_owner already exists (single-column, owner_id only) — IF NOT EXISTS is a no-op.
-- Add a new composite index with a distinct name for status-filtered lookups.
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_owner_status ON tenant_subscriptions(owner_id, status);
