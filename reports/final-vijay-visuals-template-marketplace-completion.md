# VIJAY VISUALS — Template Marketplace, Preview Builder & Owner Pricing Manager Completion Report

Date: 2026-11-28
Branch: `preview/vijay-visuals-p0-safe-2026-11-26`
Base HEAD: `6164024`
Scope: **Preview source only**. No commit, push, merge, deploy, Production access, Live Cashfree, DNS/domain/hosting change, OTP/email or account creation.

---

## 1. Executive summary

The Preview branch now contains a complete, server-authoritative Owner Template Pricing Manager in addition to the previously completed 36-template marketplace and builder handoff.

- `Owner Dashboard → Pricing & Offers` renders a clearly visible **“36 Website Templates — Pricing Manager”** section using the authoritative catalogue count.
- Each row shows template name, `tpl-*` SKU, one-time INR price, active/inactive status, included features, exclusions, update period, support period and maintenance terms.
- One-time template prices are explicitly separated from recurring package/subscription prices; no template price is invented by the client.
- Every template has a persistent Save action. Save validates locally, sends `PATCH` to the Owner-only API, then reloads the saved values with `GET` and shows a server-reload confirmation timestamp.
- `GET/PATCH /api/platform-owner/template-pricing` uses the existing `requireOwner`. Super Admin and Customer are denied with HTTP 403; unauthenticated requests are denied with HTTP 401.
- `PATCH` updates only the selected `tpl-*` row in the existing `subscription_plans` table. It rejects invalid prices, periods, booleans, empty terms and misleading lifetime/unlimited/guaranteed promises, and writes an audit log without secrets or credentials.
- Automated verification is **130 PASS / 0 FAIL** across 8 suites. Browser-mock QA is **10 PASS / 0 FAIL**. Lint and build are **PASS**.
- Migration `0029` was applied to Preview D1 only after explicit approval. It created 36 inactive, zero-price template SKUs. No rollback was executed.
- No real template price was configured, no template was activated, and no remote pricing write was performed. The deployed stable Preview URL remains stale and still returns HTTP 404 for the new endpoint because deployment was not approved.

---

## 2. Status definitions

| Status | Meaning in this report |
| --- | --- |
| `PASS` | Source, API, local in-memory D1, browser-mock UI or build evidence matched the requirement. |
| `FAIL` | A check did not meet the requirement. Resolved failures are recorded; unresolved local/source FAIL count is 0. A stale deployed Preview failure is recorded separately. |
| `PENDING` | Implementation exists, but real deployed or end-to-end verification/configuration is outstanding. |
| `BLOCKED` | Outside the approved boundary; requires separate written approval or real money/customer action. |

A `PASS` on a local mocked regression is **not** a claim that a deployed request, real payment, real D1 pricing write, draft save or publish was executed.

---

## 3. Scope and preservation boundaries

- Work remains uncommitted on `preview/vijay-visuals-p0-safe-2026-11-26`; no commit, push, merge or deploy was performed.
- Preview D1 (`vijay-visuals-preview`, ID `04ebaf6a-ff38-445c-889d-1fb391548a41`) received **only** additive migration `0029`, after explicit approval, at `2026-11-28 11:07:52`.
- Post-migration read-only D1 check: `total_tpl_rows=36`, `unique_codes=36`, `inactive_rows=36`, `zero_price_rows=36`; `subscription_plans` schema unchanged; no new pricing table.
- No remote template-pricing `PATCH`/price write was executed. The disposable save test used an isolated in-memory SQLite D1 fixture; the browser save test used a temporary local mock server only.
- Production D1 (`5e6c67d1-ccc0-4e98-a787-c6643e9f0f6c`), Production secrets, Supabase Production, Cashfree Live, DNS, domains and hosting were **not touched**.
- Stable Preview URL `https://preview-vijay-visuals-p0-saf.vijay-visuals-site.pages.dev/` was read only, not redeployed.
- No password, OTP, API key, token value or internal credential was requested, stored or printed. The browser mock used a synthetic local session only.
- The proposal URL `/proposal/vv_prop_1128ed4fba07d7bac7cf743a764fa7bd` was deliberately not navigated because it writes view metadata.

