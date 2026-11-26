// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE MULTI-TENANT HOSTNAME MIDDLEWARE
// Handles custom customer domains, 301 canonical redirects, takeover defense,
// unknown-route 404s, and per-tenant SEO / OpenGraph / JSON-LD injection.
// All public SEO rules come from shared/seo.ts.
// ============================================================================

import { PagesContext, SECURITY_HEADERS, applyCorsHeaders, isPlatformHostname } from './api/_shared';
import { parseTenantDeliveryHostname } from '../shared/tenantHost';
import {
  OFFICIAL_SITE_URL,
  STOREFRONT_ROUTE_PREFIX,
  buildNotFoundHtml,
  buildTenantStructuredData,
  escapeHtml,
  getPlatformSeoMeta,
  getStorefrontSlug,
  getTenantRobotsDirective,
  isIndexableRobotsDirective,
  isKnownPlatformHtmlRoute,
  isLegacyStorefrontRoute,
  isStaticAssetPath,
  normalizePathname,
  parseTenantSeoSettings,
  renderPlatformHeadInjection,
  renderTenantHeadInjection,
  replaceHeadMetadata,
  resolveTenantCanonicalUrl,
  setHtmlLangDir,
} from '../shared/seo';

interface ResolvedTenantRow {
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
  website_json: string;
}

interface TenantHeadMetadata {
  title: string;
  injection: string;
}

