// ============================================================================
// SHARED ENQUIRY WHATSAPP NOTIFICATION WORKFLOW (EDGE)
// - Single dispatcher used by public tenant quote requests and project inquiries.
// - Enquiry persistence always happens BEFORE this module is called.
// - Reuses _whatsapp.ts as the only Meta Cloud API sender (no duplicate sender).
// - Fails closed for missing credentials, missing approved template config, or
//   missing explicit WhatsApp opt-in. Enquiries are never lost or rewritten.
// ============================================================================

import {
  maskIndiaWhatsAppNumber,
  validateIndiaWhatsAppNumber,
} from '../../shared/indiaWhatsapp';
import { redactSensitiveLogText } from './_email';
import { sendWhatsAppNotification, type WhatsAppSendResult } from './_whatsapp';
import { CloudflareEnv, sanitizeText } from './_shared';

export const ENQUIRY_WHATSAPP_EVENT = 'enquiry_whatsapp';
export const ENQUIRY_WORKFLOW_ID = 4;

/**
 * Durable marker stored in crm_contacts_leads.notes for an explicit one-off
 * WhatsApp reply opt-in. Marketing consent is a separate, broader permission
 * and must never be inferred from an enquiry reply request.
 */
export const ENQUIRY_WHATSAPP_OPT_IN_MARKER = '[whatsapp_reply_opt_in]';

export type EnquiryDeliveryStatus =
  | 'sent'
  | 'delivered'
  | 'setup_required'
  | 'failed'
  | 'idempotent_duplicate'
  | 'in_progress'
  | 'blocked_no_consent'
  | 'workflow_paused'
  | 'skipped_invalid_phone';

export interface EnquiryWorkflowInput {
  websiteId: string | null;
  toPhone: string;
  customerName: string;
  requirement: string;
  source: 'quote_request' | 'project_inquiry' | 'support_inquiry';
  recordId: string | number;
  /** Explicit, unchecked-by-default WhatsApp opt-in from the customer. */
  whatsappOptIn: boolean;
  /** Parsed tenant website_json, used to honour the automation workflow switch. */
  parsedWebsite?: Record<string, any> | null;
}

export interface EnquiryWorkflowResult {
  ok: boolean;
  dispatched: boolean;
  status: EnquiryDeliveryStatus;
  notice: string;
  idempotencyKey: string;
  maskedRecipient: string;
  templateName?: string;
  templateLanguage?: string;
}

interface TemplateConfig {
  configured: boolean;
  name: string;
  language: string;
  missing: string[];
}

const TEMPLATE_NAME_PATTERN = /^[A-Za-z0-9_]{2,512}$/;
const TEMPLATE_LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/;

const LOG_ALLOWED_STATUSES = new Set([
  'delivered',
  'sent',
  'setup_required',
  'failed',
  'blocked_no_consent',
]);

/** Reads explicitly configured approved-template settings. No implicit defaults. */
export function getEnquiryTemplateConfig(env: CloudflareEnv): TemplateConfig {
  const name = sanitizeText(env.WHATSAPP_ENQUIRY_TEMPLATE_NAME, 512);
  const language = sanitizeText(env.WHATSAPP_ENQUIRY_TEMPLATE_LANGUAGE, 16);
  const missing: string[] = [];
  if (!TEMPLATE_NAME_PATTERN.test(name)) missing.push('WHATSAPP_ENQUIRY_TEMPLATE_NAME');
  if (!TEMPLATE_LANGUAGE_PATTERN.test(language)) missing.push('WHATSAPP_ENQUIRY_TEMPLATE_LANGUAGE');
  return { configured: missing.length === 0, name, language, missing };
}

/** Honours an existing automation workflow switch; a missing workflow uses the built-in default. */
export function isEnquiryWorkflowEnabled(parsedWebsite?: Record<string, any> | null): boolean {
  const workflows = Array.isArray(parsedWebsite?.automationWorkflows)
    ? parsedWebsite!.automationWorkflows
    : null;
  if (!workflows || workflows.length === 0) return true;

  const match = workflows.find(
    (w: any) =>
      Number(w?.id) === ENQUIRY_WORKFLOW_ID ||
      w?.triggerType === 'quote_request' ||
      w?.actionType === 'enquiry_whatsapp' ||
      w?.actionType === 'send_whatsapp_enquiry'
  );
  if (!match) return true;
  return match.enabled !== false;
}

