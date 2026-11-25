// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE MULTI-TENANT HOSTNAME MIDDLEWARE
// Handles custom customer domains, 301 canonical redirects, takeover defense,
// and per-tenant SEO / OpenGraph / JSON-LD metadata injection at the edge.
// ============================================================================

import {
  CloudflareEnv,
  PagesContext,
  escapeHtml,
  isPlatformHostname,
} from './api/_shared';
import { parseTenantDeliveryHostname } from '../shared/tenantHost';

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

const BYPASS_PREFIXES = ['/api/', '/assets/', '/favicon', '/manifest', '/sw.js', '/workbox-'];
const BYPASS_EXACT = new Set(['/robots.txt', '/sitemap.xml']);

function blockedDomainHtml(title: string, message: string, hostname: string): Response {
  const safeHost = escapeHtml(hostname);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
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
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}

interface TenantHeadMetadata {
  title: string;
  injection: string;
}

function safeMediaUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '';
}

function safeCssColor(value: unknown): string {
  const raw = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '';
}

/** Builds tenant-owned head tags. No platform credit appears in customer HTML. */
export function buildTenantHeadInjection(
  row: ResolvedTenantRow,
  canonicalUrl: string
): TenantHeadMetadata {
  let seoTitle = `${row.business_name} | Official Website`;
  let seoDescription = `Browse products, services and contact details for ${row.business_name}.`;
  let phone = '';
  let address = '';
  let logoUrl = '';
  let themeColor = '';

  try {
    const parsed = JSON.parse(row.website_json || '{}') as Record<string, unknown>;
    if (typeof parsed.seoTitle === 'string' && parsed.seoTitle.trim()) {
      seoTitle = parsed.seoTitle.trim();
    } else if (typeof parsed.tagline === 'string' && parsed.tagline.trim()) {
      seoTitle = `${row.business_name} — ${parsed.tagline.trim()}`;
    }
    if (typeof parsed.seoDescription === 'string' && parsed.seoDescription.trim()) {
      seoDescription = parsed.seoDescription.trim();
    } else if (typeof parsed.description === 'string' && parsed.description.trim()) {
      seoDescription = parsed.description.trim().slice(0, 160);
    }
    if (typeof parsed.phone === 'string') phone = parsed.phone.trim();
    if (typeof parsed.address === 'string') address = parsed.address.trim();
    logoUrl = safeMediaUrl(parsed.logoImage || parsed.logoUrl);
    themeColor = safeCssColor(parsed.primaryColor || parsed.themeColor || parsed.brandColor);
  } catch {
    // Use safe defaults
  }

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: row.business_name,
    url: canonicalUrl,
    ...(phone ? { telephone: phone } : {}),
    ...(address ? { address } : {}),
  }).replace(/</g, '\\u003c');

  const tags = [
    `<meta name="vv-tenant-slug" content="${escapeHtml(row.public_slug)}" />`,
    `<meta name="application-name" content="${escapeHtml(row.business_name)}" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(row.business_name)}" />`,
    themeColor ? `<meta name="theme-color" content="${themeColor}" />` : '',
    `<meta name="description" content="${escapeHtml(seoDescription)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(row.business_name)}" />`,
    `<meta property="og:title" content="${escapeHtml(seoTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(seoDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(seoTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(seoDescription)}" />`,
    logoUrl ? `<meta property="og:image" content="${escapeHtml(logoUrl)}" />` : '',
    logoUrl ? `<link rel="icon" href="${escapeHtml(logoUrl)}" />` : '',
    logoUrl ? `<link rel="apple-touch-icon" href="${escapeHtml(logoUrl)}" />` : '',
    `<script type="application/ld+json">${ldJson}</script>`,
  ];

  return { title: seoTitle, injection: tags.filter(Boolean).join('\n') };
}

/**
 * Removes the global platform SPA metadata before tenant tags are injected.
 * Appending tenant tags alone left duplicate titles and platform JSON-LD on
 * delivered customer domains.
 */
export function replacePlatformHeadMetadata(
  html: string,
  tenantTitle: string,
  tenantHeadInjection: string
): string {
  const safeTitle = escapeHtml(tenantTitle);
  let result = String(html || '').replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, `<title>${safeTitle}</title>`);

  result = result
    .replace(
      /<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:|twitter:|google-site-verification|description|robots|theme-color|mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title)[^"']*["'][^>]*>/gi,
      ''
    )
    .replace(
      /<link\b[^>]*\brel\s*=\s*["'](?:canonical|alternate|icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi,
      ''
    )
    .replace(
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      ''
    );

  return result.replace(/<\/head>/i, `${tenantHeadInjection}\n</head>`);
}

