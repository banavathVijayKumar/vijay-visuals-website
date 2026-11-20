// ============================================================================
// POST /api/domains/search — Option B Domain Suggestions & Honest Registrar Status
// NEVER fabricates real-time registrar availability or checkout pricing!
// ============================================================================

import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, toSlug } from '../_shared';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{ query?: string; businessName?: string; category?: string }>(request);
  if (!body) return errorJson('Invalid JSON payload.', 400);

  const rawQuery = sanitizeText(body.query || body.businessName || '', 120);
  const category = sanitizeText(body.category || '', 60);
  const baseSlug = toSlug(rawQuery.replace(/\.[a-z]{2,10}$/i, ''));

  if (!baseSlug || baseSlug.length < 2) {
    return errorJson('Enter a business name or keyword (at least 2 characters) to search domain ideas.', 400);
  }

  const registrarConfigured = Boolean(env.DOMAIN_REGISTRAR_PROVIDER && env.DOMAIN_REGISTRAR_API_KEY);

  const tlds = (
    await env.DB.prepare(
      `SELECT extension, registration_inr, renewal_inr, gst_percent, service_fee_inr
       FROM domain_pricing_config WHERE is_enabled = 1 ORDER BY registration_inr ASC`
    ).all<{
      extension: string;
      registration_inr: number;
      renewal_inr: number;
      gst_percent: number;
      service_fee_inr: number;
    }>()
  ).results || [];

  const compactSlug = baseSlug.replace(/-/g, '');
  const catSlug = toSlug(category).replace(/-/g, '');
  const nameVariants = Array.from(
    new Set(
      [
        compactSlug,
        baseSlug,
        catSlug && !compactSlug.includes(catSlug) ? `${compactSlug}${catSlug}` : '',
        `${compactSlug}online`,
      ].filter((v) => v && v.length >= 2 && v.length <= 48)
    )
  ).slice(0, 3);

  const suggestions = [];
  for (const variant of nameVariants) {
    for (const tld of tlds.slice(0, 4)) {
      const fullDomain = `${variant}${tld.extension}`;
      const subtotal = tld.registration_inr + tld.service_fee_inr;
      const gst = Math.round((subtotal * tld.gst_percent) / 100);
      suggestions.push({
        domain: fullDomain,
        extension: tld.extension,
        availabilityStatus: registrarConfigured ? 'check_required' : 'integration_required',
        availabilityLabel: registrarConfigured
          ? 'Verify live availability at registrar'
          : 'Integration Required (Check at Registrar)',
        indicativeFirstYearInr: subtotal + gst,
        indicativeRenewalInr:
          tld.renewal_inr + tld.service_fee_inr + Math.round(((tld.renewal_inr + tld.service_fee_inr) * tld.gst_percent) / 100),
        isIndicativeOnly: true,
        recommendedRegistrarLinks: [
          {
            name: 'Cloudflare Registrar (At-Cost, Recommended)',
            url: `https://domains.cloudflare.com/?domain=${encodeURIComponent(fullDomain)}`,
          },
          {
            name: 'Namecheap',
            url: `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(fullDomain)}`,
          },
          {
            name: 'GoDaddy India',
            url: `https://www.godaddy.com/en-in/domainsearch/find?domainToCheck=${encodeURIComponent(fullDomain)}`,
          },
        ],
      });
    }
  }

  return json({
    query: rawQuery,
    registrarConnected: registrarConfigured,
    registrarProvider: registrarConfigured ? env.DOMAIN_REGISTRAR_PROVIDER : null,
    status: registrarConfigured ? 'registrar_connected' : 'integration_required',
    message: registrarConfigured
      ? 'Registrar API configured. Complete checkout in your registrar account, then connect your domain under Option A.'
      : 'Integration Required: Live domain registrar checkout is not active. You can purchase your preferred domain directly in your own Cloudflare Registrar, Namecheap, or GoDaddy account (100% ownership in your name) and connect it immediately using Option A.',
    suggestions,
  });
}
