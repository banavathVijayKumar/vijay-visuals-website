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
import { checkTenantSubscriptionEntitlement, requireTenantOwnerAccess } from '../../_tenantAccess';
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
  let isFreeStartRequested = false;
  if (request.method.toUpperCase() === 'PATCH' || request.method.toUpperCase() === 'POST') {
    const body = await parseJsonBody<{ published?: boolean; freeStart?: boolean }>(request);
    if (body && typeof body.published === 'boolean') {
      published = body.published;
    }
    if (body?.freeStart) {
      isFreeStartRequested = true;
    }
  }

  if (access.parsedWebsite?.planTier === 'free_start' || access.parsedWebsite?.planCode === 'free-start') {
    isFreeStartRequested = true;
  }

  // Server-side entitlement verification before allowing website to be published live
  if (published) {
    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      access.row.website_id,
      auth.user.id,
      auth.user.isSuperAdmin
    );

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
      try {
        await env.DB!.prepare(
          `INSERT OR IGNORE INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, 'free-start', 'monthly', 'active', 0, 0, 0, 0, 'free_plan', 'free_subdomain', datetime('now'), datetime('now', '+36500 days'), datetime('now'), datetime('now'))`
        )
          .bind(access.row.website_id, auth.user.id)
          .run();
      } catch {}
    }
  }

  const nextStatus = published ? 'published' : 'unpublished';
  const nowIso = new Date().toISOString();

  await env.DB!.prepare(
    `UPDATE customer_website_publications
     SET status = ?,
         published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE published_at END,
         updated_at = ?
     WHERE website_id = ?`
  )
    .bind(nextStatus, published ? 1 : 0, nowIso, nowIso, access.row.website_id)
    .run();

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
