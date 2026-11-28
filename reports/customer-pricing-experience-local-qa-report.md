# Customer Pricing Experience — Local Source + Browser QA Report (Final Pending QA Completion)

Date: 2026-11-28  
Branch: `preview/vijay-visuals-p0-safe-2026-11-26`  
Base commit: `f58728bd8446e763b3dbaf09466a265f0d948d85`  
Scope: **Preview source only**. QA was performed while the changes were local; Vijay subsequently approved Preview-only commit/push/deploy on 2026-11-28. No Production access, DNS/domain/hosting change, Cashfree Live action, secret/OTP/email, real payment, refund, payout, deletion, or historical-record change was performed.

---

## 1. Outcome

A clearly separated, Preview-safe customer journey is implemented in source:

- **Section A — Website Templates**: 36 templates with exact proposed SKU prices, honest demo availability, template-only inclusions/exclusions, and a purchase-summary modal that explicitly says a template alone is not a hosted/published website.
- **Section B — Complete Website Packages**: the existing server-configured `business-website` package at **₹7,999**, with the selected template included at **₹0**, 18% configured GST of **₹1,440**, and final payable **₹9,439**.
- Out-of-package requirements are labelled exactly **`Custom Requirement — Quote Required`** and cannot be charged without an Owner-approved proposal.
- Checkout summaries show item/package, selected template, base price, optional extras, tax treatment, final payable, recurring costs, refund/cancellation honesty, and support contact.
- Payment success remains gated on genuine server-side Cashfree verification; the browser never infers success from return URL state.
- The deployed Preview bundle was **not changed** and still predates these local source edits.

---

## 2. Exact changes made

### New files

| File | Purpose |
| --- | --- |
| `src/lib/customerPricing.ts` | Single source for the 36 exact proposed prices, `formatInr`, `₹7,999` price breakdown, bounded scope, milestones, customer responsibilities, exclusions, `CUSTOM_REQUIREMENT_MESSAGE`, and `detectCustomRequirement`. Display-only; writes nothing to D1. |
| `src/components/PackagePurchaseGuide.tsx` | Complete-package section: transparent price breakdown, itemized scope, requirement form, quote-required detection, milestones, responsibilities, exclusions, refund/support honesty, and own-data language. |
| `scripts/test-customer-pricing-experience.ts` | 18 source-only assertions for the new customer journey, payment gating, dashboards, owner separation, package-price preservation, white-label source, and mobile-first layout. |
| `reports/customer-pricing-experience-local-qa-report.md` | This report. |

### Modified files

| File | Change |
| --- | --- |
| `src/components/TemplateMarketplace.tsx` | Added Section A/B labels; exact proposed SKU prices; clear “Proposed … not active yet” and conflict states; `View Demo` only for the 3 verified fixtures and `No live demo yet` for the other 33; template-only disclosure modal with full checkout summary; disabled `Buy Template — activation pending`; mounted `PackagePurchaseGuide`; passes selected template into package guide; support contact added. |
| `src/data/content.ts` | Added English/Telugu heading and subtitle keys for the two customer-choice sections to the shared i18n registry. |
| `src/App.tsx` | Passes `lang` to `TemplateMarketplace`. Existing Cashfree return handler still calls `/api/payments/cashfree/verify` and only reports success when `res.verified` is true. |
| `src/components/StudioLanding.tsx` | Package cards now filter to `p.category === 'website'`, so template SKUs are not presented as complete packages. |
| `functions/api/proposals/calculate.ts` | Rejects template SKUs in the package quotation endpoint with: `Template SKUs are priced separately and cannot be added to the package quotation. Choose either a template or a complete website package.` |
| `src/components/OwnerTemplatePricing.tsx` | Clarifies that template prices are one-time design SKUs, separate from one-time website package plans and recurring SaaS plans. |
| `src/components/BusinessOwnerDashboard.tsx` | `Pricing & Offers` now visibly separates `Existing Packages & Subscriptions`, `36 Website Template Prices`, and `Special Offers` without changing stored plans/offers. |
| `src/components/DashboardsHub.tsx` | Added a transparent “My Website Project, Requirements & Handover” panel using only the signed-in customer’s own data APIs/state; replaced hardcoded `₹7,999 Business Website Package` copy with server-neutral package wording. |
| `package.json` | Added `test:customer-experience` script. |
| `reports/vijay-visuals-36-template-pricing-schedule.md` | Corrected stale status line to state the report is committed in `f58728b`, while the current experience source changes are local/uncommitted. Preserved `Not written to D1, not activated, not deployed`. |

