# VIJAY VISUALS — Final Cashfree Live Readiness & Launch Report

**Date:** 2026-11-28  
**Verdict:** **PRODUCTION NOT READY**

**Branch / audited HEAD commit / audited Preview deployment:** `preview/vijay-visuals-p0-safe-2026-11-26` / `16bac20080bd7326daa3152ecd96d8a4bdf10fbe` / `6b5d3e96-0acd-45b1-83d2-5de3194d5157`  
**Preview URL:** https://preview-vijay-visuals-p0-saf.vijay-visuals-site.pages.dev/  
**Current working tree:** local uncommitted Preview-only changes exist after the audited commit. No new commit, push, merge or deployment was made. The audited Preview deployment is unchanged.

An **authenticated Cashfree Dashboard session was inspected read-only** for KYC/VCIP/Live evidence. No login, OTP, key generation, webhook change, payment, refund, payout, settlement, RiskShield activation, Production infrastructure access, commit, push, merge, migration or deployment was performed. No secret value, password, OTP, token, API key, private key, full bank/card detail or sensitive document was requested, displayed, logged or stored.

---

## 1. Authoritative status summary

| Check | Status | Authoritative evidence and interpretation |
|---|---|---|
| **KYC** | **PENDING** | Authenticated dashboard Home says **“Start transacting on Cashfree while we review your submitted details.”** Home footer says VCIP **“is required to complete the KYC process.”** Read-only merchant-details response shows `basicKYC: 0`. No `APPROVED` KYC label was found. |
| **VCIP** | **PENDING** | Required, not completed, not self-service. No **Start VCIP**, **Complete VCIP**, **Verify now** or video-upload button exists. The only route is Home → footer → **VCIP → care@cashfree.com**. Merchant-docs response has no VCIP/video entry. |
| **Merchant approval** | **PENDING** | Submitted details are still under review. No merchant-level approval label was found in Profile or Settings. |
| **Cashfree Live** | **UNKNOWN** | Conflicting signals: Live keys exist, a Production webhook is registered, one Live attempt was recorded, Home lists PG under Products Activated, and read-only network responses report `PG: APPROVED` / `paymentActive: 1`; but PG Overview shows **“Product is not activated”** with no displayed reason. Full Live activation is not conclusively verified. |
| **Payment Gateway product activation** | **UNKNOWN** | `Home → Products Activated → Payment Gateway` conflicts with `Payment Gateway → Summary → Overview: Product is not activated`. Reason **NOT DISPLAYED**. |
| **Live API keys** | **CONFIGURED** | Livemode header offers **Switch to Test**; `Payment Gateway → Developers → API Keys` shows a **Live API Keys** section with generation disabled. Values were not inspected or recorded. |
| **Production webhook** | **REGISTERED** | `https://vijay-visuals-site.pages.dev/api/webhooks/cashfree`, API version `2023-08-01`, events **success payment / failed payment / user dropped payment**. Refund events are not subscribed. Webhook logs show `PAYMENT_USER_DROPPED_WEBHOOK` delivered with HTTP `200`. |
| **Webhook secret compatibility** | **VERIFIED** | Observed Live `PAYMENT_USER_DROPPED_WEBHOOK` returned HTTP `200` against the strict HMAC implementation, so the signing secret matched for that delivered event. Secret value was not inspected. Verification is limited to that event. |
| **Easy Split** | **PENDING** | Dashboard requires an account-manager request or `care@cashfree.com` subject **Request to activate Easy Split**. No Live Easy Split activation or vendor/sub-account evidence was found. |
| **Seller settlement** | **BLOCKED** | Easy Split not active; no vendor KYC/bank/UPI mapping in Preview D1; 8 Preview settlement rows remain `pending_activation` / `cashfree_split_pending`. No payout or split was executed. |
| **Live payment** | **NOT TESTED** | Only genuine Live attempt was **User Dropped** on 28 Nov 2026. No `SUCCESS`/`PAID` Live transaction, receipt, settlement or refund exists. |
| **Signed webhook success without mandatory provider fetch** | **FIXED** | Local Preview code now requires authoritative Cashfree `SUCCESS` payment evidence, normalized provider payment ID, ID match with the signed payload, and provider amount/currency preference before any `PAID` transition. Regression tests pass. Not deployed. |
| **Refund attempt on non-captured row** | **FIXED** | Local Preview code now requires local `paid` + `signature_verified=1` + valid normalized Cashfree payment ID, then provider-confirmed matching `SUCCESS` capture and amount before refund reservation/provider call. Regression tests pass. Not deployed. |
| **Missing explicit `CANCELLED`/`EXPIRED` webhook branch** | **FIXED** | Local Preview code now recognizes explicit cancellation/expiry events and conflicting payload states before success handling, stores non-paid terminal state, never false-marks PAID, and maps `EXPIRED` safely in `/verify`. Regression tests pass. Not deployed. |

