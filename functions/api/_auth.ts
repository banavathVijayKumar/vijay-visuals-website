// ============================================================================
// VIJAY VISUALS — PRODUCTION SUPABASE AUTH & 7-ROLE RBAC FOR CLOUDFLARE PAGES
// Compatible with existing Supabase Auth + vv_users + additive 7-role tables
// ============================================================================

import { CloudflareEnv, errorJson } from './_shared';

export type PlatformRole =
  | 'super_admin'
  | 'platform_staff'
  | 'business_owner'
  | 'business_manager'
  | 'business_staff'
  | 'end_customer'
  | 'delivery_partner';

export type TenantRole =
  | 'business_owner'
  | 'business_manager'
  | 'business_staff'
  | 'delivery_partner';

export interface AuthenticatedUser {
  id: string;
  authSubject: string;
  email: string;
  fullName: string;
  supabaseRole: string;
  platformRole: PlatformRole;
  isSuperAdmin: boolean;
  isPlatformStaff: boolean;
  staffPermissions: string[];
  status: 'active' | 'suspended';
}

export interface AuthSuccess {
  ok: true;
  user: AuthenticatedUser;
}

export interface AuthFailure {
  ok: false;
  response: Response;
}

export type AuthResult = AuthSuccess | AuthFailure;

export interface WebsiteRow {
  website_id: string;
  owner_id: string;
  public_slug: string;
  business_name: string;
  website_json: string;
  status: 'published' | 'unpublished';
}

export interface WebsiteAccessSuccess {
  ok: true;
  website: WebsiteRow;
  effectiveRole: PlatformRole;
}

export type WebsiteAccessResult = WebsiteAccessSuccess | AuthFailure;

