# VIJAY VISUALS — STAGED GLOBAL PRODUCTION RELEASE PLAN (STAGES 1–5)

> **SUPERSEDED / HISTORICAL RAZORPAY-ERA PLAN — DO NOT EXECUTE.** VIJAY VISUALS now uses **Cashfree only**. The Razorpay steps below are retained only as historical context; historical Razorpay records must be preserved, but no Razorpay credential, route, webhook or live mode may be configured or reintroduced. Use the current `.env.example` and the Cashfree-only guidance in this repository for any Preview or Production work.

**Brand Positioning**: `VIJAY VISUALS — Made in India. Built for the World. Empowering Every Business to Go Digital.`  
**Target Production Project**: `vijay-visuals-site` (`https://vijay-visuals-site.pages.dev`)  
**GitHub Repository**: `https://github.com/banavathVijayKumar/vijay-visuals-website`  
**Production Database**: Cloudflare D1 `vijay-visuals-marketplace` (`5e6c67d1-ccc0-4e98-a787-c6643e9f0f6c`)  
**Auth Provider**: Supabase Auth (`public.profiles` + RLS)

---

## Stage 1 — Pre-Release Backup, Secret Hygiene & Local Verification
1. Export full remote D1 snapshot before touching any schema:
   ```bash
   wrangler d1 export vijay-visuals-marketplace --remote --output="backup-vijay-visuals-$(date +%Y%m%d-%H%M%S).sql"
   ```
2. Verify zero secrets in Git working tree and `dist/` bundle (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `SHIPROCKET_PASSWORD`).
3. Verify `npm run build` (`vite build`) and `npm run lint` (`tsc --noEmit`) pass with zero errors.
4. Keep Razorpay strictly in **Test Mode** (`rzp_test_*`), `RAZORPAY_LIVE_APPROVED="false"`, and `RAZORPAY_ROUTE_ENABLED="false"` until Stage 4 & Stage 5 approvals.

## Stage 2 — Preview Branch Deployment & Automated Smoke Checks
1. Push changes to a preview branch (`feature/global-expansion-release`) — never push directly to `main`.
2. Execute migrations `0002` through `0006` on a local/preview D1 instance and apply `supabase/migrations/0001_vijay_visuals_rls_and_auth.sql` in Supabase SQL Editor.
3. Verify all critical endpoints on the Cloudflare Pages preview URL:
   - `GET /api/health`
   - `GET /api/payments/config` (confirm `mode: "test"`, `sellerRouteEnabled: false`)
   - `GET /api/platform/global?scope=countries` (confirm 8 countries & 12 languages)
   - `GET /api/platform/global?scope=rates` (confirm live/cached FX or honest `503` without fabricated rates)
   - `GET /api/platform/seo-growth?scope=blog` & `POST /api/platform/seo-growth` (`seo_audit`)
   - `GET /sitemap.xml` (confirm 12-language `xhtml:link hreflang` + published storefronts + blog URLs)
   - `GET /robots.txt`
4. Verify UI on desktop, tablet, and mobile viewports across English, Telugu (`te`), Hindi (`hi`), Tamil (`ta`), and Urdu (`ur` RTL `dir="rtl"`).

## Stage 3 — Production Database Migration & Controlled Release to `main` (Owner Approval Required)
1. Apply strictly additive migrations `0002` → `0006` sequentially to `--remote` D1 `vijay-visuals-marketplace`.
2. Merge preview branch to `main` after verifying Cloudflare Pages Secrets are configured (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `CRON_SECRET`).
3. Run live smoke tests on `https://vijay-visuals-site.pages.dev` covering existing customer websites, Supabase login, domain DNS wizard, 12-language switcher, FX display, and platform Razorpay **Test Mode** checkout.

## Stage 4 — External Provider Approvals & Payment Go-Live (Explicit Owner Approval Required)
- **Razorpay Live Mode (Platform Billing Only)**: Complete Razorpay KYC, configure live webhook endpoint `https://vijay-visuals-site.pages.dev/api/payments/webhook`, set `rzp_live_*` secrets and `RAZORPAY_LIVE_APPROVED="true"`, and verify ₹1 live end-to-end payment + webhook signature + refund.
- **Razorpay Route (Shop Owner Settlements)**: Obtain Razorpay Route marketplace activation, onboard pilot merchant Linked Account (`acc_*`), then enable `RAZORPAY_ROUTE_ENABLED="true"`. Until enabled, merchant storefronts safely support COD + verified manual invoice without routing customer sales to the Vijay Visuals owner account.
- **Optional External Integrations**: Configure `SHIPROCKET_EMAIL`/`SHIPROCKET_PASSWORD` (live AWB), `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` (Meta templates), `GSC_OAUTH_CLIENT_ID` (Google Search Console API), and domain registrar API credentials only when approved.

## Stage 5 — Post-Launch Monitoring, SEO Indexing & Instant Rollback Readiness
1. Submit `https://vijay-visuals-site.pages.dev/sitemap.xml` inside Google Search Console and verify custom domains via DNS TXT.
2. Monitor `/api/health`, `/api/platform/admin-summary`, Razorpay webhook logs, and `domain_health_checks`.
3. **Instant Rollback**:
   - **Frontend/Functions**: Roll back to the previous deployment in Cloudflare Pages -> Deployments (1-click instant rollback).
   - **Database Schema**: Execute rollback scripts in reverse order (`0006` → `0005` → `0004` → `0003` → `0002`), which drop ONLY newly added tables while preserving all 9 original production D1 tables untouched.
