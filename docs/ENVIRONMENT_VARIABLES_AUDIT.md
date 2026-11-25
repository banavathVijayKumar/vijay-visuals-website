# VIJAY VISUALS — COMPLETE ENVIRONMENT VARIABLES & SECRETS AUDIT

**Deployment Target**: Cloudflare Pages (`vijay-visuals-site`) + Cloudflare D1 (`vijay-visuals-marketplace`) + Supabase Auth  
**Security Rule**: NEVER paste secret values into source files, `.env` committed to Git, browser localStorage, or frontend `VITE_*` variables. Configure all secrets exclusively inside **Cloudflare Pages -> Settings -> Environment Variables (Encrypt / Secret)**.

---

## 1. Full 30+ Variable Production Audit Matrix

| # | Environment Variable | Requirement | Exact Service | Storage Type (Cloudflare Pages) | Safe Setup Instructions | Behavior When Not Configured |
|---|---|---|---|---|---|---|
| 1 | `VITE_SUPABASE_URL` | **Required** | Supabase Auth (Frontend + Edge) | Public Variable (Plaintext) | Copy Project URL from Supabase Dashboard -> Project Settings -> API. Set for both Production and Preview. | Auth endpoints return `503`; login disabled gracefully. |
| 2 | `VITE_SUPABASE_ANON_KEY` | **Required** | Supabase Auth (Frontend + Edge) | Public Variable (Plaintext — RLS-protected anon key) | Copy `anon` `public` key from Supabase -> API Settings. Must be paired with `supabase/migrations/0001_vijay_visuals_rls_and_auth.sql`. | Auth endpoints return `503`; login disabled gracefully. |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | **Optional** (Not needed for standard runtime) | Supabase Admin Bypass | **Cloudflare Secret (Encrypted)** — NEVER `VITE_*` | Only add if running server-side Supabase user management scripts. Never expose to client JS or Functions unless strictly required. | Standard Edge auth uses `VITE_SUPABASE_ANON_KEY` + user JWT (`GET /auth/v1/user`), so platform works securely without it. |
| 4 | `DATABASE_URL` | **Not Used in Production** (Legacy Local Express Only) | Local PostgreSQL (Dev only) | Do NOT set on Cloudflare Pages | Production uses Cloudflare D1 binding `DB` (`wrangler.toml`), NOT PostgreSQL `DATABASE_URL`. | Ignored by Cloudflare Pages Functions; D1 binding `DB` handles all persistence. |
| 5 | `RAZORPAY_KEY_ID` | **Required for Payments** | Razorpay (Flow 1 Platform + Flow 2 Route) | Server Var (Safe Public Key ID — `rzp_test_*` first) | Create Test keys in Razorpay Dashboard -> Account & Settings -> API Keys. Start with `rzp_test_*`; switch to `rzp_live_*` only after approval. | `/api/payments/config` reports `configured: false`; online checkout shows honest "Integration Required"; COD still works. |
| 6 | `RAZORPAY_KEY_SECRET` | **Required for Payments** | Razorpay Order Creation & HMAC Signature Verification | **Cloudflare Secret (Encrypted — Server Only)** | Add in Cloudflare Pages -> Environment Variables -> Mark as **Secret**. Never prefix with `VITE_`. | All Razorpay order creation & verification routes return `503` without exposing secrets. |
| 7 | `RAZORPAY_WEBHOOK_SECRET` | **Required for Payments** | Razorpay Server-to-Server Webhooks (`/api/payments/webhook`) | **Cloudflare Secret (Encrypted — Server Only)** | Generate a 32+ char random secret in Razorpay -> Webhooks (`https://vijay-visuals-site.pages.dev/api/payments/webhook`) for `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `transfer.processed`. | Webhook endpoint rejects all deliveries with `503` (never trusts unsigned payloads). |
| 8 | `RAZORPAY_LIVE_APPROVED` | **Safety Gate** (Optional, default `false`) | Vijay Visuals Live Payment Guard | Plaintext Server Variable | Leave unset or `"false"` during test mode. Set `"true"` ONLY when switching to `rzp_live_*` after owner approval. | Blocks `rzp_live_*` keys from creating live charges until explicitly approved. |
| 9 | `RAZORPAY_ROUTE_ENABLED` | **Required for Flow 2 Seller Online Payouts** | Razorpay Route (Marketplace Split Transfers) | Plaintext Server Variable (`"true"` / `"false"`) | Enable Razorpay Route on Vijay Visuals merchant account, complete marketplace KYC, then set `"true"`. | Flow 2 seller online checkout is strictly blocked (`503`) so seller revenue NEVER enters Vijay Visuals' personal account; COD remains available. |
| 10 | `VITE_RAZORPAY_KEY_ID` | **Optional** (Redundant — server supplies `keyId`) | Frontend Razorpay Checkout | Public Variable (if desired) | Optional because `/api/payments/platform/create-order` returns the safe `keyId` dynamically. Never put `KEY_SECRET` here. | Frontend uses `keyId` returned by server order-creation response. |
| 11 | `STRIPE_SECRET_KEY` | **Optional** (Not Active — Razorpay is primary for India) | Stripe Global Payments | **Cloudflare Secret (Encrypted)** | Only needed if expanding internationally outside India in a future phase. | Disabled; India payments use Razorpay. |
| 12 | `STRIPE_WEBHOOK_SECRET` | **Optional** (Not Active) | Stripe Webhooks | **Cloudflare Secret (Encrypted)** | Configure only when Stripe is activated. | Disabled. |
| 13 | `VITE_STRIPE_PUBLISHABLE_KEY` | **Optional** (Not Active) | Stripe Checkout UI | Public Variable | Configure only when Stripe is activated. | Disabled. |
| 14 | `CLOUDFLARE_API_TOKEN` | **Optional (Phase 2 Automation)** | Cloudflare Pages / Custom Hostnames API | **Cloudflare Secret (Encrypted)** | Create scoped API token (Cloudflare Pages Edit / SSL and Certificates Edit) when automating custom hostname provisioning. | Phase 1 uses free DNS verification via Cloudflare DoH (`cloudflare-dns.com`) + manual Pages Custom Domain binding up to 100 domains ($0/mo). |
| 15 | `CLOUDFLARE_ACCOUNT_ID` | **Optional (Phase 2 Automation)** | Cloudflare Pages API | Server Variable | Copy from Cloudflare Dashboard -> Account Home sidebar. | Manual Pages Custom Domain workflow in Phase 1. |
| 16 | `CLOUDFLARE_ZONE_ID` | **Optional (Phase 2 SaaS Hostnames)** | Cloudflare for SaaS | Server Variable | Copy from Cloudflare Zone Overview for primary domain when scaling past 100 domains. | Not required in Phase 1 (up to 100 custom domains on Pages Free). |
| 17 | `CLOUDFLARE_PAGES_PROJECT` | **Optional** (Defaults to `vijay-visuals-site`) | Cloudflare Pages | Server Variable | Set to `vijay-visuals-site`. | Defaults cleanly to `vijay-visuals-site`. |
| 18 | `R2_ACCESS_KEY_ID` | **Optional (Future Media Storage)** | Cloudflare R2 Object Storage | **Cloudflare Secret (Encrypted)** | Generate R2 API Token when migrating uploaded images/review photos to R2. | Media registry stores validated `https://` URLs with plan quota enforcement in D1. |
| 19 | `R2_SECRET_ACCESS_KEY` | **Optional (Future Media Storage)** | Cloudflare R2 Object Storage | **Cloudflare Secret (Encrypted)** | Paired with `R2_ACCESS_KEY_ID`. | Same as above. |
| 20 | `R2_BUCKET_NAME` | **Optional (Future Media Storage)** | Cloudflare R2 Bucket | Server Variable | Set to e.g. `vijay-visuals-media` after creating R2 bucket. | Media uploads use external HTTPS URLs until R2 is bound. |
| 21 | `R2_PUBLIC_URL` | **Optional (Future Media Storage)** | Cloudflare R2 Public CDN | Public Server Variable | Set custom R2 domain e.g. `https://media.vijayvisuals.com`. | Disabled until R2 bucket is provisioned. |
| 22 | `SMTP_HOST` | **Optional (Email Notifications)** | Email Relay (Note: Cloudflare Edge requires HTTPS relay like Resend/Postmark rather than raw TCP 587) | Server Variable | Configure HTTPS email API (`RESEND_API_KEY`) or external relay; Cloudflare Workers cannot open raw SMTP TCP sockets natively. | `/api/platform/notifications` logs honest `setup_required` status; in-app notifications work immediately. |
| 23 | `SMTP_PORT` | **Optional** | Email Relay | Server Variable | Used only on Node/external SMTP relays. | Honest `setup_required` fallback on Edge. |
| 24 | `SMTP_USER` | **Optional** | Email Relay | Server Variable | Paired with `SMTP_HOST`. | Honest `setup_required` fallback on Edge. |
| 25 | `SMTP_PASS` | **Optional** | Email Relay | **Cloudflare Secret (Encrypted)** | Paired with `SMTP_HOST`. | Honest `setup_required` fallback on Edge. |
| 26 | `SMTP_FROM` | **Optional** | Email Sender Address | Server Variable | E.g. `Vijay Visuals <no-reply@vijayvisuals.com>` after SPF/DKIM verification. | Honest `setup_required` fallback. |
| 27 | `WHATSAPP_CLOUD_API_TOKEN` | **Optional (Official WhatsApp)** | Meta WhatsApp Business Cloud API | **Cloudflare Secret (Encrypted)** | Generate permanent System User token in Meta Business Manager -> WhatsApp -> API Setup. | `/api/platform/notifications` returns honest `setup_required`; never fakes sent WhatsApp messages. |
| 28 | `WHATSAPP_PHONE_NUMBER_ID` | **Optional (Official WhatsApp)** | Meta WhatsApp Business Cloud API | Server Variable | Copy Phone Number ID from Meta Developer Portal -> WhatsApp -> API Setup. | Paired with `WHATSAPP_CLOUD_API_TOKEN`; returns `setup_required` if absent. |
| 29 | `SHIPROCKET_TOKEN` | **Optional (Live Shipping / AWB)** | Shiprocket Official Courier API | **Cloudflare Secret (Encrypted)** | Generate API user token in Shiprocket -> Settings -> API -> Configure. | `/api/platform/shipping` provides transparent pincode quotes and returns `503 setup_required` for AWB generation (never invents fake AWB numbers). |
| 30 | `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` | **Optional (Token Refresh)** | Shiprocket API Auth | **Cloudflare Secret (Encrypted)** | Optional dedicated Shiprocket API user credentials if implementing automated token rotation. | Uses `SHIPROCKET_TOKEN` directly or returns `setup_required`. |
| 31 | `SMS_PROVIDER_API_KEY` | **Optional (Transactional SMS)** | Indian DLT SMS Provider (MSG91 / Fast2SMS) | **Cloudflare Secret (Encrypted)** | Register DLT Entity + Templates first, then add API key. | Returns honest `setup_required` status. |
| 32 | `DOMAIN_REGISTRAR_PROVIDER` / `DOMAIN_REGISTRAR_API_KEY` | **Optional (Option B Live Domain Purchase)** | ResellerClub / GoDaddy / Cloudflare Registrar | **Cloudflare Secret (Encrypted)** | Only set after registrar reseller approval & wallet funding. | Option B shows indicative pricing + "Integration Required" notice; never fakes live availability or purchases. |
| 33 | `GEMINI_API_KEY` | **Optional (AI Business Assistant)** | Google Gemini API (`@google/genai`) | **Cloudflare Secret (Encrypted — Server Only)** | Generate API key in Google AI Studio and add as Cloudflare Secret. | `/api/platform/ai-assistant` returns honest `503` setup message; rest of platform works normally. |
| 34 | `GOOGLE_MAPS_API_KEY` / `VITE_GOOGLE_MAPS_API_KEY` | **Optional (Maps & Branch Picker)** | Google Maps Platform | Public Browser Key (HTTP-referrer restricted to `vijay-visuals-site.pages.dev/*`) | Restrict key by HTTP Referrer and Maps JS / Places / Geocoding APIs in Google Cloud Console. | Manual address entry + "Get Directions" links work cleanly without Maps JS key. |
| 35 | `CRON_SECRET` | **Recommended** | Scheduled Domain Renewal Scanner (`/api/admin/domains/run-renewal-scan`) | **Cloudflare Secret (Encrypted)** | Generate 32-byte random hex string; pass in `X-Cron-Secret` header from a scheduled Cloudflare Worker Cron Trigger. | Endpoint still works manually via authenticated Super Admin JWT. |
| 36 | `APP_URL` / `CUSTOM_DOMAIN_CNAME_TARGET` | **Recommended** | Platform Canonical URL & Custom Domain CNAME | Public Server Variable | Set `APP_URL=https://vijay-visuals-site.pages.dev` and `CUSTOM_DOMAIN_CNAME_TARGET=vijay-visuals-site.pages.dev`. | Defaults cleanly to `vijay-visuals-site.pages.dev`. |
| 37 | `RESEND_VERIFIED_SENDER_DOMAINS` | **Optional (Tenant Sender Identity)** | Verified email sender domains (comma-separated) | Public Server Variable | List only domains already verified in the email provider, e.g. `shop.example.test`. Customer emails fall back to neutral `Store Notifications <onboarding@resend.dev>` unless the tenant domain is both verified in D1 and present here. | Never spoof unverified customer domains; platform emails keep platform sender/branding. |