function getSupabaseConfig(env: CloudflareEnv): { url: string; anonKey: string } | null {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function mapSupabaseRoleToPlatformRole(rawRole: string): PlatformRole {
  const role = (rawRole || 'customer').trim().toLowerCase();
  if (role === 'admin' || role === 'super_admin') return 'super_admin';
  if (role === 'platform_staff' || role === 'support_staff') return 'platform_staff';
  if (role === 'shop_owner' || role === 'business_owner' || role === 'owner') return 'business_owner';
  if (role === 'business_manager' || role === 'manager') return 'business_manager';
  if (role === 'business_staff' || role === 'staff') return 'business_staff';
  if (role === 'delivery_boy' || role === 'delivery_partner') return 'delivery_partner';
  return 'end_customer';
}

export async function requireUser(request: Request, env: CloudflareEnv): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return {
      ok: false,
      response: errorJson('Authentication required. Provide a valid Supabase Bearer token.', 401),
    };
  }

  const token = match[1].trim();
  const supa = getSupabaseConfig(env);
  if (!supa) {
    return {
      ok: false,
      response: errorJson(
        'Supabase Auth environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured on Cloudflare Pages.',
        503
      ),
    };
  }

  // 1. Verify Bearer token directly with Supabase Auth GoTrue API
  let supaUser: {
    id?: string;
    email?: string;
    user_metadata?: { full_name?: string; name?: string };
  };
  try {
    const userRes = await fetch(`${supa.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supa.anonKey,
      },
    });
    if (!userRes.ok) {
      return {
        ok: false,
        response: errorJson('Invalid or expired session token. Please sign in again.', 401),
      };
    }
    supaUser = (await userRes.json()) as typeof supaUser;
  } catch {
    return {
      ok: false,
      response: errorJson('Unable to verify session with Supabase Auth.', 503),
    };
  }

  if (!supaUser?.id) {
    return {
      ok: false,
      response: errorJson('Authenticated user subject is missing.', 401),
    };
  }

  // 2. Fetch authoritative role from Supabase `profiles` table (preserving live production logic)
  let profileRole = 'customer';
  let fullName = supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || '';
  try {
    const profileRes = await fetch(
      `${supa.url}/rest/v1/profiles?id=eq.${encodeURIComponent(supaUser.id)}&select=id,full_name,role`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supa.anonKey,
          Accept: 'application/json',
        },
      }
    );
    if (profileRes.ok) {
      const rows = (await profileRes.json()) as Array<{
        id?: string;
        full_name?: string;
        role?: string;
      }>;
      if (Array.isArray(rows) && rows[0]) {
        if (rows[0].role) profileRole = String(rows[0].role).toLowerCase();
        if (rows[0].full_name) fullName = String(rows[0].full_name);
      }
    }
  } catch {
    // Fallback to customer role if profiles table is temporarily unreachable
  }

  const mappedRole = mapSupabaseRoleToPlatformRole(profileRole);
  const vvRole: 'admin' | 'customer' = mappedRole === 'super_admin' ? 'admin' : 'customer';

  // 3. Synchronize with existing D1 `vv_users` table and check suspension status
  let status: 'active' | 'suspended' = 'active';
  let userId = supaUser.id;
  let isPlatformStaff = mappedRole === 'platform_staff';
  let staffPermissions: string[] = [];

  if (env.DB) {
    try {
      const existing = await env.DB.prepare(
        'SELECT id, role, status, full_name FROM vv_users WHERE auth_subject = ? OR id = ? LIMIT 1'
      )
        .bind(supaUser.id, supaUser.id)
        .first<{ id: string; role: string; status: string; full_name: string }>();

      if (existing) {
        userId = existing.id;
        if (existing.status === 'suspended') {
          status = 'suspended';
        }
        if (!fullName && existing.full_name) fullName = existing.full_name;
        await env.DB.prepare(
          `UPDATE vv_users SET email = ?, full_name = ?, role = ?, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(supaUser.email || '', fullName, vvRole, userId)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at)
           VALUES (?, 'supabase', ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`
        )
          .bind(supaUser.id, supaUser.id, supaUser.email || '', fullName, vvRole)
          .run();
      }

      // Check additive `platform_staff` table for Vijay Visuals Support/Operations Staff role
      try {
        const staffRow = await env.DB.prepare(
          'SELECT staff_role, permissions_json, is_active FROM platform_staff WHERE user_id = ? AND is_active = 1 LIMIT 1'
        )
          .bind(userId)
          .first<{ staff_role: string; permissions_json: string; is_active: number }>();
        if (staffRow && staffRow.is_active === 1) {
          isPlatformStaff = true;
          try {
            const parsed = JSON.parse(staffRow.permissions_json || '[]');
            if (Array.isArray(parsed)) staffPermissions = parsed.map(String);
          } catch {
            staffPermissions = [];
          }
        }
      } catch {
        // Additive migration 0003 may not be applied yet; continue cleanly
      }
    } catch {
      // Preserve auth even if vv_users sync encounters transient issue
    }
  }

  if (status === 'suspended') {
    return {
      ok: false,
      response: errorJson('Your account has been suspended. Please contact Vijay Visuals support.', 403),
    };
  }

  const finalPlatformRole: PlatformRole =
    mappedRole === 'super_admin'
      ? 'super_admin'
      : isPlatformStaff
        ? 'platform_staff'
        : mappedRole;

  return {
    ok: true,
    user: {
      id: userId,
      authSubject: supaUser.id,
      email: supaUser.email || '',
      fullName: fullName || supaUser.email || 'User',
      supabaseRole: profileRole,
      platformRole: finalPlatformRole,
      isSuperAdmin: finalPlatformRole === 'super_admin',
      isPlatformStaff: finalPlatformRole === 'platform_staff' || finalPlatformRole === 'super_admin',
      staffPermissions,
      status,
    },
  };
}

export async function requireAdmin(request: Request, env: CloudflareEnv): Promise<AuthResult> {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth;
  if (!auth.user.isSuperAdmin) {
    return {
      ok: false,
      response: errorJson('Super Admin privileges are required for this action.', 403),
    };
  }
  return auth;
}

export async function requirePlatformStaff(
  request: Request,
  env: CloudflareEnv
): Promise<AuthResult> {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth;
  if (!auth.user.isPlatformStaff) {
    return {
      ok: false,
      response: errorJson('Vijay Visuals Platform Staff or Super Admin access is required.', 403),
    };
  }
  return auth;
}

/**
 * Enforces strict multi-tenant website isolation across all 7 roles.
 * Never trusts client-supplied owner_id; always resolves ownership and membership from D1.
 */
export async function requireWebsiteAccess(
  env: CloudflareEnv,
  user: AuthenticatedUser,
  websiteId: string,
  allowedTenantRoles: TenantRole[] = ['business_owner', 'business_manager']
): Promise<WebsiteAccessResult> {
  if (!env.DB) {
    return { ok: false, response: errorJson('Database binding is not configured.', 503) };
  }

  const website = await env.DB.prepare(
    `SELECT website_id, owner_id, public_slug, business_name, website_json, status
     FROM customer_website_publications
     WHERE website_id = ? LIMIT 1`
  )
    .bind(websiteId)
    .first<WebsiteRow>();

  if (!website) {
    return { ok: false, response: errorJson('Website not found.', 404) };
  }

  if (user.isSuperAdmin) {
    return { ok: true, website, effectiveRole: 'super_admin' };
  }

  if (website.owner_id === user.id || website.owner_id === user.authSubject) {
    return { ok: true, website, effectiveRole: 'business_owner' };
  }

  // Check additive tenant_memberships for Business Manager, Business Staff, Delivery Partner
  try {
    const membership = await env.DB.prepare(
      `SELECT role, status FROM tenant_memberships
       WHERE website_id = ? AND (user_id = ? OR user_id = ?) AND status = 'active' LIMIT 1`
    )
      .bind(websiteId, user.id, user.authSubject)
      .first<{ role: TenantRole; status: string }>();

    if (membership && allowedTenantRoles.includes(membership.role)) {
      return { ok: true, website, effectiveRole: membership.role };
    }
  } catch {
    // Table may not be migrated yet
  }

  return {
    ok: false,
    response: errorJson('Forbidden: you do not have permission to access this business website.', 403),
  };
}
