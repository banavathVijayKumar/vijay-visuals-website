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
  if (request.method.toUpperCase() === 'PATCH') {
    const body = await parseJsonBody<{ published?: boolean }>(request);
    if (body && typeof body.published === 'boolean') {
      published = body.published;
    }
  }

  // Server-side entitlement verification before allowing website to be published live
  if (published) {
    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      access.row.website_id,
      auth.user.id,
      auth.user.isSuperAdmin
    );

    if (!entitlement.canPublish) {
      return jsonResponse(
        {
          error:
            'An active package or subscription is required to publish this website live. Please complete your website package purchase (₹7,999 Business Website package).',
          code: 'PAYMENT_REQUIRED',
        },
        402
      );
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
