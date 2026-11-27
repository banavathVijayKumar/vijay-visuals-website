// ============================================================================
// POST /api/tenants/:tenantId/delivery-partners — Add rider / self-register
// Ported from server.ts (Express) to Cloudflare Pages + D1.
// D1 has no delivery_partners table; tenant_memberships (migration 0003) is the
// authoritative rider store used by /api/delivery/portal and /api/me.
// Tenant owners/managers add riders; any authenticated user may self-register
// with linkCurrentUser, matching the Express behavior.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, jsonResponse, parseJsonBody } from '../../_shared';
import { findPublicationByIdentifier, requireTenantOwnerAccess } from '../../_tenantAccess';
import type { PublicationRow } from '../../_tenantMapper';

interface MembershipRow {
  id: number;
  website_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  permissions_json: string;
}

function parsePermission(raw: string | undefined, prefix: string): string {
  const text = String(raw || '');
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const hit = parsed.find((item) => typeof item === 'string' && item.startsWith(prefix));
      if (hit) return String(hit).slice(prefix.length);
    }
  } catch {
    // Fall back to plain text below.
  }
  return text || '';
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    name?: unknown;
    phone?: unknown;
    vehicleType?: unknown;
    linkCurrentUser?: unknown;
  }>(request);

  const name = String(body?.name || '').trim().slice(0, 100);
  const phone = String(body?.phone || '').trim().slice(0, 25);
  const vehicleTypeRaw = body?.vehicleType === undefined ? 'Two-Wheeler' : String(body.vehicleType).trim();
  const vehicleType = (vehicleTypeRaw || 'Two-Wheeler').slice(0, 60);
  const linkCurrentUser = body?.linkCurrentUser === true;

  if (
    typeof body?.name !== 'string' ||
    typeof body?.phone !== 'string' ||
    (body?.vehicleType !== undefined && typeof body.vehicleType !== 'string') ||
    (body?.linkCurrentUser !== undefined && typeof body.linkCurrentUser !== 'boolean') ||
    name.length < 2 ||
    phone.length < 8 ||
    vehicleType.length < 2
  ) {
    return errorJson('Invalid delivery partner details.', 400);
  }

  let publication: PublicationRow | null = null;
  if (linkCurrentUser) {
    // Express allowed any authenticated user to join a store's delivery fleet.
    publication = await findPublicationByIdentifier(env, params.tenantId || '');
    if (!publication) return errorJson('Website / tenant not found.', 404);
  } else {
    const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
      'business_owner',
      'business_manager',
      'business_staff',
    ]);
    if (!access.ok) return access.response;
    publication = access.row;
  }

  const websiteId = publication.website_id;
  const tenantId = Number(publication.rowid || 0);
  const userId = linkCurrentUser
    ? auth.user.id || auth.user.authSubject
    : `rider:${websiteId}:${phone}`;
  const email = linkCurrentUser ? auth.user.email || '' : '';
  const permissionsJson = JSON.stringify([
    `phone:${phone}`,
    `vehicleType:${vehicleType}`,
    `linkCurrentUser:${linkCurrentUser ? 'true' : 'false'}`,
  ]);

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_memberships
        (website_id, user_id, email, full_name, role, status, permissions_json, invited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'delivery_partner', 'active', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(websiteId, userId, email, name, permissionsJson, auth.user.id)
      .run();

    const created = await env.DB.prepare(
      `SELECT id, website_id, user_id, full_name, email, role, status, permissions_json
       FROM tenant_memberships WHERE website_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(websiteId, userId)
      .first<MembershipRow>();

    if (!created) return errorJson('Failed to register delivery partner.', 500);

    // The canonical vv_users.role is intentionally unchanged. Delivery access
    // is derived from the tenant_memberships/delivery partner record, so a
    // self-link must not globally promote a customer account.

    return jsonResponse(
      {
        partner: {
          id: Number(created.id),
          tenantId,
          userId: linkCurrentUser ? String(created.user_id || userId) : null,
          name: String(created.full_name || name),
          phone: parsePermission(created.permissions_json, 'phone:') || phone,
          vehicleType: parsePermission(created.permissions_json, 'vehicleType:') || vehicleType,
          available: created.status === 'active',
          totalDeliveries: 0,
          totalEarnings: 0,
        },
      },
      201
    );
  } catch {
    return errorJson('Failed to register delivery partner.', 500);
  }
}