---

## 4. Exact changed and added files

### 4.1 New/completed in the Owner Pricing Manager pass

| File | Change |
| --- | --- |
| `functions/api/platform-owner/template-pricing.ts` | Completed Owner-only `GET`/`PATCH`. Adds editable included features, exclusions, maintenance terms, update/support periods and paid-maintenance setting; strict validation; selected-row-only update; server reload payload; audit log. |
| `src/components/OwnerTemplatePricing.tsx` | Replaced local-only readback with full persistent manager: per-template editable fields, validation, loading state, `PATCH` save, `GET` reload, success/error states and server-reload timestamp. |
| `scripts/test-template-pricing.ts` | Added 27 local mocked regression tests covering 36-row load, auth/403, save/reload, validation, active/inactive persistence, isolation from package pricing and offers. |
| `package.json` | Added `test:template-pricing` script. |
| `reports/final-vijay-visuals-template-marketplace-completion.md` | Updated with migration, manager, API, test and deployment status. |

### 4.2 Files already added/changed in the earlier marketplace pass, still uncommitted

| File | Purpose |
| --- | --- |
| `src/lib/templateTransfer.ts` | Explicit catalogue/demo/legacy-theme maps, independent local seed creation and exact handoff. |
| `src/lib/templatePricing.ts` | Server-plan-backed price view and honest inclusions/exclusions/update/support disclosures. |
| `src/components/TemplateMarketplace.tsx` | 36-template marketplace with categories, search, filters, sorting, thumbnails and detail modal. |
| `src/App.tsx` | Marketplace route, `startTemplateHandoff()`, builder seed state, demo and theme-gallery handoff wiring. |
| `src/components/BusinessOwnerDashboard.tsx` | Mounts `OwnerTemplatePricing` only in the Owner dashboard under `Pricing & Offers`. |
| `src/components/WebsiteBuilder.tsx` | Exact seed consumption, local catalogue CRUD, responsive preview and unsaved/saved state. |
| `src/components/StorefrontView.tsx` | Shared renderer with safe `previewData` path and no preview-path writes. |
| `src/components/GlobalGrowthHub.tsx` | Theme gallery calls the explicit builder handoff. |
| `src/components/StudioLanding.tsx` | Passes `onUseTheme` to the gallery. |
| `functions/api/_planTiers.ts` | Shared `tpl-*` classification, website-package helper and SKU builder. |
| `functions/api/plans.ts` | Includes active `tpl-*` SKUs as `category:'template'`, `billingCycle:'one_time'`. |
| `functions/api/payments/cashfree/create-order.ts` | Uses the shared authorized-package helper. |
| `functions/api/payments/cashfree/verify.ts` | Uses the same helper during verification. |
| `functions/api/webhooks/cashfree.ts` | Uses the same helper in webhook entitlement handling. |
| `functions/api/_tenantAccess.ts` | Template SKUs inherit the conservative website-only publish path. |
| `cloudflare/d1/migrations/0029_template_marketplace_pricing.sql` | Additive Preview migration: 36 inactive, zero-price `tpl-*` SKUs. Applied to Preview D1 only. |
| `cloudflare/d1/rollback/0029_template_marketplace_pricing_rollback.sql` | Guarded rollback source. Not executed. |
| `.gitignore` | Preserves rollback SQL source like existing rollback files. |
| `reports/final-production-readiness-report.md`, `reports/final-vijay-visuals-implementation-completion.md`, `reports/vijay-visuals-complete-requirements-audit.md`, `reports/complete-customer-workflow-qa.md`, `reports/customer-ecommerce-journey-live-qa-report.md` | Pre-existing uncommitted audit/report files from earlier work; not part of this pass. |

No new pricing table was introduced. No Production file was changed.

---

## 5. API behavior

### 5.1 `GET /api/platform-owner/template-pricing`