Pre-existing modified report files were preserved and are not part of this task’s edits.

---

## 3. 36-template pricing status

The authoritative schedule remains `reports/vijay-visuals-36-template-pricing-schedule.md`. The client mirror in `src/lib/customerPricing.ts` matches it row by row. **No price was written to Preview D1, no SKU was activated, and no purchase was enabled.**

| # | SKU | Proposed one-time price | Preview status |
| ---: | --- | ---: | --- |
| 1 | `tpl-grocery-store` | ₹1,499 | Proposed / not active |
| 2 | `tpl-supermarket` | ₹1,999 | Proposed / not active |
| 3 | `tpl-clothing-store` | ₹1,499 | Proposed / not active |
| 4 | `tpl-fashion-boutique` | ₹2,499 | Proposed / not active |
| 5 | `tpl-mobile-store` | ₹1,999 | Proposed / not active |
| 6 | `tpl-electronics-store` | ₹1,999 | Proposed / not active |
| 7 | `tpl-medical-store` | ₹2,499 | Proposed / not active |
| 8 | `tpl-pharmacy` | ₹2,499 | Proposed / not active |
| 9 | `tpl-hospital-clinic` | ₹3,499 | Proposed / not active |
| 10 | `tpl-restaurant` | ₹1,999 | Proposed / not active |
| 11 | `tpl-cloud-kitchen` | ₹1,499 | Proposed / not active |
| 12 | `tpl-hotel` | ₹3,499 | Proposed / not active |
| 13 | `tpl-bakery` | ₹1,499 | Proposed / not active |
| 14 | `tpl-jewellery-store` | ₹3,499 | Proposed / not active |
| 15 | `tpl-photography-studio` | ₹999 | Proposed / not active |
| 16 | `tpl-video-editing-studio` | ₹999 | Proposed / not active |
| 17 | `tpl-wedding-photography` | ₹999 | Proposed / not active |
| 18 | `tpl-event-management` | ₹2,499 | Proposed / not active |
| 19 | `tpl-real-estate` | ₹2,499 | Proposed / not active |
| 20 | `tpl-automobile-showroom` | ₹2,499 | Proposed / not active |
| 21 | `tpl-bike-garage` | ₹1,999 | Proposed / not active |
| 22 | `tpl-beauty-salon` | ₹1,999 | Proposed / not active |
| 23 | `tpl-spa-wellness` | ₹1,499 | Proposed / not active |
| 24 | `tpl-gym-fitness` | ₹1,499 | Proposed / not active |
| 25 | `tpl-education-coaching` | ₹999 | Proposed / not active |
| 26 | `tpl-travel-agency` | ₹2,499 | Proposed / not active |
| 27 | `tpl-furniture-store` | ₹2,499 | Proposed / not active |
| 28 | `tpl-interior-design` | ₹2,499 | Proposed / not active |
| 29 | `tpl-hardware-store` | ₹1,999 | Proposed / not active |
| 30 | `tpl-pet-store` | ₹1,499 | Proposed / not active |
| 31 | `tpl-organic-farming` | ₹1,499 | Proposed / not active |
| 32 | `tpl-dairy-business` | ₹1,499 | Proposed / not active |
| 33 | `tpl-florist-gift-store` | ₹1,499 | Proposed / not active |
| 34 | `tpl-legal-financial` | ₹999 | Proposed / not active |
| 35 | `tpl-digital-marketing` | ₹1,999 | Proposed / not active |
| 36 | `tpl-custom-business` | ₹4,999 | Proposed / not active |

