// ============================================================================
// GET /api/public/tenants/:slug/seo — Public Storefront SEO Metadata Endpoint
// Reuses customer_website_publications + optional tenant_global_settings.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';
import {
  OFFICIAL_SITE_URL,
  getTenantRobotsDirective,
  parseTenantSeoSettings,
  resolveTenantCanonicalUrl,
} from '../../../../../shared/seo';

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
    return jsonResponse({ seo: null });
  }

  try {
    const row = await env.DB.prepare(
      `SELECT website_id, public_slug, website_json
       FROM customer_website_publications
       WHERE public_slug = ? AND status = 'published'
       LIMIT 1`
    )
      .bind(slug)
      .first<{ website_id: string; public_slug: string; website_json?: string }>();

    if (!row) {
      return jsonResponse({ seo: null });
    }

    let parsed: Record<string, any> = {};
    try {
      parsed = row.website_json ? JSON.parse(row.website_json) : {};
    } catch {}

    let globalRow: {
      gsc_site_url?: string;
      gsc_verification_token?: string;
      gbp_profile_url?: string;
    } | null = null;

    try {
      globalRow = await env.DB.prepare(
        `SELECT gsc_site_url, gsc_verification_token, gbp_profile_url
         FROM tenant_global_settings
         WHERE website_id = ?
         LIMIT 1`
      )
        .bind(row.website_id)
        .first();
    } catch {
      // Optional table may not exist yet
    }

    const settings = parseTenantSeoSettings(row.website_json);
    const canonicalUrl = resolveTenantCanonicalUrl({
      origin: OFFICIAL_SITE_URL,
      pathname: '/',
      platformSiteSlug: row.public_slug,
      configuredUrl: settings.canonicalUrl,
    });
    const robotsDirectives = getTenantRobotsDirective({
      publicationStatus: 'published',
      rawJson: row.website_json,
      configuredRobots: settings.robotsDirectives,
    });

    return jsonResponse({
      seo: {
        canonicalUrl,
        robotsDirectives,
        googleSiteVerification:
          (typeof parsed.googleSiteVerification === 'string' && parsed.googleSiteVerification.trim()) ||
          globalRow?.gsc_verification_token ||
          '',
        ga4MeasurementId: typeof parsed.ga4MeasurementId === 'string' ? parsed.ga4MeasurementId.trim() : '',
        cityAreaKeywords:
          (typeof parsed.cityAreaKeywords === 'string' && parsed.cityAreaKeywords.trim()) ||
          (typeof parsed.city === 'string' ? parsed.city.trim() : ''),
        googleMapsUrl: typeof parsed.googleMapsUrl === 'string' ? parsed.googleMapsUrl.trim() : '',
        gbpProfileUrl:
          (typeof parsed.gbpProfileUrl === 'string' && parsed.gbpProfileUrl.trim()) ||
          globalRow?.gbp_profile_url ||
          '',
        localBusinessType:
          (typeof parsed.localBusinessType === 'string' && parsed.localBusinessType.trim()) ||
          (String(parsed.category || '').toLowerCase().includes('restaurant')
            ? 'Restaurant'
            : 'LocalBusiness'),
        customPagesJson: Array.isArray(parsed.customPages)
          ? JSON.stringify(parsed.customPages)
          : '[]',
      },
    });
  } catch {
    return jsonResponse({ seo: null });
  }
}
