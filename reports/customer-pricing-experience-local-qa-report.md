# Customer Pricing Experience — Local Content Safety & QA Report

Date: 2026-11-28  
Branch: `preview/vijay-visuals-p0-safe-2026-11-26`  
Base commit: `f58728bd8446e763b3dbaf09466a265f0d948d85`  
Scope: **Preview source, local reports and the approved Preview-only release**. Content-safety QA was completed locally before the authorized commit/push/deploy. No Production, D1, Supabase, DNS, domain registrar, hosting, Cashfree Live, OTP, email, message, payment, refund, payout or external approval action was performed.

---

## 1. Final outcome

The misleading-claim cleanup is complete in source and locally verified.

- All **36 templates** now describe editable design layouts and configured platform capabilities. Delivery-time promises, cold-chain guarantees, 360° viewer promises, AI-engine promises, warranty/certification promises and similar unsupported outcomes were removed or explicitly marked as not included.
- Customer-facing tax copy uses the exact wording: **`Applicable taxes will be confirmed before payment.`** No verified GST rate or tax-invoice promise is shown in customer marketing copy.
- The free tier shows **`Total ₹0 · no tax`**. Paid optional services remain separate and are not folded into the ₹0 total.
- The ₹7,999 package keeps its base price and shows the selected template at **₹0**. Custom domain connection/setup is explicitly **not** a free domain; registration, renewal and hosting are separate.
- The ₹14,999 e-commerce tier advertises only implemented behaviour. Automated stock alerts, GST invoices, custom fulfilment and ERP/POS/AI engines are marked not included or separately quoted.
- The Sri Lakshmi Silks & Boutique fixture is labelled **`Illustrative Demo — Not a real business`**; its phone, address, hours, delivery, returns, reviews and products are fictional, and write/contact/payment paths are blocked. Real tenant storefronts are unaffected.
- Genuine Cashfree-verified entitlement remains externally **BLOCKED**; no mock or browser return was allowed to claim `verified: true`.

**Final classification:** local implementation QA **PASS — 23 checks, 0 failed**. External proof items: **BLOCKED 2** (genuine verified payment-to-entitlement; live published-store/custom-domain proof). No FAIL remains.

---

## 2. Exact safety changes made in this pass

### 2.1 Template catalogue and pricing

| File | Change |
| --- | --- |
| `src/lib/templatesData.ts` | Rewrote all 36 descriptions/features with honest design-layout wording and neutral badges. Added `TEMPLATE_CLAIM_DISCLOSURE`, which states that delivery promises, certifications, AI engines, immersive viewers and temperature-controlled logistics are not included. Removed the stale `UNUSED_OLD_TEMPLATES` block from `src/lib/supabase.ts`. |
| `src/lib/templatePricing.ts`, `src/components/TemplateMarketplace.tsx` | Removed `+ GST at checkout`; added the exact tax-confirmation wording, base-price wording, and clear template-only disclosure. |
| `reports/vijay-visuals-36-template-pricing-schedule.md` | Rewrote all 36 reason cells as honest design-layout descriptions. Preserved every SKU, name, category, design class, price, distribution and the ₹73,964 total. Removed unsupported reason text such as `same-day unboxing`, `cold-chain handling`, `360 suite walkthrough`, `EMI calculator` and `refill automation` as positive promises. |

### 2.2 Customer packages, tax and domain disclosure

| File | Change |
| --- | --- |
| `src/lib/customerPricing.ts`, `src/components/PackagePurchaseGuide.tsx`, `src/components/WebsiteBuilder.tsx` | Added the exact tax note; free tier shows `Total ₹0 · no tax`; ₹7,999 base price and ₹0 selected template are preserved; paid optional services are itemised separately. Domain note: `Custom domain connection/setup does not include a free domain. Domain registration, renewal and any hosting charges are shown or paid separately wherever applicable.` |
| `functions/api/plans.ts`, `src/db/seed.ts`, `src/data/content.ts` | Narrowed ₹14,999 e-commerce, ERP/POS, dedicated AI-engine, GST-invoice and delivery claims. Features are now conditional on configuration or marked not included/custom-quoted. |
| `src/components/StudioLanding.tsx` | Removed GST quotation, `*1.18` and `₹9439` checkout wording. Base-price checkout labels are used instead. |
| `src/routes/businessOs.ts`, `src/routes/growth.ts`, `src/components/GrowthWorkspace.tsx` | Proposal and cost copy now separates base prices from taxes and uses the exact tax note. |
| `functions/api/platform/proposals.ts`, `functions/api/platform/subscriptions.ts`, `functions/api/admin/overview.ts`, `functions/api/admin/plans/[id].ts` | Package disclosures no longer claim verified GST; exact tax wording is used. Domain registration/renewal is stated as a registrar charge. |

