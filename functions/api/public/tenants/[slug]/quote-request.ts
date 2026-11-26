// ============================================================================
// POST /api/public/tenants/:slug/quote-request — Storefront Enquiry / Quote CRM
// - Strict India +91 validation; invalid numbers are rejected before storage.
// - Durable, atomic lead dedupe via a unique enquiry fingerprint (no time window).
// - Persists the enquiry FIRST, then dispatches the WhatsApp workflow.
// - Only explicit whatsappOptIn === true may authorize a WhatsApp notification.
// ============================================================================

import { validateIndiaWhatsAppNumber } from '../../../../../shared/indiaWhatsapp';
import {
  dispatchEnquiryWhatsAppWorkflow,
  ENQUIRY_WHATSAPP_OPT_IN_MARKER,
} from '../../../_enquiryWorkflow';
import {
  PagesContext,
  checkRateLimit,
  rateLimitResponse,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../_shared';
import { findPublicationByIdentifier, isMissingTableError } from '../../../_tenantAccess';

function isEnquiryFingerprintMigrationError(err: unknown): boolean {
  return /enquiry_fingerprint/i.test(String((err as { message?: string })?.message || err || ''));
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  if (!env.DB) return jsonResponse({ error: 'CRM storage is not configured.' }, 503);

  const rl = await checkRateLimit(env, `quote:${getClientIp(request)}:${params.slug}`, 10, 600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many quote requests. Please wait a few minutes.');

  const pub = await findPublicationByIdentifier(env, params.slug);
  if (!pub || pub.status !== 'published') {
    return jsonResponse({ error: 'Storefront not found.' }, 404);
  }

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request body.' }, 400);

  const fullName = sanitizeText(body.name, 120);
  const email = sanitizeText(body.email, 160).toLowerCase();
  const requirement = sanitizeText(body.requirement, 1000);
  // Marketing consent is NEVER an alias for WhatsApp opt-in.
  const whatsappOptIn = body.whatsappOptIn === true;

  if (!fullName || !requirement) {
    return jsonResponse({ error: 'Name and requirement are required.' }, 400);
  }

  const phoneCheck = validateIndiaWhatsAppNumber(body.phone);
  if (!phoneCheck.ok) {
    return jsonResponse({ error: phoneCheck.error || 'Invalid WhatsApp phone number.' }, 400);
  }
  const normalizedPhone = phoneCheck.value!.e164;

  let parsedWebsite: Record<string, any> = {};
  try {
    const raw = pub.website_json ? JSON.parse(pub.website_json) : {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsedWebsite = raw;
  } catch {
    parsedWebsite = {};
  }

  // Canonical, durable identity for this enquiry. No time-window heuristic:
  // retries are deduplicated by the partial UNIQUE index from migration 0021.
  const enquiryFingerprint = `${normalizedPhone}|${fullName}|${email}|${requirement}`;

  let leadId = 0;
  let duplicateEnquiry = false;
  try {
    // INSERT OR IGNORE is the atomic claim. Concurrent retries cannot create
    // two leads; the loser reads the winner's durable row and reuses its key.
    const insert = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_contacts_leads
       (website_id, owner_id, full_name, phone, email, source, stage, marketing_consent, notes, enquiry_fingerprint)
       VALUES (?, ?, ?, ?, ?, 'quote_request', 'new', ?, ?, ?)`
    )
      .bind(
        pub.website_id,
        pub.owner_id,
        fullName,
        normalizedPhone,
        email,
        // One-off WhatsApp reply consent is NOT marketing consent. Persist it
        // as a durable marker on the lead note instead.
        0,
        `${whatsappOptIn ? `${ENQUIRY_WHATSAPP_OPT_IN_MARKER} ` : ''}${requirement}`,
        enquiryFingerprint
      )
      .run();

    leadId = Number(insert.meta?.changes || 0) === 1 ? Number(insert.meta?.last_row_id || 0) : 0;
    if (!leadId) {
      const existing = await env.DB.prepare(
        `SELECT id FROM crm_contacts_leads
         WHERE website_id = ? AND source = 'quote_request' AND enquiry_fingerprint = ?
         LIMIT 1`
      )
        .bind(pub.website_id, enquiryFingerprint)
        .first<{ id: number }>();
      leadId = Number(existing?.id || 0);
      duplicateEnquiry = true;
    }
  } catch (err) {
    if (isMissingTableError(err) || isEnquiryFingerprintMigrationError(err)) {
      return jsonResponse(
        {
          error: 'Quote CRM storage requires D1 migration 0021 (enquiry dedupe). Please enquire via WhatsApp.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit quote request.' }, 500);
  }

  // Persistence has succeeded (or an existing durable lead was reclaimed).
  // Only now may the WhatsApp workflow run.
  if (leadId > 0) {
    const whatsapp = await dispatchEnquiryWhatsAppWorkflow(env, {
      websiteId: pub.website_id,
      toPhone: normalizedPhone,
      customerName: fullName,
      requirement,
      source: 'quote_request',
      recordId: leadId,
      whatsappOptIn,
      parsedWebsite,
    });
    return jsonResponse(
      {
        ok: true,
        duplicateEnquiry,
        message: 'Quote request saved.',
        whatsapp: {
          status: whatsapp.status,
          notice: whatsapp.notice,
          idempotencyKey: whatsapp.idempotencyKey,
        },
      },
      201
    );
  }

  return jsonResponse({ error: 'Unable to submit quote request.' }, 500);
}
