-- Durable customer website publishing for VIJAY VISUALS.
CREATE TABLE IF NOT EXISTS customer_website_publications (
  website_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  public_slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  website_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','unpublished')),
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_website_publications_owner
  ON customer_website_publications(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_website_publications_public
  ON customer_website_publications(public_slug, status);
