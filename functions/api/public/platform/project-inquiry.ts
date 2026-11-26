// ============================================================================
// POST /api/public/platform/project-inquiry — Anonymous StudioLanding enquiries
// - Public by design; the authenticated /api/tickets endpoint stays protected.
// - Resolves only the explicitly configured PUBLISHED platform enquiry desk;
//   never selects a customer tenant from request data or publication recency.
// - Per-IP/per-desk rate limit, strict India +91 validation, explicit opt-in.
// - Atomic durable lead dedupe (migration 0021), persistence before dispatch.
// ============================================================================

import { validateIndiaWhatsAppNumber } from '../../../../shared/indiaWhatsapp';
import {
  dispatchEnquiryWhatsAppWorkflow,
  ENQUIRY_WHATSAPP_OPT_IN_MARKER,
} from '../../_enquiryWorkflow';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  isValidEmailAddress,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../../_shared';
import { findPublicationByIdentifier, isMissingTableError } from '../../_tenantAccess';
import { type PublicationRow } from '../../_tenantMapper';

function isEnquiryFingerprintMigrationError(err: unknown): boolean {
  return /enquiry_fingerprint/i.test(String((err as { message?: string })?.message || err || ''));
}

async function resolvePlatformEnquiryDesk(
  env: PagesContext['env']
): Promise<PublicationRow | null> {
  // Anonymous platform enquiries must never be attributed to an arbitrary
  // customer site. The operator explicitly names the official VIJAY VISUALS
  // publication; no request-controlled slug or recency heuristic is accepted.
  const configured = sanitizeText(env.PLATFORM_ENQUIRY_TENANT_SLUG, 63).toLowerCase();
  if (!configured || !env.DB) return null;
  const desk = await findPublicationByIdentifier(env, configured);
  return desk && desk.status === 'published' ? desk : null;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return jsonResponse({ error: 'CRM storage is not configured.' }, 503);

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request body.' }, 400);

  const pub = await resolvePlatformEnquiryDesk(env);
  if (!pub) {
    return jsonResponse(
      {
        error:
          'Platform enquiry desk is not configured. Set PLATFORM_ENQUIRY_TENANT_SLUG to the published official VIJAY VISUALS publication.',
        code: 'PLATFORM_DESK_NOT_CONFIGURED',
      },
      503
    );
  }

  const rl = await checkRateLimit(env, `project_inquiry:${getClientIp(request)}:${pub.website_id}`, 10, 600);
  if (!rl.allowed) {
    return rateLimitResponse(rl, 'Too many project enquiries. Please wait a few minutes.');
  }

  const fullName = sanitizeText(body.customerName || body.name, 120);
  const email = sanitizeText(body.customerEmail || body.email, 160).toLowerCase();
  const subject = sanitizeText(body.subject, 160) || 'Project Inquiry';
  const message = sanitizeText(body.message, 2500);
  // Explicit WhatsApp opt-in only; marketingConsent is never an alias.
  const whatsappOptIn = body.whatsappOptIn === true;

  if (!fullName || !isValidEmailAddress(email) || !message) {
    return jsonResponse(
      { error: 'Name, a valid email address, and project message are required.' },
      400
    );
  }

  const rawPhone = sanitizeText(body.customerPhone || body.phone, 32);
  let normalizedPhone = '';
  if (rawPhone) {
    const phoneCheck = validateIndiaWhatsAppNumber(rawPhone);
    if (!phoneCheck.ok) {
      return jsonResponse({ error: phoneCheck.error || 'Invalid WhatsApp phone number.' }, 400);
    }
    normalizedPhone = phoneCheck.value!.e164;
  } else if (whatsappOptIn) {
    return jsonResponse(
      { error: 'A valid Indian WhatsApp number is required for an explicit WhatsApp reply.' },
      400
    );
  }

  let parsedWebsite: Record<string, any> = {};
  try {
    const raw = pub.website_json ? JSON.parse(pub.website_json) : {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsedWebsite = raw;
  } catch {
    parsedWebsite = {};
  }

  const notes = `${subject}\n${message}`.slice(0, 2700);
  const enquiryFingerprint = `${normalizedPhone}|${fullName}|${email}|${notes}`;

  let leadId = 0;
  let duplicateEnquiry = false;
  try {
    const insert = await env.DB.prepare(
      `INSERT OR IGNORE INTO crm_contacts_leads
       (website_id, owner_id, full_name, phone, email, source, stage, marketing_consent, notes, enquiry_fingerprint)
       VALUES (?, ?, ?, ?, ?, 'project_inquiry', 'new', ?, ?, ?)`
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
        `${whatsappOptIn ? `${ENQUIRY_WHATSAPP_OPT_IN_MARKER} ` : ''}${notes}`,
        enquiryFingerprint
      )
      .run();

    leadId = Number(insert.meta?.changes || 0) === 1 ? Number(insert.meta?.last_row_id || 0) : 0;
    if (!leadId) {
      const existing = await env.DB.prepare(
        `SELECT id FROM crm_contacts_leads
         WHERE website_id = ? AND source = 'project_inquiry' AND enquiry_fingerprint = ?
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
          error: 'Enquiry CRM storage requires D1 migration 0021 (enquiry dedupe).',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit project enquiry.' }, 500);
  }

  const whatsapp = leadId
    ? await dispatchEnquiryWhatsAppWorkflow(env, {
        websiteId: pub.website_id,
        toPhone: normalizedPhone,
        customerName: fullName,
        requirement: `${subject}: ${message}`,
        source: 'project_inquiry',
        recordId: leadId,
        whatsappOptIn,
        parsedWebsite,
      })
    : null;

  return jsonResponse(
    {
      ok: true,
      duplicateEnquiry,
      message: 'Project enquiry saved.',
      tenant: pub.public_slug,
      ...(whatsapp
        ? {
            whatsapp: {
              status: whatsapp.status,
              notice: whatsapp.notice,
              idempotencyKey: whatsapp.idempotencyKey,
            },
          }
        : {}),
    },
    201
  );
}
