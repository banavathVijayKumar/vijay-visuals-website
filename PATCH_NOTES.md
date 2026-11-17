# VIJAY VISUALS — integration patch notes

## Included changes
- Kept Supabase Auth as the identity provider.
- AI client now forwards the current Supabase access token to AI API routes.
- All seven Cloudflare AI endpoints now verify the Supabase bearer token and require an active D1 subscription before calling Gemini/Claude.
- Successful AI calls are written to `vv_ai_usage` in D1.
- AI usage stats are authenticated and return only the signed-in user's monthly usage.
- Removed unauthenticated in-memory quota mutation; the legacy endpoint now requires D1 admin role and directs admins to plan-level usage limits.
- Added the `ai-website-builder` service seed to D1 schema.
- Strengthened entitlement checks to require active service, active plan, and a subscription within its active dates.
- Added validation for non-negative plan usage limits.

## AI endpoint → D1 service mapping
- `/api/ai/website-generator` → `ai-website-builder`
- `/api/ai/support-chatbot` → `customer-support-ai`
- `/api/ai/content-writer`, `logo-generator`, `product-description`, `seo-generator`, `translate` → `ai-content-generator`

## Important deployment steps
1. Apply the updated `cloudflare/d1/schema.sql` to the existing D1 database. It is designed to be re-runnable (`IF NOT EXISTS` / `INSERT OR IGNORE`).
2. Ensure Cloudflare Pages has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `GEMINI_API_KEY` configured (API keys must be secrets where applicable).
3. In Marketplace Admin, activate the relevant services and create/activate plans with real prices and usage limits. No prices were invented or seeded.
4. Deploy the updated project and test using a real Supabase customer account and an active subscription.

## Validation status
- D1 schema executed successfully against SQLite in this audit environment.
- TypeScript/build could not be run here because this extracted ZIP does not include `node_modules` and `vite/client` types are unavailable in this environment.
- Razorpay live payments and Cloudflare production deployment were not tested here.
