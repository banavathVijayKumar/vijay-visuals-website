// ============================================================================
// VIJAY VISUALS — DYNAMIC EDGE ROBOTS.TXT (PER-HOST TENANT & PLATFORM AWARE)
// ============================================================================

import { PagesContext } from './api/_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const origin = `${url.protocol}//${url.host}`;

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /dashboards',
    'Disallow: /admin',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
