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
- Counted usage is `SUM(credits_deducted)` for the current period where status is `success` or `reserved`.
- Active reservations are always counted. A reservation is released only by an explicit terminal update (`success` or `failed`) from the request that owns it; there is no time-based expiry.
- A provider failure marks the reservation `failed` with `credits_deducted = 0`; the customer is not charged.
- Replaying the same request ID never executes a second provider call. Cross-tenant replay is rejected by the tenant-scoped idempotency lookup and the globally unique `request_id`.

## Failure behavior

- All metered HTTP AI endpoints (`/api/ai/generate`, `/api/ai/content-studio`, `/api/ai/seo-assistant`, `/api/ai/setup-assistant`, `/api/platform/ai-assistant`, `/api/owner/tenants/:tenantId/ai-assistant`) call `requireAuthorizedAiTenant()` before the credit meter. That gate requires D1, so HTTP requests fail closed when D1 is unavailable, before any provider call or reservation is attempted.
- On the HTTP path, a missing ledger table/column or any ledger write error also fails closed with `503 AI_LEDGER_UNAVAILABLE` before the provider call. There is no best-effort or unmetered fallback on that path.
- `executeWithAiCreditDeduction()` fails closed with `503 AI_LEDGER_UNAVAILABLE` when `env.DB` is missing. It never calls the provider without an authoritative D1 reservation.
- Retrying the same request ID after a provider failure returns `409 AI_REQUEST_ALREADY_USED`; use a new request ID to retry.

## Honest limitations

- `tenant_ai_usage.request_id` is globally unique. A request ID used by one tenant cannot be reused by another; collisions return `409`. This prevents cross-tenant replay but means clients should generate sufficiently unique IDs.
- Successful idempotent responses are cached only in the current isolate. If the cache entry is absent, a replay still does not call the provider or charge credits, but it returns a neutral “already processed” notice instead of the original text.
- `getTenantAiQuota()` and `_aiTenantAccess` perform advisory preflight reads. They improve UX but are not the enforcement boundary.
- **Reservation reconciliation:** because reservations are no longer time-expired, an isolate crash after reservation but before terminal update can leave a row in `reserved` state and temporarily reduce available quota. This fails closed rather than allowing an unmetered generation; operators must reconcile such rows manually if a provider call is known never to have run.