export function buildEnquiryIdempotencyKey(source: EnquiryWorkflowInput['source'], recordId: string | number): string {
  const prefix =
    source === 'quote_request'
      ? 'quote_enquiry'
      : source === 'project_inquiry'
        ? 'project_enquiry'
        : 'support_enquiry';
  return `${prefix}_wa_${recordId}`;
}

/** Gate-only audit key; never consumes the actual send claim key. */
export function gateAuditKey(idempotencyKey: string, reason: string): string {
  return `${idempotencyKey}:${reason}`;
}

function mapSendStatus(status: WhatsAppSendResult['status']): EnquiryDeliveryStatus {
  switch (status) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'idempotent_duplicate':
      return 'idempotent_duplicate';
    case 'in_progress':
      return 'in_progress';
    case 'setup_required':
    case 'fallback_ready':
      return 'setup_required';
    default:
      return 'failed';
  }
}

function workflowLogStatus(status: EnquiryDeliveryStatus): 'completed' | 'blocked' | 'failed' {
  if (status === 'sent' || status === 'delivered' || status === 'idempotent_duplicate') return 'completed';
  if (status === 'failed' || status === 'skipped_invalid_phone') return 'failed';
  return 'blocked';
}

async function logEnquiryDelivery(
  env: CloudflareEnv,
  args: {
    websiteId: string | null;
    status: string;
    auditKey: string;
    maskedRecipient: string;
    notice: string;
    consentVerified: number;
  }
): Promise<void> {
  if (!env.DB) return;
  const deliveryStatus = LOG_ALLOWED_STATUSES.has(args.status) ? args.status : 'failed';
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO notification_logs (
        website_id, recipient_user_id, recipient_contact, channel, event_type,
        subject, message_preview, consent_verified, delivery_status,
        provider_message_id, idempotency_key, error_detail, created_at
      ) VALUES (?, ?, ?, 'whatsapp', ?, 'Enquiry WhatsApp Notification', ?, ?, ?, '', ?, ?, datetime('now'))`
    )
      .bind(
        args.websiteId || null,
        null,
        args.maskedRecipient,
        ENQUIRY_WHATSAPP_EVENT,
        'Enquiry notification',
        args.consentVerified,
        deliveryStatus,
        args.auditKey,
        redactSensitiveLogText(args.notice).slice(0, 600)
      )
      .run();
  } catch {
    // Delivery logging is audit-only: never fail an already-persisted enquiry.
  }
}

async function appendEnquiryWorkflowLog(
  env: CloudflareEnv,
  websiteId: string | null,
  status: EnquiryDeliveryStatus,
  idempotencyKey: string,
  maskedRecipient: string,
  source: EnquiryWorkflowInput['source']
): Promise<void> {
  if (!env.DB || !websiteId) return;
  try {
    const row = await env.DB.prepare(
      'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ website_json?: string }>();
    let parsed: Record<string, any> = {};
    try {
      const raw = row?.website_json ? JSON.parse(row.website_json) : {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw;
    } catch {
      parsed = {};
    }
    const logs = Array.isArray(parsed.automationLogs) ? parsed.automationLogs : [];
    logs.unshift({
      id: Date.now(),
      tenantId: null,
      workflowId: ENQUIRY_WORKFLOW_ID,
      eventType: source,
      status: workflowLogStatus(status),
      summary: `${status} (${maskedRecipient}) key=${idempotencyKey}`,
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
    });
    parsed.automationLogs = logs.slice(0, 50);
    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsed), websiteId)
      .run();
  } catch {
    // Non-fatal: the durable delivery record lives in notification_logs.
  }
}

/**
 * Dispatches the enquiry WhatsApp workflow. The caller MUST have persisted the
 * enquiry first. Returns an honest status and never throws to the caller.
 */
export async function dispatchEnquiryWhatsAppWorkflow(
  env: CloudflareEnv,
  input: EnquiryWorkflowInput
): Promise<EnquiryWorkflowResult> {
  const idempotencyKey = buildEnquiryIdempotencyKey(input.source, input.recordId);
  const maskedRecipient = maskIndiaWhatsAppNumber(input.toPhone);
  const base = { idempotencyKey, maskedRecipient, dispatched: false, ok: false };

  const finish = async (status: EnquiryDeliveryStatus, notice: string): Promise<EnquiryWorkflowResult> => {
    await appendEnquiryWorkflowLog(
      env,
      input.websiteId,
      status,
      idempotencyKey,
      maskedRecipient,
      input.source
    );
    return { ...base, status, notice: redactSensitiveLogText(notice).slice(0, 600) };
  };

  const phone = validateIndiaWhatsAppNumber(input.toPhone);
  if (!phone.ok) {
    return finish('skipped_invalid_phone', phone.error || 'Invalid WhatsApp number.');
  }

  if (!input.whatsappOptIn) {
    await logEnquiryDelivery(env, {
      websiteId: input.websiteId,
      status: 'blocked_no_consent',
      auditKey: gateAuditKey(idempotencyKey, 'blocked_no_consent'),
      maskedRecipient,
      notice: 'WhatsApp reply was not sent because explicit opt-in was not given.',
      consentVerified: 0,
    });
    return finish('blocked_no_consent', 'Enquiry saved. WhatsApp reply skipped: explicit opt-in is required.');
  }

  if (!isEnquiryWorkflowEnabled(input.parsedWebsite)) {
    await logEnquiryDelivery(env, {
      websiteId: input.websiteId,
      // D1 notification_logs has no `paused`/`blocked` state. `setup_required`
      // is the honest non-failure state here; the audit key and notice retain
      // the exact workflow-paused reason for owners.
      status: 'setup_required',
      auditKey: gateAuditKey(idempotencyKey, 'workflow_paused'),
      maskedRecipient,
      notice: 'Enquiry WhatsApp workflow is paused for this tenant.',
      consentVerified: 1,
    });
    return finish('workflow_paused', 'Enquiry saved. WhatsApp workflow is paused for this store.');
  }

  const template = getEnquiryTemplateConfig(env);
  const token = (env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
  const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const missing = [
    ...(token ? [] : ['WHATSAPP_CLOUD_API_TOKEN']),
    ...(phoneNumberId ? [] : ['WHATSAPP_PHONE_NUMBER_ID']),
    ...template.missing,
  ];

  if (missing.length > 0) {
    const notice = `WhatsApp enquiry delivery setup_required: ${missing.join(', ')}. Enquiry was saved.`;
    await logEnquiryDelivery(env, {
      websiteId: input.websiteId,
      status: 'setup_required',
      auditKey: gateAuditKey(idempotencyKey, 'setup_required'),
      maskedRecipient,
      notice,
      consentVerified: 1,
    });
    return finish('setup_required', notice);
  }

  const sourceLabel =
    input.source === 'quote_request'
      ? 'Storefront quote request'
      : input.source === 'project_inquiry'
        ? 'Public project inquiry'
        : 'Authenticated support inquiry';
  const messageText = [
    `New enquiry from ${sanitizeText(input.customerName, 120) || 'a customer'}`,
    `Source: ${sourceLabel}`,
    `Details: ${sanitizeText(input.requirement, 600)}`,
  ].join('\n');

  const sendResult = await sendWhatsAppNotification(env, {
    toPhone: phone.value!.e164,
    messageText,
    // Only an explicitly configured, approved template is ever sent.
    templateName: template.name,
    templateLanguage: template.language,
    templateComponents: [],
    eventType: ENQUIRY_WHATSAPP_EVENT,
    websiteId: input.websiteId,
    idempotencyKey,
    auditIdempotencyKey: gateAuditKey(idempotencyKey, 'sender_setup'),
    recipientContactLabel: maskedRecipient,
  });

  const status = mapSendStatus(sendResult.status);
  const notice =
    status === 'sent'
      ? 'Enquiry notification sent via WhatsApp.'
      : status === 'idempotent_duplicate'
        ? 'Duplicate enquiry notification safely skipped.'
        : sendResult.notice || sendResult.error || 'WhatsApp delivery could not be completed.';
  const result = await finish(status, notice);
  return {
    ...result,
    dispatched: sendResult.status === 'sent',
    ok: sendResult.ok,
    templateName: template.name,
    templateLanguage: template.language,
  };
}
