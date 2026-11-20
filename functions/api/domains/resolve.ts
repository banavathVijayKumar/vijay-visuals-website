// ============================================================================
// GET /api/domains/resolve — Multi-Tenant Hostname Resolver (Cloudflare D1)
// ============================================================================

import { PagesContext, errorJson, isPlatformHostname, json } from '../_shared';

interface ResolveRow {
  id: number;
  website_id: string;
  domain_name: string;
  status: string;
  www_mode: 'redirect_to_root' | 'redirect_to_www' | 'both';
  dns_verification_status: string;
  ssl_status: string;
  public_slug: string;
  business_name: string;
  website_status: string;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) {
    return errorJson('Database binding is not configured.', 503);
  }

  const reqUrl = new URL(request.url);
  const actualHost = reqUrl.hostname.toLowerCase().replace(/\.$/, '');
  const queryHost = (reqUrl.searchParams.get('host') || '').trim().toLowerCase().replace(/\.$/, '');

  // Security: on custom domains, ALWAYS resolve the TLS-verified request hostname.
  // Allow ?host= diagnostic resolution ONLY when called on a trusted platform host.
  const lookupHost = isPlatformHostname(actualHost, env) && queryHost ? queryHost : actualHost;

  if (!lookupHost || isPlatformHostname(lookupHost, env)) {
    return json({
      matched: false,
      isPlatformHost: true,
      hostname: lookupHost,
    });
  }

  const isWww = lookupHost.startsWith('www.');
  const rootCandidate = isWww ? lookupHost.slice(4) : lookupHost;

  const row = await env.DB.prepare(
    `SELECT
       td.id,
       td.website_id,
       td.domain_name,
       td.status,
       td.www_mode,
       td.dns_verification_status,
       td.ssl_status,
       p.public_slug,
       p.business_name,
       p.status AS website_status
     FROM tenant_domains td
     INNER JOIN customer_website_publications p ON p.website_id = td.website_id
     WHERE td.domain_name = ? OR td.domain_name = ?
     LIMIT 1`
  )
    .bind(lookupHost, rootCandidate)
    .first<ResolveRow>();

  if (!row) {
    return json({ matched: false, hostname: lookupHost, reason: 'not_found' });
  }

  if (
    row.dns_verification_status !== 'verified' ||
    (row.status !== 'live' && row.status !== 'expiring_soon') ||
    row.website_status !== 'published'
  ) {
    return json({
      matched: false,
      hostname: lookupHost,
      reason: 'inactive_or_unverified',
      domainStatus: row.status,
      websiteStatus: row.website_status,
    });
  }

  const rootDomain = row.domain_name.replace(/^www\./, '');
  let redirectUrl: string | null = null;
  if (row.www_mode === 'redirect_to_root' && isWww) {
    redirectUrl = `https://${rootDomain}`;
  } else if (row.www_mode === 'redirect_to_www' && !isWww) {
    redirectUrl = `https://www.${rootDomain}`;
  }

  return json({
    matched: true,
    hostname: lookupHost,
    websiteId: row.website_id,
    tenantSlug: row.public_slug,
    businessName: row.business_name,
    domainName: row.domain_name,
    status: row.status,
    sslStatus: row.ssl_status,
    wwwMode: row.www_mode,
    redirectUrl,
  });
}