Distribution: ₹999 × 5, ₹1,499 × 10, ₹1,999 × 8, ₹2,499 × 9, ₹3,499 × 3, ₹4,999 × 1.  
Proposed one-time list-price total: **₹73,964**.

Previously verified Preview D1 state remains: `total_tpl_rows=36`, `unique_codes=36`, `inactive_rows=36`, `zero_price_rows=36`, `non_template_rows=12`; migration `0029` already applied; `wrangler d1 migrations list vijay-visuals-preview --remote` → `No migrations to apply!`.

Activation prerequisites still require separate explicit approval and verification: final SKU/price, inclusions, exclusions, support/update/maintenance terms, builder transfer, and entitlement flow.

---

## 4. Exact ₹7,999 package economics and scope

The displayed package is the existing server-configured `business-website` plan. It was not renamed, duplicated, or re-priced.

| Line | Amount |
| --- | ---: |
| Exact base price | ₹7,999 |
| Selected template add-on | ₹0 |
| Optional extras selected | ₹0 |
| GST (18%, configured tax) | ₹1,440 |
| Separate recurring costs stated now | ₹0 |
| **Final payable before Cashfree payment** | **₹9,439** |

Exact customer-facing statement: **`Your selected template is included in this package.`**

### Itemized package scope

Items marked **Owner service** are bounded proposed deliverables requiring an agreed written scope; they are not advertised as automatic software.

| Scope item | Type |
| --- | --- |
| One selected premium template; builder seeds an independent editable draft | Platform capability |
| Up to 7 agreed website pages; extra pages require an approved quote | Owner service |
| Business logo, brand colours and business details setup | Platform capability |
| Product/service catalogue setup: names, descriptions, categories, prices, availability, inventory | Platform capability |
| WhatsApp enquiry integration using a verified business number | Platform capability |
| Contact form and Google Maps integration; map display depends on configured URL/API and supported tenant view | Owner service |
| Responsive desktop, tablet and mobile design where the selected template supports it | Platform capability |
| Basic SEO: title, description, sitemap/robots and structured metadata where configured | Platform capability |
| Customer Dashboard access after verified entitlement | Platform capability |
| Admin Dashboard access where applicable, with role separation preserved | Platform capability |
| Two agreed revision rounds; additional rounds need an Owner-approved proposal | Owner service |
| 30 days of technical support after handover; not lifetime or unlimited support | Owner service |
| Website handover and basic usage training; recorded only when actually completed | Owner service |

### Milestones

1. Confirm package, template, page list and requirements in writing.
2. Prepare the editable template draft and agreed page structure.
3. Apply approved brand details, catalogue and enquiry settings.
4. Share preview for the two agreed revision rounds.
5. Handover, basic training and support period start.

### Customer responsibilities

- Business name, category, logo, brand colours and approved business details.
- Final page list (maximum 7), products/services and prices.
- Verified WhatsApp/contact information and any domain access requested.
- Timely review and consolidated revision feedback.
- Domain, gateway merchant approval or third-party account credentials the customer chooses to use.

### Explicit exclusions

Domain registration/renewal; hosting renewals, storage overages and business email; premium plugins/third-party licences; gateway approval, MDR and settlement charges; custom integrations/development/data migration; content creation, photography and paid marketing; ongoing paid maintenance after the support period; unlimited revisions/support, free lifetime hosting or guaranteed rankings.

### Requirement flow

Collects business name, business category, email, preferred template, logo/brand colours, page count, products/services, contact/WhatsApp information, domain preference and special features. It sends `whatsappOptIn: false`, requests no OTP, creates no account, starts no payment, and requests no external WhatsApp reply. Out-of-package detection triggers exactly **`Custom Requirement — Quote Required`** with no auto-generated price.

