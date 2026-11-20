// ============================================================================
// GET & POST /api/domains/websites/:websiteId
// Option A: Connect an existing customer-owned domain with strict ownership,
// plan domain limit enforcement, global UNIQUE conflict defense (409), and audit.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  getCnameTarget,
  json,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import {
  TenantDomainRow,
  buildDnsInstructions,
  generateVerificationToken,
  normalizeAndValidateDomain,
  recordDomainEvent,
} from '../../_helpers';

export async function onRequestGet(
  context: PagesContext<{ websiteId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireWebsiteAccess(env, auth.user, params.websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const domainsRes = await env.DB.prepare(
    `SELECT * FROM tenant_domains WHERE website_id = ? ORDER BY is_primary DESC, created_at DESC`
  )
    .bind(params.websiteId)
    .all<TenantDomainRow>();

  const eventsRes = await env.DB.prepare(
    `SELECT * FROM domain_events WHERE website_id = ? ORDER BY created_at DESC LIMIT 40`
  )
    .bind(params.websiteId)
    .all();

  const notificationsRes = await env.DB.prepare(
    `SELECT * FROM domain_notifications WHERE website_id = ? ORDER BY created_at DESC LIMIT 40`
  )
    .bind(params.websiteId)
    .all();

  return json({
    website: {
      websiteId: access.website.website_id,
      publicSlug: access.website.public_slug,
      businessName: access.website.business_name,
      status: access.website.status,
    },
    domains: (domainsRes.results || []).map((d) => ({
      ...d,
      is_primary: Boolean(d.is_primary),
      dnsInstructions: buildDnsInstructions(d.domain_name, d.verification_token, env),
    })),
    events: eventsRes.results || [],
    notifications: notificationsRes.results || [],
  });
}

export async function onRequestPost(
  context: PagesContext<{ websiteId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireWebsiteAccess(env, auth.user, params.websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rl = await checkRateLimit(env, `domain_connect:${auth.user.id}`, 15, 3600);
  if (!rl.allowed) {
    return errorJson('Too many domain connection requests. Please try again shortly.', 429);
  }

  const body = await parseJsonBody<{
    domainName?: string;
    registrarName?: string;
    wwwMode?: 'redirect_to_root' | 'redirect_to_www' | 'both';
    expiryDate?: string;
    renewalDate?: string;
    isPrimary?: boolean;
  }>(request);
  if (!body) return errorJson('Invalid JSON payload.', 400);

  const parsed = normalizeAndValidateDomain(body.domainName || '', env);
  if (!parsed.valid) {
    return errorJson(parsed.error, 400);
  }

  const domain = parsed.domain;
  const wwwMode =
    body.wwwMode === 'redirect_to_www' || body.wwwMode === 'both'
      ? body.wwwMode
      : 'redirect_to_root';
  const registrarName = sanitizeText(body.registrarName || '', 80);
  const expiryDate = body.expiryDate ? sanitizeText(body.expiryDate, 32) : null;
  const renewalDate = body.renewalDate ? sanitizeText(body.renewalDate, 32) : expiryDate;

  // Enforce plan custom-domain limit (defaults to 2 if no subscription row exists yet)
  let maxDomains = 2;
  try {
    const planLimit = await env.DB.prepare(
      `SELECT sp.max_custom_domains
       FROM tenant_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(params.websiteId)
      .first<{ max_custom_domains: number }>();
    if (planLimit?.max_custom_domains) {
      maxDomains = planLimit.max_custom_domains;
    }
  } catch {
    // Migration 0003 optional
  }

  const activeCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM tenant_domains
     WHERE website_id = ? AND status NOT IN ('disconnected', 'rejected')`
  )
    .bind(params.websiteId)
    .first<{ cnt: number }>();

  if (!auth.user.isSuperAdmin && (activeCountRow?.cnt || 0) >= maxDomains) {
    return errorJson(
      `Your current plan allows up to ${maxDomains} active custom domain(s) for this website. Upgrade your plan or disconnect an unused domain first.`,
      403
    );
  }

  // Global hostname uniqueness check (prevents cross-tenant domain hijacking)
  const existing = await env.DB.prepare(
    'SELECT id, website_id, owner_id, status FROM tenant_domains WHERE domain_name = ? LIMIT 1'
  )
    .bind(domain)
    .first<{ id: number; website_id: string; owner_id: string; status: string }>();

  if (existing) {
    return errorJson(
      'This domain is already registered in Vijay Visuals. If you own this domain, contact support for verified ownership transfer.',
      409
    );
  }

  const verificationToken = generateVerificationToken();
  const dnsTarget = getCnameTarget(env);
  const isPrimary = body.isPrimary === false ? 0 : 1;

  if (isPrimary === 1) {
    await env.DB.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE website_id = ?')
      .bind(params.websiteId)
      .run();
  }

  const insertRes = await env.DB.prepare(
    `INSERT INTO tenant_domains
      (website_id, owner_id, domain_name, domain_source, registrar_name, status, is_primary,
       www_mode, www_status, dns_verification_status, verification_token, dns_target,
       ssl_status, expiry_date, renewal_date, created_at, updated_at)
     VALUES (?, ?, ?, 'external_owned', ?, 'pending_dns', ?, ?, 'pending', 'pending', ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(
      params.websiteId,
      access.website.owner_id,
      domain,
      registrarName,
      isPrimary,
      wwwMode,
      verificationToken,
      dnsTarget,
      expiryDate,
      renewalDate
    )
    .run();

  const created = await env.DB.prepare('SELECT * FROM tenant_domains WHERE domain_name = ? LIMIT 1')
    .bind(domain)
    .first<TenantDomainRow>();

  const domainId = created?.id || Number(insertRes.meta?.last_row_id || 0);

  await recordDomainEvent(env, {
    domainId,
    websiteId: params.websiteId,
    ownerId: access.website.owner_id,
    eventType: 'domain_connected_pending_dns',
    actorRole: access.effectiveRole,
    actorId: auth.user.id,
    reason: 'Customer initiated Option A existing domain connection',
    details: { domain, registrarName, wwwMode, dnsTarget },
  });

  return json(
    {
      domain: created
        ? {
            ...created,
            is_primary: Boolean(created.is_primary),
            dnsInstructions: buildDnsInstructions(created.domain_name, created.verification_token, env),
          }
        : null,
      message:
        'Domain added. Configure the TXT ownership record and CNAME/A routing records at your registrar, then click Verify DNS.',
    },
    201
  );
}
