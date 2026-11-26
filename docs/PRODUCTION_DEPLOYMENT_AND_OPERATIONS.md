# VIJAY VISUALS — PRODUCTION DEPLOYMENT, OPERATIONS & HANDOVER GUIDE

> **HISTORICAL / PARTIALLY SUPERSEDED RUNBOOK.** The endpoint table and migration examples below still mention Razorpay-era flows. Current policy is **Cashfree only**; do not configure or reintroduce Razorpay, Stripe or any other gateway. Historical Razorpay ledger data is preserved read-only. No Production action is authorized without separate owner approval; use the current `.env.example` and the Cashfree-only guidance in this repository for launch preparation.

**Existing Production Project**: `vijay-visuals-site` (`https://vijay-visuals-site.pages.dev`)  
**Existing GitHub Repository**: `https://github.com/banavathVijayKumar/vijay-visuals-website`  
**Existing Production Database**: Cloudflare D1 `vijay-visuals-marketplace` (`5e6c67d1-ccc0-4e98-a787-c6643e9f0f6c`, binding `DB`)  
**Existing Production Auth**: Supabase Auth (`@supabase/supabase-js` + `profiles` role table + `vv_users`)  
**Backend Runtime**: Cloudflare Pages Functions (`/functions/api/*` + `/functions/_middleware.ts`) — 100% Web-Standard Edge Runtime (no Express, no Node sockets, no Firebase in production)

---

## 1. API Reference (Cloudflare Pages Functions)