---

## 5. Conflicts and duplicate-pricing checks

| Finding | Resolution |
| --- | --- |
| 36 template SKUs existed inactive at ₹0 while proposed prices existed only in a report. | Source displays exact proposed prices with a prominent “not active yet” label and disabled purchase. No D1 write or activation occurred. |
| An active configured price could differ from the approved schedule. | `customerPriceDisplay` detects the mismatch, shows “configured price differs”, and blocks purchase pending Owner review. |
| Template SKUs could previously be accepted by the package quotation endpoint. | `functions/api/proposals/calculate.ts` now rejects them with the exact message quoted in section 2. |
| Package cards could mix template SKUs into package choices. | `StudioLanding.tsx` filters to `category === 'website'`. |
| Customer dashboard copy hardcoded a package price. | Replaced with server-neutral “eligible Business Website Package” wording. |
| Owner pricing UI could blur templates, packages and SaaS. | Owner manager wording and dashboard section headings now separate all three. |
| Existing packages/offers could be accidentally modified by test activity. | Local mocked regressions confirm package pricing and offer/proposal rows remain unchanged. |
| Refund/cancellation policy is not published. | UI states this plainly and promises no refund; support contact is shown before payment. |

No fake reviews, ratings, guarantees, discounts, demo claims, or hidden fees were introduced. Only the three verified fixtures expose `View Demo`; catalogue `demo_slug` values were not silently substituted.

---

## 6. Automated verification

| Command | Result |
| --- | --- |
| `npm run lint` | PASS (`tsc --noEmit`, no errors) |
| `npm run build` | PASS; only the known non-blocking Vite `__dirname` config-loader warning |
| `npm run test:customer-experience` | **18 passed, 0 failed** |
| `npm run check:template-pricing-schedule` | **11 passed, 0 failed** |
| `npm run test:template-pricing` | **27 passed, 0 failed** |
| `npm test` | **20 passed, 0 failed** |
| `npm run test:preview` | **9 passed, 0 failed** |
| `npm run test:cashfree-safety` | **13 passed, 0 failed** |
| `npm run test:cashfree-architecture` | **9 passed, 0 failed** |
| `npm run test:cashfree-webhook-freshness` | **11 passed, 0 failed** |
| `npm run test:cashfree-hardening` | **15 passed, 0 failed** |
| `npm run test:cashfree-security` | **36 passed, 0 failed** |
| `npm run test:sandbox-payment` | **34 passed, 0 failed** |
| `npm run test:webhooks` | **16 passed, 0 failed** |
| `npx tsx scripts/test-priority-fix-13.ts` | **41 passed, 0 failed** (includes white-label middleware/domain/email fixtures) |
| `npx tsx scripts/test-priority-fix-consolidated.ts` | **46 passed, 0 failed** (includes white-label and entitlement/display gates) |
| `npx tsx scripts/test-website-workflow-regressions.ts` | **19 passed, 0 failed** |
| `npx tsx scripts/test-demo-business-builder.ts` | **11 passed, 0 failed** (public preview has no platform branding) |
| `npm run test:preview-targeted-fixes` | **FAIL — stale, unrelated assertion**: it expects `/marketplace` to be absent from `SPA_SHELL_EXACT_ROUTES`, but `functions/_middleware.ts` already includes it. Neither `functions/_middleware.ts` nor this test was modified by this task (`git diff` clean). Not a customer-pricing regression. |

Browser QA used the built `dist` behind temporary **read-only local mocks** at `http://127.0.0.1:3012` and `http://127.0.0.1:3013`; all mutation endpoints returned 405. The 3013 fixture used mock Supabase sessions and identity-scoped GET responses for Owner, Customer A and Customer B; no real account, OTP, email, secret, payment or external API was used. Desktop viewport and a 390px iframe viewport were checked. Observed: 36 `Proposed ₹` labels, 3 `View Demo`, 33 `No live demo yet`, exact inclusion message, ₹9,439 final payable, quote-required dynamic state, no horizontal overflow at 390px, three Owner pricing sections, two isolated customer sessions, and no successful payment claim from an unverified Cashfree return. The temporary servers and QA tabs were closed after verification.

