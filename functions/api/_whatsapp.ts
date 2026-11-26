// ============================================================================
// VIJAY VISUALS — META WHATSAPP BUSINESS CLOUD API SERVICE (CLOUDFLARE PAGES EDGE)
// Server-side Meta Graph API v20.0 integration with automatic click-to-chat fallback.
// Enforces consent, idempotency, durable D1 logging, and zero token exposure.
// ============================================================================

import { redactSensitiveLogText } from './_email';
import { CloudflareEnv, sanitizeText } from './_shared';

export type WhatsAppSendStatus =
  | 'sent'
  | 'delivered'
  | 'setup_required'
  | 'fallback_ready'
  | 'failed'
  | 'idempotent_duplicate'
  | 'in_progress';

export interface WhatsAppSendOptions {
  toPhone: string;
  messageText: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: any[];
  /**
   * Business-initiated notifications (for example payment receipts) must use an
   * approved template. When true, a missing template records setup_required and
   * never sends free-form text that Meta would reject outside a 24-hour window.
   */
  requireApprovedTemplate?: boolean;
  eventType: string;
  websiteId?: string | null;
  recipientUserId?: string | null;
  /** Atomic claim key. Only the claimant may call the Graph API. */
  idempotencyKey?: string;
  /**
   * Key used for gate-only audit rows (setup_required, missing template, etc.).
   * Kept separate so a setup failure cannot consume the actual send claim key.
   */
  auditIdempotencyKey?: string;
  /**
   * Privacy-safe label written to notification_logs instead of the full number.
   * Callers that handle customer enquiries must supply a masked value. Existing
   * callers keep the previous behaviour when this is omitted.
   */
  recipientContactLabel?: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  status: WhatsAppSendStatus;
  providerMessageId?: string;
  clickToChatUrl: string;
  error?: string;
  notice?: string;
}

/**
 * Normalizes phone numbers to standard international format without '+' or leading zeros.
 * Defaults to Indian country code (91) for 10-digit numbers.
 */
