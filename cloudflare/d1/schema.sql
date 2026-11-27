-- VIJAY VISUALS Marketplace - Cloudflare D1 (SQLite)
-- No invented prices are seeded. Admin must set actual prices before publishing services.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vv_users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'supabase',
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_services (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'sparkles',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  demo_enabled INTEGER NOT NULL DEFAULT 0 CHECK (demo_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_service_plans (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES ai_services(id) ON DELETE CASCADE,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly','yearly','one_time')),
  price_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'INR',
  usage_limit INTEGER,
  features_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service_id, billing_period),
  CHECK (price_minor IS NULL OR price_minor >= 0)
);

CREATE TABLE IF NOT EXISTS vv_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES vv_users(id),
  service_id TEXT NOT NULL REFERENCES ai_services(id),
  plan_id TEXT NOT NULL REFERENCES ai_service_plans(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','payment_pending','paid','failed','cancelled','refunded')),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vv_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES vv_users(id),
  service_id TEXT NOT NULL REFERENCES ai_services(id),
  plan_id TEXT NOT NULL REFERENCES ai_service_plans(id),
  order_id TEXT NOT NULL UNIQUE REFERENCES vv_orders(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','suspended')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vv_ai_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES vv_users(id),
  service_id TEXT NOT NULL REFERENCES ai_services(id),
  request_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success','error','blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vv_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_services_active_sort ON ai_services(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_ai_plans_service_active ON ai_service_plans(service_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vv_orders_user_created ON vv_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vv_subscriptions_user_status ON vv_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vv_usage_user_created ON vv_ai_usage(user_id, created_at DESC);

-- finance_ledger, tenant_memberships, delivery_assignments and store_orders are
-- created by the numbered migrations in this directory. Rider earnings use the
-- deterministic reference_id guard added in 0022_rider_earnings_idempotency.sql;
-- that unique index is optional for backwards compatibility with older previews.

-- Seed catalogue only; all prices remain unset and services remain inactive until Admin configures them.
INSERT OR IGNORE INTO ai_services
(id, slug, name, short_description, description, category, icon, is_active, demo_enabled, sort_order)
VALUES
('svc-whatsapp-assistant','whatsapp-ai-assistant','WhatsApp AI Assistant','Automate WhatsApp enquiries and replies.','Server-side WhatsApp automation integration; requires WhatsApp Business Platform credentials.','Messaging','message-circle',0,0,1),
('svc-customer-support','customer-support-ai','Customer Support AI','AI-assisted customer support workflows.','Support automation with secure provider configuration and usage controls.','Support','headset',0,0,2),
('svc-chatbot','ai-chatbot','AI Chatbot','A website chatbot for customer questions.','Website chatbot service using a configured AI provider.','Chatbots','bot',0,0,3),
('svc-order-management','order-management-automation','Order Management Automation','Automate order status and operations.','Order workflow automation; requires connected commerce data.','Operations','package',0,0,4),
('svc-appointment-booking','appointment-booking-ai','Appointment Booking AI','Assist customers with appointment booking.','Booking assistant; requires calendar/booking integration.','Bookings','calendar-check',0,0,5),
('svc-content-generator','ai-content-generator','AI Content Generator','Generate marketing and business content.','Text generation using configured server-side AI provider.','Content','pen-tool',0,0,6),
('svc-video-assistant','ai-video-editing-assistant','AI Video Editing Assistant','Assist with video editing workflows.','Editing assistant; does not claim to render or edit video until a real render engine is connected.','Creative','clapperboard',0,0,7);


-- Free demo requests are recorded separately from paid subscriptions.
CREATE TABLE IF NOT EXISTS vv_demo_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES vv_users(id),
  service_id TEXT NOT NULL REFERENCES ai_services(id),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','completed')),
  customer_note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vv_demo_user_created ON vv_demo_requests(user_id, created_at DESC);


-- AI website content generation is a separately entitled service.
INSERT OR IGNORE INTO ai_services
(id, slug, name, short_description, description, category, icon, is_active, demo_enabled, sort_order)
VALUES
('svc-website-builder-ai','ai-website-builder','AI Website Builder','Generate business website content and structure.','AI-assisted website content generation; requires an active plan configured by Admin.','Website','layout-template',0,0,8);
