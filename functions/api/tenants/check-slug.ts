// ============================================================================
// GET /api/tenants/check-slug — Live Slug Validation & Uniqueness Check (D1)
// ============================================================================

import { PagesContext, handleOptions, jsonResponse, toSlug } from '../_shared';
import { RESERVED_SLUGS, validateSlugFormat } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const rawSlug = url.searchParams.get('slug') || '';
  const excludeTenantId = (url.searchParams.get('excludeTenantId') || '').trim();

  const check = validateSlugFormat(rawSlug);
  const baseNormalized = toSlug(rawSlug) || 'my-business';

  if (!check.valid) {
    const candidate = RESERVED_SLUGS.has(baseNormalized)
      ? `${baseNormalized}-store`
      : baseNormalized.length >= 3
        ? baseNormalized
        : `${baseNormalized}-site`;
    return jsonResponse({
      available: false,
      valid: false,
      normalizedSlug: check.normalized,
      message: check.reason || 'Invalid URL slug format.',
      suggestedSlug: candidate,
    });
  }

  if (!env.DB) {
    return jsonResponse({
      available: true,
      valid: true,
      normalizedSlug: check.normalized,
      message: 'Valid slug format.',
      suggestedSlug: check.normalized,
    });
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT rowid, website_id, public_slug
       FROM customer_website_publications
       WHERE public_slug = ?
       LIMIT 1`
    )
      .bind(check.normalized)
      .first<{ rowid?: number; website_id: string; public_slug: string }>();

    const isSameTenant =
      Boolean(existing) &&
      Boolean(excludeTenantId) &&
      (String(existing?.rowid ?? '') === excludeTenantId ||
        existing?.website_id === excludeTenantId ||
        existing?.public_slug === excludeTenantId.toLowerCase());

    if (!existing || isSameTenant) {
      return jsonResponse({
        available: true,
        valid: true,
        normalizedSlug: check.normalized,
        message: 'This URL slug is available.',
        suggestedSlug: check.normalized,
      });
    }

    // Generate an available suggestion
    let suggested = `${check.normalized}-2`;
    for (let suffix = 2; suffix <= 9; suffix++) {
      const candidate = `${check.normalized}-${suffix}`.slice(0, 63);
      const taken = await env.DB.prepare(
        'SELECT 1 AS found FROM customer_website_publications WHERE public_slug = ? LIMIT 1'
      )
        .bind(candidate)
        .first();
      if (!taken) {
        suggested = candidate;
        break;
      }
    }

    return jsonResponse({
      available: false,
      valid: true,
      normalizedSlug: check.normalized,
      message: `The URL "/site/${check.normalized}" is already in use by another business.`,
      suggestedSlug: suggested,
    });
  } catch {
    return jsonResponse(
      {
        available: false,
        valid: true,
        normalizedSlug: check.normalized,
        message: 'Unable to check URL slug availability right now.',
      },
      503
    );
  }
}
