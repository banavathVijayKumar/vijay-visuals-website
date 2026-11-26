// ============================================================================
// VIJAY VISUALS — DYNAMIC EDGE ROBOTS.TXT
// Platform routes and tenant-owned domains share one authoritative rule set.
// ============================================================================

import { PagesContext, isPlatformHostname } from './api/_shared';
import { OFFICIAL_SITE_URL, buildRobotsTxt } from '../shared/seo';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const origin = isPlatformHostname(hostname, env)
    ? OFFICIAL_SITE_URL
    : `${url.protocol}//${url.host}`;

  return new Response(buildRobotsTxt(origin), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