const BYPASS_PREFIXES = ['/api/', '/assets/', '/favicon', '/manifest', '/sw.js', '/workbox-'];
const BYPASS_EXACT = new Set(['/robots.txt', '/sitemap.xml']);

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function blockedDomainHtml(title: string, message: string, hostname: string): Response {
  const safeHost = escapeHtml(hostname);
  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08080A;color:#E8E8ED;font-family:system-ui,-apple-system,sans-serif;padding:24px;}
    .card{max-width:520px;background:#111116;border:1px solid #262630;border-radius:14px;padding:28px;}
    h1{margin:0 0 10px;font-size:20px;color:#F8FAFC;}
    p{margin:0 0 12px;font-size:14px;line-height:1.6;color:#A1A1AA;}
    code{background:#1A1A24;padding:2px 6px;border-radius:6px;color:#E2E8F0;}
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p>Requested host: <code>${safeHost}</code></p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: 403,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

function notFoundHtmlResponse(message = 'The requested page does not exist.'): Response {
  return new Response(buildNotFoundHtml('Page Not Found', message), {
    status: 404,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

function tenantCopy(
  row: ResolvedTenantRow,
  settings: ReturnType<typeof parseTenantSeoSettings>,
  parsed: Record<string, unknown>
): { seoTitle: string; seoDescription: string } {
  const tagline = text(parsed.tagline);
  const description = text(parsed.description);
  return {
    seoTitle:
      settings.seoTitle ||
      (tagline ? `${row.business_name} — ${tagline}` : `${row.business_name} | Official Website`),
    seoDescription:
      settings.seoDescription ||
      description.slice(0, 160) ||
      `Browse products, services and contact details for ${row.business_name}.`,
  };
}

/** Builds tenant-owned head tags. No platform credit appears in customer HTML. */
export function buildTenantHeadInjection(
  row: ResolvedTenantRow,
  canonicalUrl: string,
  robotsDirective?: string
): TenantHeadMetadata {
  const parsed = parseJsonObject(row.website_json);
  const settings = parseTenantSeoSettings(row.website_json);
  const copy = tenantCopy(row, settings, parsed);
  const robots =
    robotsDirective ||
    getTenantRobotsDirective({
      publicationStatus: row.website_status || row.status,
      rawJson: row.website_json,
      configuredRobots: settings.robotsDirectives,
    });

  const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
  const products = rawProducts
    .slice(0, 12)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const product = item as Record<string, unknown>;
      const name = text(product.name);
      if (!name) return null;
      return {
        name,
        description: text(product.description) || undefined,
        imageUrl: text(product.imageUrl) || undefined,
        price: Number(product.price) || 0,
        stock: Number(product.stock) || 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const structuredData = buildTenantStructuredData({
    name: row.business_name,
    description: copy.seoDescription,
    phone: settings.phone || text(parsed.phone),
    address: settings.address || text(parsed.address),
    addressCountry: 'IN',
    canonicalUrl,
    localBusinessType: settings.localBusinessType,
    googleMapsUrl: settings.googleMapsUrl,
    currency: settings.currency,
    products,
  });

  return renderTenantHeadInjection({
    name: row.business_name,
    seoTitle: copy.seoTitle,
    seoDescription: copy.seoDescription,
    canonicalUrl,
    robots,
    tenantSlug: row.public_slug,
    logoUrl: settings.logoUrl,
    googleSiteVerification: settings.googleSiteVerification,
    structuredData,
  });
}

/**
 * Removes platform-owned SEO metadata before tenant tags are injected.
 * Appending tenant tags alone left duplicate titles and platform JSON-LD on
 * delivered customer domains.
 */
export function replacePlatformHeadMetadata(
  html: string,
  tenantTitle: string,
  tenantHeadInjection: string
): string {
  return replaceHeadMetadata(html, tenantTitle, tenantHeadInjection, true);
}

async function platformHtmlResponse(
  context: PagesContext,
  url: URL,
  pathname: string
): Promise<Response | null> {
  const response = await context.next();
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
    return response;
  }

  const meta = getPlatformSeoMeta(
    OFFICIAL_SITE_URL,
    pathname,
    url.searchParams.get('lang'),
    url.searchParams.has('lang')
  );
  let html = replaceHeadMetadata(
    await response.text(),
    meta.title,
    renderPlatformHeadInjection(meta),
    false
  );
  html = setHtmlLangDir(html, meta.lang, meta.dir);

  const headers = new Headers(response.headers);
  for (const name of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    headers.set(name, SECURITY_HEADERS[name]);
  }
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Robots-Tag', meta.robots);
  headers.delete('Content-Length');
  return new Response(html, { status: response.status, headers });
}

/**
 * /site/{slug} on a platform host is the single canonical platform-host route.
 * Only public, indexable publications are rewritten with tenant metadata.
 * Malformed or unpublished slugs fall through to the unchanged platform shell,
 * preserving existing platform-host compatibility while still keeping unknown
 * non-storefront routes as real 404s.
 */
async function rewritePlatformSiteRouteMetadata(
  context: PagesContext,
  rawSlug: string,
  hostname: string,
  url: URL
): Promise<Response | null> {
  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(rawSlug || '');
  } catch {
    return null;
  }
  const slug = getStorefrontSlug(`${STOREFRONT_ROUTE_PREFIX}${decodedSlug}`);
  if (!slug || !context.env.DB) return null;

  const published = await context.env.DB.prepare(
    `SELECT website_id, public_slug, business_name, status, website_json
     FROM customer_website_publications
     WHERE public_slug = ?
     LIMIT 1`
  )
    .bind(slug)
    .first<{
      website_id: string;
      public_slug: string;
      business_name: string;
      status: string;
      website_json: string;
    }>();
  if (!published) return null;

  const settings = parseTenantSeoSettings(published.website_json);
  const robots = getTenantRobotsDirective({
    publicationStatus: published.status,
    rawJson: published.website_json,
    configuredRobots: settings.robotsDirectives,
  });
  if (!isIndexableRobotsDirective(robots)) return null;

  const response = await context.next();
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
    return response;
  }

  const canonicalUrl = resolveTenantCanonicalUrl({
    origin: OFFICIAL_SITE_URL,
    pathname: url.pathname,
    platformSiteSlug: published.public_slug,
    configuredUrl: settings.canonicalUrl,
  });
  const row: ResolvedTenantRow = {
    id: 0,
    website_id: published.website_id,
    domain_name: hostname,
    status: 'published',
    www_mode: 'both',
    dns_verification_status: 'not_applicable',
    ssl_status: 'not_applicable',
    public_slug: published.public_slug,
    business_name: published.business_name,
    website_status: published.status,
    website_json: published.website_json,
  };
  const head = buildTenantHeadInjection(row, canonicalUrl, robots);
  let html = replacePlatformHeadMetadata(await response.text(), head.title, head.injection);
  html = setHtmlLangDir(html, 'en', 'ltr');

  const headers = new Headers(response.headers);
  for (const name of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    headers.set(name, SECURITY_HEADERS[name]);
  }
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-VV-Tenant-Slug', row.public_slug);
  headers.set('X-VV-Domain-Status', published.status);
  headers.set('X-Robots-Tag', robots);
  headers.delete('Content-Length');

  return new Response(html, { status: response.status, headers });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const pathname = normalizePathname(url.pathname);

  // SECURITY & SPA SAFEGUARD: Never allow an API route to fall through to the HTML SPA shell.
  // When a Cloudflare Pages Function route is missing or fails to match, Pages serves index.html (200 text/html).
  // This interceptor guarantees any unmatched /api/* call returns 404 JSON with proper Content-Type.
  if (pathname.startsWith('/api/')) {
    const response = await next();
    const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return applyCorsHeaders(
        request,
        new Response(
          JSON.stringify({
            error: `API route not found: ${pathname}`,
            status: 404,
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          }
        ),
        env
      );
    }
    return applyCorsHeaders(request, response, env);
  }

  // SECURITY: Always use the TLS-verified request URL hostname — never trust arbitrary Host/X-Forwarded-Host headers.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const storefrontSlug = getStorefrontSlug(pathname);
  const isPlatformHost = isPlatformHostname(hostname, env);

  // API endpoints, static assets and SEO files always bypass HTML rewriting.
  if (
    BYPASS_EXACT.has(pathname) ||
    BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    isStaticAssetPath(pathname)
  ) {
    return next();
  }

  // Legacy /sites/{slug} is never canonical: 301 to /site/{slug}.
  if (isPlatformHost && isLegacyStorefrontRoute(pathname)) {
    if (!storefrontSlug) return notFoundHtmlResponse('Invalid storefront URL.');
    const target = new URL(`${STOREFRONT_ROUTE_PREFIX}${storefrontSlug}`, OFFICIAL_SITE_URL);
    target.search = url.search;
    return Response.redirect(target.toString(), 301);
  }

  const deliveryHost = parseTenantDeliveryHostname(hostname);
  const canResolveDeliveryHost = Boolean(deliveryHost && env.DB);

  if (isPlatformHost && !canResolveDeliveryHost) {
    if (storefrontSlug || pathname.startsWith(STOREFRONT_ROUTE_PREFIX)) {
      const rewritten = await rewritePlatformSiteRouteMetadata(
        context,
        pathname.split('/').filter(Boolean).slice(1).join('/'),
        hostname,
        url
      );
      // Malformed/unpublished slugs stay on the unchanged platform shell.
      return rewritten || next();
    }
    if (!isKnownPlatformHtmlRoute(pathname)) return notFoundHtmlResponse();
    // Official hosts and deploy previews own their platform head metadata; do
    // not rewrite it at the edge when no tenant has been resolved.
    return next();
  }

  if (!env.DB) {
    return blockedDomainHtml(
      'Domain Routing Unavailable',
      'The platform database binding is not configured for custom domain resolution.',
      hostname
    );
  }

  const isWwwRequest = hostname.startsWith('www.');
  const rootCandidate = isWwwRequest ? hostname.slice(4) : hostname;
  let row: ResolvedTenantRow | null = null;
  let isDeliveryHost = false;

  if (deliveryHost) {
    const published = await env.DB.prepare(
      `SELECT website_id, public_slug, business_name, status, website_json
       FROM customer_website_publications
       WHERE (public_slug = ? OR website_id = ?) AND status = 'published'
       LIMIT 1`
    )
      .bind(deliveryHost.slug, deliveryHost.slug)
      .first<{
        website_id: string;
        public_slug: string;
        business_name: string;
        status: string;
        website_json: string;
      }>();

    if (published) {
      row = {
        id: 0,
        website_id: published.website_id,
        domain_name: hostname,
        status: 'requires_wildcard_dns_tls',
        www_mode: 'both',
        dns_verification_status: 'pending',
        ssl_status: 'pending',
        public_slug: published.public_slug,
        business_name: published.business_name,
        website_status: published.status,
        website_json: published.website_json,
      };
      isDeliveryHost = true;
    }
  } else {
    row = await env.DB.prepare(
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
         p.status AS website_status,
         p.website_json
       FROM tenant_domains td
       INNER JOIN customer_website_publications p ON p.website_id = td.website_id
       WHERE td.domain_name = ? OR td.domain_name = ?
       LIMIT 1`
    )
      .bind(hostname, rootCandidate)
      .first<ResolvedTenantRow>();
  }

  // Unknown delivery hosts are deploy previews or unprovisioned hostnames; they
  // stay on the platform shell. Unknown custom domains remain blocked.
  if (!row) {
    if (deliveryHost) {
      // Unknown delivery subdomains are unprovisioned platform hosts. Keep the
      // platform shell byte-for-byte unchanged and never emit tenant headers.
      return next();
    }
    return blockedDomainHtml(
      'Domain Not Connected',
      'This custom domain is not connected to any verified business website.',
      hostname
    );
  }

  if (!isDeliveryHost) {
    if (row.status === 'suspended' || row.status === 'expired' || row.status === 'rejected' || row.status === 'disconnected') {
      return blockedDomainHtml(
        'Website Temporarily Unavailable',
        'This custom domain is currently inactive, suspended, or awaiting renewal verification.',
        hostname
      );
    }

    if (row.dns_verification_status !== 'verified' || (row.status !== 'live' && row.status !== 'expiring_soon')) {
      return blockedDomainHtml(
        'Domain Verification Pending',
        'DNS ownership verification and HTTPS activation have not been completed for this domain yet.',
        hostname
      );
    }

    if (row.website_status !== 'published') {
      return blockedDomainHtml(
        'Website Unpublished',
        'The business owner has currently set this website to unpublished mode.',
        hostname
      );
    }
  }

  // A tenant domain owns only its root storefront. /site/* and /sites/* on a
  // tenant host are duplicates and must not be indexed.
  if (storefrontSlug || pathname !== '/') {
    const target = new URL('/', request.url);
    target.protocol = 'https:';
    return Response.redirect(target.toString(), 301);
  }

  // Canonical 301 Redirect Enforcement (www <-> root)
  const rootDomain = row.domain_name.replace(/^www\./, '');
  if (row.www_mode === 'redirect_to_root' && isWwwRequest) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = rootDomain;
    return Response.redirect(target.toString(), 301);
  }
  if (row.www_mode === 'redirect_to_www' && !isWwwRequest) {
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = `www.${rootDomain}`;
    return Response.redirect(target.toString(), 301);
  }

  // Load SPA shell and inject per-tenant SEO metadata + tenant headers.
  const response = await next();
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const canonicalHost = isDeliveryHost
    ? hostname
    : row.www_mode === 'redirect_to_www'
      ? `www.${rootDomain}`
      : rootDomain;
  const settings = parseTenantSeoSettings(row.website_json);
  const resolvedCanonicalUrl = resolveTenantCanonicalUrl({
    origin: `https://${canonicalHost}`,
    pathname: '/',
    platformSiteSlug: null,
    configuredUrl: settings.canonicalUrl,
  });
  // Delivery hosts canonicalize to the bare HTTPS origin; platform-host routes
  // keep the explicit trailing slash used by the shared SEO rules.
  const canonicalUrl = isDeliveryHost ? resolvedCanonicalUrl.replace(/\/$/, '') : resolvedCanonicalUrl;
  const robots = getTenantRobotsDirective({
    publicationStatus: row.website_status || row.status,
    domainStatus: isDeliveryHost ? undefined : row.status,
    rawJson: row.website_json,
    configuredRobots: settings.robotsDirectives,
  });
  const head = buildTenantHeadInjection(row, canonicalUrl, robots);

  let html = replacePlatformHeadMetadata(await response.text(), head.title, head.injection);
  html = setHtmlLangDir(html, 'en', 'ltr');

  const headers = new Headers(response.headers);
  for (const name of [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    headers.set(name, SECURITY_HEADERS[name]);
  }
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-VV-Tenant-Slug', row.public_slug);
  headers.set('X-VV-Domain-Status', row.status);
  headers.set('X-Robots-Tag', robots);
  headers.delete('Content-Length');

  return new Response(html, {
    status: response.status,
    headers,
  });
}
