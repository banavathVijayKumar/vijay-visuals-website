-- ============================================================================
-- VIJAY VISUALS — CLOUDFLARE D1 MIGRATION 0005
-- REVIEWS & RATINGS, SHIPROCKET SHIPPING, COUPONS, REFUNDS, PROPOSALS,
-- NOTIFICATION LOGS, CUSTOMER ADDRESSES & ALL 9 INDUSTRY WEBSITE TEMPLATES
-- STRICTLY ADDITIVE — PRESERVES ALL EXISTING TABLES (ORIGINAL 9 + 0002..0004)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. SEED ALL 9 BUSINESS VERTICAL TEMPLATES (IDEMPOTENT INSERT OR IGNORE)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO website_templates (id, name, category, description, default_sections_json)
VALUES
  ('tpl-clothing-store', 'Clothing & Fashion Boutique', 'clothing', 'Lookbook hero, size/color variant catalog, wishlist, coupons, reviews, and branch map.', '["hero","featured_products","categories","size_guide","reviews","location_map","contact"]'),
  ('tpl-restaurant', 'Restaurant & Fine Dining', 'restaurant', 'Interactive food menu, table/order CTA, chef specials, customer reviews, and directions.', '["hero","menu","specials","reviews","gallery","location_map","contact"]'),
  ('tpl-cafe-bakery', 'Cafe & Artisan Bakery', 'cafe', 'Beverage & pastry showcase, combo offers, daily hours, Instagram gallery, and WhatsApp orders.', '["hero","menu","offers","gallery","reviews","location_map","contact"]'),
  ('tpl-grocery-mart', 'Grocery & Daily Mart', 'grocery', 'Category-filtered essentials, stock badges, delivery zones, coupons, and fast checkout.', '["hero","categories","catalog","offers","delivery_areas","contact"]'),
  ('tpl-beauty-salon', 'Beauty Salon & Spa', 'beauty_salon', 'Treatment menu, stylist portfolio, appointment booking, verified client reviews, and map.', '["hero","services","booking_form","gallery","reviews","location_map"]'),
  ('tpl-photography', 'Photography & Creative Studio', 'photography', 'High-res portfolio showcase, wedding/commercial packages, inquiry quote form, and reviews.', '["hero","portfolio","packages","testimonials","booking_form","contact"]'),
  ('tpl-real-estate', 'Real Estate & Property Advisors', 'real_estate', 'Property listings, floor plans, site-visit booking, locality map, and lead capture.', '["hero","listings","highlights","booking_form","location_map","contact"]'),
  ('tpl-gym-fitness', 'Gym & Fitness Center', 'gym', 'Membership plans, trainer profiles, class timetable, free trial form, and location map.', '["hero","plans","trainers","schedule","reviews","location_map"]'),
  ('tpl-small-business', 'Small Business & Local Brand', 'small_business', 'Clean responsive business website with services/products, reviews, WhatsApp CTA, and map.', '["hero","about","catalog","reviews","faq","location_map","contact"]');