| Endpoint | Methods | Auth / Roles | Purpose |
|---|---|---|---|
| `/api/health` | `GET` | Public | Safe runtime health & integration booleans (zero secrets) |
| `/robots.txt`, `/sitemap.xml` | `GET` | Public | Dynamic per-host SEO crawl rules & sitemap from D1 |
| `/api/domains/resolve` | `GET` | Public | Resolves TLS-verified custom hostname to live tenant website |
| `/api/domains/pricing` | `GET` | Public | Transparent indicative TLD pricing + GST breakdown |
| `/api/domains/search` | `POST` | Public | Option B domain suggestions + honest registrar integration notice |
| `/api/domains/my` | `GET` | Authenticated User | Customer's websites, domains, DNS instructions, events, notifications |
| `/api/domains/websites/:websiteId` | `GET`, `POST` | Owner / Manager / Admin | List domains & connect existing domain (Option A, plan limit + UNIQUE) |
| `/api/domains/websites/:websiteId/:domainId` | `PATCH`, `DELETE` | Owner / Manager / Admin | Update registrar/WWW/primary/expiry or disconnect domain |
| `/api/domains/websites/:websiteId/:domainId/verify` | `POST` | Owner / Manager / Admin | Real Cloudflare DoH TXT/CNAME/A/WWW + live HTTPS probe |
| `/api/domains/websites/:websiteId/:domainId/health-check` | `POST` | Owner / Manager / Admin | Diagnostics recorded into `domain_health_checks` |
| `/api/domains/notifications/:id/read` | `PATCH` | Owner / Admin | Mark customer's own notification read |
| `/api/admin/domains` | `GET` | Platform Staff / Admin | Fleet KPIs, filter/search all customer domains & TLD config |
| `/api/admin/domains/:domainId/activity` | `GET` | Platform Staff / Admin | Domain immutable audit events, health checks, notifications |
| `/api/admin/domains/:domainId/action` | `PATCH` | Super Admin | Approve, reject, suspend, reactivate, confirm renewal, assign website |
| `/api/admin/domains/run-renewal-scan` | `POST` | Super Admin or `X-Cron-Secret` | Idempotent 30d/15d/7d/3d/0d expiry reminder scanner |
| `/api/admin/domains/export` | `GET` | Super Admin | Download CSV or JSON domain inventory |
| `/api/admin/domains/pricing/:extension` | `PUT` | Super Admin | Update indicative TLD registration/renewal/GST/fee |
| `/api/platform/onboarding` | `GET`, `POST` | Owner / Manager | Business profile, slug validation, branches, GST, handover & JSON export |
| `/api/platform/revisions` | `GET`, `POST` | Owner / Manager | Website Builder draft, publish, unpublish & revision restore |
| `/api/platform/subscriptions` | `GET`, `POST`, `PUT` | Public / Owner / Admin | 5-tier SaaS plans, GST invoice calculation, upgrade/cancel, Admin pricing |
| `/api/platform/payments` | `GET`, `POST` | Owner / Webhook | Dual money-flow overview & seller KYC submission (blocks unrouted seller orders) |
| `/api/payments/config` | `GET` | Public | Safe non-secret Razorpay mode & dual money-flow policy status |
| `/api/payments/platform/create-order` | `POST` | Authenticated Owner | Flow 1: Creates server-priced Razorpay order for Vijay Visuals account (`keyId` only) |
| `/api/payments/platform/verify` | `POST` | Authenticated Owner | Flow 1: Server-side HMAC-SHA256 verification + subscription activation |
| `/api/payments/platform/history` | `GET` | Owner / Super Admin | Lists platform website/subscription payment ledger |
| `/api/payments/platform/:id/refund` | `POST` | Super Admin | Refunds verified paid platform Razorpay payment |
| `/api/payments/seller/create-order` | `POST` | Buyer / Seller | Flow 2: Strictly requires verified Razorpay Route `acc_*` transfer (never Vijay Visuals account) |
| `/api/payments/seller/verify` | `POST` | Buyer / Seller | Flow 2: Server-side HMAC-SHA256 verification for routed seller store orders |
| `/api/payments/seller/transfers` | `GET`, `PATCH` | Owner / Super Admin | Flow 2: Seller settlement reports, KYC verification & Razorpay Route `acc_*` binding |
| `/api/payments/webhook` | `POST` | Razorpay Server | Raw-body `X-Razorpay-Signature` HMAC verification (`payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `transfer.processed`) |
| `/api/platform/commerce` | `GET`, `POST` | Public / Customer / Owner / Delivery | Products, server-side coupons, authenticated & guest COD checkout, customer address book, order history/tracking, cancel/return refunds, warehouses, suppliers, scoped delivery |
| `/api/platform/reviews` | `GET`, `POST`, `PATCH`, `DELETE` | Public / Customer / Owner / Admin | Verified-purchase reviews + photos, duplicate protection, owner replies, abuse flagging, Super Admin moderation |
| `/api/platform/shipping` | `GET`, `POST` | Owner / Staff | Indian pincode quotes, official Shiprocket AWB integration (honest `setup_required` fallback), verified-delivery status proof |
| `/api/platform/notifications` | `GET`, `POST` | Owner / Manager / Admin | Official Meta WhatsApp Cloud API, email/SMS status with consent enforcement & `notification_logs` |
| `/api/platform/proposals` | `GET`, `POST` | Public / Customer / Admin | 4 transparent website packages (`starter`, `professional`, `premium`, `custom_enterprise`), GST breakdown & explicit lock-in |
| `/api/platform/crm-finance` | `GET`, `POST` | Owner / Manager / Staff | CRM leads/consent, appointments, P&L/GST estimates, marketing campaigns |
| `/api/platform/media-support` | `GET`, `POST` | Owner / Staff / Admin | Quota-enforced media registry, support tickets, backup audit records |
| `/api/platform/ai-assistant` | `POST` | Owner / Manager / Staff | Tenant-grounded Gemini 9-tool AI studio across 12 Indian & global languages (`gemini-4-hydrogen`) |
| `/api/platform/global` | `GET`, `POST` | Public / Owner / Manager | 8 country presets, live FX rates (`open.er-api.com` + D1 cache, never fabricated), per-tenant global/tax/GSC/GBP settings |
| `/api/platform/seo-growth` | `GET`, `POST` | Public / Authenticated | Technical SEO audit tool, public blog & templates, GSC/GBP honest status, referral/affiliate codes, consent-gated abandoned cart reminders |
| `/api/platform/admin-summary` | `GET`, `POST` | Super Admin | Live D1 aggregates, audit logs, integration readiness, Platform Staff RBAC |

---

## 2. Backup, Migration, Deployment & Rollback Runbook (Approval Required Before Running)

> **STOP**: Do NOT run `--remote` migrations or merge to `main` until explicitly approved by the Vijay Visuals owner.

### Step 1: Backup Existing Production D1 Database FIRST
```bash
wrangler d1 export vijay-visuals-marketplace --remote \
  --output="backup-vijay-visuals-$(date +%Y%m%d-%H%M%S).sql"
```

### Step 2: Test Migrations Locally Before Touching Production
```bash
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/migrations/0002_domain_management.sql
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/migrations/0003_complete_platform_saas.sql
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/migrations/0004_razorpay_platform_payments.sql
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/migrations/0005_ecommerce_reviews_shipping_proposals.sql
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/migrations/0006_global_i18n_seo_growth.sql
```

### Step 2B: Apply Non-Destructive Supabase Auth & RLS Migration
Run `supabase/migrations/0001_vijay_visuals_rls_and_auth.sql` inside **Supabase Dashboard -> SQL Editor** to harden `public.profiles` RLS policies (prevents role self-escalation and auto-provisions profiles on signup).

### Step 3: Deploy Preview Branch First (Zero Impact on Production `main`)
```bash
git checkout -b feature/global-expansion-release
git add wrangler.toml public/_headers .env.example index.html cloudflare/ supabase/ functions/ src/ docs/
git commit -m "feat: add global 12-language i18n, live FX, SEO/growth hub, 9-tool AI studio & migration 0006"
git push -u origin feature/global-expansion-release
```
Cloudflare Pages automatically builds a preview URL (`https://feature-global-expansion-release.vijay-visuals-site.pages.dev`). Verify `/api/health`, `/api/payments/config`, `/api/platform/global?scope=countries`, `/api/platform/global?scope=rates`, `/api/platform/seo-growth?scope=blog`, `/robots.txt`, `/sitemap.xml`, and Supabase sign-in on Preview before merging.

### Step 4: Apply Strictly Additive Migrations to Production D1 (After Approval)
```bash
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/migrations/0002_domain_management.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/migrations/0003_complete_platform_saas.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/migrations/0004_razorpay_platform_payments.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/migrations/0005_ecommerce_reviews_shipping_proposals.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/migrations/0006_global_i18n_seo_growth.sql
```

### Step 5: Safe Additive Rollback (Preserves All 9 Original Production Tables)
```bash
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/rollback/0006_global_i18n_seo_growth_rollback.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/rollback/0005_ecommerce_reviews_shipping_proposals_rollback.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/rollback/0004_razorpay_platform_payments_rollback.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/rollback/0003_complete_platform_saas_rollback.sql
wrangler d1 execute vijay-visuals-marketplace --remote --file=cloudflare/d1/rollback/0002_domain_management_rollback.sql
```
To restore the full database snapshot if ever needed:
```bash
wrangler d1 execute vijay-visuals-marketplace --remote --file="backup-vijay-visuals-YYYYMMDD-HHMMSS.sql"
```

---

## 3. Infrastructure Cost Breakdown

| Phase | Scale | Services Used | Estimated Monthly Cost |
|---|---|---|---|
| **Phase 1 (Approved Now)** | Up to **100** custom domains | Cloudflare Pages Free (100 custom domains + Free Universal SSL), Cloudflare D1 Free (5 GB / 5M reads/day), Supabase Free Auth, Cloudflare DoH (`cloudflare-dns.com`) | **$0/month** (excl. optional Gemini API overage & payment gateway MDR) |
| **Phase 2 (Growth)** | **100 – 1,000+** custom domains | Cloudflare for SaaS Custom Hostnames (first 100 hostnames free, ~$0.10/hostname/mo after 100) + Cloudflare Workers Paid ($5/mo) + Cloudflare R2 (10 GB free) | **~$5–$15/month** base + $0.10/domain beyond 100 |
| **External Add-Ons (Optional)** | As enabled | Razorpay (~2% domestic MDR), WhatsApp Cloud API (per conversation), Resend/SMTP, Google Maps (monthly free credit tier) | Pay-as-you-go only when activated |

---

## 4. Customer Onboarding, Admin & Website Handover Guides

### Customer Onboarding Quick-Start
1. Sign in with your business account (Supabase Auth) and open **Website Builder / Onboarding**.
2. Enter Business Name (slug auto-generates cleanly, e.g., `Sri Lakshmi Fashion` -> `sri-lakshmi-fashion`), GSTIN (optional), address/coordinates, branches, and working hours.
3. Add products/services, configure COD or submit Seller Payout KYC (separate from Vijay Visuals billing), and click **Publish**.
4. Connect your custom domain under **Domains -> Option A (I already own a domain)** by adding the `_vijayvisuals` TXT record and CNAME to `vijay-visuals-site.pages.dev`, then click **Verify DNS**.

### Super Admin Governance Guide
- Use **Admin -> Domain Management** to inspect fleet KPIs, filter pending/error/expiring domains, review DNS/HTTPS health checks, update indicative TLD pricing, run renewal scans, export CSV, or suspend/reactivate domains (mandatory audit reason logged).
- Use **Admin -> Control Center** (`/api/platform/admin-summary`) to monitor live D1 aggregates, assign/revoke Platform Staff roles, and audit external integration status.
- Start Razorpay exclusively with `rzp_test_*` keys. Switch to `rzp_live_*` + `RAZORPAY_LIVE_APPROVED="true"` only after live test verification.

### Customer Website Handover & Continuity Checklist
1. **Account Ownership**: Confirm Business Owner email is verified in Supabase Auth and holds the `business_owner` role on `customer_website_publications`.
2. **Domain Ownership**: Confirm the customer owns their domain inside their own registrar account (never locked to Vijay Visuals).
3. **Payment Separation**: Confirm customer store payouts route to the seller's own bank/UPI/Razorpay Linked Account.
4. **Data Portability**: Run `GET /api/platform/onboarding?websiteId=<id>&export=json` to hand over a SHA-256 checksummed JSON export of website content, products, orders, CRM contacts, ledger, and media registry.

---

## 5. Future Native Android Application Readiness Note

Because all backend operations live behind version-clean JSON REST endpoints (`/api/domains/*`, `/api/platform/*`) authenticated via standard **Supabase JWT Bearer tokens** (`Authorization: Bearer <token>`), a future native Android app (Kotlin/Jetpack Compose or Flutter) can integrate directly with the exact same Cloudflare Pages Functions backend without rewriting any database schema or business logic. Scoped endpoints such as `GET /api/platform/commerce?scope=my_deliveries` and `POST /api/platform/commerce` (`update_delivery_status`) are already structured for lightweight mobile polling and Proof-of-Delivery workflows.
