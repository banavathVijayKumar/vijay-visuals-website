// ============================================================================
// Automatic paid-order delivery assignment.
//
// Server-only helper. Uses existing D1 tables only:
//   * tenant_memberships — active, approved delivery partners
//   * delivery_assignments — unique order_id prevents duplicate assignments
//   * business_locations — optional configured store coordinates
//   * vv_audit_log / notification_logs — durable evidence and in-app alerts
//
// Legacy self-registered riders created before approval gating may be 'active'
// without proof of owner approval. They are NOT suspended or changed here;
// they are simply excluded from automatic assignment until an owner records an
// explicit approval through the owner-only PATCH endpoint.
// ============================================================================

import type { CloudflareEnv } from '../_shared';
import { writeAuditLog } from '../_shared';
import { dispatchLifecycleNotification } from '../_lifecycleNotifications';
import { redactPiiText } from '../_pii';
import {
  hasDurableOwnerApproval,
  isAutoAssignmentEligible,
  isDeliveryPartnerApprovalUnverifiable as hasUnverifiableApproval,
} from './_riderState';

/** Kept for audit readers that still recognise the historical action name. */
export const DELIVERY_PARTNER_APPROVAL_ACTION = 'delivery_partner_approved';

interface CandidateRow {
  id: number;
  user_id: string;
  full_name: string;
  role: string;
  status: string;
  permissions_json: string;
  invited_by: string;
  workload: number;
  last_lat: number | null;
  last_lng: number | null;
}

export interface AutoAssignmentResult {
  assigned: boolean;
  partnerId?: number;
  reason:
    | 'assigned'
    | 'invalid'
    | 'db_unavailable'
    | 'order_not_found'
    | 'unpaid'
    | 'closed_order'
    | 'already_assigned'
    | 'no_eligible_rider'
    | 'assignment_failed';
}

/**
 * Backwards-compatible export for older callers. Approval is now read only
 * from the durable permissions_json marker, never from vv_audit_log.
 */