-- ----------------------------------------------------------------------------
-- 2. VERIFIED CUSTOMER REVIEWS, PHOTOS & MODERATION (ZERO FAKE REVIEWS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  product_id INTEGER, -- NULL = overall shop review; non-null = specific product review
  order_id INTEGER,
  reviewer_user_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL,
  verified_purchase INTEGER NOT NULL DEFAULT 0 CHECK (verified_purchase IN (0, 1)),
  owner_reply TEXT NOT NULL DEFAULT '',
  owner_replied_at TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK (
    moderation_status IN ('published', 'flagged', 'hidden', 'removed')
  ),
  reported_count INTEGER NOT NULL DEFAULT 0,
  last_report_reason TEXT NOT NULL DEFAULT '',
  moderated_by TEXT,
  moderation_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES store_products(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES store_orders(id) ON DELETE SET NULL
);

-- Prevent duplicate reviews by the same customer for the same purchase & product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_reviews_unique_purchase
  ON product_reviews(website_id, COALESCE(product_id, 0), reviewer_user_id, COALESCE(order_id, 0));
CREATE INDEX IF NOT EXISTS idx_product_reviews_website ON product_reviews(website_id, moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, moderation_status);

CREATE TABLE IF NOT EXISTS review_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL,
  website_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_photos_review ON review_photos(review_id);

-- ----------------------------------------------------------------------------
-- 3. STORE COUPONS, CUSTOMER DELIVERY ADDRESSES & REFUNDS LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'flat')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  min_order_inr INTEGER NOT NULL DEFAULT 0 CHECK (min_order_inr >= 0),
  max_discount_inr INTEGER,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (website_id, code),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON customer_addresses(user_id);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('platform_payment', 'seller_order')),
  website_id TEXT,
  platform_payment_id INTEGER,
  store_order_id INTEGER,
  razorpay_payment_id TEXT NOT NULL DEFAULT '',
  razorpay_refund_id TEXT UNIQUE,
  amount_inr INTEGER NOT NULL CHECK (amount_inr >= 0),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (
    status IN ('requested', 'approved', 'created', 'processed', 'failed', 'rejected')
  ),
  requested_by TEXT NOT NULL DEFAULT '',
  processed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refunds_website ON refunds(website_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. SHIPMENTS & SHIPROCKET INTEGRATION LEDGER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  order_id INTEGER NOT NULL UNIQUE,
  order_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual', 'shiprocket', 'local_delivery')),
  shiprocket_order_id TEXT NOT NULL DEFAULT '',
  shiprocket_shipment_id TEXT NOT NULL DEFAULT '',
  awb_code TEXT NOT NULL DEFAULT '',
  courier_name TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  shipping_charge_inr INTEGER NOT NULL DEFAULT 0,
  delivery_pincode TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'awb_assigned', 'pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'rto_initiated', 'returned')
  ),
  verified_delivery_source TEXT NOT NULL DEFAULT '',
  last_tracking_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES store_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipments_website ON shipments(website_id, status);

-- ----------------------------------------------------------------------------
-- 5. CONFIGURABLE PACKAGES & LOCKED PROPOSALS / QUOTATIONS (SECTION 14)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_number TEXT NOT NULL UNIQUE,
  owner_id TEXT,
  website_id TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL,
  business_category TEXT NOT NULL DEFAULT 'small_business',
  package_code TEXT NOT NULL CHECK (package_code IN ('starter', 'professional', 'premium', 'custom_enterprise')),
  package_name TEXT NOT NULL,
  development_fee_inr INTEGER NOT NULL CHECK (development_fee_inr >= 0),
  maintenance_monthly_inr INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_monthly_inr >= 0),
  domain_hosting_yearly_inr INTEGER NOT NULL DEFAULT 0 CHECK (domain_hosting_yearly_inr >= 0),
  addons_json TEXT NOT NULL DEFAULT '[]',
  included_items_json TEXT NOT NULL DEFAULT '[]',
  excluded_items_json TEXT NOT NULL DEFAULT '[]',
  subtotal_inr INTEGER NOT NULL CHECK (subtotal_inr >= 0),
  gst_percent INTEGER NOT NULL DEFAULT 18,
  gst_inr INTEGER NOT NULL DEFAULT 0,
  grand_total_inr INTEGER NOT NULL CHECK (grand_total_inr >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted_locked', 'paid', 'expired', 'declined')),
  customer_confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_proposals_owner ON platform_proposals(owner_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 6. OFFICIAL NOTIFICATION DISPATCH LOG (WHATSAPP / EMAIL / SMS — CONSENT ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT,
  recipient_user_id TEXT,
  recipient_contact TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'whatsapp', 'email', 'sms')),
  event_type TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message_preview TEXT NOT NULL DEFAULT '',
  consent_verified INTEGER NOT NULL DEFAULT 0 CHECK (consent_verified IN (0, 1)),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('delivered', 'sent', 'setup_required', 'failed', 'blocked_no_consent')),
  provider_message_id TEXT NOT NULL DEFAULT '',
  error_detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_website ON notification_logs(website_id, created_at DESC);
