# Cashfree Live Activation Checklist — VIJAY VISUALS

**Date:** 2026-11-28  
**Branch / audited HEAD commit / audited Preview deployment:** `preview/vijay-visuals-p0-safe-2026-11-26` / `16bac20080bd7326daa3152ecd96d8a4bdf10fbe` / `6b5d3e96-0acd-45b1-83d2-5de3194d5157`  
**Preview URL:** https://preview-vijay-visuals-p0-saf.vijay-visuals-site.pages.dev/  
**Verdict:** **PRODUCTION NOT READY.** KYC/VCIP and Easy Split are pending, full Live activation is UNKNOWN, and no successful low-value Live payment exists.

## Status meanings

- **VERIFIED COMPLETE** — OpenCode verified from Preview code, local mocked tests, safe endpoints and read-only Preview D1 queries.
- **ACTION REQUIRED FROM VIJAY** — needs Vijay’s authenticated dashboard login, secure secret entry, explicit approval, legal decision or external provider confirmation.
- **BLOCKED BY CASHFREE** — cannot be completed until Cashfree approves/enables the merchant capability or provides authoritative status.
- **NOT VERIFIED** — no authoritative evidence was available under the Preview-only safety rules.
- **NOT APPLICABLE** — intentionally out of scope or deliberately disabled.

---

## 1. Stop point for Vijay — one instruction

**Simple Telugu instruction:**  
**మీరు Cashfree డ్యాష్‍బోర్డ్‍లోకి లాగిన్ అయి KYC/merchant approval, Live eligibility, Easy Split స్థితిని మాత్రమే తనిఖీ చేసి, సెన్సిటివ్ వివరాలు పంచకుండా నాకు కేవలం approved/pending స్థితిని చెప్పండి.**

OpenCode inspected an authenticated dashboard session read-only. No login, OTP, upload, activation, key/webhook change, payment, refund, payout, settlement or support submission was performed. Everything below is safe Preview verification/documentation only.

---

## 2. Cashfree merchant readiness and KYC

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Merchant KYC | ACTION REQUIRED FROM VIJAY | Dashboard Home says submitted details are under review; read-only `basicKYC: 0`. No `APPROVED` label. | Complete VCIP through Cashfree support and report only `APPROVED`/`PENDING`. |
| VCIP | BLOCKED BY CASHFREE | Required, not completed, no self-service button; dashboard routes to `care@cashfree.com`. No VCIP/video document entry. | Contact `care@cashfree.com` from the registered merchant email; do not share sensitive details with OpenCode. |
| Merchant approval | ACTION REQUIRED FROM VIJAY | Still `PENDING`; no merchant-level approval label in Profile or Settings. | Confirm the dashboard status word only. |
| Live-mode eligibility | NOT VERIFIED | Live keys exist and a Live attempt occurred, but PG Overview says **“Product is not activated”** with no reason. `PG: APPROVED` / `paymentActive: 1` conflict with the UI. | Ask Cashfree to resolve the conflict and confirm full Live eligibility. |
| Exact pending compliance requirements | ACTION REQUIRED FROM VIJAY | 17 documents read-only as `SUBMITTED`, 17 `NOT REQUIRED`, none `APPROVED`/`REJECTED`. No document content opened. | Read and complete only dashboard items; never send document content to OpenCode. |

---

