// ============================================================================
// POST /api/tenants/:tenantId/staff — Owner adds a team member
// Ported from server.ts (Express) to Cloudflare Pages + D1.
// D1 has no staff_members table; tenant_memberships is the authoritative
// migration 0003 table used by owner/tenants/:tenantId/overview.ts for staff.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, jsonResponse, parseJsonBody } from '../../_shared';
import { requireTenantOwnerAccess } from '../../_tenantAccess';

const ALLOWED_STAFF_ROLES = ['store_manager', 'inventory_clerk', 'support_agent'] as const;
const MEMBERSHIP_ROLE_BY_STAFF_ROLE: Record<(typeof ALLOWED_STAFF_ROLES)[number], string> = {
  store_manager: 'business_manager',
  inventory_clerk: 'business_staff',
  support_agent: 'business_staff',
};

interface MembershipRow {
  id: number;
  website_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  permissions_json: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    name?: unknown;
    email?: unknown;
    staffRole?: unknown;
  }>(request);

  const name = String(body?.name || '').trim().slice(0, 100);
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 200);
  const staffRole = String(body?.staffRole || '');

  if (
    typeof body?.name !== 'string' ||
    typeof body?.email !== 'string' ||
    typeof body?.staffRole !== 'string' ||
    name.length < 2 ||
    !isValidEmail(email) ||
    !(ALLOWED_STAFF_ROLES as readonly string[]).includes(staffRole)
  ) {
    return errorJson('Invalid staff member fields.', 400);
  }

  const membershipRole = MEMBERSHIP_ROLE_BY_STAFF_ROLE[
    staffRole as (typeof ALLOWED_STAFF_ROLES)[number]
  ];
  const websiteId = access.row.website_id;
  const tenantId = Number(access.row.rowid || 0);
  const permissionsJson = JSON.stringify([`staff_role:${staffRole}`]);

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_memberships
        (website_id, user_id, email, full_name, role, status, permissions_json, invited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(websiteId, email, email, name, membershipRole, permissionsJson, auth.user.id)
      .run();

    const created = await env.DB.prepare(
      `SELECT id, website_id, user_id, email, full_name, role, status, permissions_json
       FROM tenant_memberships WHERE website_id = ? AND user_id = ? LIMIT 1`
    )
      .bind(websiteId, email)
      .first<MembershipRow>();

    if (!created) return errorJson('Failed to add staff member.', 500);

    return jsonResponse(
      {
        staff: {
          id: Number(created.id),
          tenantId,
          name: String(created.full_name || name),
          email: String(created.email || email),
          staffRole,
          active: created.status === 'active',
        },
      },
      201
    );
  } catch {
    return errorJson('Failed to add staff member.', 500);
  }
}
