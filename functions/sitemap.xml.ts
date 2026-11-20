// ============================================================================
// VIJAY VISUALS — DYNAMIC EDGE SITEMAP.XML (PLATFORM, BLOG, HREFLANG & DOMAINS)
// ============================================================================

import { PagesContext, escapeHtml, isPlatformHostname } from './api/_shared';

const HREFLANG_CODES = ['en', 'te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'or', 'ur'] as const;

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const origin = `${url.protocol}//${url.host}`;

  const isPlatform = isPlatformHostname(hostname, env);
  const urls: Array<{ loc: string; lastmod?: string; priority: string; withHreflang?: boolean }> = [
    { loc: `${origin}/`, priority: '1.0', withHreflang: isPlatform },
  ];

  if (env.DB) {
    try {
      if (isPlatform) {
        urls.push(
          { loc: `${origin}/builder`, priority: '0.9', withHreflang: true },
          { loc: `${origin}/marketplace`, priority: '0.9', withHreflang: true }
        );

        // Published tenant storefronts
        const res = await env.DB.prepare(
          `SELECT public_slug, updated_at FROM customer_website_publications
           WHERE status = 'published' ORDER BY updated_at DESC LIMIT 500`
        ).all<{ public_slug: string; updated_at?: string }>();

        for (const row of res.results || []) {
          urls.push({
            loc: `${origin}/sites/${encodeURIComponent(row.public_slug)}`,
            lastmod: row.updated_at ? row.updated_at.slice(0, 10) : undefined,
            priority: '0.8',
          });
        }

        // Published public SEO blog articles (Migration 0006)
        try {
          const posts = await env.DB.prepare(
            `SELECT slug, published_at FROM public_blog_posts
             WHERE is_published = 1 ORDER BY published_at DESC LIMIT 200`
          ).all<{ slug: string; published_at?: string }>();
          for (const post of posts.results || []) {
            urls.push({
              loc: `${origin}/blog/${encodeURIComponent(post.slug)}`,
              lastmod: post.published_at ? post.published_at.slice(0, 10) : undefined,
              priority: '0.7',
            });
          }
        } catch {
          // Optional prior to migration 0006
        }
      } else {
        // Custom customer domain: include only that tenant's verified active products
        const rootCandidate = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
        const domainRow = await env.DB.prepare(
          `SELECT website_id, updated_at FROM tenant_domains
           WHERE (domain_name = ? OR domain_name = ?) AND status IN ('live', 'expiring_soon') LIMIT 1`
        )
          .bind(hostname, rootCandidate)
          .first<{ website_id: string; updated_at?: string }>();

        if (domainRow) {
          if (domainRow.updated_at) {
            urls[0].lastmod = domainRow.updated_at.slice(0, 10);
          }
          try {
            const products = await env.DB.prepare(
              `SELECT id, updated_at FROM store_products WHERE website_id = ? AND is_active = 1 LIMIT 200`
            )
              .bind(domainRow.website_id)
              .all<{ id: number; updated_at?: string }>();
            for (const p of products.results || []) {
              urls.push({
                loc: `${origin}/?product=${p.id}`,
                lastmod: p.updated_at ? p.updated_at.slice(0, 10) : undefined,
                priority: '0.7',
              });
            }
          } catch {
            // Optional products table
          }
        }
      }
    } catch {
      // Fallback to root URL only
    }
  }

  const xmlEntries = urls
    .map((u) => {
      const lastmodTag = u.lastmod ? `<lastmod>${escapeHtml(u.lastmod)}</lastmod>` : '';
      const hreflangTags = u.withHreflang
        ? '\n' +
          HREFLANG_CODES.map(
            (code) =>
              `    <xhtml:link rel="alternate" hreflang="${code}" href="${escapeHtml(`${u.loc}?lang=${code}`)}" />`
          ).join('\n') +
          `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(u.loc)}" />\n  `
        : '';
      return `  <url><loc>${escapeHtml(u.loc)}</loc>${lastmodTag}<priority>${u.priority}</priority>${hreflangTags}</url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${xmlEntries}
</urlset>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  });
}