## 3. Live configuration readiness

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Live API credentials | ACTION REQUIRED FROM VIJAY | Live key section exists in dashboard; values not inspected. Preview config is Sandbox-only and exposes safe booleans only. | Generate/confirm keys in dashboard and enter them only into Production Cloudflare Pages Secrets. |
| Single active gateway | VERIFIED COMPLETE | Cashfree only; `/api/payments/razorpay/config` remains `404`; historical Razorpay columns are ledger references only. | Keep Razorpay decommissioned. |
| Sandbox/Live cannot be mixed at runtime | VERIFIED COMPLETE | `_cashfree.ts` selects exactly one API host from `CASHFREE_ENV`; no key/host blending path. No prefix assertion exists, so mismatched keys fail at Cashfree. | Ensure Production uses a complete Live-only env set; keep Preview Sandbox-only. |
| Expected webhook endpoint | VERIFIED COMPLETE | Preview GET shows active endpoint and dedicated secret boolean. Production endpoint is registered with API version `2023-08-01`. | Do not register Preview as Production; confirm the Production endpoint after Live approval. |
| Webhook signature algorithm | VERIFIED COMPLETE | HMAC-SHA256 over `timestamp + rawBody`; Base64/hex accepted; timestamp freshness enforced; client-secret fallback rejected. Observed Production event returned HTTP `200`. | Confirm which key signs Live PG webhooks; resolve dedicated-webhook-secret vs PG-client-secret discrepancy. |
| Event handling | VERIFIED COMPLETE | Code handles success, failed, user-dropped, refund events, plus explicit `CANCELLED`/`EXPIRED` terminal states. Unknown signed events are durably logged and never marked paid. | Subscribe only to intended Live events and confirm exact names in dashboard. |
| Refund event subscriptions | ACTION REQUIRED FROM VIJAY | Dashboard has success/failed/user-dropped only; `REFUND_STATUS_WEBHOOK` and `AUTO_REFUND_STATUS_WEBHOOK` are absent. | Register refund events only after an explicit Live refund decision; do not ask OpenCode to change webhooks. |
| Idempotency / retry safety | VERIFIED COMPLETE | Stable event IDs, dedupe ledger, conditional `PAID`, deterministic refund ID/idempotency key, settlement/notification keys, 15/15 hardening and all idempotency checks pass locally. | Verify one Live duplicate retry does not duplicate fulfilment or notifications. |
| Pending / failed / cancelled / expired payments | VERIFIED COMPLETE | `/verify` maps `FAILED`, `CANCELLED`, `USER_DROPPED`, `EXPIRED`, `REFUNDED` safely; webhook terminal branch cannot overwrite `PAID`/`REFUNDED`. | Observe one Live failed/dropped path if feasible. |
| Duplicate success callback | VERIFIED COMPLETE | Every success branch requires authoritative provider `SUCCESS`, normalized provider ID match, and provider amount/currency evidence before `PAID`. | Confirm via Live webhook log after an approved Live payment. |
| Signed webhook success without provider fetch | VERIFIED COMPLETE | Gap fixed locally in `functions/api/webhooks/cashfree.ts`; 15/15 hardening tests pass. Not deployed. | After separate approval, deploy/verify this change before relying on Live payments. |
| Refund on non-captured row | VERIFIED COMPLETE | Gap fixed locally in `functions/api/payments/platform/[id]/refund.ts`; local paid + signature + payment ID and provider capture/amount checks added. Not deployed. | After separate approval, deploy/verify before authorizing Live refunds. |
| `CANCELLED` / `EXPIRED` webhook status | VERIFIED COMPLETE | Gap fixed locally in webhook and `/verify`; explicit `EXPIRED` preserved in notes/response, ledger uses allowed `CANCELLED`. Not deployed. | After separate approval, deploy/verify before Live. |
| Webhook registration changed | NOT APPLICABLE | Not attempted under safety rules. | Vijay must perform/authorize separately. |

---

## 4. Seller settlement readiness

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Existing settlement rows | BLOCKED BY CASHFREE | 8 Preview rows, all `pending_activation` / `cashfree_split_pending`; no payout executed. | Do not treat these rows as paid. Reconcile only after provider confirmation. |
| Exact blocker for existing merchant | BLOCKED BY CASHFREE | `seller_payout_accounts` returned zero rows; no vendor/sub-account or bank/UPI mapping. | Enable Easy Split, register/verify the seller vendor and bank/UPI details in Cashfree. |
| Easy Split product enablement | BLOCKED BY CASHFREE | Dashboard requires account-manager request or `care@cashfree.com`. Sandbox simulation API was not called. | Contact/await Cashfree account-manager approval. |
| Split Settlement Addendum | ACTION REQUIRED FROM VIJAY | No executed addendum evidence. | Execute/confirm addendum with Cashfree; do not share signed documents with OpenCode. |
| Vendor KYC / bank verification | BLOCKED BY CASHFREE | No vendor activation evidence; provider statuses remain UNKNOWN. | Add each seller as vendor, submit KYC, and confirm `ACTIVE` with verified bank/UPI. |
| `CASHFREE_SPLIT_ENABLED` | ACTION REQUIRED FROM VIJAY | Blank placeholder now documented in `.env.example`; code reads flag but it remains disabled/uninspected in Production. | Set only after approval, KYC and a provider-confirmed split, under explicit owner authorization. |
| Provider-confirmed split | BLOCKED BY CASHFREE | No provider split call or settlement webhook confirmation exists in Preview. | Verify one provider-confirmed split before claiming payout success. |

---

## 5. Verified low-value Live transaction

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Low-value Live payment | BLOCKED BY CASHFREE | Only Live attempt was `User Dropped`; OpenCode initiated no payment. | After Live keys/webhook are ready, explicitly approve and personally perform one low-value Live transaction. |
| Server-side verification | VERIFIED COMPLETE | Verification fetches authoritative order/payment entities and validates ownership, refund state, integer paise, INR and successful payment identity. | Confirm the same behaviour on the Live transaction. |
| Receipt / ledger / webhook reconciliation | ACTION REQUIRED FROM VIJAY | Code writes receipts/notifications idempotently; local mocked tests pass. | Confirm Live receipt, D1 ledger status, webhook log and notification delivery. |
| Live refund path | ACTION REQUIRED FROM VIJAY | Refund code uses deterministic identity, provider API with idempotency, terminal guards and webhook finalization; new capture guard passes local tests. No Live refund was initiated. | Optionally test one refund after the low-value Live payment, only with explicit approval. |

