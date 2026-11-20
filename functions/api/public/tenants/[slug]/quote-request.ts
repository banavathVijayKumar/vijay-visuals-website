// ============================================================================
// POST /api/public/tenants/:slug/quote-request — Storefront Enquiry / Quote CRM
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { findPublicationByIdentifier, isMissingTableError } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  if (!env.DB) return jsonResponse({ error: 'CRM storage is not configured.' }, 503);

  const rl = await checkRateLimit(env, `quote:${getClientIp(request)}:${params.slug}`, 10, 600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many quote requests. Please wait a few minutes.' }, 429);
  }

  const pub = await findPublicationByIdentifier(env, params.slug);
  if (!pub || pub.status !== 'published') {
    return jsonResponse({ error: 'Storefront not found.' }, 404);
  }

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request body.' }, 400);

  const fullName = sanitizeText(body.name, 120);
  const phone = sanitizeText(body.phone, 30);
  const email = sanitizeText(body.email, 160).toLowerCase();
  const requirement = sanitizeText(body.requirement, 1000);

  if (!fullName || !phone || !requirement) {
    return jsonResponse({ error: 'Name, phone number, and requirement are required.' }, 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO crm_contacts_leads
       (website_id, owner_id, full_name, phone, email, source, stage, marketing_consent, notes)
       VALUES (?, ?, ?, ?, ?, 'quote_request', 'new', ?, ?)`
    )
      .bind(
        pub.website_id,
        pub.owner_id,
        fullName,
        phone,
        email,
        body.marketingConsent ? 1 : 0,
        requirement
      )
      .run();

    return jsonResponse({ ok: true, message: 'Quote request saved.' }, 201);
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error: 'Quote CRM storage requires D1 migration 0003 (crm_contacts_leads). Please enquire via WhatsApp.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit quote request.' }, 500);
  }
}
