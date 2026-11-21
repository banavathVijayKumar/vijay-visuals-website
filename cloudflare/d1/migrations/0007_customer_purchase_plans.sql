-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0007: PLATFORM PACKAGES & ENTITLEMENTS
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING TABLES (0001..0006)
-- Ensures the ₹7,999 Business Website package and official website packages
-- exist in subscription_plans for server-side order calculation & verification.
-- ============================================================================

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO subscription_plans
  (code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, max_websites, max_custom_domains, max_products, max_staff, storage_quota_mb, monthly_ai_credits, features_json, is_active)
VALUES
  (
    'business-website',
    'Business Website Package',
    7999,
    7999,
    0,
    18,
    1,
    1,
    50,
    2,
    250,
    50,
    '["Access to own website management dashboard","Edit website design, colours, layout and content","Upload, replace and manage photos and banners","Add, edit and delete products or services","Manage product prices, descriptions and categories","Manage orders and customer information","View reports and website analytics where supported","Manage website settings and publish/unpublish controls","Custom domain connection (customer provides own domain)"]',
    1
  ),
  (
    'starter-website',
    'Starter Website Package',
    2999,
    2999,
    0,
    18,
    1,
    1,
    50,
    2,
    5120,
    100,
    '["Mobile-responsive business website across 16 industry templates","Temporary preview subdomain (/site/your-brand) + custom domain DNS wizard","Contact, WhatsApp enquiry, Call & Quote Request lead forms","Technical SEO essentials (meta tags, sitemap.xml, robots.txt, JSON-LD)"]',
    1
  ),
  (
    'ecommerce-website',
    'E-Commerce Website Package',
    14999,
    14999,
    0,
    18,
    2,
    2,
    2500,
    15,
    25600,
    500,
    '["Full e-commerce storefront with categories, variants, stock alerts & coupons","Cart, wishlist, COD/UPI & Razorpay checkout, GST invoices & order tracking","Wholesale B2B tiers, customer reviews, sales reports & refund tracking","Includes all Business Website SEO, custom domain DNS & CRM capabilities"]',
    1
  ),
  (
    'website-only',
    'Website-Only Business Package',
    14999,
    14999,
    0,
    18,
    1,
    1,
    1000,
    10,
    10240,
    250,
    '["Responsive business website & e-commerce storefront","Custom branding (logo, banner, colors, fonts)","Unique /site/your-brand URL & custom domain support","Inventory, orders, GST invoice generator & COD / UPI checkout","Owner, Customer & Delivery Partner dashboards"]',
    1
  ),
  (
    'website-plus-pwa',
    'Website + Optional Branded PWA Add-On',
    22999,
    22999,
    0,
    18,
    2,
    2,
    2500,
    20,
    25600,
    750,
    '["Everything in Website-Only Business Package","Branded Progressive Web App (custom app name, icon, splash theme & manifest)","Installable on supported Android Chrome & iOS Safari browsers","Offline page caching & synchronized customer login","Server-side PWA license verification"]',
    1
  ),
  (
    'custom-dev-enterprise',
    'Custom Development & Multi-Branch Enterprise',
    49999,
    49999,
    0,
    18,
    10,
    20,
    50000,
    100,
    102400,
    5000,
    '["Bespoke UX architecture & custom ERP / POS integrations","Dedicated multi-branch inventory & wholesale B2B pricing tiers","Custom WhatsApp Business Cloud API & Razorpay webhook deployment","Priority engineering SLA with Vijay Visuals"]',
    1
  );