---

## 6. Checkout and payment safety

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Cashfree-only online checkout | VERIFIED COMPLETE | Cashfree sole active gateway; Razorpay route `404`; legacy columns retained only for reconciliation; architecture 9/9 and integration 26/26 pass. | None. Do not reintroduce Razorpay. |
| COD separation | VERIFIED COMPLETE | Checkout maps COD separately; read-only D1 shows COD order without `gateway_order_id`; COD does not require Cashfree. | None for Preview. |
| Per-shop isolation | VERIFIED COMPLETE | Gateway rows carry `website_id`/`owner_id`; verification matches persisted order, owner and website; tenant isolation suites pass. | Preserve separation for real sellers. |
| False payment success | VERIFIED COMPLETE | Event name alone insufficient; authoritative provider status, amount/currency, ID match, refund terminality and conditional claims enforced. | Watch first Live transaction for unexpected success states. |
| Historical Razorpay records | VERIFIED COMPLETE | Preserved as legacy fields; not deleted, repurposed or re-enabled. | Do not request deletion/rewrite. |

---

## 7. Remaining launch readiness items

| Item | Status | OpenCode verified | Vijay must manually approve / perform |
|---|---|---|---|
| Email / OTP delivery | ACTION REQUIRED FROM VIJAY | Gmail OAuth adapter is Preview-only and narrow-scoped; blank `GMAIL_*` placeholders added to `.env.example`; mocked email/Gmail/registration suites pass. Gmail is not connected here; no draft/email sent. | Securely configure Preview/Production sender secrets if needed and approve one real OTP retest. |
| Privacy / Terms / Refund / Shipping / Cancellation pages | ACTION REQUIRED FROM VIJAY | Standalone SPA routes, footer links and explicit rewrites added; copy states only confirmed behaviour and marks pending items. | Finalize and legally review binding wording before launch. |
| Backup and restore | ACTION REQUIRED FROM VIJAY | Local isolated export/checksum/mutate/restore/audit drill passes 4/4; current runbook documents snapshot-only rollback for `0008` and `0010`–`0026`. | Take a full Production D1 snapshot and test restore/rollback under separate approval. |
| Official domain / DNS / SSL | ACTION REQUIRED FROM VIJAY | Code allows verified hosts; wildcard DNS/TLS remains unproven; `/site/:slug` honest fallback retained. | Verify DNS, custom hostname SSL and wildcard delivery TLS externally. |
| Production deployment / rollback readiness | NOT VERIFIED | Current Cashfree-only runbook exists; no Production deployment/settings inspected; no new deployment made. | Perform a separately authorized Production audit, snapshot and rollback drill. |
| RiskShield pricing / renewal / cancellation | ACTION REQUIRED FROM VIJAY | No project evidence; terms remain UNKNOWN; RiskShield not activated. | Obtain official terms and decide separately. Do not activate by default. |
| Production access | NOT APPLICABLE | Production Supabase/D1/Cloudflare/DNS/domains/SSL/secrets were not accessed. | Keep separate explicit approval for any Production work. |

---

## 8. Exact manual sequence for Vijay

1. **Stop here:** use the Telugu instruction in section 1. OpenCode cannot proceed past authentication or external approval.
2. Confirm KYC/merchant approval and Live eligibility; report only status words.
3. Complete VCIP via `care@cashfree.com`; ask Cashfree to clarify **“Product is not activated”**.
4. Confirm which secret signs Live PG webhooks; resolve the dedicated-secret vs client-secret discrepancy.
5. Register/confirm Production webhook URL and intended payment events; register refund events only if refunds are approved.
6. Generate/confirm Live keys and enter them into Production Cloudflare Pages Secrets yourself.
7. After separate approval, deploy the locally verified hardening changes and re-run targeted checks on Preview/Production as authorized.
8. Explicitly approve and personally execute one low-value Live transaction; verify ledger, receipt, server verification, webhook log and duplicate retry.
9. If refunds are used, explicitly approve and personally test one refund.
10. Obtain Easy Split approval, execute addendum, register/verify each seller vendor/sub-account and bank/UPI details, then authorize `CASHFREE_SPLIT_ENABLED=true` only after a provider-confirmed split.
11. Complete Gmail/OTP, legal policy, DNS/TLS, and Production backup/restore items above.
12. Request a separate, explicitly authorized commit/merge/deployment. OpenCode will not commit, push, deploy, activate Live, activate RiskShield, move money, or touch Production under this task.

---

## 9. Production non-touch confirmation

Production Supabase, Production D1, Production Cloudflare Pages settings, secrets, DNS, domains, SSL, hosting and Live payment settings were **not accessed, modified or deployed**. No real payment, refund, payout, settlement activation, secret value, password, OTP, token, private key or card detail was requested, displayed, logged, committed or stored by this checklist work.

**Final verdict: PRODUCTION NOT READY.**
