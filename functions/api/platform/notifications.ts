// ============================================================================
// GET & POST /api/platform/notifications
// Official WhatsApp Cloud API, Email (SMTP), and SMS Transactional Notifications
// - Server-side API tokens ONLY (never exposed to browser)
// - Enforces explicit consent for non-transactional messages
// - Honest `setup_required` status when external provider credentials absent
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  getNotificationChannelStatus,
  json,
  parseJsonBody,
  sanitizeText,
} from '../_shared';

const TRANSACTIONAL_EVENTS = new Set([
  'order_confirmed',
  'payment_confirmed',
  'order_shipped',
  'order_delivered',
  'refund_processed',
  'new_order_owner_alert',
  'support_update',
  'proposal_sent',
]);

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);

  if (websiteId) {
    const access = await requireWebsiteAccess(env, auth.user, websiteId, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;
  } else if (!auth.user.isSuperAdmin) {
    return errorJson('websiteId query parameter is required.', 400);
  }

  const logsRes = websiteId
    ? await env.DB.prepare(
        'SELECT * FROM notification_logs WHERE website_id = ? ORDER BY created_at DESC LIMIT 100'
      )
        .bind(websiteId)
        .all()
    : await env.DB.prepare('SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 100').all();

  return json({
    channels: getNotificationChannelStatus(env),
    logs: logsRes.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    channel?: 'in_app' | 'whatsapp' | 'email' | 'sms';
    eventType?: string;
    recipientContact?: string;
    recipientUserId?: string;
    subject?: string;
    message?: string;
    consentVerified?: boolean;
  }>(request);

  if (!body || !body.channel || !body.eventType || !body.message) {
    return errorJson('channel, eventType, and message are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId || '', 120) || null;
  if (websiteId) {
    const access = await requireWebsiteAccess(env, auth.user, websiteId, [
      'business_owner',
      'business_manager',
      'business_staff',
    ]);
    if (!access.ok) return access.response;
  } else if (!auth.user.isSuperAdmin) {
    return errorJson('websiteId is required.', 400);
  }

  const channel = ['in_app', 'whatsapp', 'email', 'sms'].includes(body.channel)
    ? body.channel
    : 'in_app';
  const eventType = sanitizeText(body.eventType, 60);
  const recipientContact = sanitizeText(body.recipientContact || '', 140);
  const subject = sanitizeText(body.subject || eventType, 160);
  const message = sanitizeText(body.message, 1500);
  const isTransactional = TRANSACTIONAL_EVENTS.has(eventType);
  const hasConsent = isTransactional || body.consentVerified === true;

  if (!hasConsent) {
    await env.DB.prepare(
      `INSERT INTO notification_logs
        (website_id, recipient_user_id, recipient_contact, channel, event_type, subject, message_preview,
         consent_verified, delivery_status, error_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'blocked_no_consent', 'Explicit customer opt-in consent is required for non-transactional messages.', datetime('now'))`
    )
      .bind(websiteId, body.recipientUserId || null, recipientContact, channel, eventType, subject, message.slice(0, 240))
      .run();
    return errorJson('Blocked: explicit customer consent is required before sending promotional notifications.', 403);
  }

  let deliveryStatus: 'delivered' | 'sent' | 'setup_required' | 'failed' = 'delivered';
  let providerMessageId = '';
  let errorDetail = '';

  if (channel === 'whatsapp') {
    const token = (env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
    const phoneNumberId = (env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    if (!token || !phoneNumberId) {
      deliveryStatus = 'setup_required';
      errorDetail =
        'Integration Required: Configure WHATSAPP_CLOUD_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Cloudflare Pages Secrets.';
    } else {
      const cleanPhone = recipientContact.replace(/[^\d]/g, '');
      if (cleanPhone.length < 10) {
        return errorJson('Valid WhatsApp recipient phone number with country code is required.', 400);
      }
      try {
        const waRes = await fetch(
          `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'text',
              text: { body: message },
            }),
          }
        );
        const waData = (await waRes.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
          error?: { message?: string };
        };
        if (waRes.ok && waData.messages?.[0]?.id) {
          deliveryStatus = 'sent';
          providerMessageId = waData.messages[0].id;
        } else {
          deliveryStatus = 'failed';
          errorDetail = waData.error?.message || `WhatsApp Cloud API returned HTTP ${waRes.status}`;
        }
      } catch (err) {
        deliveryStatus = 'failed';
        errorDetail = err instanceof Error ? err.message : 'WhatsApp Cloud API network error';
      }
    }
  } else if (channel === 'email') {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      deliveryStatus = 'setup_required';
      errorDetail =
        'Integration Required: Configure SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (or HTTP Email API like Resend/MailChannels) in Cloudflare Pages Secrets.';
    } else {
      deliveryStatus = 'setup_required';
      errorDetail =
        'Note: Cloudflare Pages Edge does not open raw TCP SMTP sockets natively; wire an HTTPS email relay (e.g., Resend/Postmark/SendGrid) using your configured email credentials.';
    }
  } else if (channel === 'sms') {
    if (!env.SMS_PROVIDER_API_KEY) {
      deliveryStatus = 'setup_required';
      errorDetail =
        'Integration Required: Configure SMS_PROVIDER_API_KEY (and DLT-approved templates for India) in Cloudflare Pages Secrets.';
    } else {
      deliveryStatus = 'setup_required';
      errorDetail = 'SMS provider adapter awaits DLT template ID configuration.';
    }
  }

  const insertRes = await env.DB.prepare(
    `INSERT INTO notification_logs
      (website_id, recipient_user_id, recipient_contact, channel, event_type, subject, message_preview,
       consent_verified, delivery_status, provider_message_id, error_detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))`
  )
    .bind(
      websiteId,
      body.recipientUserId || null,
      recipientContact,
      channel,
      eventType,
      subject,
      message.slice(0, 240),
      deliveryStatus,
      providerMessageId,
      errorDetail
    )
    .run();

  return json(
    {
      notificationId: Number(insertRes.meta?.last_row_id || 0),
      channel,
      eventType,
      deliveryStatus,
      providerMessageId: providerMessageId || null,
      errorDetail: errorDetail || null,
    },
    deliveryStatus === 'failed' ? 502 : 201
  );
}
