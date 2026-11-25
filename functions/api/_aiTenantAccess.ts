// ============================================================================
// Shared AI tenant authorization gate.
// The client may supply only an identifier used to look up a server row; it
// never supplies ownership, role, status, plan, or quota information.
// ============================================================================

import { getTenantAiQuota, TenantQuotaStatus } from './_aiCredits';
import { CloudflareEnv, jsonResponse } from './_shared';
import { requireTenantOwnerAccess, TenantAccessResult } from './_tenantAccess';
import { AuthenticatedUser } from './_auth';

export type AiTenantAccessResult =
  | Extract<TenantAccessResult, { ok: true }> & { quota: TenantQuotaStatus }
  | { ok: false; response: Response };

/**
 * Legacy callers may omit tenantId. In that case the tenant is derived only
 * from the authenticated user's D1 ownership/membership rows; no client field
 * can select or influence it.
 */
async function resolveImplicitTenantIdentifier(
  env: CloudflareEnv,
  user: AuthenticatedUser
): Promise<string> {
  if (!env.DB) return '';
  const userId = String(user.id || '');
  const authSubject = String(user.authSubject || userId);
  if (!userId && !authSubject) return '';

  try {
    const owned = await env.DB.prepare(
      `SELECT website_id
       FROM customer_website_publications
       WHERE (owner_id = ? OR owner_id = ?) AND status = 'published'
       ORDER BY rowid ASC
       LIMIT 1`
    )
      .bind(userId, authSubject)
      .first<{ website_id: string }>();
    if (owned?.website_id) return String(owned.website_id);
  } catch {
    // D1 binding/table errors are handled by the access gate below.
  }

  try {
    const membership = await env.DB.prepare(
      `SELECT tm.website_id
       FROM tenant_memberships tm
       INNER JOIN customer_website_publications p
         ON p.website_id = tm.website_id AND p.status = 'published'
       WHERE (tm.user_id = ? OR tm.user_id = ?) AND tm.status = 'active'
       ORDER BY tm.id ASC
       LIMIT 1`
    )
      .bind(userId, authSubject)
      .first<{ website_id: string }>();
    if (membership?.website_id) return String(membership.website_id);
  } catch {
    // tenant_memberships is an optional table; an absent table is not an error.
  }

  return '';
}

/**
 * Verifies ownership/delegated role, publication status, and the server-derived
 * plan allowance before any AI credit is consumed.
 */
export async function requireAuthorizedAiTenant(
  env: CloudflareEnv,
  user: AuthenticatedUser,
  identifier: unknown
): Promise<AiTenantAccessResult> {
  let tenantIdentifier = String(identifier ?? '').trim();
  if (!tenantIdentifier) {
    tenantIdentifier = await resolveImplicitTenantIdentifier(env, user);
  }
  if (!tenantIdentifier) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Website / tenant not found.', code: 'TENANT_NOT_FOUND' }, 404),
    };
  }

  const access = await requireTenantOwnerAccess(env, user, tenantIdentifier, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access;

  // Platform staff do not get blanket AI access to arbitrary tenants. Verified
  // tenant owners/delegated members and explicit super admins are allowed.
  if (access.effectiveRole === 'platform_staff') {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'AI services are not available to platform staff accounts.', code: 'TENANT_ACCESS_DENIED' },
        403
      ),
    };
  }

  if (String(access.row.status || '').toLowerCase() !== 'published') {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'This website must be published before AI services can be used.', code: 'TENANT_INACTIVE' },
        403
      ),
    };
  }

  // Advisory preflight only. The authoritative, concurrency-safe quota check
  // happens inside the atomic reservation statement in executeWithAiCreditDeduction().
  const quota = await getTenantAiQuota(
    env,
    access.row.website_id,
    access.row.rowid ? Number(access.row.rowid) : undefined,
    access.parsed.planTier
  );
  if (quota.isExhausted) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: 'Monthly AI credit allowance has been exhausted.',
          code: 'AI_QUOTA_EXHAUSTED',
          quota,
        },
        403
      ),
    };
  }

  return { ...access, quota };
}
