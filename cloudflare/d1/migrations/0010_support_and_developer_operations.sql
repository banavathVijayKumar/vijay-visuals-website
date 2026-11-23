-- ============================================================================
-- VIJAY VISUALS — MIGRATION 0010: SUPPORT & DEVELOPER OPERATIONS
-- Implements Website Change Requests, Quotations, and Developer Tasks
-- Purely additive: 100% safe, never modifies existing customer tables or data.
-- ============================================================================

-- 1. Website Change Requests & Quotation System (Module 4)
CREATE TABLE IF NOT EXISTS website_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  website_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'design_changes',
    'logo_banner',
    'product_content',
    'new_page',
    'website_redesign',
    'domain_dns',
    'payment_gateway',
    'checkout_orders',
    'bug_fix',
    'custom_feature',
    'general'
  )),
  is_bug_fix INTEGER NOT NULL DEFAULT 0 CHECK (is_bug_fix IN (0, 1)),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  ai_summary TEXT NOT NULL DEFAULT '',
  quotation_inr INTEGER NOT NULL DEFAULT 0 CHECK (quotation_inr >= 0),
  estimated_hours REAL NOT NULL DEFAULT 0 CHECK (estimated_hours >= 0),
  delivery_days INTEGER NOT NULL DEFAULT 1 CHECK (delivery_days >= 1),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'under_review',
    'quoted',
    'approved',
    'rejected',
    'in_progress',
    'review_ready',
    'completed',
    'cancelled'
  )),
  customer_notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_change_requests_website ON website_change_requests(website_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_owner ON website_change_requests(owner_id, status);

-- 2. Internal Developer Task Management (Module 5)
CREATE TABLE IF NOT EXISTS developer_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number TEXT NOT NULL UNIQUE,
  website_id TEXT NOT NULL,
  change_request_id INTEGER REFERENCES website_change_requests(id) ON DELETE SET NULL,
  ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'review_pending', 'completed', 'blocked')),
  assigned_developer_id TEXT NOT NULL,
  assigned_developer_name TEXT NOT NULL,
  estimated_hours REAL NOT NULL DEFAULT 0,
  actual_hours REAL NOT NULL DEFAULT 0,
  deadline TEXT,
  internal_notes TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  activity_log_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (website_id) REFERENCES customer_website_publications(website_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_developer_tasks_website ON developer_tasks(website_id, status);
CREATE INDEX IF NOT EXISTS idx_developer_tasks_dev ON developer_tasks(assigned_developer_id, status);