/**
 * /site/{slug} on a platform host is an honest fallback route. The shell stays
 * on the official host, but platform OG/Twitter branding must not be presented
 * as the tenant's storefront metadata.
 */
async function rewritePlatformSiteRouteMetadata(
  context: PagesContext,
  rawSlug: string,
  hostname: string
): Promise<Response | null> {
  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(rawSlug || '');
  } catch {
    return null;
  }
  const slug = decodedSlug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !context.env.DB) return null;

  const published = await context.env.DB.prepare(
    `SELECT website_id, public_slug, business_name, status, website_json
     FROM customer_website_publications
     WHERE public_slug = ? AND status = 'published'
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

  const response = await context.next();
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('text/html')) {
    return response;
  }

  const url = new URL(context.request.url);
  const canonicalUrl = `${url.origin}/site/${encodeURIComponent(published.public_slug)}`;
  const row: ResolvedTenantRow = {
    id: 0,
    website_id: published.website_id,
    domain_name: hostname,
    status: 'platform_site_route',
    www_mode: 'both',
    dns_verification_status: 'not_applicable',
    ssl_status: 'not_applicable',
    public_slug: published.public_slug,
    business_name: published.business_name,
    website_status: published.status,
    website_json: published.website_json,
  };
  const head = buildTenantHeadInjection(row, canonicalUrl);
  const updatedHtml = replacePlatformHeadMetadata(await response.text(), head.title, head.injection);
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-VV-Tenant-Slug', row.public_slug);
  headers.set('X-VV-Domain-Status', row.status);
  headers.delete('Content-Length');

  return new Response(updatedHtml, { status: response.status, headers });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // SECURITY & SPA SAFEGUARD: Never allow an API route to fall through to the HTML SPA shell.
  // When a Cloudflare Pages Function route is missing or fails to match, Pages serves index.html (200 text/html).
  // This interceptor guarantees any unmatched /api/* call returns 404 JSON with proper Content-Type.
  if (url.pathname.startsWith('/api/')) {
    const response = await next();
    const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return new Response(
        JSON.stringify({
          error: `API route not found: ${url.pathname}`,
          status: 404,
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }
      );
    }
    return response;
  }

  // SECURITY: Always use the TLS-verified request URL hostname — never trust arbitrary Host/X-Forwarded-Host headers.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');

  // API endpoints, static assets and SEO files always bypass tenant HTML rewriting.
  if (
    BYPASS_EXACT.has(url.pathname) ||
    BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return next();
  }

  const platformSiteRoute = url.pathname.match(/^\/site\/([^/]+)\/?$/);
  if (platformSiteRoute && isPlatformHostname(hostname, context.env)) {
    const rewritten = await rewritePlatformSiteRouteMetadata(
      context,
      platformSiteRoute[1],
      hostname
    );
    if (rewritten) return rewritten;
  }

  // Platform-owned default delivery subdomains are tenant hosts only when a
  // published tenant actually exists for the subdomain. Unknown hosts (including
  // Pages deploy previews) continue to render the platform shell.
  const deliveryHost = parseTenantDeliveryHostname(hostname);
  const canResolveDeliveryHost = Boolean(deliveryHost && env.DB);
  if (isPlatformHostname(hostname, env) && !canResolveDeliveryHost) {
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
        // Do not fabricate DNS/TLS verification. Real wildcard provisioning
        // must be completed externally before these hosts can be advertised as live.
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
    if (deliveryHost) return next();
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

  // Load SPA shell and inject per-tenant SEO metadata + tenant headers
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
  const canonicalUrl = `https://${canonicalHost}${url.pathname === '/' ? '' : url.pathname}`;
  const head = buildTenantHeadInjection(row, canonicalUrl);

  const html = await response.text();
  const updatedHtml = replacePlatformHeadMetadata(html, head.title, head.injection);

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-VV-Tenant-Slug', row.public_slug);
  headers.set('X-VV-Domain-Status', row.status);
  headers.delete('Content-Length');

  return new Response(updatedHtml, {
    status: response.status,
    headers,
  });
}
