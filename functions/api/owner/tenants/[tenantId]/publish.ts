// ============================================================================
// PATCH /api/owner/tenants/:tenantId/publish — Toggle Published / Draft Status
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../../_shared';
import {
  checkTenantSubscriptionEntitlement,
  customerApprovalBlockedResponse,
  requireTenantOwnerAccess,
} from '../../../_tenantAccess';
import { mapPublicationToTenant } from '../../../_tenantMapper';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{ published?: boolean }>(request);
  if (!body || typeof body.published !== 'boolean') {
    return jsonResponse({ error: 'Boolean "published" field is required.' }, 400);
  }

  // Server-side entitlement verification before allowing website to be published live
  let maxWebsites = 1;
  if (body.published) {
    const approvalBlocked = await customerApprovalBlockedResponse(env, access.row.website_id);
    if (approvalBlocked) return approvalBlocked;

    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      access.row.website_id,
      auth.user.id,
      auth.user.isSuperAdmin
    );
    maxWebsites = Math.max(1, Math.floor(Number(entitlement.maxWebsites) || 1));

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

  const nextStatus = body.published ? 'published' : 'unpublished';
  const nowIso = new Date().toISOString();

  const publishRes = await env.DB!.prepare(
    `UPDATE customer_website_publications
     SET status = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END, updated_at = ?
     WHERE website_id = ?
       AND (status <> 'published' OR (
         SELECT COUNT(DISTINCT website_id) FROM customer_website_publications
         WHERE owner_id = ? AND status = 'published' AND website_id <> ?
       ) < ?)`
  )
    .bind(
      nextStatus,
      nextStatus,
      nowIso,
      nowIso,
      access.row.website_id,
      access.row.owner_id,
      access.row.website_id,
      body.published ? maxWebsites : 0
    )
    .run();
  if (body.published && Number(publishRes?.meta?.changes || 0) < 1) {
    return jsonResponse(
      { error: 'Your current package has reached its live website limit.', code: 'WEBSITE_LIMIT_REACHED' },
      409
    );
  }

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: body.published ? 'website_published' : 'website_unpublished',
    targetType: 'website',
    targetId: access.row.website_id,
    details: { slug: access.row.public_slug, status: nextStatus },
  });

  const tenant = mapPublicationToTenant(
    {
      ...access.row,
      status: nextStatus,
      published_at: body.published ? nowIso : access.row.published_at,
      updated_at: nowIso,
    },
    access.parsedWebsite
  );

  return jsonResponse({
    published: body.published,
    status: nextStatus,
    slug: access.row.public_slug,
    tenant,
    siteUrl: body.published
      ? `https://vijay-visuals-site.pages.dev/site/${access.row.public_slug}`
      : null,
    deliverySubdomainUrl: body.published
      ? `https://${access.row.public_slug}.vijay-visuals-site.pages.dev`
      : null,
    deliverySubdomainStatus: body.published ? 'requires_wildcard_dns_tls' : null,
    deliveryNotice: body.published
      ? 'The /site/ URL is live immediately. Tenant subdomains and custom domains require wildcard DNS and HTTPS verification before they can serve the website.'
      : null,
  });
}
