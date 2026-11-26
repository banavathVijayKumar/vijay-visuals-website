// ============================================================================
// VIJAY VISUALS — DYNAMIC EDGE SITEMAP.XML
// Only real, indexable HTML routes are advertised. Canonical storefront URLs
// use /site/{slug}; /sites/{slug} is legacy and deliberately excluded.
// ============================================================================

import { PagesContext, isPlatformHostname } from './api/_shared';
import {
  OFFICIAL_SITE_URL,
  SitemapEntry,
  STOREFRONT_ROUTE_PREFIX,
  buildSitemapXml,
  safeLastmod,
} from '../shared/seo';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const isPlatform = isPlatformHostname(hostname, env);
  const sitemapOrigin = isPlatform ? OFFICIAL_SITE_URL : `${url.protocol}//${url.host}`;

  const entries: SitemapEntry[] = [
    { loc: `${sitemapOrigin}/`, priority: '1.0', withHreflang: isPlatform },
  ];

  if (env.DB) {
    try {
      if (isPlatform) {
        // /builder is intentionally absent: it is an application route and is
        // served with noindex. Only public, crawlable pages belong here.
        entries.push({ loc: `${sitemapOrigin}/marketplace`, priority: '0.9' });

        const published = await env.DB.prepare(
          `SELECT public_slug, updated_at
           FROM customer_website_publications
           WHERE status = 'published' AND public_slug IS NOT NULL AND public_slug <> ''
           ORDER BY updated_at DESC
           LIMIT 500`
        ).all<{ public_slug: string; updated_at?: string }>();

        for (const row of published.results || []) {
          entries.push({
            loc: `${sitemapOrigin}${STOREFRONT_ROUTE_PREFIX}${encodeURIComponent(row.public_slug)}`,
            lastmod: safeLastmod(row.updated_at),
            priority: '0.8',
          });
        }
      } else {
        // Tenant-owned domain: only the verified, published storefront root is
        // indexable. Product query strings and unverified domains are excluded.
        const rootCandidate = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
        const domainRow = await env.DB.prepare(
          `SELECT td.updated_at AS domain_updated_at,
                  p.updated_at AS publication_updated_at
           FROM tenant_domains td
           INNER JOIN customer_website_publications p ON p.website_id = td.website_id
           WHERE (td.domain_name = ? OR td.domain_name = ?)
             AND td.status IN ('live', 'expiring_soon')
             AND td.dns_verification_status = 'verified'
             AND p.status = 'published'
           LIMIT 1`
        )
          .bind(hostname, rootCandidate)
          .first<{ domain_updated_at?: string; publication_updated_at?: string }>();

        if (domainRow) {
          entries[0].lastmod = safeLastmod(
            domainRow.publication_updated_at || domainRow.domain_updated_at
          );
        }
      }
    } catch {
      // A missing migration or D1 failure must never break the sitemap. The
      // root URL above remains valid.
    }
  }

  return new Response(buildSitemapXml(entries), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}