---

## 2. Minimum Required Variables to Launch Phase 1 Safely ($0/month)

To operate Vijay Visuals Phase 1 with authentication, multi-tenant D1 websites, verified reviews, coupons, proposals, and custom domain DNS verification:
1. Cloudflare D1 Binding: `DB` -> `vijay-visuals-marketplace` (`5e6c67d1-ccc0-4e98-a787-c6643e9f0f6c`) — already wired in `wrangler.toml`.
2. `VITE_SUPABASE_URL` (Public Var)
3. `VITE_SUPABASE_ANON_KEY` (Public Var)
4. `APP_URL=https://vijay-visuals-site.pages.dev` (Public Var)
5. `CUSTOM_DOMAIN_CNAME_TARGET=vijay-visuals-site.pages.dev` (Public Var)

To activate **Flow 1 Platform Payments** (Test Mode first):
6. `RAZORPAY_KEY_ID` (`rzp_test_*`)
7. `RAZORPAY_KEY_SECRET` (Encrypted Secret)
8. `RAZORPAY_WEBHOOK_SECRET` (Encrypted Secret)
9. `RAZORPAY_LIVE_APPROVED="false"` (switch to `"true"` only when moving to `rzp_live_*`)

To activate **Flow 2 Seller Store Online Payments** (strictly isolated from Vijay Visuals' personal account):
10. `RAZORPAY_ROUTE_ENABLED="true"` (only after Razorpay Route approval + seller KYC linked `acc_*` account verification)