---

## 2. Dashboard inspection record

All dashboard actions were navigation/read-only:

- **Home:** “Start transacting on Cashfree while we review your submitted details”; footer **VCIP → care@cashfree.com**.
- **Header avatar → Manage your profile → My Information:** Name, User Name, Email ID, Phone Number, Account Password and Customer Support Email ID only. No KYC/VCIP/approval section.
- **Settings:** `General → Account / Users / MCP Server` and `Products → Payment Gateway → Payment Methods / Notifications / Bank Account / Preferences / Wallets / SFTP Configuration`. No KYC/VCIP/Verification menu.
- **Product switcher:** `Access → Payment Gateway`; `Discover → VERIFY IDENTITY → Secure ID` is customer KYC, not merchant VCIP.
- **Developers → API Keys:** Live key pair present; generation disabled; values not inspected.
- **Developers → Webhooks → Configuration:** Production endpoint registered with three payment events. Refund events absent.
- **Developers → Webhooks → Logs:** one `PAYMENT_USER_DROPPED_WEBHOOK` delivery, HTTP `200`.
- **Transactions → Payments / Orders:** one Live attempt, `User Dropped`.
- **Settlements → Standard:** no settlement results; ₹0 unsettled/upcoming.
- **Easy Split:** activation request required; no vendor activation evidence.
- **PG Summary Overview:** **“Product is not activated”**; no reason dialog or action button.
- **Read-only network evidence:** `common/product/status` → `PG: APPROVED`, `PGRS: APPROVED`; `merchant-details/get` → `basicKYC: 0`, `paymentActive: 1`, `isActive: true`; `merchant-docs/get` → 34 entries, 17 `SUBMITTED`, 17 `NOT REQUIRED`, none `APPROVED`/`REJECTED`, no VCIP/video entry.

Full navigation detail and safe element screenshots are in `reports/cashfree-kyc-vcip-navigation.md` and `reports/evidence/`.

No settings, webhooks, keys, payments, refunds, payouts or settlements were changed.

---

## 3. Three payment-hardening concerns — completed locally

### 3.1 Signed webhook success without mandatory provider fetch — **FIXED**

Files: `functions/api/webhooks/cashfree.ts`, `functions/api/payments/_cashfree.ts` types.

- Explicit non-success payload order/payment states are rejected with HTTP `409` before success handling.
- Every `PAYMENT_SUCCESS_WEBHOOK` / `ORDER_PAID_WEBHOOK` calls `fetchEdgeCashfreeOrderPayments` and requires provider `SUCCESS`.
- Provider payment ID must normalize safely and match the signed payload ID when present.
- Provider payment amount/currency are preferred for authoritative amount validation.
- Provider fetch failure fails closed with HTTP `502`; no `PAID` transition or entitlement on missing evidence.
- Preserves unmatched-order logging, refund terminality, strict HMAC/timestamp checks and conditional idempotent ledger claims.

### 3.2 Refund attempt on non-captured row — **FIXED**

File: `functions/api/payments/platform/[id]/refund.ts`.

