// ============================================================================
// POST & PATCH /api/tenants/:slug/publish — Toggle Published / Draft Status
// Compatible alias for tenant website publishing with entitlement enforcement.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../_shared';
import {
  checkTenantSubscriptionEntitlement,
  customerApprovalBlockedResponse,
  provisionLifetimeEntitlement,
  requireTenantOwnerAccess,
} from '../../_tenantAccess';
import { FREE_START_PLAN_CODE, FREE_START_TIER } from '../../_planTiers';
import { mapPublicationToTenant } from '../../_tenantMapper';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

async function handlePublish(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug);
  if (!access.ok) return access.response;

  let published = true;
  if (request.method.toUpperCase() === 'PATCH' || request.method.toUpperCase() === 'POST') {
    const body = await parseJsonBody<{ published?: boolean }>(request);
    if (body && typeof body.published === 'boolean') {
      published = body.published;
    }
  }

  // Only a persisted plan identity can request Free Start; a bare request flag is ignored.
  const isFreeStartRequested =
    access.parsedWebsite?.planTier === FREE_START_TIER ||
    access.parsedWebsite?.planCode === FREE_START_PLAN_CODE;

  // Server-side entitlement verification before allowing website to be published live
  let maxWebsites = 1;
  if (published) {
    const approvalBlocked = await customerApprovalBlockedResponse(env, access.row.website_id);
    if (approvalBlocked) return approvalBlocked;

    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      access.row.website_id,
      auth.user.id,
      auth.user.isSuperAdmin
    );
    maxWebsites = Math.max(1, Math.floor(Number(entitlement.maxWebsites) || 1));

    const hasPaidEntitlement = entitlement.hasActiveSubscription && !entitlement.isFreeStart;
    if (isFreeStartRequested && hasPaidEntitlement) {
      return jsonResponse(
        {
          error: 'This website already has a paid package. Continue with the existing package instead.',
          code: 'PAID_SITE_LOCKED',
        },
        409
      );
    }

    if (!entitlement.canPublish && !isFreeStartRequested) {
      return jsonResponse(
        {
          error:
            'An active package or subscription is required to publish this website live. Please complete your website package purchase (₹7,999 Business Website package) or choose the Free Start package.',
          code: 'PAYMENT_REQUIRED',
        },
        402
      );
    }

    if (isFreeStartRequested && !entitlement.hasActiveSubscription) {
      const provision = await provisionLifetimeEntitlement(env, {
        websiteId: access.row.website_id,
        ownerId: auth.user.id,
        planCode: FREE_START_PLAN_CODE,
        entitlementType: 'free_start',
        source: 'free_start_tenant_publish',
        sourceReference: params.slug,
      });
      if (!provision.ok && provision.error) return provision.error;
    }
  }

  const nextStatus = published ? 'published' : 'unpublished';
  const nowIso = new Date().toISOString();

  const publishRes = await env.DB!.prepare(
    `UPDATE customer_website_publications
     SET status = ?,
         published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE published_at END,
         updated_at = ?
     WHERE website_id = ?
       AND (status = 'published' OR (
         SELECT COUNT(DISTINCT website_id) FROM customer_website_publications
         WHERE owner_id = ? AND status = 'published' AND website_id <> ?
       ) < ?)`
  )
    .bind(
      nextStatus,
      published ? 1 : 0,
      nowIso,
      nowIso,
      access.row.website_id,
      access.row.owner_id,
      access.row.website_id,
      published ? maxWebsites : 0
    )
    .run();
  if (published && Number(publishRes?.meta?.changes || 0) < 1) {
    return jsonResponse(
      { error: 'Your current package has reached its live website limit.', code: 'WEBSITE_LIMIT_REACHED' },
      409
    );
  }

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: published ? 'website_published' : 'website_unpublished',
    targetType: 'website',
    targetId: access.row.website_id,
    details: {
      tenantSlug: access.row.public_slug,
      businessName: access.row.business_name,
      status: nextStatus,
    },
  });

  return jsonResponse({
    success: true,
    published,
    status: nextStatus,
    slug: access.row.public_slug,
  });
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  return handlePublish(context);
}

export async function onRequestPatch(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  return handlePublish(context);
}