- `requireOwner` only. Unauthenticated = 401; Super Admin/Customer = 403 with `Business Owner privileges are required for this action.`
- Reads `subscription_plans` where `code LIKE 'tpl-%'` and filters through `isTemplatePlanCode()`.
- Returns all 36 configured template rows plus `category:'template'`, `billingCycle:'one_time'` and `writeMode:'owner_authorized'`.
- Each row contains: `templateId`, `code`, `name`, `priceInr`, `active`, `updatePeriodMonths`, `supportPeriodMonths`, `paidMaintenanceAfterSupport`, `included`, `excluded`, `maintenanceTerms`, `disclosures`, `renewal`, `updatedAt`.
- Malformed stored feature JSON falls back to conservative defaults; no token, secret, credential or internal configuration is returned.

### 5.2 `PATCH /api/platform-owner/template-pricing`

- `requireOwner` only. Super Admin and Customer are denied before any body processing or DB write.
- Accepts `templateId`, `priceInr`, `active`, `updatePeriodMonths`, `supportPeriodMonths`, `paidMaintenanceAfterSupport`, `included`, `excluded`, `maintenanceTerms`, optional `disclosures`.
- Validates:
  - `templateId` is a safe slug and resolves to `tpl-<templateId>`.
  - price is an integer `0–5,000,000`.
  - `active` and `paidMaintenanceAfterSupport` are explicit booleans.
  - update/support periods are integers `0–120`.
  - included/excluded are non-empty sanitised string lists, max 10 items.
  - maintenance terms are required text, max 600 chars.
  - included features, disclosure text and maintenance terms may not contain lifetime/unlimited/permanent/free-forever/guaranteed promises.
- Updates only `WHERE code = ?` for the selected `tpl-*` SKU: `monthly_price_inr`, `yearly_price_inr` (same one-time price), `is_active`, `features_json`, `updated_at`.
- Re-fetches the row after update and returns it.
- Writes `TEMPLATE_PRICING_UPDATED` audit metadata with actor, code, price, active state and periods; no secret or full provider response is logged.
- Unknown SKU = 404; missing DB = 503; DB failure = 500; validation failure = 400.
- Package plans, offers/proposals and all non-`tpl-*` rows remain untouched.

### 5.3 Deployed API status

The deployed stable Preview endpoint still returns HTTP 404 because the updated source has not been deployed. The deployed bundle also lacks the new manager strings. This is a deployment gap, not a source regression.

---

## 6. Owner UI behavior

- Header uses `TEMPLATES_DATA.length` and reads **“36 Website Templates — Pricing Manager”**.
- Explanatory copy states that one-time template prices are separate from recurring subscription/package plans.
- Summary counters show catalogue templates, configured SKUs and active-for-purchase count.
- Each template card shows name, `tpl-*` SKU, server price or “Not available yet”, active/inactive badge, included features, exclusions, update period, support period and maintenance terms.
- Each card has a collapsible editor with:
  - one-time price,
  - active checkbox,
  - update and support period inputs,
  - paid-maintenance-after-support checkbox,
  - included features textarea (one per line),
  - exclusions textarea (one per line),
  - maintenance terms textarea,
  - optional disclosures textarea,
  - Save button with loading state.
- Save performs client validation, `PATCH`, then `GET`; on success it shows “Saved and reloaded from server at …” and a toast. On failure it shows field-level or request-level errors.
- Refresh button reloads all rows from the server.
- Inactive, zero-price rows honestly display “Not available yet” until the Owner configures and activates them.

---

## 7. Marketplace, handoff and builder verification

- **36** catalogue templates render as **36** cards; header count matches `TEMPLATES_DATA`. `PASS`
- **16** categories and **4** themes are present; search, filters, sorting and thumbnails work. `PASS`
- Exactly **3** verified frontend-only demos expose `View Demo`; the other **33** show `Coming Soon`. `PASS`
- All **36** cards expose `Use This Template`. `PASS`
- Detail modal shows price/SKU, status, features, inclusions, exclusions, update/support terms, domain/hosting, gateway, renewal and support disclosures. `PASS`
- Marketplace performed **0 non-GET requests** in browser capture. `PASS`
- Demo/catalogue/legacy handoff transfers the exact selected design through `resolveTemplateHandoff()` and `StorefrontView`, with an independent local copy and explicit unsaved state. `PASS`
- Unknown legacy theme IDs and unmapped demo slugs fail explicitly; no substitute is silently loaded. `PASS`
- Builder desktop/tablet/mobile preview widths measured **944/820/390 px**. `PASS`
- Editing the hero headline updated the live preview with **0 non-GET requests**. `PASS`

