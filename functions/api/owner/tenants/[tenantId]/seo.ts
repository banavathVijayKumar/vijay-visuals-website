// ============================================================================
// GET & PUT /api/owner/tenants/:tenantId/seo
// Persists sectionOrder, customPages, and SEO/Maps config inside website_json
// so it works immediately on existing D1 schema 0001+ without requiring resets.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { requireTenantOwnerAccess, validateSafeHttpUrl } from '../../../_tenantAccess';
import { sanitizeCustomPages } from '../../../_customPages';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const p = access.parsed;
  const sectionOrder = Array.isArray(p.sectionOrder) && p.sectionOrder.length > 0
    ? p.sectionOrder
    : ['hero', 'catalog', 'gallery', 'booking', 'contact'];
  const customPages = Array.isArray(p.customPages) ? p.customPages : [];

  return jsonResponse({
    seo: {
      canonicalUrl: p.canonicalUrl || '',
      robotsDirectives: p.robotsDirectives || 'index, follow',
      googleSiteVerification: p.googleSiteVerification || '',
      ga4MeasurementId: p.ga4MeasurementId || '',
      cityAreaKeywords: p.cityAreaKeywords || '',
      googleMapsUrl: p.googleMapsUrl || '',
      gbpProfileUrl: p.gbpProfileUrl || '',
      localBusinessType: p.localBusinessType || 'LocalBusiness',
      sectionOrderJson: JSON.stringify(sectionOrder),
      customPagesJson: JSON.stringify(customPages),
    },
  });
}

export async function onRequestPut(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON payload.' }, 400);
  }

  const nextParsed: Record<string, any> = { ...access.parsed };

  if (typeof body.sectionOrderJson === 'string') {
    try {
      const arr = JSON.parse(body.sectionOrderJson);
      if (Array.isArray(arr)) {
        nextParsed.sectionOrder = arr.map((s) => sanitizeText(s, 40)).filter(Boolean).slice(0, 12);
      }
    } catch {
      return jsonResponse({ error: 'Invalid sectionOrderJson format.' }, 400);
    }
  }
  if (typeof body.customPagesJson === 'string') {
    try {
      const arr = JSON.parse(body.customPagesJson);
      if (Array.isArray(arr)) {
        nextParsed.customPages = sanitizeCustomPages(arr);
      }
    } catch {
      return jsonResponse({ error: 'Invalid customPagesJson format.' }, 400);
    }
  }

  if (typeof body.canonicalUrl === 'string') nextParsed.canonicalUrl = validateSafeHttpUrl(body.canonicalUrl, 300);
  if (typeof body.robotsDirectives === 'string') nextParsed.robotsDirectives = sanitizeText(body.robotsDirectives, 60);
  if (typeof body.googleSiteVerification === 'string') nextParsed.googleSiteVerification = sanitizeText(body.googleSiteVerification, 120);
  if (typeof body.ga4MeasurementId === 'string') nextParsed.ga4MeasurementId = sanitizeText(body.ga4MeasurementId, 40);
  if (typeof body.cityAreaKeywords === 'string') nextParsed.cityAreaKeywords = sanitizeText(body.cityAreaKeywords, 240);
  if (typeof body.googleMapsUrl === 'string') nextParsed.googleMapsUrl = validateSafeHttpUrl(body.googleMapsUrl, 400);
  if (typeof body.gbpProfileUrl === 'string') nextParsed.gbpProfileUrl = validateSafeHttpUrl(body.gbpProfileUrl, 400);
  if (typeof body.localBusinessType === 'string') nextParsed.localBusinessType = sanitizeText(body.localBusinessType, 60);

  await env.DB!.prepare(
    `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
  )
    .bind(JSON.stringify(nextParsed), access.row.website_id)
    .run();

  return jsonResponse({
    ok: true,
    seo: {
      canonicalUrl: nextParsed.canonicalUrl || '',
      robotsDirectives: nextParsed.robotsDirectives || 'index, follow',
      googleSiteVerification: nextParsed.googleSiteVerification || '',
      ga4MeasurementId: nextParsed.ga4MeasurementId || '',
      cityAreaKeywords: nextParsed.cityAreaKeywords || '',
      googleMapsUrl: nextParsed.googleMapsUrl || '',
      gbpProfileUrl: nextParsed.gbpProfileUrl || '',
      localBusinessType: nextParsed.localBusinessType || 'LocalBusiness',
      sectionOrderJson: JSON.stringify(nextParsed.sectionOrder || []),
      customPagesJson: JSON.stringify(nextParsed.customPages || []),
    },
  });
}