---

## 7. 13-scenario QA report

| # | Scenario | Status | Evidence |
| ---: | --- | --- | --- |
| 1 | Price understanding | **PASS** | 36 exact proposed SKU prices shown; schedule total ₹73,964; row-by-row client/report assertion PASS. |
| 2 | Template/package distinction | **PASS** | Section A `Choose Your Website Design`; Section B `Get Your Complete Business Website`; template-only modal states it is not a hosted/published website. |
| 3 | Template-only selection | **PASS** | 36 `Buy / Customize` actions open a modal with inclusions, exclusions, update/support terms, and disabled activation-dependent purchase. |
| 4 | ₹7,999 package + template, no duplicate charge | **PASS** | Exact inclusion message shown; template add-on ₹0; final ₹9,439; proposal calculator rejects template SKUs. |
| 5 | Custom feature quote-required | **PASS** | Browser test with 9 pages + “custom API integration and data migration” showed exact `Custom Requirement — Quote Required`, reasons, and Owner-review-only wording; no POST was made. |
| 6 | Final price before checkout | **PASS** | Base ₹7,999, GST 18% ₹1,440, final ₹9,439 visible before any payment action. |
| 7 | Unverified payment cannot show success | **PASS** | Disabled template purchase clicked without URL change, success toast, or non-GET request; source gates success on `res.verified`. |
| 8 | Verified entitlement after genuine payment | **BLOCKED** | Source wiring to authenticated `/api/customer/package-status` and `signatureVerified` checked; Cashfree safety/hardening/security/webhook/freshness/sandbox suites pass. A browser return with an unverified order produced only a status toast, no success claim. Genuine entitlement proof still requires an explicitly authorized Cashfree-verified payment, which is outside scope. |
| 9 | Customer dashboard own-data isolation | **PASS** | Read-only local mock with two isolated sessions: Customer A saw only `Customer A Own Package`, `A-ONLY-RECEIPT`, and 1 own change request; Customer B saw only `Customer B Own Package`, `B-ONLY-RECEIPT`, and 1 own support ticket. Neither session saw the other’s email, plan, receipt or request. No local writes or app console errors. |
| 10 | Owner dashboard pricing separation | **PASS** | Mock Owner session loaded `Existing Packages & Subscriptions`, `36 Website Template Prices`, `Special Offers`, and the 36-row `Pricing Manager`; separation copy confirmed one-time templates are distinct from package plans and recurring SaaS. Owner API 200; non-owner paths stayed 403 in regression suites. No local writes. |
| 11 | Existing packages/offers unchanged | **PASS** | No D1 writes; previous read-only verification showed 12 non-template rows, `platform_proposals=2`, `store_coupons=0`; regression suites confirm unchanged package and offer rows. |
| 12 | White-label has no VIJAY VISUALS branding | **PASS** | Local middleware/fixture suites prove platform head metadata is replaced on `/site/{slug}`, delivery subdomains and custom domains; tenant emails/notifications are tenant-branded; public preview fixture is customer-branded. Live custom-domain/DNS proof is separately noted in section 8 and is not claimed here. |
| 13 | Mobile layout | **PASS** | 390px iframe: width 390, scrollWidth 382, no horizontal overflow, single-column responsive grids; both required sections and ₹9,439 summary rendered. |

### Summary

- **PASS: 12**
- **FAIL: 0**
- **PENDING: 0**
- **BLOCKED: 1**

---

## 8. Unavailable or deliberately withheld features

