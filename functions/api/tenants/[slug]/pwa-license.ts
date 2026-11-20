// ============================================================================
// GET /api/tenants/:slug/pwa-license — Public PWA License Check (Cloudflare D1)
// Prevents SPA HTML fallback on storefront load and accurately reports license.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../../_shared';

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
    return jsonResponse({ valid: false, pwaEnabled: false });
  }

  try {
    const row = await env.DB.prepare(
      `SELECT website_json
       FROM customer_website_publications
       WHERE public_slug = ? AND status = 'published'
       LIMIT 1`
    )
      .bind(slug)
      .first<{ website_json?: string }>();

    if (!row?.website_json) {
      return jsonResponse({ valid: false, pwaEnabled: false });
    }

    const parsed = JSON.parse(row.website_json) as Record<string, unknown>;
    const pwaEnabled = parsed.pwaEnabled === true;
    const hasLicenseKey =
      typeof parsed.pwaLicenseKey === 'string' && parsed.pwaLicenseKey.trim().length > 0;

    return jsonResponse({
      valid: pwaEnabled && hasLicenseKey,
      pwaEnabled,
    });
  } catch {
    return jsonResponse({ valid: false, pwaEnabled: false });
  }
}
