// ============================================================================
// GET /api/owner/tenants/:tenantId/enquiries — Authenticated enquiry visibility
// - Strict tenant isolation via requireTenantOwnerAccess.
// - Platform admins/staff pass the same helper; anonymous callers never do.
// - Phone numbers and provider error details are masked/redacted on read.
// ============================================================================

import { maskIndiaWhatsAppNumber } from '../../../../../shared/indiaWhatsapp';
import { requireUser } from '../../../_auth';
import { redactSensitiveLogText } from '../../../_email';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';
import { ENQUIRY_WHATSAPP_OPT_IN_MARKER } from '../../../_enquiryWorkflow';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function safeContactLabel(raw: unknown): string {
  const value = String(raw || '').slice(0, 40);
  if (!value) return '+91****';
  // Never trust a stored value that already contains masking characters: it may
  // be a partially masked value with unredacted digits. Keep only the last four.
  if (value.includes('*')) {
    const last4 = value.replace(/\D/g, '').slice(-4);
    return last4 ? `+91******${last4}` : '+91****';
  }
  return maskIndiaWhatsAppNumber(value);
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return jsonResponse({ error: 'Database binding is not configured.' }, 503);

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const websiteId = access.row.website_id;
  try {
    const [leadsRes, logsRes] = await Promise.all([
      env.DB.prepare(
        `SELECT id, full_name, email, phone, source, stage, marketing_consent, notes, unsubscribed_at, created_at
         FROM crm_contacts_leads
         WHERE website_id = ? AND source IN ('quote_request', 'project_inquiry')
         ORDER BY id DESC LIMIT 100`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, event_type, delivery_status, recipient_contact, provider_message_id,
                error_detail, idempotency_key, created_at
         FROM notification_logs
         WHERE website_id = ? AND event_type = 'enquiry_whatsapp'
         ORDER BY id DESC LIMIT 200`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
    ]);

    const logs = logsRes.results || [];
    const logsByKey = new Map<string, Record<string, any>>();
    for (const log of logs) {
      const key = String(log.idempotency_key || '');
      if (key && !logsByKey.has(key)) logsByKey.set(key, log);
    }

    const enquiries = (leadsRes.results || []).map((lead) => {
      const baseKey =
        lead.source === 'project_inquiry'
          ? `project_enquiry_wa_${lead.id}`
          : `quote_enquiry_wa_${lead.id}`;
      const candidateKeys = [
        baseKey,
        `${baseKey}:setup_required`,
        `${baseKey}:blocked_no_consent`,
        `${baseKey}:workflow_paused`,
        `${baseKey}:sender_setup`,
      ];
      let log: Record<string, any> | null = null;
      for (const key of candidateKeys) {
        const candidate = logsByKey.get(key);
        // logs are ordered newest-first, so the first match wins.
        if (candidate && (!log || Number(candidate.id) > Number(log.id))) log = candidate;
      }
      return {
        id: Number(lead.id),
        name: String(lead.full_name || ''),
        email: String(lead.email || ''),
        phoneMasked: safeContactLabel(lead.phone),
        source: String(lead.source || 'quote_request'),
        stage: String(lead.stage || 'new'),
        // New enquiries store explicit one-off WhatsApp reply consent as a
        // marker on the note. Historical rows may still have it in
        // marketing_consent, so both are recognised. Marketing consent itself
        // is a broader permission and is reported separately below.
        whatsappOptInRecorded:
          String(lead.notes || '').includes(ENQUIRY_WHATSAPP_OPT_IN_MARKER) ||
          Boolean(lead.marketing_consent),
        marketingUnsubscribed: Boolean(lead.unsubscribed_at),
        createdAt: String(lead.created_at || ''),
        whatsapp: log
          ? {
              status: String(log.delivery_status || ''),
              providerMessageId: String(log.provider_message_id || ''),
              errorDetail: redactSensitiveLogText(log.error_detail || '').slice(0, 600),
              createdAt: String(log.created_at || ''),
            }
          : null,
      };
    });

    return jsonResponse({
      enquiries,
      whatsappLogs: logs.map((log) => ({
        id: Number(log.id),
        eventType: String(log.event_type || ''),
        status: String(log.delivery_status || ''),
        recipientMasked: safeContactLabel(log.recipient_contact),
        errorDetail: redactSensitiveLogText(log.error_detail || '').slice(0, 600),
        idempotencyKey: String(log.idempotency_key || ''),
        createdAt: String(log.created_at || ''),
      })),
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ enquiries: [], whatsappLogs: [] });
    }
    return jsonResponse({ error: 'Unable to load enquiries.' }, 500);
  }
}
