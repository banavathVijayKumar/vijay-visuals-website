# VIJAY VISUALS — Current Cashfree-only Preview Deploy / Rollback Runbook

**Date:** 2026-11-28  
**Scope:** Safe Preview preparation only. No Production deployment, remote D1 command, DNS/DNS-SSL change, secret entry, merge, commit or push is authorized by this document.  
**Audit branch:** `preview/vijay-visuals-p0-safe-2026-11-26`  
**Audited Preview deployment:** `6b5d3e96-0acd-45b1-83d2-5de3194d5157`

This runbook supersedes the action sections of the historical Razorpay-era docs:
`docs/GLOBAL_PRODUCTION_RELEASE_PLAN.md` and `docs/PRODUCTION_DEPLOYMENT_AND_OPERATIONS.md`. Those files are retained only as historical context; Razorpay must not be configured or reintroduced.

---

## 1. Safety stop points

Stop and ask Vijay explicitly before any of the following:

- commit, push, merge, or deploy;
- touching Production Supabase, Production D1, Cloudflare Pages settings, DNS, domains, SSL, or secrets;
- entering/generating/rotating Live API keys, webhook secrets, Gmail OAuth secrets, or any other credential;
- registering/changing a Cashfree Production webhook;
- starting a Live payment, refund, payout, settlement, or RiskShield activation;
- applying the intentionally unstaged `supabase/migrations/0001_vijay_visuals_rls_and_auth.sql` role-lockdown migration.

Raw `profiles.role='platform_owner'` remains non-privileged. The singleton `platform_owner` table remains authoritative, and the Owner route stays `/dashboards/platform-owner`.

---

## 2. Local Preview verification already safe

Run only on the local working copy. No network or account access is required by these commands:

```bash
npm run lint
npm run build
npm run test:cashfree-hardening
npm run test:cashfree-safety
npm run test:cashfree-webhook-freshness
npm run test:cashfree-architecture
npm run test:backup-restore
```

The local backup/restore drill uses an in-memory SQLite fixture only. It exports synthetic tenant rows, computes SHA-256, mutates/deletes fixture rows, restores the export, verifies the checksum, and records an audit row. It does **not** access remote D1 or Production data.

---

## 3. Preview deployment

The audited Preview deployment used the existing branch preview build. No manual deployment was performed in this work.

If Vijay later authorizes a Preview-only deploy, follow the repository's normal branch-preview mechanism and verify:

- `/api/health` returns safe booleans only;
- `/api/payments/config` reports Cashfree only and Sandbox-only configuration;
- `/api/payments/razorpay/config` remains `404`;
- `/api/webhooks/cashfree` GET remains active;
- checkout keeps Online (Cashfree) and COD as separate methods;
- policy routes `/privacy`, `/terms`, `/refund`, `/shipping`, `/cancellation` return the SPA page;
- no secret value appears in bundle, logs, reports, or browser responses.

Never put `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `GMAIL_OAUTH_*`, Supabase service-role keys, OTPs, bank details, or personal documents into client code or reports.

---

## 4. D1 migration coverage and rollback truth

### 4.1 Local migration check

Local, non-remote verification only:

```bash
wrangler d1 execute vijay-visuals-marketplace --local --file=cloudflare/d1/schema.sql
```

The repository also has `scripts/test-local-d1-migrations.ts` for local migration coverage. No `--remote` command is part of this Preview-only runbook.

### 4.2 Files with dedicated SQL rollback scripts

The following rollback files exist under `cloudflare/d1/rollback/`:

- `0002_domain_management_rollback.sql`
- `0003_complete_platform_saas_rollback.sql`
- `0004_razorpay_platform_payments_rollback.sql`
- `0005_ecommerce_reviews_shipping_proposals_rollback.sql`
- `0006_global_i18n_seo_growth_rollback.sql`
- `0007_customer_purchase_plans_rollback.sql`
- `0009_tenant_ai_credit_ledger_rollback.sql`

### 4.3 Migrations without dedicated SQL rollback

There is no dedicated rollback SQL for `0008` or `0010`–`0026` (including the Cashfree, owner-singleton, idempotency, OTP, and Preview-completion migrations). For those migrations, rollback means **restore from a verified pre-change snapshot**, not guess at destructive `DROP` statements.

Before any separately authorized Production migration/deployment, Vijay must personally take and verify a full D1 snapshot. OpenCode has not done this and must not do it under the Preview-only safety rules.

---

## 5. Frontend/Functions rollback

Cloudflare Pages supports one-click rollback to a previous deployment in **Deployments**. Under this task, no Production deployment was inspected or changed.

After explicit owner approval only:

1. identify the last known-good Production deployment;
2. confirm DNS/domain state has not changed;
3. perform the Pages rollback in the Cloudflare dashboard;
4. verify `/api/health`, Cashfree-only config, webhook GET status, login, Owner dashboard, checkout, COD, and policy routes;
5. record only safe status words and non-secret deployment IDs.

---

## 6. Database restore rule

If a separately authorized Production rollback requires a database restore, the only safe documented path is:

1. stop new writes/maintenance activity after owner approval;
2. use the verified pre-change snapshot captured before the change;
3. restore through the owner-approved D1 process;
4. verify row counts, idempotency ledgers, payment/refund ledgers, tenant isolation, and audit rows;
5. never invent rollback SQL for migrations lacking files;
6. never leave a partial restore claimed as successful.

No Production snapshot, restore, migration, or rollback was executed for this report.

---

## 7. Owner-only external steps still pending

1. Complete Cashfree KYC/VCIP via `care@cashfree.com`; report only `APPROVED`/`PENDING` status words.
2. Clarify the PG **“Product is not activated”** toast and confirm full Live activation.
3. Confirm which secret signs Live PG webhooks.
4. Register refund events (`REFUND_STATUS_WEBHOOK`, `AUTO_REFUND_STATUS_WEBHOOK`) only after an authorized Live webhook decision.
5. Explicitly perform one low-value Live payment and verify receipt, ledger, webhook, and retry behavior.
6. Obtain Easy Split approval, vendor KYC, addendum, and one provider-confirmed split before considering `CASHFREE_SPLIT_ENABLED`.
7. Configure any Gmail OAuth variables securely in Cloudflare Pages Secrets and approve one real OTP retest. Gmail is not connected in this session; no draft was saved and no email was sent.
8. Complete Production DNS/TLS, policy legal review, and a Production backup/restore drill under separate approval.

---

## 8. Verdict

This runbook is preparation only. The launch verdict remains **PRODUCTION NOT READY** until the owner-only steps above are completed with authoritative evidence. OpenCode did not commit, push, merge, deploy, configure Production, move money, or activate any external product.