- Processed-refund replay remains unchanged.
- Before any refund ledger reservation or provider call, require `status='paid'`, `signature_verified=1`, and a valid normalized Cashfree payment ID.
- Require authoritative provider `SUCCESS` for the same normalized payment ID and exact integer-paise amount.
- Both rejection paths write an auditable `platform_refund_rejected_uncaptured` event and return `409`; provider lookup failure returns `502`.
- Existing full-refund-only and provider-`SUCCESS` finalization guards remain intact.

### 3.3 Missing explicit `CANCELLED`/`EXPIRED` webhook branch — **FIXED**

Files: `functions/api/webhooks/cashfree.ts`, `functions/api/payments/cashfree/verify.ts`.

- Recognizes explicit `CANCELLED` / `EXPIRED` event names and payload states before success logic.
- A success-labelled event carrying a cancelled/expired state cannot mark `PAID`.
- Cashfree ledger uses allowed non-paid `CANCELLED`; explicit `EXPIRED` is preserved in notes and response.
- Platform payments map to `failed`; store orders update only when not already `paid`.
- `/verify` maps provider/payment `EXPIRED` to non-paid `CANCELLED` with an explicit expiry message, respecting existing CHECK constraints.

---

## 4. Local Preview-only work completed

| Task | Status | Notes |
|---|---|---|
| Three payment-hardening fixes | **VERIFIED COMPLETE** | Implemented locally, uncommitted, undeployed. |
| Dedicated payment-hardening regressions | **VERIFIED COMPLETE** | `scripts/test-cashfree-payment-hardening.ts`: 15/15 passed. |
| Existing webhook/safety tests updated | **VERIFIED COMPLETE** | Provider mocks added; safety source assertions extended. |
| Gmail OAuth placeholders in `.env.example` | **VERIFIED COMPLETE** | Blank placeholders/comments only; no secret values. Live OTP retest still owner-gated. |
| `CASHFREE_SPLIT_ENABLED` placeholder in `.env.example` | **VERIFIED COMPLETE** | Documented blank/false-by-default; not enabled. |
| Standalone policy routes | **VERIFIED COMPLETE** | `/privacy`, `/terms`, `/refund`, `/shipping`, `/cancellation` routes, links and SPA rewrites added. Legal wording still needs owner review. |
| Local backup/restore drill | **VERIFIED COMPLETE** | `scripts/test-preview-backup-restore.ts`: 4/4 passed with isolated synthetic fixture. |
| Current Cashfree-only deploy/rollback runbook | **VERIFIED COMPLETE** | `docs/PREVIEW_CASHFREE_DEPLOY_ROLLBACK_RUNBOOK.md`; documents snapshot-only rollback for `0008` and `0010`–`0026`. |
| Supabase role-lockdown migration | **NOT APPLICABLE** | Intentionally unstaged/unapplied; raw `platform_owner` profile remains non-privileged. |
| Production verification/deployment | **NOT VERIFIED** | Out of scope; remains owner-authorized only. |

Full classification is in `reports/final-remaining-work-completion-report.md`.

---

## 5. Local test results actually executed

All results below are from real local runs after the code changes:

| Check | Result |
|---|---|
| `npm run lint` | PASS, 0 errors |
| `npm run build` | PASS (non-blocking Vite chunk/config warnings only) |
| `test:cashfree-hardening` | 15 passed, 0 failed |
| `test:cashfree-safety` | 13 passed, 0 failed |
| `test:cashfree-webhook-freshness` | 11 passed, 0 failed |
| `test:cashfree-architecture` | 9 passed, 0 failed |
| `test:backup-restore` | 4 passed, 0 failed |
| `test:supabase-role-lockdown` | 47 passed, 0 failed |
| Owner role + dashboard | 8 passed, 0 failed |
| P0 launch fixes | 22 passed, 0 failed |
| Security blockers | 10 passed, 0 failed |
| Priority fix 13 (security/isolation/white-label) | 41 passed, 0 failed |
| Priority fix 7 tenant discovery | 6 passed, 0 failed |
| Brand cleanup | 6 passed, 0 failed |
| Branding and demo | 10 passed, 0 failed |
| Preview completion regressions | 17 passed, 0 failed |
| Email verification | 19 passed, 0 failed |
| Gmail OAuth provider | 10 passed, 0 failed |
| P0 registration | 16 passed, 0 failed |
| Sandbox payment flow | 34 passed, 0 failed |
| Preview targeted fixes | 15 passed, 0 failed |
| Preview blocker fixes | 9 passed, 0 failed |
| Local integration | 15 passed, 0 failed |
| Master consolidated | 12 passed, 0 failed |
| Master audit | 64 passed, 0 failed |
| Cashfree integration | 26 passed, 0 failed |
| Cashfree idempotency | all local checks passed, 0 failed |
| Customer delivery order workflow | 12 passed, 0 failed |
| Webhook signature security | 16 passed, 0 failed |

