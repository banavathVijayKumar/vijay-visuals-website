// ============================================================================
// GET /api/tenants/:slug/manifest.webmanifest
// Dynamic per-tenant Web App Manifest for installable branded business PWAs.
// ============================================================================

import { PagesContext, handleOptions } from '../../_shared';
import { PublicationRow, cleanString, mapPublicationToTenant } from '../../_tenantMapper';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { params, env } = context;
  const slug = String(params?.slug || '').toLowerCase().trim();

  if (!SLUG_PATTERN.test(slug) || !env.DB) {
    return new Response(JSON.stringify({ error: 'Manifest not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  let row: PublicationRow | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
       FROM customer_website_publications
       WHERE public_slug = ? AND status = 'published'
       LIMIT 1`
    )
      .bind(slug)
      .first<PublicationRow>();
  } catch {
    return new Response(JSON.stringify({ error: 'Manifest unavailable.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (!row) {
    return new Response(JSON.stringify({ error: 'Storefront not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  let parsed: Record<string, any> = {};
  try {
    parsed = row.website_json ? JSON.parse(row.website_json) : {};
  } catch {}

  // Branded install manifests are a licensed PWA feature. Unlicensed storefronts
  // get no branded manifest instead of inheriting the platform PWA identity.
  const pwaEnabled = parsed.pwaEnabled === true;
  const hasLicenseKey =
    typeof parsed.pwaLicenseKey === 'string' && parsed.pwaLicenseKey.trim().length >= 8;
  if (!pwaEnabled || !hasLicenseKey) {
    return new Response(JSON.stringify({ error: 'Branded PWA is not enabled for this storefront.' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const tenant = mapPublicationToTenant(row, parsed);
  const shortName = cleanString(tenant.pwaShortName || tenant.name, 12) || 'Store';
  const startUrl = `/site/${tenant.slug}`;
  const configuredIcon = [parsed.pwaIconUrl, tenant.logoImage].find(
    (value): value is string =>
      typeof value === 'string' &&
      (/^https?:\/\//i.test(value.trim()) || (value.trim().startsWith('/') && !value.trim().startsWith('//')))
  );
  const tenantIcon = configuredIcon ? configuredIcon.trim() : '';

  const manifest = {
    id: startUrl,
    name: tenant.pwaAppName || tenant.name,
    short_name: shortName,
    description: tenant.tagline || tenant.description || `${tenant.name} Official Business Web App`,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: tenant.accentColor || '#08080A',
    theme_color: tenant.pwaThemeColor || tenant.primaryColor || '#08080A',
    icons: tenantIcon
      ? [
          { src: tenantIcon, sizes: 'any', purpose: 'any' },
          { src: tenantIcon, sizes: 'any', purpose: 'maskable' },
        ]
      : [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