export function isDeliveryPartnerApprovalUnverifiable(row: {
  permissions_json?: unknown;
  invited_by?: unknown;
  user_id?: unknown;
}): boolean {
  return hasUnverifiableApproval(row);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function hasExplicitOwnerApproval(
  env: CloudflareEnv,
  partnerId: number
): Promise<boolean> {
  if (!env.DB || !Number.isInteger(partnerId) || partnerId <= 0) return false;
  try {
    const member = await env.DB.prepare(
      `SELECT id, permissions_json, status, role
       FROM tenant_memberships
       WHERE id = ? AND role = 'delivery_partner' LIMIT 1`
    )
      .bind(partnerId)
      .first<{ id?: number; permissions_json?: string; status?: string; role?: string }>();
    if (!member?.id) return false;
    return hasDurableOwnerApproval(member);
  } catch {
    return false;
  }
}

async function notifyNoEligibleRider(
  env: CloudflareEnv,
  input: { websiteId: string; ownerId: string; orderId: number }
): Promise<void> {
  await dispatchLifecycleNotification(env, {
    websiteId: input.websiteId,
    eventType: 'delivery_exception',
    subject: redactPiiText(`Delivery assignment needed for order #${input.orderId}`),
    message: redactPiiText(
      `Order #${input.orderId} is paid but has no approved, available delivery partner. The order remains unassigned; manual assignment is still available.`
    ),
    recipientUserId: input.ownerId || null,
  });
}

/**
 * Assigns one paid order to the best currently eligible rider. Safe to call
 * from both Cashfree verification and the webhook: order_id is UNIQUE and the
 * insert is OR IGNORE, so only the first caller can create the assignment.
 */
export async function autoAssignPaidOrder(
  env: CloudflareEnv,
  orderId: number
): Promise<AutoAssignmentResult> {
  if (!env.DB || !Number.isInteger(orderId) || orderId <= 0) {
    return { assigned: false, reason: 'invalid' };
  }

  try {
    const order = await env.DB.prepare(
      `SELECT id, website_id, owner_id, order_number, payment_method,
              payment_status, order_status, total_inr
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<Record<string, any>>();

    if (!order) return { assigned: false, reason: 'order_not_found' };
    if (String(order.payment_status) !== 'paid') return { assigned: false, reason: 'unpaid' };
    if (
      ['cancelled', 'delivered', 'returned', 'return_requested'].includes(
        String(order.order_status)
      )
    ) {
      return { assigned: false, reason: 'closed_order' };
    }

    const websiteId = String(order.website_id || '');
    if (!websiteId) return { assigned: false, reason: 'invalid' };

    const existing = await env.DB.prepare(
      'SELECT id FROM delivery_assignments WHERE order_id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id?: number }>();
    if (existing?.id) return { assigned: false, reason: 'already_assigned' };

    let originLat: number | null = null;
    let originLng: number | null = null;
    try {
      const branch = await env.DB.prepare(
        `SELECT latitude, longitude FROM business_locations
         WHERE website_id = ? AND active = 1
         ORDER BY is_primary DESC, id ASC LIMIT 1`
      )
        .bind(websiteId)
        .first<{ latitude?: number; longitude?: number }>();
      const lat = branch?.latitude == null ? NaN : Number(branch.latitude);
      const lng = branch?.longitude == null ? NaN : Number(branch.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        originLat = lat;
        originLng = lng;
      }
    } catch {
      // business_locations is optional; distance ranking is skipped without it.
    }

    const candidateRows = await env.DB.prepare(
      `SELECT tm.id, tm.user_id, tm.full_name, tm.role, tm.status,
              tm.permissions_json, tm.invited_by,
              (SELECT COUNT(*) FROM delivery_assignments da
                WHERE da.website_id = tm.website_id
                  AND da.delivery_partner_user_id = CAST(tm.id AS TEXT)
                  AND da.status IN ('assigned', 'picked_up', 'in_transit')) AS workload,
              (SELECT da.last_lat FROM delivery_assignments da
                WHERE da.website_id = tm.website_id
                  AND da.delivery_partner_user_id = CAST(tm.id AS TEXT)
                  AND da.last_lat IS NOT NULL
                ORDER BY da.updated_at DESC LIMIT 1) AS last_lat,
              (SELECT da.last_lng FROM delivery_assignments da
                WHERE da.website_id = tm.website_id
                  AND da.delivery_partner_user_id = CAST(tm.id AS TEXT)
                  AND da.last_lng IS NOT NULL
                ORDER BY da.updated_at DESC LIMIT 1) AS last_lng
       FROM tenant_memberships tm
       WHERE tm.website_id = ? AND tm.role = 'delivery_partner' AND tm.status = 'active'
       ORDER BY workload ASC, tm.id ASC LIMIT 50`
    )
      .bind(websiteId)
      .all<CandidateRow>();

    const eligible: Array<CandidateRow & { distanceKm: number | null }> = [];
    for (const row of candidateRows.results || []) {
      // Offline riders remain approved but are excluded from automatic
      // assignment; legacy rows without a durable marker are never assigned.
      if (!isAutoAssignmentEligible(row)) continue;

      let distanceKm: number | null = null;
      if (originLat !== null && originLng !== null) {
        const lat = row.last_lat == null ? NaN : Number(row.last_lat);
        const lng = row.last_lng == null ? NaN : Number(row.last_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          distanceKm = haversineKm(originLat, originLng, lat, lng);
        }
      }
      eligible.push({ ...row, distanceKm });
    }

    eligible.sort(
      (a, b) =>
        Number(a.workload || 0) - Number(b.workload || 0) ||
        (a.distanceKm ?? Number.POSITIVE_INFINITY) -
          (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
        Number(a.id) - Number(b.id)
    );

    const chosen = eligible[0];
    if (!chosen) {
      await notifyNoEligibleRider(env, {
        websiteId,
        ownerId: String(order.owner_id || ''),
        orderId,
      });
      return { assigned: false, reason: 'no_eligible_rider' };
    }

    const codAmount =
      String(order.payment_method) === 'cod' ? Number(order.total_inr || 0) : 0;
    const write = await env.DB.prepare(
      `INSERT OR IGNORE INTO delivery_assignments
        (website_id, order_id, delivery_partner_user_id, partner_name, status,
         cod_amount_inr, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'assigned', ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        orderId,
        String(chosen.id),
        String(chosen.full_name || 'Delivery Partner').slice(0, 120),
        codAmount
      )
      .run();

    if (!write.meta?.changes) return { assigned: false, reason: 'already_assigned' };

    await writeAuditLog(env, {
      actorId: 'system',
      actorRole: 'system',
      action: 'auto_assign_delivery',
      targetType: 'order',
      targetId: String(orderId),
      details: {
        websiteId,
        partnerId: Number(chosen.id),
        orderNumber: String(order.order_number || ''),
        workload: Number(chosen.workload || 0),
        distanceConsidered: originLat !== null && originLng !== null,
      },
    });

    await dispatchLifecycleNotification(env, {
      websiteId,
      eventType: 'order_assigned',
      subject: redactPiiText(`Order #${orderId} assigned`),
      message: redactPiiText(
        `Order #${orderId} was automatically assigned to an approved, available delivery partner.`
      ),
      recipientUserId: String(chosen.user_id || ''),
    });

    return { assigned: true, partnerId: Number(chosen.id), reason: 'assigned' };
  } catch {
    // Assignment is an optimization: never fail a verified payment because
    // optional assignment tables or notification tables are unavailable.
    return { assigned: false, reason: 'assignment_failed' };
  }
}
