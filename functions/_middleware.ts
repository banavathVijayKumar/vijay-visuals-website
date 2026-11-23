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
  <title>${escapeHtml(title)} — Vijay Visuals</title>
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

function buildTenantHeadInjection(row: ResolvedTenantRow, canonicalUrl: string): string {
  let seoTitle = `${row.business_name} | Official Website`;
  let seoDescription = `Visit ${row.business_name} online — powered by Vijay Visuals.`;
  let phone = '';
  let address = '';

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

  return [
    `<meta name="vv-tenant-slug" content="${escapeHtml(row.public_slug)}" />`,
    `<meta name="vv-tenant-website-id" content="${escapeHtml(row.website_id)}" />`,
    `<meta name="description" content="${escapeHtml(seoDescription)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(seoTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(seoDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `<script type="application/ld+json">${ldJson}</script>`,
  ].join('\n');
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

  // Pass through platform domains, API endpoints, static assets, and SEO files directly
  if (
    isPlatformHostname(hostname, env) ||
    BYPASS_EXACT.has(url.pathname) ||
    BYPASS_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
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
       p.status AS website_status,
       p.website_json
     FROM tenant_domains td
     INNER JOIN customer_website_publications p ON p.website_id = td.website_id
     WHERE td.domain_name = ? OR td.domain_name = ?
     LIMIT 1`
  )
    .bind(hostname, rootCandidate)
    .first<ResolvedTenantRow>();

  // Domain Takeover Defense: never serve an unverified or unregistered custom domain
  if (!row) {
    return blockedDomainHtml(
      'Domain Not Connected',
      'This custom domain is not connected to any verified business website on Vijay Visuals.',
      hostname
    );
  }

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

  const canonicalHost = row.www_mode === 'redirect_to_www' ? `www.${rootDomain}` : rootDomain;
  const canonicalUrl = `https://${canonicalHost}${url.pathname === '/' ? '' : url.pathname}`;
  const headInjection = buildTenantHeadInjection(row, canonicalUrl);
  const safeTitle = escapeHtml(`${row.business_name} | Official Website`);

  const html = await response.text();
  const updatedHtml = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(/<\/head>/i, `${headInjection}\n</head>`);

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