export function normalizeWhatsAppPhone(rawPhone: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

/**
 * Constructs a fallback wa.me click-to-chat link.
 */
export function buildClickToChatUrl(phone: string, text: string): string {
  const clean = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

/**
 * Removes full/long phone-like digit sequences from provider errors and log
 * previews. Emails, tokens, and raw OTPs are already handled by
 * `redactSensitiveLogText`; this adds phone-number hygiene on top.
 */
export function redactPhoneFromLogText(text: unknown, phone: string, label: string): string {
  let out = redactSensitiveLogText(String(text || ''));
  const digits = (phone || '').replace(/\D/g, '');
  const labelDigits = label.replace(/[^\d*]/g, '') || '****';
  if (digits.length >= 10) {
    out = out.split(digits).join(labelDigits);
  }
  out = out.replace(/\d{10,12}/g, labelDigits);
  return out.slice(0, 600);
}

type WhatsAppClaimResult =
  | { claimed: true }
  | {
      claimed: false;
      status: Extract<WhatsAppSendStatus, 'idempotent_duplicate' | 'in_progress' | 'failed'>;
      providerMessageId?: string;
      notice: string;
    };

/**
 * Atomically reserves an idempotency key before any provider call.
 *
 * - INSERT OR IGNORE is the claim: exactly one concurrent request can win.
 * - `processing` is uncertain and is NEVER retried automatically.
 * - `sent` and `failed` are terminal; neither may call Meta a second time.
 * - No claim key/DB means legacy unclaimed behaviour for older callers only.
 */
async function claimWhatsAppSend(
  env: CloudflareEnv,
  args: {
    idempotencyKey?: string;
    recipientContact: string;
    eventType: string;
    websiteId?: string | null;
  }
): Promise<WhatsAppClaimResult> {
  const key = String(args.idempotencyKey || '').trim();
  if (!env.DB || !key) return { claimed: true };

  try {
    const insert = await env.DB.prepare(
      `INSERT OR IGNORE INTO whatsapp_send_claims
        (claim_key, recipient_contact, event_type, website_id, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'processing', datetime('now'), datetime('now'))`
    )
      .bind(key, args.recipientContact, args.eventType, args.websiteId || null)
      .run();

    if (Number(insert.meta?.changes || 0) === 1) return { claimed: true };

    const existing = await env.DB.prepare(
      'SELECT state, provider_message_id FROM whatsapp_send_claims WHERE claim_key = ? LIMIT 1'
    )
      .bind(key)
      .first<{ state: string; provider_message_id: string }>();

    if (!existing) return { claimed: true };

    if (existing.state === 'sent') {
      return {
        claimed: false,
        status: 'idempotent_duplicate',
        providerMessageId: existing.provider_message_id || undefined,
        notice: 'Duplicate WhatsApp send safely skipped.',
      };
    }
    if (existing.state === 'failed') {
      return {
        claimed: false,
        status: 'failed',
        notice: 'A previous WhatsApp send for this enquiry already failed; not retrying automatically.',
      };
    }
    return {
      claimed: false,
      status: 'in_progress',
      notice: 'A WhatsApp send for this enquiry is already in progress; not re-sending an uncertain request.',
    };
  } catch {
    // If the claim ledger is unavailable, fail closed; never send unclaimed.
    return {
      claimed: false,
      status: 'in_progress',
      notice: 'WhatsApp idempotency ledger is unavailable; send skipped.',
    };
  }
}

async function finalizeWhatsAppClaim(
  env: CloudflareEnv,
  key: string | undefined,
  state: 'sent' | 'failed',
  providerMessageId: string,
  errorDetail: string
): Promise<void> {
  const claimKey = String(key || '').trim();
  if (!env.DB || !claimKey) return;
  try {
    await env.DB.prepare(
      `UPDATE whatsapp_send_claims
       SET state = ?, provider_message_id = ?, error_detail = ?,
           updated_at = datetime('now'), completed_at = datetime('now')
       WHERE claim_key = ? AND state = 'processing'`
    )
      .bind(state, providerMessageId, errorDetail, claimKey)
      .run();
  } catch {
    // Leave the claim in `processing`; a later retry must not re-send.
  }
}

/**
 * Sends an automated WhatsApp notification using the official Meta WhatsApp Business Cloud API.
 * If credentials are not configured, provides a seamless click-to-chat fallback link and logs status.
 */
export async function sendWhatsAppNotification(
  env: CloudflareEnv,
  options: WhatsAppSendOptions
): Promise<WhatsAppSendResult> {
  const {
    toPhone,
    messageText,
    templateName,
    templateLanguage,
    templateComponents,
    requireApprovedTemplate,
    eventType,
    websiteId,
    recipientUserId,
    idempotencyKey,
    auditIdempotencyKey,
    recipientContactLabel,
  } = options;

  const cleanPhone = normalizeWhatsAppPhone(toPhone);
  const clickToChatUrl = buildClickToChatUrl(cleanPhone, messageText);
  const logContact = recipientContactLabel || cleanPhone;
  const safeMessagePreview = redactPhoneFromLogText(messageText, cleanPhone, logContact);
  // Gate-only failures use a separate audit key so they never consume the
  // actual send claim key (see _enquiryWorkflow.ts for the suffix scheme).
  const logKey = String(auditIdempotencyKey || idempotencyKey || '').trim();

  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      ok: false,
      status: 'failed',
      clickToChatUrl,
      error: 'Valid recipient phone number with country code is required.',
    };
  }

  const logSetupRequired = async (notice: string, consentVerified = 1): Promise<void> => {
    if (!env.DB) return;
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO notification_logs (
          website_id, recipient_user_id, recipient_contact, channel, event_type,
          subject, message_preview, consent_verified, delivery_status,
          idempotency_key, error_detail, created_at
        ) VALUES (?, ?, ?, 'whatsapp', ?, 'WhatsApp Automated Notification', ?, ?, 'setup_required', ?, ?, datetime('now'))`
      )
        .bind(
          websiteId || null,
          recipientUserId || null,
          logContact,
          eventType,
          safeMessagePreview,
          consentVerified,
          logKey,
          redactPhoneFromLogText(notice, cleanPhone, logContact)
        )
        .run();
    } catch (logErr) {
      console.error('Failed to log WhatsApp setup_required status:', logErr);
    }
  };

  // Business-initiated messages must be approved templates. Fail closed before
  // any claim or Graph API call rather than sending unapproved free-form text.
  if (requireApprovedTemplate && (!String(templateName || '').trim() || !String(templateLanguage || '').trim())) {
    const notice =
      'Approved WhatsApp payment template is not configured. No business-initiated message was sent.';
    await logSetupRequired(notice);
    return {
      ok: false,
      status: 'setup_required',
      clickToChatUrl,
      notice,
      error: notice,
    };
  }

  // Template messages require an explicitly configured name AND language.
  // Never fall back to an implicit default language for template sends.
  if (templateName && !String(templateLanguage || '').trim()) {
    const notice =
      'Approved WhatsApp template language is not configured. No template message was sent.';
    await logSetupRequired(notice);
    return {
      ok: false,
      status: 'setup_required',
      clickToChatUrl,
      notice,
      error: notice,
    };
  }

  const token = (env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
  const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  // If Meta Cloud API credentials are not set
  if (!token || !phoneNumberId) {
    const notice = 'WhatsApp Business Cloud API (WHATSAPP_CLOUD_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID) is not configured in Cloudflare Pages. Click-to-chat fallback is active.';
    await logSetupRequired(notice);

    return {
      ok: false,
      status: 'setup_required',
      clickToChatUrl,
      notice,
      error: notice,
    };
  }

  // Atomic at-most-once claim. Only the winner may reach the Graph API.
  const claim = await claimWhatsAppSend(env, {
    idempotencyKey,
    recipientContact: logContact,
    eventType,
    websiteId,
  });
  if (!claim.claimed) {
    return {
      ok: claim.status === 'idempotent_duplicate',
      status: claim.status,
      providerMessageId: claim.providerMessageId,
      clickToChatUrl,
      notice: claim.notice,
      error: claim.status === 'failed' ? claim.notice : undefined,
    };
  }

  // Call Meta WhatsApp Business Cloud API
  let deliveryStatus: 'sent' | 'failed' = 'failed';
  let providerMessageId = '';
  let errorDetail = '';

  try {
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`;

    // If template specified, use template message
    const bodyPayload = templateName
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: templateComponents || [],
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: true, body: messageText },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; type?: string; code?: number };
    };

    if (res.ok && data.messages?.[0]?.id) {
      deliveryStatus = 'sent';
      providerMessageId = data.messages[0].id;
    } else {
      deliveryStatus = 'failed';
      errorDetail = data.error?.message || `WhatsApp Cloud API returned HTTP ${res.status}`;
    }
  } catch (err: any) {
    deliveryStatus = 'failed';
    errorDetail = err?.message || 'WhatsApp Cloud API network error';
  }

  const safeErrorDetail = errorDetail
    ? redactPhoneFromLogText(errorDetail, cleanPhone, logContact)
    : '';

  await finalizeWhatsAppClaim(
    env,
    idempotencyKey,
    deliveryStatus,
    providerMessageId,
    safeErrorDetail
  );

  // Log in D1 notification_logs
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO notification_logs (
          website_id, recipient_user_id, recipient_contact, channel, event_type,
          subject, message_preview, consent_verified, delivery_status,
          provider_message_id, idempotency_key, error_detail, created_at
        ) VALUES (?, ?, ?, 'whatsapp', ?, 'WhatsApp Automated Notification', ?, 1, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          websiteId || null,
          recipientUserId || null,
          logContact,
          eventType,
          safeMessagePreview,
          deliveryStatus,
          providerMessageId || (idempotencyKey ? `idemp_${idempotencyKey}` : ''),
          idempotencyKey || '',
          safeErrorDetail
        )
        .run();
    } catch (logErr) {
      console.error('Failed to log WhatsApp audit record:', logErr);
    }
  }

  return {
    ok: deliveryStatus === 'sent',
    status: deliveryStatus,
    providerMessageId: providerMessageId || undefined,
    clickToChatUrl,
    error: safeErrorDetail || undefined,
  };
}
