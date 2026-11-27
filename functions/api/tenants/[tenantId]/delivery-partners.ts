// ============================================================================
// POST /api/tenants/:tenantId/delivery-partners — Add rider / self-register
// Ported from server.ts (Express) to Cloudflare Pages + D1.
// D1 has no delivery_partners table; tenant_memberships (migration 0003) is the
// authoritative rider store used by /api/delivery/portal and /api/me.
// Tenant owners/managers add riders as active members. Any authenticated user
// may self-register with linkCurrentUser, but that creates a PENDING membership
// (status='invited'); a tenant owner/super admin must approve it before the
// rider gains delivery portal access.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  errorJson,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../_shared';
import { findPublicationByIdentifier, requireTenantOwnerAccess } from '../../_tenantAccess';
import type { PublicationRow } from '../../_tenantMapper';
import { readRiderState, withRiderState } from '../../delivery/_riderState';

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
  const permissionsJson = withRiderState(
    [
      `phone:${phone}`,
      `vehicleType:${vehicleType}`,
      `linkCurrentUser:${linkCurrentUser ? 'true' : 'false'}`,
    ],
    {
      // Owner-added riders are approved at creation; self-registration stays
      // pending until a tenant owner records approval. Everyone starts offline.
      deliveryApproval: linkCurrentUser ? 'pending' : 'owner_added',
      availability: 'offline',
    }
  );
  const membershipStatus = linkCurrentUser ? 'invited' : 'active';

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_memberships
        (website_id, user_id, email, full_name, role, status, permissions_json, invited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'delivery_partner', ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(websiteId, userId, email, name, membershipStatus, permissionsJson, auth.user.id)
      .run();

    const created = await env.DB.prepare(
      `SELECT id, website_id, user_id, full_name, email, role, status, permissions_json
       FROM tenant_memberships WHERE website_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(websiteId, userId)
      .first<MembershipRow>();

    if (!created) return errorJson('Failed to register delivery partner.', 500);

    // The canonical vv_users.role is intentionally unchanged. Delivery access
    // is derived from an ACTIVE tenant_memberships/delivery partner record, so
    // a self-link must not globally promote a customer account.

    return jsonResponse(
      {
        partner: {
          id: Number(created.id),
          tenantId,
          userId: linkCurrentUser ? String(created.user_id || userId) : null,
          name: String(created.full_name || name),
          phone: parsePermission(created.permissions_json, 'phone:') || phone,
          vehicleType: parsePermission(created.permissions_json, 'vehicleType:') || vehicleType,
          status: String(created.status || membershipStatus),
          approvalPending: readRiderState(created.permissions_json).deliveryApproval === 'pending',
          availability: readRiderState(created.permissions_json).availability,
          available: readRiderState(created.permissions_json).availability === 'online',
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

// ============================================================================
// PATCH /api/tenants/:tenantId/delivery-partners — Approve / suspend a rider.
// Tenant owners/managers (or super admins) are the only callers allowed to
// activate a self-registered membership. Riders can never self-approve.
// ============================================================================

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{ partnerId?: unknown; approved?: unknown }>(request);
  const partnerId = Number(body?.partnerId);
  const approved = body?.approved;

  if (!Number.isInteger(partnerId) || partnerId <= 0 || typeof approved !== 'boolean') {
    return errorJson('Invalid delivery partner approval payload.', 400);
  }

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId || '', [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const nextStatus = approved ? 'active' : 'suspended';
  try {
    const current = await env.DB.prepare(
      `SELECT id, permissions_json, status, role
       FROM tenant_memberships
       WHERE id = ? AND website_id = ? AND role = 'delivery_partner'
       LIMIT 1`
    )
      .bind(partnerId, access.row.website_id)
      .first<MembershipRow>();

    if (
      !current?.id ||
      (approved && !['active', 'invited'].includes(String(current.status))) ||
      (!approved && String(current.status) !== 'active')
    ) {
      return errorJson('Delivery partner not found for this website.', 404);
    }

    // The approval marker is written in the SAME membership UPDATE as status.
    // Eligibility helpers read this marker, never vv_audit_log.
    const nextPermissionsJson = withRiderState(current.permissions_json, {
      deliveryApproval: approved ? 'owner_approved' : 'revoked',
      availability: approved ? undefined : 'offline',
    });
    const observedPermissionsJson = String(current.permissions_json || '');
    const result = await env.DB.prepare(
      `UPDATE tenant_memberships
       SET status = ?, permissions_json = ?, updated_at = datetime('now')
       WHERE id = ? AND website_id = ? AND role = 'delivery_partner'
         AND permissions_json = ?`
    )
      .bind(
        nextStatus,
        nextPermissionsJson,
        partnerId,
        access.row.website_id,
        observedPermissionsJson
      )
      .run();

    if (!result.meta?.changes) {
      return errorJson(
        'Delivery partner approval changed concurrently. Reload and retry.',
        409
      );
    }

    // Audit is optional secondary evidence only; the durable marker above is
    // what actually controls eligibility.
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: approved ? 'delivery_partner_approved' : 'delivery_partner_suspended',
      targetType: 'tenant_membership',
      targetId: String(partnerId),
      details: { websiteId: access.row.website_id, approved },
    });

    return jsonResponse({
      success: true,
      partnerId,
      status: nextStatus,
      deliveryApproval: readRiderState(nextPermissionsJson).deliveryApproval,
      availability: readRiderState(nextPermissionsJson).availability,
    });
  } catch {
    return errorJson('Failed to update delivery partner approval.', 500);
  }
}
