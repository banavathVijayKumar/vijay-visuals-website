// ============================================================================
// Assignment-scoped delivery authorization.
//
// A delivery-partner membership proves that a user is a rider for a website;
// it does NOT prove that the rider owns a particular order. Every mutating
// delivery action must additionally match delivery_assignments.order_id and
// delivery_assignments.delivery_partner_user_id.
// ============================================================================

import type { AuthenticatedUser } from '../_auth';
import type { CloudflareEnv } from '../_shared';
import { hasDurableOwnerApproval } from './_riderState';

export interface AssignedDeliveryAccess {
  authorized: boolean;
  isOwnerOrAdmin: boolean;
  partnerId: number | null;
  assignmentId: number | null;
  assignment: Record<string, any> | null;
}

function denied(): AssignedDeliveryAccess {
  return {
    authorized: false,
    isOwnerOrAdmin: false,
    partnerId: null,
    assignmentId: null,
    assignment: null,
  };
}

/**
 * Resolves whether the caller may act on one specific delivery order.
 * Fails closed when publication ownership, rider membership, or assignment
 * cannot be proven from the authoritative D1 tables.
 */
export async function checkAssignedDeliveryAccess(
  env: CloudflareEnv,
  user: AuthenticatedUser,
  websiteId: string,
  orderId: number
): Promise<AssignedDeliveryAccess> {
  if (!env.DB || !websiteId || !Number.isInteger(orderId) || orderId <= 0) return denied();

  let assignment: Record<string, any> | null = null;
  try {
    assignment = await env.DB.prepare(
      `SELECT id, website_id, order_id, delivery_partner_user_id, status,
              last_lat, last_lng, updated_at
       FROM delivery_assignments
       WHERE order_id = ? AND website_id = ?
       LIMIT 1`
    )
      .bind(orderId, websiteId)
      .first<Record<string, any>>();
  } catch {
    // Missing delivery_assignments means no assignment can be proven.
    return denied();
  }

  // The assignment row is the only source of the rider who actually owns this
  // delivery — including for owner/admin callers who complete secure POD.
  const assignedPartnerId = assignment ? Number(assignment.delivery_partner_user_id) || null : null;
  const result: AssignedDeliveryAccess = {
    authorized: false,
    isOwnerOrAdmin: false,
    partnerId: assignedPartnerId,
    assignmentId: assignment ? Number(assignment.id) || null : null,
    assignment,
  };

  if (user.isSuperAdmin) {
    return { ...result, authorized: true, isOwnerOrAdmin: true };
  }

  try {
    const pub = await env.DB.prepare(
      'SELECT owner_id FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ owner_id?: string }>();
    if (pub && (pub.owner_id === user.id || pub.owner_id === user.authSubject)) {
      return { ...result, authorized: true, isOwnerOrAdmin: true };
    }
  } catch {
    // Never grant ownership when the publication cannot be read.
  }

  try {
    const partner = await env.DB.prepare(
      `SELECT id, permissions_json, status, role
       FROM tenant_memberships
       WHERE website_id = ? AND role = 'delivery_partner'
         AND (user_id = ? OR user_id = ? OR email = ?)
       LIMIT 1`
    )
      .bind(websiteId, user.id, user.authSubject, user.email)
      .first<{ id?: number; permissions_json?: string; status?: string; role?: string }>();

    const partnerId = Number(partner?.id) || null;
    if (!partnerId || !assignment) return denied();
    if (!hasDurableOwnerApproval({ ...partner, status: partner?.status, permissions_json: partner?.permissions_json })) {
      return denied();
    }
    if (String(assignment.delivery_partner_user_id) !== String(partnerId)) return denied();

    return { ...result, authorized: true, partnerId };
  } catch {
    return denied();
  }
}
