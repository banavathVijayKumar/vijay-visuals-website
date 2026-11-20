-- ============================================================================
-- VIJAY VISUALS — ADDITIVE MIGRATION 0006
-- Global Expansion (Multi-Country, Multi-Currency FX Cache, 12-Language i18n),
-- Google Search Console / Google Business Profile Metadata, Public SEO Blog,
-- Referral & Affiliate Tracking, and Consent-Gated Abandoned Cart Reminders
--
-- NON-DESTRUCTIVE: Preserves all existing production and 0002-0005 tables.
-- ============================================================================

-- 1. PER-TENANT GLOBAL, TAX, REGIONAL SHIPPING, SEO & LOCAL DISCOVERY SETTINGS
CREATE TABLE IF NOT EXISTS tenant_global_settings (
  website_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'IN',
  primary_currency TEXT NOT NULL DEFAULT 'INR' CHECK (primary_currency IN ('INR', 'USD', 'GBP', 'EUR', 'AED')),
  default_language TEXT NOT NULL DEFAULT 'en',
  enabled_languages_json TEXT NOT NULL DEFAULT '["en","te","hi"]',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  address_format TEXT NOT NULL DEFAULT 'IN_PINCODE',
  tax_label TEXT NOT NULL DEFAULT 'GST',
  tax_rate_percent REAL NOT NULL DEFAULT 18 CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 50),
  tax_registration_id TEXT NOT NULL DEFAULT '',
  tax_provider_verified INTEGER NOT NULL DEFAULT 0 CHECK (tax_provider_verified IN (0, 1)),
  regional_shipping_json TEXT NOT NULL DEFAULT '[]',
  gsc_site_url TEXT NOT NULL DEFAULT '',
  gsc_verification_token TEXT NOT NULL DEFAULT '',
  gbp_place_id TEXT NOT NULL DEFAULT '',
  gbp_profile_url TEXT NOT NULL DEFAULT '',
  business_hours_json TEXT NOT NULL DEFAULT '{}',
  seo_meta_by_lang_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

-- 2. EXCHANGE RATES CACHE (RELIABLE LIVE FX SOURCE WITH TIMESTAMP — NEVER FAKE)
CREATE TABLE IF NOT EXISTS exchange_rates_cache (
  base_currency TEXT PRIMARY KEY,
  rates_json TEXT NOT NULL,
  provider_source TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. SEO-FRIENDLY PUBLIC BLOG & TUTORIALS
CREATE TABLE IF NOT EXISTS public_blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'guides',
  language TEXT NOT NULL DEFAULT 'en',
  author_name TEXT NOT NULL DEFAULT 'Vijay Visuals Editorial',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO public_blog_posts
  (slug, title, excerpt, content_markdown, category, language, seo_title, seo_description)
VALUES
  (
    'how-indian-small-businesses-launch-online-store',
    'How Indian Small Businesses Can Launch a Fast Online Store Without High Commissions',
    'A practical guide for clothing boutiques, restaurants, salons, and local shops to own their brand website, UPI/COD checkout, and customer data.',
    'Building an independent business website gives local merchants direct ownership of their domain, customer list, and repeat orders. Start with an industry template, add GST-ready product listings, enable Cash on Delivery first, and connect verified Razorpay Route payouts once KYC is approved.',
    'tutorials',
    'en',
    'Launch an Online Store for Indian Small Businesses | Vijay Visuals',
    'Step-by-step guide for Indian shop owners to build a custom website, manage GST invoices, connect custom domains, and grow organically.'
  ),
  (
    'technical-seo-checklist-local-businesses-india',
    'Technical SEO & Google Local Discovery Checklist for Shops and Studios',
    'Learn how clean canonical URLs, LocalBusiness JSON-LD schema, XML sitemaps, mobile speed, and genuine customer reviews improve search visibility.',
    'Search engines reward fast, accessible, well-structured websites. Ensure every page has a unique 30-60 character title, a clear 120-160 character description, accurate LocalBusiness hours and address schema, alt text on product images, and verified Google Search Console sitemap submission. Remember: no honest platform can guarantee the #1 Google spot, but technical discipline compounds organic traffic sustainably.',
    'seo',
    'en',
    'Local Business Technical SEO Checklist | Vijay Visuals',
    'Improve Google visibility ethically using sitemaps, LocalBusiness schema, hreflang multilingual tags, and verified customer reviews.'
  ),
  (
    'dual-flow-razorpay-route-marketplace-guide',
    'Understanding Platform Billing vs. Seller Direct Payouts with Razorpay Route',
    'Why transparent multi-tenant platforms keep software subscription fees completely separate from each shop owner''s customer order settlements.',
    'In a trustworthy commerce platform, website development and SaaS subscription fees settle into the platform account, while end-customer store orders settle directly to the verified shop owner via Razorpay Route Linked Accounts after KYC approval. Never mix seller revenue with personal accounts.',
    'payments',
    'en',
    'Razorpay Route Multi-Tenant Payment Separation Guide | Vijay Visuals',
    'How Vijay Visuals isolates platform subscription billing from individual shop owner customer settlements with HMAC verification and KYC.'
  );

-- 4. REFERRAL & AFFILIATE GROWTH SYSTEM
CREATE TABLE IF NOT EXISTS referral_affiliate_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  program_type TEXT NOT NULL DEFAULT 'referral' CHECK (program_type IN ('referral', 'affiliate')),
  commission_percent REAL NOT NULL DEFAULT 10 CHECK (commission_percent >= 0 AND commission_percent <= 30),
  clicks_count INTEGER NOT NULL DEFAULT 0,
  signups_count INTEGER NOT NULL DEFAULT 0,
  conversions_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referral_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referral_code TEXT NOT NULL,
  referred_email_hash TEXT NOT NULL,
  website_id TEXT,
  status TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'qualified', 'reward_pending', 'reward_settled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (referral_code) REFERENCES referral_affiliate_codes(referral_code) ON DELETE CASCADE
);

-- 5. CONSENT-GATED ABANDONED CART REMINDERS (ZERO UNCONSENTED MARKETING)
CREATE TABLE IF NOT EXISTS abandoned_cart_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  customer_user_id TEXT,
  customer_contact TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'in_app')),
  cart_items_json TEXT NOT NULL DEFAULT '[]',
  cart_total_inr INTEGER NOT NULL DEFAULT 0,
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  reminder_status TEXT NOT NULL DEFAULT 'pending' CHECK (reminder_status IN ('pending', 'sent', 'recovered', 'blocked_no_consent', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_website ON abandoned_cart_reminders(website_id, reminder_status);