---

## 8. Pricing and disclosure terms

- Runtime marketplace price comes only from `subscription_plans`; no client-side price is invented. `PASS`
- With no configured SKU, the marketplace shows `Owner pricing pending` / `Owner setup pending`. `PASS`
- Migration 0029 uses inactive zero-price placeholders inherited from conservative Business Website quotas. `PASS`
- Inclusions cover responsive editing, catalogue editing, responsive preview and white-label published output. `PASS`
- Exclusions cover domain fees, gateway approval/MDR, lifetime/unlimited promises and separately quoted optional work. `PASS`
- Paid maintenance after support is explicit and separately quoted; no free-forever or guaranteed promise is accepted. `PASS`
- One clear one-time base price per template is represented by one `tpl-<templateId>` SKU. `PASS`

---

## 9. Security, tenancy and preservation

- `requireOwner` and `requireAdmin` remain separate; no Super Admin fallback was added. `PASS`
- Only the selected `tpl-*` row can be updated; SQL binds prevent identifier/value injection. `PASS`
- Sanitised terms and forbidden-promise checks prevent misleading customer-facing claims. `PASS`
- No secret, credential, password, OTP, API key or provider token is returned by the new API. `PASS`
- Audit logging uses safe metadata only. `PASS`
- Tenant scoping and existing approval, payment verification and webhook paths were not bypassed. `PASS`
- Preview handoff remains local-only and does not create D1 rows. `PASS`
- No real purchase, refund, payout, publish, DNS or domain action was performed. `PASS`

---

## 10. Test evidence

### 10.1 Automated suites

| Verification | Result |
| --- | --- |
| `npm.cmd run lint` (`tsc --noEmit`) | `PASS` |
| `npm.cmd run build` (`vite build`) | `PASS` (existing Vite config/chunk-size warnings only) |
| `npm.cmd run test` — SEO/security regressions | `PASS` 20 / 20 |
| `npm.cmd run test:website` | `PASS` 19 / 19 |
| `npm.cmd run test:preview` | `PASS` 9 / 9 |
| `npm.cmd run test:template-pricing` | `PASS` 27 / 27 |
| `npm.cmd run test:cashfree-safety` | `PASS` 13 / 13 |
| `npm.cmd run test:webhooks` | `PASS` 16 / 16 |
| `npm.cmd run test:cashfree-webhook-freshness` | `PASS` 11 / 11 |
| `npm.cmd run test:cashfree-hardening` | `PASS` 15 / 15 |

Automated assertions: **130 PASS, 0 FAIL**.

`test-template-pricing` uses an isolated in-memory SQLite D1 fixture with schema and all migrations including 0029, plus mocked Supabase auth. It verified: unauthenticated 401; Owner 36-row load; all rows inactive/zero price; Super Admin/Customer GET and PATCH 403 with no writes; disposable Owner save/reload; active=true and active=false persistence; negative/decimal/over-cap price rejection; invalid update/support periods; non-boolean active; empty included/excluded; lifetime/unlimited/guaranteed promise rejection; unknown SKU 404; no mutation on invalid requests; package pricing unchanged; proposal/offer count unchanged.

### 10.2 Browser QA (local built bundle + temporary mock server)

A temporary Node server outside the repository served the freshly built `dist` bundle on `http://localhost:3011` and injected a synthetic Owner session plus mocked API responses. No real credentials, remote D1 writes or deployed API calls were used. The mock state was restored to its original zero-price/inactive/default-terms values after testing.

