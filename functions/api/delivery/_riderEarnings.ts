// ============================================================================
// Rider earnings ledger (append-only, no migration).
//
// Uses existing finance_ledger rows with category='rider_earnings' and a
// deterministic reference_id. No row is ever updated or deleted by this code.
// Earnings are posted only after D1 proves the order and its assignment are
// both delivered. This is an internal operational ledger, not a payout.
// ============================================================================

import type { CloudflareEnv } from '../_shared';
import { writeAuditLog } from '../_shared';
import { dispatchLifecycleNotification } from '../_lifecycleNotifications';

const EARNINGS_CATEGORY = 'rider_earnings';
const EARNINGS_PREFIX = 'rider_earnings';

/**
 * App-level in-flight guard. The D1 unique index in migration 0022 is the
 * durable guard; this set additionally makes concurrent calls in one isolate
 * safe even when the migration has not yet been applied.
 */
const inFlightEarnings = new Set<string>();

export interface RiderEarningsResult {
  posted: boolean;
  amountInr?: number;
  reason:
    | 'posted'
    | 'duplicate'
    | 'invalid'
    | 'db_unavailable'
    | 'not_delivered'
    | 'commission_not_configured'
    | 'ledger_unavailable';
}

export function riderEarningsReferenceId(
  websiteId: string,
  orderId: number,
  partnerId: number
): string {
  return `${EARNINGS_PREFIX}:${websiteId}:${orderId}:${partnerId}`;
}