- 36 proposed template prices remain **display-only**; activation and D1 writes need explicit approval.
- No template purchase is possible until an Owner configures and activates the SKU.
- **Exact remaining QA blocker — verified entitlement:** proving a genuine payment-to-entitlement transition requires an explicitly authorized Cashfree-verified Preview transaction with a real signed-in customer and successful server-to-server verification. Local mocks deliberately never returned `verified: true`; no payment, receipt, refund, payout or entitlement was simulated as real.
- Live white-label *deployment* proof still requires a published tenant fixture and verified custom domain/DNS/TLS (or wildcard delivery host). The local QA scenario is PASS via middleware fixtures, but no live published-domain claim is made.
- Authenticated live dashboard checks with real accounts/OTP/email were not used; the Owner-separation and customer-isolation scenarios were closed with read-only local mock sessions instead.
- 33 templates have no live demo; only `deccan-royal-couture`, `nocturne-audio-tech`, and `nizam-heritage-kitchen` are verified fixtures.
- Two revisions, 30-day support, handover/training, and “up to 7 agreed pages” are bounded **Owner-service** terms; they are not automatic software and need written Owner/service-process approval.
- A refund/cancellation policy has not been published; no refund is promised.
- Razorpay is retired. Historical ledger fields are preserved, but no new Razorpay checkout or active gateway path was introduced.

---

## 9. Deployment and safety statement

No commit, push, merge, deploy, Production D1/Supabase access, DNS/domain/hosting/Cloudflare Production change, Cashfree Live action, secret access, OTP, external email/message, real account, real payment/refund/payout, deletion, or historical-record modification was performed. The currently deployed Preview URL continues to serve the earlier committed bundle and does **not** include these local customer-experience changes.

A separate explicit approval is required before writing the 36 prices, activating SKUs, committing/pushing, merging, or deploying this work.

---

## 10. Final pending QA completion evidence

The single original PENDING item and two of the three original BLOCKED items were closed using only the existing local Preview build, read-only mocks and source fixtures.

| Original item | Closure evidence | Final status |
| --- | --- | --- |
| Owner dashboard pricing separation (was PENDING) | Mock Owner session opened `/dashboards/platform-owner`; `Existing Packages & Subscriptions`, `36 Website Template Prices`, `Special Offers`, the 36-row template pricing manager, and the explicit template/package/SaaS separation copy were visible. `/api/platform-owner/dashboard` and `/api/platform-owner/template-pricing` returned 200 for the mock Owner. No local mutation requests were made. | **PASS** |
| Customer dashboard own-data isolation (was BLOCKED) | Two identity-scoped mock sessions were checked at `/dashboards`. Customer A showed only A’s package, receipt and change request; Customer B showed only B’s package, receipt and support ticket. Each isolation sentence named the signed-in email; the other customer’s email, plan, receipt and request were absent. No local writes and no app console errors. | **PASS** |
| White-label branding (was BLOCKED) | Local suites verified platform head metadata replacement on `/site/{slug}`, delivery subdomains and custom domains; blocked custom domains contain no platform branding; tenant store-order email is tenant-branded; the public demo fixture body is customer-branded; source guard confirms no platform credit in tenant head injection. | **PASS** |
| Verified entitlement after genuine payment (BLOCKED) | Server-side verification, signature freshness, amount mismatch rejection, duplicate protection, webhook idempotency, refund safety and entitlement provisioning are covered by passing local suites. A browser Cashfree return with an unverified order produced only a status toast, no success toast. No mock ever returned `verified: true`. | **BLOCKED** |

Pricing re-verification in this pass: 36 exact proposed SKU prices and ₹73,964 total PASS; ₹7,999 base + ₹0 selected template + ₹1,440 GST = ₹9,439 PASS; template SKU rejection from package quotations PASS; out-of-package `Custom Requirement — Quote Required` PASS; no duplicate template charge PASS.

**Final QA classification: PASS 12, FAIL 0, PENDING 0, BLOCKED 1.** The customer pricing journey is ready for the approved Preview-only release. The one BLOCKED item requires an external, explicitly authorized genuine Cashfree verification and must not be claimed as complete until that occurs.