### 2.3 Proposal, PDF and email surfaces

| File | Change |
| --- | --- |
| `src/lib/proposalPdfGenerator.ts` | Removed stored-GST display logic and GST-percentage labels. All proposal totals are labelled base price/quoted amount with the exact tax note. Replaced fixed timelines, lifetime/free-support claims, verified-review/promo-engine/courier/AI concierge claims with conditional or not-included wording. |
| `src/components/CustomerProposalView.tsx`, `src/components/ProposalManager.tsx` | Same tax and scope treatment in the customer-facing proposal view and manager. Removed `3–5 Business Days`, `30 Days Complimentary Assistance`, `One-Click WhatsApp Order Alerts` and lifetime self-editing promises. |
| `functions/api/proposals/[id]/delivery.ts` | WhatsApp and email delivery copy now says `Quoted Amount`, uses the exact tax note, and says the timeline is quoted after scope review. |
| `functions/api/_email.ts`, `functions/api/webhooks/cashfree.ts` | Removed `3–5 Business Days` and `Scheduled for Development` claims. Payment-verified email now says work begins after scope confirmation. |
| `src/components/DashboardsHub.tsx` | Payment history no longer claims authoritative GST receipts. Stored tax fields are labelled unverified; the exact tax note is shown. |

### 2.4 Demo and sample-data safety

| File | Change |
| --- | --- |
| `src/components/StorefrontView.tsx`, `src/components/BusinessFuturePreview.tsx`, `src/components/WebsiteBuilder.tsx` | Sri Lakshmi demo is labelled fictional/non-contactable. Phone/address/hours are labelled sample; orders, payments, chat, reviews, quote requests and other write paths are blocked in demo mode. Sample WhatsApp placeholder is non-dialable. |
| `src/data/demoBuilder.ts`, `src/db/seed.ts`, `src/lib/saasServices.ts` | Sample warranty and SSL-timing claims were changed to sample/conditional wording. |
| `src/components/StorefrontReviews.tsx` | `Verified Purchase Guarantee` was replaced with `Verified purchase badges where enabled` and an explanation that the badge appears only when a completed order matches the reviewer. |
| `src/components/InteractiveDemoHub.tsx` | Simulated tax line is labelled simulated and the cart shows the exact tax note plus `This transaction is 100% simulated.` |
| `functions/api/help-center.ts`, `functions/api/ai/seo-assistant.ts`, `src/components/GlobalGrowthHub.tsx`, `src/components/PolicyView.tsx`, `src/components/DomainManagementCenter.tsx`, `src/components/AiAutomationCenter.tsx`, `src/components/OrderTrackerModal.tsx` | Removed certified-products/fast-delivery SEO text, GST-invoice promises, `+GST` domain labels and other unsupported claims. |

### 2.5 Test coverage

`scripts/test-customer-pricing-experience.ts` was expanded to assert the exact tax note, `Total ₹0 · no tax`, domain/hosting disclosure, ₹14,999 honesty, all 36 template claims and Sri Lakshmi demo safety. It now reports **23 passed, 0 failed**.

---

## 3. Pricing verification

### 3.1 36 template schedule

| Check | Result |
| --- | ---: |
| Catalogue templates | 36 |
| Schedule rows | 36 |
| Unique `tpl-*` SKUs | 36 |
| Approved price levels | 6 / 6 |
| ₹999 / ₹1,499 / ₹1,999 / ₹2,499 / ₹3,499 / ₹4,999 | 5 / 10 / 8 / 9 / 3 / 1 |
| Proposed one-time list-price total | ₹73,964 |
| SKUs activated | 0 |
| Prices written to D1 | 0 |