| Check | Result |
| --- | --- |
| Owner dashboard loaded with server-verified Owner state | `PASS` |
| `Pricing & Offers` showed the “36 Website Templates — Pricing Manager” section | `PASS` |
| 36 configured SKUs / 0 active counters rendered | `PASS` |
| Per-template name, SKU, price/status, inclusions, exclusions, periods and maintenance rendered | `PASS` |
| Read-only navigation to the manager produced 0 non-GET mock calls | `PASS` |
| Save produced `PATCH` then `GET`, reloaded price `4321`, and showed server-reload confirmation | `PASS` |
| Invalid `-1` price was blocked with a visible error and no `PATCH` | `PASS` |
| Active=true and active=false were persisted through the mock endpoint | `PASS` |
| Mock row restored to price 0, inactive, original periods and terms | `PASS` |
| No browser console errors in the mocked run | `PASS` |

Browser checks: **10 PASS, 0 FAIL**.

### 10.3 Deployed environment

| Check | Result |
| --- | --- |
| Deployed `GET /api/platform-owner/template-pricing` | `FAIL` — HTTP 404; source not deployed |
| Deployed bundle contains manager strings | `FAIL` — stale asset; prior audit found no `Per-template one-time pricing`, endpoint string or `OwnerTemplatePricing` |

These deployed FAILs are classified `BLOCKED` until deployment is separately approved.

### 10.4 Totals

- Local/source checks: **142 PASS** = 130 automated assertions + 10 browser checks + lint + build.
- Unresolved local/source FAIL: **0**.
- Deployed-environment FAIL: **2** (endpoint 404 and stale bundle), both due to the same deployment gap.
- Earlier temporary source checks from the marketplace phase: **19 PASS** (7 transfer + 12 migration checks); scripts were removed after execution.

---

## 11. PASS / FAIL / PENDING / BLOCKED summary

**PASS**

- Full persistent Owner Template Pricing Manager in source.
- Owner-only GET/PATCH with strict validation, row-scoped update and audit log.
- 36-row load, save/reload, invalid-input rejection and role denial in local tests.
- Active/inactive persistence in local tests and browser mock.
- Package pricing and offers unchanged in local tests.
- Migration 0029 applied to Preview D1 only; post-migration read-only state correct.
- Lint, build, 130 automated tests, 10 browser-mock checks.
- No real price change, activation, payment, draft save, publish or Production change.

**FAIL**

- 0 unresolved local/source failures.
- Deployed Preview is stale: new API returns 404 and the bundle lacks the manager. This is a deployment gap, not a source regression.

**PENDING (8)**

1. Obtain separate approval and deploy the updated source to the stable Preview URL.
2. Repeat deployed-browser verification of the Owner manager after deployment.
3. Configure real one-time prices/active states through the deployed Owner endpoint only when approved.
4. Run live Super Admin/Customer 403 tests with valid non-Owner sessions without creating accounts or sending OTP/email.
5. Run SANDBOX-only purchase → server verification → entitlement → publish end-to-end checks.
6. Complete the 14-step guided workflow end-to-end with real saved drafts.
7. Decide whether template and package SKUs may stack under `tenant_lifetime_entitlements` or whether the `one_time_purchase` uniqueness must include `plan_code`.
8. Confirm merchant online-payment routing: merchant-approved Cashfree account or approved split-settlement arrangement.

**BLOCKED (8)**

1. Preview/Production deployment.
2. Real remote template-pricing D1 writes beyond the already-approved migration.
3. Saving customer-owned drafts and publishing public URLs.
4. OTP/email, external messaging and account creation.
5. Real payments, refunds, payouts and Cashfree Live.
6. DNS, custom-domain and hosting changes.
7. Production deploy, Production D1, Production secrets and main merge.
8. Real COD confirmation and merchant gateway approval.

---

## 12. Exact next action

Obtain separate written approval to deploy the current Preview source to the stable Preview URL, then verify the Owner manager and `GET/PATCH` endpoint there with a real Owner session. Do **not** configure real prices, activate SKUs, merge to `main`, deploy Production, touch Production D1/secrets, use Live Cashfree, or create real customer drafts/orders/payments without further approval.

No rollback was executed. Migration 0029 remains applied to Preview D1, and the 36 template SKUs remain inactive at zero price.