Some fixture tests emit benign local audit/log warnings while still reporting zero failures. No Live payment, refund, payout, remote D1, Production endpoint or secret was used by these tests.

---

## 6. Why Production is still not ready

1. **KYC/VCIP remains PENDING** with a support-driven VCIP route through `care@cashfree.com`.
2. **Cashfree Live full activation is unresolved**: PG Overview still says **“Product is not activated”** despite conflicting positive signals.
3. **No successful low-value Live payment** exists; the only Live attempt was `User Dropped`.
4. **Production webhook lacks refund event subscriptions**, while refund webhook handling exists.
5. **Easy Split and seller settlement remain PENDING/BLOCKED** with no provider-confirmed split.
6. **The three code fixes are local and uncommitted/undeployed**; the audited Preview deployment has not been rebuilt with them.
7. **Production infrastructure remains out of scope** under the Preview-only safety rules.

---

## 7. Exact manual action list for Vijay

Only Vijay may perform these external/Production actions. OpenCode stopped before every one:

1. Log in to the authorized Cashfree Dashboard and open **Home → footer → VCIP**. Use **care@cashfree.com** or **Need help? → Care Support / Raise a ticket / Chat with us / Your Account Manager** to request VCIP completion. Do not share sensitive details with OpenCode.
2. Ask Cashfree to clarify the **“Product is not activated”** message at **Payment Gateway → Summary → Overview** and confirm whether Payment Gateway is fully Live-enabled.
3. Report only these status words: KYC `APPROVED`/`PENDING`, VCIP `COMPLETED`/`PENDING`, PG `ACTIVATED`/`NOT ACTIVATED`, Easy Split `APPROVED`/`PENDING`.
4. Confirm which key signs Live PG webhooks; resolve the dedicated-webhook-secret vs PG-client-secret discrepancy.
5. Register the Production webhook events `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `PAYMENT_USER_DROPPED_WEBHOOK`, and only after an explicit decision `REFUND_STATUS_WEBHOOK` / `AUTO_REFUND_STATUS_WEBHOOK`. Do not let OpenCode change webhooks.
6. Generate/confirm Live keys and enter them into Production Cloudflare Pages Secrets yourself. Never paste values into chat, reports, tickets or `VITE_*` variables.
7. Explicitly approve and personally perform one low-value Live payment; verify provider status, receipt, D1 ledger, webhook log, and duplicate retry.
8. If refunds will be used, explicitly approve and personally test one refund after a successful Live payment.
9. Obtain Easy Split approval, execute the addendum, register/verify vendor KYC and bank/UPI details, and confirm one provider-confirmed split before authorizing `CASHFREE_SPLIT_ENABLED=true`.
10. Configure any Gmail OAuth secrets securely if real customer OTP delivery must be retested, then approve one real OTP send/verify. Gmail is not connected here; no draft was saved and no email was sent.
11. Finalize and legally review the standalone privacy/terms/refund/shipping/cancellation pages.
12. Verify custom-domain DNS/TLS and wildcard delivery readiness if that feature will be advertised.
13. Take a full Production D1 snapshot and complete a separately authorized Production backup/restore drill.
14. Request a separate, explicitly authorized commit/merge/deployment after reviewing the local uncommitted changes. No Production rollback or migration should be attempted without that approval.

**Simple Telugu stop instruction:**  
**మీరు Cashfree డ్యాష్‍బోర్డ్‍లోకి లాగిన్ అయి KYC/merchant approval, Live eligibility, Easy Split స్థితిని మాత్రమే తనిఖీ చేసి, సెన్సిటివ్ వివరాలు పంచకుండా నాకు కేవలం approved/pending స్థితిని చెప్పండి.**

---

## 8. Production non-touch confirmation

Production Supabase, Production D1, Production Cloudflare Pages settings, secrets, DNS, domains, SSL, live hosting, Cashfree Live settings, RiskShield, payments, refunds, payouts and settlements were **not accessed, modified, activated or deployed**. No secret value, password, OTP, token, API key, private key, card detail, full bank detail or sensitive merchant document was requested, printed, logged, committed or stored. Sensitive-pattern review of `reports/` and `docs/` found no secret-assignment patterns.

Working-tree user changes were preserved. This completion task changed only Preview code/config/tests/docs/reports and created safe local scripts; it did not commit, push, merge or deploy.

**Final verdict: PRODUCTION NOT READY.** Do not launch until KYC/approval, full Live enablement, a successful low-value Live payment, refund event registration if used, seller settlement activation and deployment of the verified hardening fixes are confirmed with authoritative evidence.

---

## 9. Post-audit local implementation update — 2026-11-28

Sections 1–8 remain the authoritative read-only Cashfree dashboard audit. After Vijay's single consolidated implementation authorization, additional safe local work was completed. It does **not** change the launch verdict and does **not** exist on the audited Preview deployment or in Production.

| Area | Classification | Current local evidence | Launch boundary |
|---|---|---|---|
| Custom pages, support/policy placeholders, service catalog, return lifecycle | **COMPLETED LOCALLY** | `test:support-policy` 6/6, `test:custom-pages` 7/7, `test:service-return` 8/8; shared sanitizer, dedicated D1 tables and tenant-scoped APIs. | Migrations `0027`/`0028` are local source only and were not applied. |
| Cashfree payment hardening from the earlier local pass | **COMPLETED LOCALLY** | `test:cashfree-hardening` 15/15, safety 13/13, freshness 11/11. | Still uncommitted/undeployed; no Live transaction. |
| Existing Preview deployment and isolated Preview fixtures | **PREVIEW VERIFIED** | Audited deployment `6b5d3e96-...` unchanged; local Preview fixtures used for mock/migration/regression checks. | New changes require separate deployment authorization. |
| KYC, VCIP, merchant approval, Live/PG activation, refund events, Easy Split, seller settlement | **EXTERNAL BLOCKED** | Exact statuses remain `PENDING`, `PENDING`, `PENDING`, `UNKNOWN`, `UNKNOWN`, absent, `PENDING`, `BLOCKED`. | Only Vijay can obtain authoritative provider clarification/status. |
| Live keys, legal/business details, RiskShield decision, commit/deploy authorization | **OWNER INPUT REQUIRED** | No secret, GSTIN, legal entity, address, grievance contact or commercial term was invented. RiskShield remains not activated with terms `UNKNOWN`. | Owner-controlled; nothing was changed here. |
| Live payment, Live refund, final Lighthouse/axe, real-device QA, load test | **NOT TESTED** | Mocked tests are not Live proof; no final-build performance/accessibility/load run is claimed. | Requires explicitly authorized tests. |
| AI video/photo editing product | **FUTURE ROADMAP** | `docs/FUTURE_AI_EDITING_ROADMAP.md`; no editor/render pipeline activated. | Separate product scope. |

`npm.cmd run lint` and `npm.cmd run build` both pass after the final edits (build has only the known non-blocking Vite config/chunk warnings). The 28-file local D1 migration test passes and includes `0027`/`0028` on in-memory SQLite only.

The complete task-by-task classification, all verified test results and the exact blocker list are in `reports/final-vijay-visuals-implementation-completion.md`. No new Production, commit, push, merge or deploy action was taken.
