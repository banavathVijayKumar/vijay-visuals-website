# Delivery payouts design (local, no real payouts)

Status: **design only**. No Cashfree Payouts call, beneficiary, balance check, transfer,
or provider-confirmed status exists in this repository. Collections remain Cashfree-only.

## Current local behaviour

- Rider earnings are written after both `store_orders.order_status` and
  `delivery_assignments.status` are `delivered`.
- Earnings are append-only `finance_ledger` rows with
  `category='rider_earnings'` and deterministic
  `reference_id = rider_earnings:{websiteId}:{orderId}:{partnerId}`.
- Earnings amount is `round(order.total_inr × deliveryCommissionPct / 100)`.
- `deliveryCommissionPct` is stored in `customer_website_publications.website_json`
  and shown as a transparent rate card.
- Dashboards show **pending payout** only. Nothing is ever marked paid locally
  without a provider confirmation.

## Why real payouts are not implemented here

The existing D1 schema has no payout table, provider transfer ID, UTR, payout status,
failure reason, batch/run ID, or webhook flow type for payouts. Reusing seller
settlement or legacy Razorpay transfer tables would produce misleading status. A
migration is outside the current local-only scope.

External prerequisites before implementation:

1. Cashfree Easy Split / payout capability approved for the merchant.
2. Verified rider beneficiary (bank account + IFSC) registered by the merchant.
3. Split Settlement Addendum verification.
4. Payout credentials and a dedicated payout webhook secret configured by the
   owner through the normal secure configuration process.
5. Explicit approval to enable provider calls and a schema migration.

No credential values are stored in this document.

## Target design once approved

### 1. New tables required by migration

- `rider_payout_accounts`: tenant, membership, encrypted beneficiary reference,
  verification status, audit fields. Never store full account/bank PII in logs.
- `rider_payout_batches`: tenant, week start/end, currency, total amount, state,
  created by, provider batch reference, provider status.
- `rider_payout_transfers`: batch, earning references, membership, amount,
  idempotency key, provider transfer ID, UTR, provider status, failure reason,
  raw response hash, attempt count, timestamps.
- Payout webhook events with a distinct flow type and canonical event identity.

### 2. Weekly run

- Cron or owner-initiated run selects delivered earning references not already
  linked to a transfer, grouped by tenant and week.
- Idempotency key: `payout:{tenantId}:{week}:{membershipId}:{hash(earningRefs)}`.
- Provider call is made only with `idempotency-key`; a retry reuses the same key.
- On timeout, status stays `uncertain`; reconciliation queries the provider by
  idempotency key/reference before any retry. No duplicate transfer is created.
- Provider status is the only source of `paid`/`failed`/`reversed`.

### 3. Reconciliation

- Webhook and status-poll both write provider-confirmed state into
  `rider_payout_transfers`, deduped by canonical event/transfer ID.
- A transfer is reconcilable only when all linked earning references are still
  `rider_earnings` rows and no reversal exists.
- Failures keep earnings posted and transfer status explicit; no fake balance is
  deducted.
- Reversal opens an exception queue for owner review; ledger rows are append-only
  and are never deleted.

### 4. UI contract

Owner and rider dashboards must display: posted earnings, pending amount,
provider-confirmed paid amount, failed/reversed amount, week/batch reference,
and “no payout sent” when no provider confirmation exists.

## Feasibility: ₹80,000 net/month at 8 hours/day

Inputs from code: commission percentage and delivered order total. All other
inputs below are labelled assumptions, not stored facts.

Let `T = 80000`, `E = monthly rider expenses`, `p = commission fraction`,
`A = average delivered order value`, `D = working days/month`, `N = orders/day`.

- Required gross delivered order value: `G = (T + E) / p`.
- Required orders/day: `N = ceil(G / (D × A))`.
- Minutes available per order: `(8 × 60) / N`.

| Commission | Required monthly GMV (E=0) | Orders/day at A=₹500, D=26 | Orders/day at A=₹1,000, D=26 | Minutes/order at A=₹500 |
|---:|---:|---:|---:|---:|
| 5% | ₹1,600,000 | 124 | 62 | ~3.9 |
| 10% | ₹800,000 | 62 | 31 | ~7.7 |
| 15% | ₹533,334 | 42 | 21 | ~11.4 |
| 20% | ₹400,000 | 31 | 16 | ~15.5 |

The repository contains no rider hours, expense, average-order-value, time-per-delivery,
tax withholding, or schedule data. Therefore the target cannot be declared feasible or
infeasible from code alone; the table is a rate-card planning framework only.
