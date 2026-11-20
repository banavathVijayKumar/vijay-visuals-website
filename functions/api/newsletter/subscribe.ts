// ============================================================================
// POST /api/newsletter/subscribe — Explicit Consent-Based Newsletter Opt-In
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../_shared';
import { findPublicationByIdentifier, isMissingTableError } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: 'Subscription storage is not configured.' }, 503);

  const rl = await checkRateLimit(env, `newsletter:${getClientIp(request)}`, 10, 600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many requests. Please wait a few minutes.' }, 429);
  }

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  if (body.consentGiven !== true) {
    return jsonResponse({ error: 'Explicit marketing consent is required before subscribing.' }, 400);
  }

  const email = sanitizeText(body.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Please provide a valid email address.' }, 400);
  }

  const fullName = sanitizeText(body.name, 120) || email.split('@')[0];
  const source = sanitizeText(body.source, 80) || 'newsletter';
  const pub = body.tenantId
    ? await findPublicationByIdentifier(env, String(body.tenantId))
    : null;

  if (!pub) {
    return jsonResponse({ error: 'Target business store was not found.' }, 404);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO crm_contacts_leads
       (website_id, owner_id, full_name, phone, email, source, stage, marketing_consent, notes)
       VALUES (?, ?, ?, '', ?, ?, 'new', 1, 'Explicit consent newsletter opt-in')`
    )
      .bind(pub.website_id, pub.owner_id, fullName, email, source)
      .run();

    return jsonResponse({ ok: true }, 201);
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Newsletter CRM requires D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to save subscription.' }, 500);
  }
}
