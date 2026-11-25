# AI credit quota reservation

## Authoritative enforcement

`executeWithAiCreditDeduction()` in `functions/api/_aiCredits.ts` enforces the monthly allowance with a **single conditional D1 `INSERT ... SELECT ... WHERE` statement**.

- The usage sum and the allowance are recomputed inside that statement at execution time.
- No application-level `SELECT` result authorizes the reservation.
- D1 serializes writes, so concurrent requests with different request IDs cannot both pass the same stale quota snapshot and reserve the same final credits.
- A request that cannot be reserved writes no ledger row, calls no AI provider, and returns `403 AI_QUOTA_EXHAUSTED`.

## Allowance rules

The allowance is resolved in SQL from `subscription_plans.monthly_ai_credits` joined to `tenant_subscriptions` where:

- `ts.status = 'active'`
- `ts.current_period_end > datetime('now')`
- `sp.code = ts.plan_code`

Only an active, unexpired subscription can raise the allowance. If none exists, the server-side publication row's `planTier` is used via `getPackageMonthlyAiCredits()`. Client-supplied plan/role/owner fields are never consulted.

There is no separate purchased-credit/top-up table in the current schema. “Purchased credits” therefore means the monthly credits attached to the purchased plan; no new credit type is invented here.

## Usage accounting

- Billing period is UTC `YYYY-MM` from `getCurrentBillingPeriod()`.
- Counted usage is `SUM(credits_deducted)` for the current period where status is `success`, or `reserved` and newer than two minutes.
- Reservations older than two minutes are marked `failed` with `credits_deducted = 0` before the authoritative reservation statement runs.
- A provider failure marks the reservation `failed` with `credits_deducted = 0`; the customer is not charged.
- Replaying the same request ID never executes a second provider call. Cross-tenant replay is rejected by the tenant-scoped idempotency lookup and the globally unique `request_id`.

## Failure behavior

- Missing D1 binding, missing ledger table/column, or any ledger write error fails closed with `503 AI_LEDGER_UNAVAILABLE` before the provider call.
- There is no best-effort or unmetered fallback when the reservation system is unavailable.
- Retrying the same request ID after a provider failure returns `409 AI_REQUEST_ALREADY_USED`; use a new request ID to retry.

## Honest limitations

- `tenant_ai_usage.request_id` is globally unique. A request ID used by one tenant cannot be reused by another; collisions return `409`. This prevents cross-tenant replay but means clients should generate sufficiently unique IDs.
- Successful idempotent responses are cached only in the current isolate. If the cache entry is absent, a replay still does not call the provider or charge credits, but it returns a neutral “already processed” notice instead of the original text.
- `getTenantAiQuota()` and `_aiTenantAccess` perform advisory preflight reads. They improve UX but are not the enforcement boundary.
