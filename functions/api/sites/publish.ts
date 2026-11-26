import { CloudflareEnv, handleOptions, jsonResponse, parseJsonBody } from '../_shared';
import { requireUser } from '../_auth';
import {
  checkTenantSubscriptionEntitlement,
  customerApprovalBlockedResponse,
  provisionLifetimeEntitlement,
} from '../_tenantAccess';
import { FREE_START_PLAN_CODE, FREE_START_TIER } from '../_planTiers';

export const onRequestOptions = () => handleOptions();

export const onRequestPost = async ({ request, env }: { request: Request; env: CloudflareEnv }) => {
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid or oversized JSON request.' }, 400);
  const slug = String(body.slug || '').toLowerCase().trim();
  const businessName = String(body?.businessName || '').trim();
  const website = body?.website;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 70) {
    return jsonResponse({ error: 'Business URL name is invalid. Use 2–70 letters, numbers or hyphens.' }, 400);
  }
  if (!businessName || businessName.length > 120 || !website || typeof website !== 'object') {
    return jsonResponse({ error: 'Business name or website content is missing.' }, 400);
  }
  const serialized = JSON.stringify(website);
  if (serialized.length > 200_000) return jsonResponse({ error: 'Website content is too large (maximum 200 KB).' }, 413);

  try {
    const existing = await env.DB!.prepare(
      'SELECT website_id, owner_id, status, website_json FROM customer_website_publications WHERE public_slug = ?'
    ).bind(slug).first<{
      website_id: string;
      owner_id: string;
      status: string;
      website_json: string;
    }>();
    const now = new Date().toISOString();
    if (
      existing &&
      existing.owner_id !== user.id &&
      existing.owner_id !== user.authSubject &&
      !user.isSuperAdmin
    ) {
      return jsonResponse({ error: 'This website URL is already in use. Change the business name and try again.' }, 409);
    }

    // Use the persisted owner consistently for entitlement, provisioning and
    // mutation. Legacy rows may be keyed by authSubject rather than user.id.
    const effectiveOwnerId = existing?.owner_id || user.id;
    const websiteId = existing?.website_id || crypto.randomUUID();

    const approvalBlocked = await customerApprovalBlockedResponse(env, websiteId);
    if (approvalBlocked) return approvalBlocked;

    // Authorization comes from the persisted plan identity, never a bare
    // client-supplied freeStart boolean.
    const isFreeStartRequested =
      website?.planTier === FREE_START_TIER || website?.planCode === FREE_START_PLAN_CODE;

    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      websiteId,
      effectiveOwnerId,
      user.isSuperAdmin
    );
    const effectiveMaxWebsites = entitlement.hasActiveSubscription
      ? Math.max(1, Math.floor(Number(entitlement.maxWebsites) || 1))
      : 1;
    const hasPaidEntitlement = entitlement.hasActiveSubscription && !entitlement.isFreeStart;

    // A paid/live site must never be silently downgraded to Free Start.
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

    let createdDraft = false;
    if (!existing && isFreeStartRequested && !entitlement.hasActiveSubscription) {
      // Create the parent draft first so the lifetime-entitlement FK is valid.
      // If provisioning fails below, the site remains unpublished.
      await env.DB!.prepare(
        `INSERT INTO customer_website_publications
          (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'unpublished', '', ?, ?, ?)`
      )
        .bind(websiteId, effectiveOwnerId, slug, businessName, serialized, now, now, now)
        .run();
      createdDraft = true;
    }

    if (isFreeStartRequested && !entitlement.hasActiveSubscription) {
      const provision = await provisionLifetimeEntitlement(env, {
        websiteId,
        ownerId: effectiveOwnerId,
        planCode: FREE_START_PLAN_CODE,
        entitlementType: 'free_start',
        source: 'free_start_publish',
        sourceReference: slug,
      });
      if (!provision.ok && provision.error) return provision.error;
    }

    let publishChanges = 0;
    if (existing || createdDraft) {
      const updateRes = await env.DB!.prepare(`UPDATE customer_website_publications
        SET business_name = ?, website_json = ?, status = 'published', published_at = ?, updated_at = ?
        WHERE public_slug = ? AND owner_id = ?
          AND (status = 'published' OR (
            SELECT COUNT(DISTINCT website_id) FROM customer_website_publications
            WHERE owner_id = ? AND status = 'published' AND website_id <> ?
          ) < ?)`)
        .bind(
          businessName,
          serialized,
          now,
          now,
          slug,
          effectiveOwnerId,
          effectiveOwnerId,
          websiteId,
          effectiveMaxWebsites
        )
        .run();
      publishChanges = Number(updateRes?.meta?.changes || 0);
    } else {
      const insertRes = await env.DB!.prepare(`INSERT INTO customer_website_publications
        (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, 'published', ?, ?, ?
        WHERE (
          SELECT COUNT(DISTINCT website_id) FROM customer_website_publications
          WHERE owner_id = ? AND status = 'published'
        ) < ?`)
        .bind(
          websiteId,
          effectiveOwnerId,
          slug,
          businessName,
          serialized,
          now,
          now,
          now,
          effectiveOwnerId,
          effectiveMaxWebsites
        )
        .run();
      publishChanges = Number(insertRes?.meta?.changes || 0);
    }
    if (publishChanges < 1) {
      return jsonResponse(
        { error: 'Your current package has reached its live website limit.', code: 'WEBSITE_LIMIT_REACHED' },
        409
      );
    }
    return jsonResponse({
      success: true,
      slug,
      url: `/site/${slug}`,
      // Wildcard DNS/TLS is not configured or verified in this repository.
      // Only the platform-host path is a confirmed delivery URL.
      deliverySubdomainStatus: 'requires_wildcard_dns_tls',
      deliveryUrl: null,
      previewDeliveryUrl: null,
      publishedAt: now,
    });
  } catch (error) {
    console.error('Website publication failed:', error);
    return jsonResponse({ error: 'Website publishing database is not ready. Apply the customer website publication migration, then retry.' }, 503);
  }
};