export async function postRiderEarnings(
  env: CloudflareEnv,
  input: { websiteId: string; orderId: number; partnerId?: number | null }
): Promise<RiderEarningsResult> {
  const websiteId = String(input.websiteId || '');
  const orderId = Number(input.orderId);
  if (!env.DB || !websiteId || !Number.isInteger(orderId)) {
    return { posted: false, reason: 'invalid' };
  }

  // The partner hint is never trusted as authorization: the assignment row is
  // the only source of the rider who actually completed the delivery.
  const hintedPartnerId = Number(input.partnerId || 0);
  const pendingKey = `${websiteId}:${orderId}:${hintedPartnerId}`;
  if (inFlightEarnings.has(pendingKey)) {
    return { posted: false, reason: 'duplicate' };
  }
  inFlightEarnings.add(pendingKey);

  try {
    const delivered = await env.DB.prepare(
      `SELECT o.id, o.order_number, o.owner_id, o.total_inr, o.order_status,
              da.status AS assignment_status, da.delivery_partner_user_id
       FROM store_orders o
       JOIN delivery_assignments da ON da.order_id = o.id AND da.website_id = o.website_id
       WHERE o.id = ? AND o.website_id = ? LIMIT 1`
    )
      .bind(orderId, websiteId)
      .first<Record<string, any>>();

    const assignedPartnerId = Number(delivered?.delivery_partner_user_id || 0);
    if (
      !delivered ||
      String(delivered.order_status) !== 'delivered' ||
      String(delivered.assignment_status) !== 'delivered' ||
      !Number.isInteger(assignedPartnerId) ||
      assignedPartnerId <= 0
    ) {
      return { posted: false, reason: 'not_delivered' };
    }

    const partnerId = assignedPartnerId;
    const referenceId = riderEarningsReferenceId(websiteId, orderId, partnerId);
    const existing = await env.DB.prepare(
      `SELECT id FROM finance_ledger
       WHERE website_id = ? AND category = ? AND reference_id = ? LIMIT 1`
    )
      .bind(websiteId, EARNINGS_CATEGORY, referenceId)
      .first<{ id?: number }>();
    if (existing?.id) return { posted: false, reason: 'duplicate' };

    const publication = await env.DB.prepare(
      'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ website_json?: string }>();

    let parsed: Record<string, any> = {};
    try {
      const raw = publication?.website_json ? JSON.parse(publication.website_json) : {};
      if (raw && typeof raw === 'object') parsed = raw;
    } catch {
      parsed = {};
    }

    const commissionPct = Math.max(
      0,
      Math.min(100, Number(parsed.deliveryCommissionPct || 0))
    );
    if (!Number.isFinite(commissionPct) || commissionPct <= 0) {
      return { posted: false, reason: 'commission_not_configured' };
    }

    const amountInr = Math.round(Number(delivered.total_inr || 0) * commissionPct / 100);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return { posted: false, reason: 'commission_not_configured' };
    }

    const notes = `Rider earnings for order #${String(delivered.order_number || orderId)} at ${commissionPct}% tenant commission.`;
    const write = await env.DB.prepare(
      `INSERT INTO finance_ledger
        (website_id, owner_id, entry_type, category, amount_inr, gst_inr,
         reference_id, notes, entry_date, created_by, created_at)
       SELECT ?, ?, 'expense', ?, ?, 0, ?, ?, date('now'), 'system', datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM finance_ledger
         WHERE website_id = ? AND category = ? AND reference_id = ?
       )`
    )
      .bind(
        websiteId,
        String(delivered.owner_id || ''),
        EARNINGS_CATEGORY,
        amountInr,
        referenceId,
        notes,
        websiteId,
        EARNINGS_CATEGORY,
        referenceId
      )
      .run();

    if (!write.meta?.changes) return { posted: false, reason: 'duplicate' };

    await writeAuditLog(env, {
      actorId: 'system',
      actorRole: 'system',
      action: 'rider_earning_posted',
      targetType: 'order',
      targetId: String(orderId),
      details: {
        websiteId,
        partnerId,
        amountInr,
        commissionPct,
        referenceId,
      },
    });

    const member = await env.DB.prepare(
      'SELECT user_id FROM tenant_memberships WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(partnerId, websiteId)
      .first<{ user_id?: string }>();

    await dispatchLifecycleNotification(env, {
      websiteId,
      eventType: 'rider_earnings_posted',
      subject: `Earnings recorded for order #${orderId}`,
      message: `₹${amountInr} in rider earnings was recorded for order #${orderId} after verified delivery. Payment is pending; no payout has been sent.`,
      recipientUserId: String(member?.user_id || ''),
    });

    return { posted: true, amountInr, reason: 'posted' };
  } catch {
    return { posted: false, reason: 'ledger_unavailable' };
  } finally {
    // Release the in-flight guard only after the ledger attempt has finished.
    inFlightEarnings.delete(pendingKey);
  }
}

function partnerKeyFromReference(referenceId: unknown): string | null {
  const parts = String(referenceId || '').split(':');
  if (parts.length < 4) return null;
  return `${parts[1]}|${parts[3]}`;
}

/**
 * Returns posted rider earnings by tenant + membership id. No payouts are
 * deducted because no Cashfree Payouts integration is active in this codebase.
 */
export async function getRiderEarningsByPartner(
  env: CloudflareEnv
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!env.DB) return totals;
  try {
    const rows = await env.DB.prepare(
      `SELECT reference_id, SUM(amount_inr) AS amount_inr
       FROM finance_ledger
       WHERE category = ? AND reference_id LIKE ?
       GROUP BY reference_id`
    )
      .bind(EARNINGS_CATEGORY, `${EARNINGS_PREFIX}:%`)
      .all<{ reference_id?: string; amount_inr?: number }>();

    for (const row of rows.results || []) {
      const key = partnerKeyFromReference(row.reference_id);
      if (!key) continue;
      totals.set(key, (totals.get(key) || 0) + Number(row.amount_inr || 0));
    }
  } catch {
    // Optional table unavailable; dashboards show zero rather than inventing data.
  }
  return totals;
}

/** Display-only delivery count derived from immutable earning references. */
export async function getRiderDeliveryCountsByPartner(
  env: CloudflareEnv
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!env.DB) return counts;
  try {
    const rows = await env.DB.prepare(
      `SELECT reference_id, COUNT(*) AS deliveries
       FROM finance_ledger
       WHERE category = ? AND reference_id LIKE ?
       GROUP BY reference_id`
    )
      .bind(EARNINGS_CATEGORY, `${EARNINGS_PREFIX}:%`)
      .all<{ reference_id?: string; deliveries?: number }>();
    for (const row of rows.results || []) {
      const key = partnerKeyFromReference(row.reference_id);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + Number(row.deliveries || 0));
    }
  } catch {
    // Dashboard shows zero when the optional ledger table is unavailable.
  }
  return counts;
}

/** Tenant's transparent rider commission rate, from existing website_json. */
export async function getDeliveryCommissionPct(
  env: CloudflareEnv,
  websiteId: string
): Promise<number> {
  if (!env.DB || !websiteId) return 0;
  try {
    const publication = await env.DB.prepare(
      'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ website_json?: string }>();
    const parsed = publication?.website_json ? JSON.parse(publication.website_json) : {};
    const pct = Number(parsed?.deliveryCommissionPct || 0);
    return Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : 0;
  } catch {
    return 0;
  }
}
