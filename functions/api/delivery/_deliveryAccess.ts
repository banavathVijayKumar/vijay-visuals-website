// ============================================================================
// Shared tenant-scoped authorization for delivery operations.
// Super admins, the owning business, and active assigned delivery partners only.
// ============================================================================

import type { AuthenticatedUser } from '../_auth';
import type { CloudflareEnv } from '../_shared';

export interface DeliveryOrderAccess {
  authorized: boolean;
  partnerId: number | null;
}

/**
 * Resolves whether a caller may act on an order belonging to `websiteId`.
 * Fails closed: if ownership cannot be resolved, no access is granted.
 */
export async function checkDeliveryOrderAccess(
  env: CloudflareEnv,
  user: AuthenticatedUser,
  websiteId: string
): Promise<DeliveryOrderAccess> {
  if (!env.DB || !websiteId) return { authorized: false, partnerId: null };
  if (user.isSuperAdmin) return { authorized: true, partnerId: null };

  try {
    const pub = await env.DB.prepare(
      'SELECT owner_id FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ owner_id?: string }>();
    if (
      pub &&
      (pub.owner_id === user.id || (user.authSubject && pub.owner_id === user.authSubject))
    ) {
      return { authorized: true, partnerId: null };
    }
  } catch {
    // Missing/optional publication table: never grant by default.
  }

  try {
    const partner = await env.DB.prepare(
      `SELECT id FROM tenant_memberships
       WHERE website_id = ? AND role = 'delivery_partner' AND status = 'active'
         AND (user_id = ? OR user_id = ? OR email = ?)
       LIMIT 1`
    )
      .bind(websiteId, user.id, user.authSubject, user.email)
      .first<{ id?: number }>();
    if (partner) {
      return { authorized: true, partnerId: Number(partner.id) || null };
    }
  } catch {
    // Optional membership table may not be migrated; stay unauthorized.
  }

  return { authorized: false, partnerId: null };
}
