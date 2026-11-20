// ============================================================================
// GET /api/public/tenants/:slug/locations — Public Storefront Branch Locations
// Returns saved branches from business_profiles if present, or safe empty [].
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';

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
    return jsonResponse({ locations: [] });
  }

  try {
    const pub = await env.DB.prepare(
      `SELECT website_id
       FROM customer_website_publications
       WHERE public_slug = ? AND status = 'published'
       LIMIT 1`
    )
      .bind(slug)
      .first<{ website_id: string }>();

    if (!pub) {
      return jsonResponse({ locations: [] });
    }

    try {
      const bp = await env.DB.prepare(
        `SELECT branches_json
         FROM business_profiles
         WHERE website_id = ?
         LIMIT 1`
      )
        .bind(pub.website_id)
        .first<{ branches_json?: string }>();

      if (bp?.branches_json) {
        const parsed = JSON.parse(bp.branches_json);
        if (Array.isArray(parsed)) {
          return jsonResponse({ locations: parsed });
        }
      }
    } catch {
      // Optional business_profiles table may not exist yet
    }

    return jsonResponse({ locations: [] });
  } catch {
    return jsonResponse({ locations: [] });
  }
}