The authoritative schedule is `reports/vijay-visuals-36-template-pricing-schedule.md`; `npm run check:template-pricing-schedule` passes **11/0**. All prices remain display-only.

### 3.2 ₹7,999 package

| Line | Display treatment |
| --- | ---: |
| Base price | ₹7,999 |
| Selected template | ₹0 |
| Optional extras | shown separately; no hidden duplicate charge |
| Taxes | `Applicable taxes will be confirmed before payment.` |
| Domain/registration/renewal/hosting | separate registrar/infrastructure charges |
| Recurring costs | separated from the one-time base price |

The stale `₹7,999 + ₹1,440 GST = ₹9,439` statement was removed from the report and customer-facing copy. It is not presented as a verified final payable amount.

### 3.3 Backend caveat — disclosed, not hidden

`functions/api/payments/cashfree/create-order.ts` was **not** changed. It still computes GST from `subscription_plans.gst_percent`, and `npm run test:cashfree-architecture` explicitly verifies exact 18% GST calculation for the configured packages. This pass removes misleading customer-facing claims; it does **not** claim that backend charge behaviour was removed or that tax applicability was verified.

---

## 4. Demo safety verification

The Sri Lakshmi Silks & Boutique fixture is treated as an illustrative preview only:

- Entire demo storefront is labelled **`Illustrative Demo — Not a real business`**.
- Phone, address, hours, delivery, returns, reviews and products are labelled fictional/sample.
- No real order, payment, message, review, quote request or form submission is allowed in demo mode.
- Real tenant storefronts continue to use their own verified data and are not changed by demo guards.
- Source assertion: `Sri Lakshmi demo storefront is fictional, labelled and non-contactable` PASS.

---

## 5. Automated QA results — final run

| Command | Result |
| --- | --- |
| `npm run lint` | PASS — `tsc --noEmit`, no errors |
| `npm run build` | PASS — Vite build succeeded; known non-blocking `__dirname` config-loader and chunk-size warnings only |
| `npm run test:customer-experience` | **23 passed, 0 failed** |
| `npm run test:template-pricing` | **27 passed, 0 failed** |
| `npm run check:template-pricing-schedule` | **11 passed, 0 failed** |
| `npm test` | **20 passed, 0 failed** — SEO/metadata regressions |
| `npm run test:cashfree-safety` | **13 passed, 0 failed** |
| `npm run test:preview` | **9 passed, 0 failed** |
| `npm run test:website` | **19 passed, 0 failed** |
| `npx tsx scripts/test-demo-business-builder.ts` | **11 passed, 0 failed** |
| `npx tsx scripts/test-brand-cleanup.ts` | **6 passed, 0 failed** |
| `npx tsx scripts/test-priority-fix-consolidated.ts` | **46 passed, 0 failed** |
| `npm run test:cashfree-architecture` | **9 passed, 0 failed** |
| `npm run test:webhooks` | **16 passed, 0 failed** |
| `npm run test:cashfree-security` | **36 passed, 0 failed** |
| `npm run test:cashfree-webhook-freshness` | **11 passed, 0 failed** |
| `npm run test:cashfree-hardening` | **15 passed, 0 failed** |
| `npm run test:sandbox-payment` | **34 passed, 0 failed** |

Known unrelated stale suite: `npm run test:preview-targeted-fixes` was not used as a gate. Its `/marketplace` assertion is stale relative to unchanged `functions/_middleware.ts`; no middleware change was made in this pass.

---

## 6. 390px browser layout verification

A local read-only static server served the newly built `dist` at `http://127.0.0.1:3015`. It had no API/D1 access and performed no writes. The expected `API endpoint is unavailable` console message appeared because the static fixture intentionally has no API backend; no app-initiated mutation was observed.

