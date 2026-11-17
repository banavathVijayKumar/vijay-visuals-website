# Run from project root. Copy database_id from the create command into wrangler.toml.
npx wrangler d1 create vijay-visuals-marketplace
# After adding the DB binding to wrangler.toml:
npx wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/schema.sql