| Page | Measured result |
| --- | --- |
| `/marketplace` inside a 390px iframe | `innerWidth=390`, `clientWidth=382`, `scrollWidth=382`, horizontal overflow `0px` |
| `/marketplace` content | 36 `Proposed ₹` labels, 3 `View Demo`, 33 `No live demo yet`, `Choose Your Website Design`, `Get Your Complete Business Website`, exact tax note present |
| `/builder` inside a 390px iframe | `innerWidth=390`, `clientWidth=382`, `scrollWidth=382`, horizontal overflow `0px` |
| `/builder` content | `Not a real business`, `Sample phone`, `Sample address`, `Total ₹0 · no tax`, exact tax note present |

The browser tab was closed and the temporary local server was stopped after verification.

---

## 7. Misleading-claim grep classification

Scoped grep was run over active `src/**/*.{ts,tsx}` and `functions/**/*.ts` for delivery guarantees, 30-minute/same-day claims, cold-chain, 360 viewers, AI engines, warranties/certifications, `free domain`, `Total Free`, `₹0 + 18`, EMI calculators, refill automation, fixed proposal timelines and GST claims.

Residual matches are classified as follows:

1. **Negations and disclosures — allowed.** Examples: `templatesData.ts` says delivery/certification/AI/immersive/temperature-controlled outcomes are *not included*; `customerPricing.ts` and `WebsiteBuilder.tsx` say domain connection is *not* a free domain; `functions/api/plans.ts` says dedicated AI engines require a separate proposal.
2. **Technical DNS timing — allowed.** `src/routes/domains.ts` says DNS changes typically propagate within `5–30 minutes` and may take up to 24 hours. This is DNS propagation guidance, not a 30-minute delivery promise. `test-brand-cleanup` explicitly preserves non-technical 24-hour claims while confirming non-technical ones are gone.
3. **Numeric false positives — allowed.** `360` matches in SVG paths, image heights, rate-limit windows and image-data limits are not 360° viewer claims.
4. **GST fields and calculations — allowed with caveat.** Schema/type fields, internal finance ledgers, regional tax configuration and Cashfree calculation code remain. Customer-facing marketing/UI/API disclosure copy uses the exact tax note. Backend GST calculation was not removed and is reported in section 3.3.
5. **Local test fixtures — allowed, non-customer-facing.** `scripts/test-purchase-system.ts`, `scripts/test-cashfree-integration.ts`, `scripts/run-local-integration-tests.ts` contain 18% GST fixtures; `scripts/test-priority-fix-consolidated.ts` asserts that `3–5 Business Days` is absent; `scripts/verify-branding-and-pdf.cjs` contains non-runtime PDF fixture substitutions. None are active storefront or package marketing copy.

No unclassified customer-facing promise remained in the scoped active source.

---

## 8. BLOCKED / deliberately not claimed

- **Genuine verified entitlement:** BLOCKED. Source and local Cashfree suites verify server-side verification, signature freshness, amount mismatch rejection, duplicate protection, refund safety and entitlement logic. No mock returned `verified: true`; no real payment was made.
- **Live published-store e-commerce and custom-domain proof:** BLOCKED. Only source and local fixture verification was performed. No live published tenant, DNS/TLS/custom-domain validation or external merchant approval was attempted.
- **GST applicability:** still unverified. The exact confirmation wording is shown; no new GSTIN/tax-provider configuration was written.
- **Template activation:** not performed. All 36 SKUs remain inactive at zero price in Preview D1.

---

## 9. Deployment and safety statement

The content-safety QA pass made **source and report edits only**. Commit, push and Preview-only deploy were performed afterwards under Vijay's explicit authorization:

- Commit, push and deploy were limited to `preview/vijay-visuals-p0-safe-2026-11-26`; no Production change, merge to `main`/`master`, or other branch action.
- No D1 or Supabase write. Earlier read-only D1 checks reported `changes: 0`, `rows_written: 0`, `changed_db: false`.
- No SKU activation, price write, package-price or backend-GST configuration change, external approval, payment, refund, payout, message, email, OTP, secret access or account action.
- Pre-existing unrelated modified/untracked report files were left untouched.
- The earlier approved Preview deployment was the baseline; only this content-safety release was deployed to the existing Preview project.

**Final status: local content-safety work PASS and Preview-only release authorized; external entitlement and live-domain proofs remain BLOCKED pending explicit authorisation.**
