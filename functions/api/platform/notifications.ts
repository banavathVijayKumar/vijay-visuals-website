// ============================================================================
// GET & POST /api/platform/notifications
// Official WhatsApp Cloud API, Email (SMTP), and SMS Transactional Notifications
// - Server-side API tokens ONLY (never exposed to browser)
// - Enforces explicit consent for non-transactional messages
// - Honest `setup_required` status when external provider credentials absent
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  redactSensitiveLogText,
  resolveVerifiedTenantSender,
  sendTransactionalEmail,
} from '../_email';
import { sendWhatsAppNotification } from '../_whatsapp';
import {
  PagesContext,
  errorJson,
  escapeHtml,
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

const NEUTRAL_CUSTOMER_BRAND = 'Store Notifications';

/**
 * Tenant-originated messages use the tenant's own name only when a verified
 * tenant sender is available. Otherwise they use a neutral identity — never
 * the platform brand. Superadmin messages without a websiteId remain genuine
 * platform communications and intentionally keep platform branding.
 */
async function resolveTenantNotificationBrand(
  env: PagesContext['env'],
  websiteId: string | null
): Promise<{ name: string; verifiedSender: { email: string; domain: string } | null }> {
  const verifiedSender = websiteId ? await resolveVerifiedTenantSender(env, websiteId) : null;
  if (!websiteId) {
    return { name: 'Vijay Visuals', verifiedSender: null };
  }

  let tenantName = NEUTRAL_CUSTOMER_BRAND;
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        'SELECT business_name FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(websiteId)
        .first<{ business_name?: string }>();
      const cleaned = sanitizeText(row?.business_name || '', 80).replace(/\bVijay\s+Visuals\b/gi, '');
      if (cleaned.trim()) tenantName = cleaned.trim();
    } catch {
      // Keep the neutral fallback.
    }
  }

  return {
    name: verifiedSender ? tenantName : NEUTRAL_CUSTOMER_BRAND,
    verifiedSender,
  };
}

function buildNotificationHtml(message: string, brandName: string, isPlatformMessage: boolean): string {
  const body = escapeHtml(message).replace(/\r?\n/g, '<br/>');
  if (isPlatformMessage) {
    return `<div style="font-family:sans-serif;background:#0A0A0F;color:#FFF;padding:24px;border-radius:8px;border:1px solid #DFBA5A;">
      <h2 style="color:#DFBA5A;margin-top:0;">VIJAY VISUALS</h2>
      <div style="font-size:14px;line-height:1.6;color:#CCC;">${body}</div>
      <p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #222;padding-top:12px;">Vijay Visuals Digital Architecture · Hyderabad, Telangana</p>
    </div>`;
  }
  return `<div style="font-family:sans-serif;background:#0A0A0F;color:#FFF;padding:24px;border-radius:8px;border:1px solid #DFBA5A;">
    <h2 style="color:#DFBA5A;margin-top:0;">${escapeHtml(brandName)}</h2>
    <div style="font-size:14px;line-height:1.6;color:#CCC;">${body}</div>
    <p style="font-size:11px;color:#888;margin-top:24px;border-top:1px solid #222;padding-top:12px;">Store notifications · delivered on behalf of this store.</p>
  </div>`;
}

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

  // Redact on read as well as on write so legacy rows created before redaction
  // cannot leak raw OTPs or provider errors through the notifications UI.
  const logs = (logsRes.results || []).map((log: Record<string, unknown>) => ({
    ...log,
    subject: redactSensitiveLogText(log.subject),
    message_preview: redactSensitiveLogText(log.message_preview),
    error_detail: redactSensitiveLogText(log.error_detail),
  }));

  return json({
    channels: getNotificationChannelStatus(env),
    logs,
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
  const isPlatformMessage = !websiteId;
  const brand = await resolveTenantNotificationBrand(env, websiteId);
  const safePreview = redactSensitiveLogText(message);
  const safeSubject = redactSensitiveLogText(subject);

  if (!hasConsent) {
    await env.DB.prepare(
      `INSERT INTO notification_logs
        (website_id, recipient_user_id, recipient_contact, channel, event_type, subject, message_preview,
         consent_verified, delivery_status, error_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'blocked_no_consent', 'Explicit customer opt-in consent is required for non-transactional messages.', datetime('now'))`
    )
      .bind(websiteId, body.recipientUserId || null, recipientContact, channel, eventType, safeSubject, safePreview)
      .run();
    return errorJson('Blocked: explicit customer consent is required before sending promotional notifications.', 403);
  }

  let deliveryStatus: 'delivered' | 'sent' | 'setup_required' | 'failed' = 'delivered';
  let providerMessageId = '';
  let errorDetail = '';

  if (channel === 'whatsapp') {
    const waResult = await sendWhatsAppNotification(env, {
      toPhone: recipientContact,
      messageText: message,
      eventType,
      websiteId,
      recipientUserId: body.recipientUserId || null,
    });
    deliveryStatus = waResult.status === 'setup_required' ? 'setup_required' : waResult.ok ? 'sent' : 'failed';
    providerMessageId = waResult.providerMessageId || '';
    errorDetail = waResult.error || waResult.notice || '';
  } else if (channel === 'email') {
    const emailResult = await sendTransactionalEmail(env, {
      to: recipientContact,
      subject,
      html: buildNotificationHtml(message, brand.name, isPlatformMessage),
      text: message,
      eventType,
      websiteId,
      recipientUserId: body.recipientUserId || null,
      audience: isPlatformMessage ? 'platform' : 'customer',
      tenantBrandName: isPlatformMessage ? undefined : brand.name,
      verifiedSenderEmail: brand.verifiedSender?.email,
      verifiedSenderDomain: brand.verifiedSender?.domain,
    });
    deliveryStatus = emailResult.status === 'setup_required' ? 'setup_required' : emailResult.ok ? 'sent' : 'failed';
    providerMessageId = emailResult.providerMessageId || '';
    errorDetail = emailResult.error || emailResult.notice || '';
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
      safeSubject,
      safePreview,
      deliveryStatus,
      providerMessageId,
      redactSensitiveLogText(errorDetail)
    )
    .run();

  return json(
    {
      notificationId: Number(insertRes.meta?.last_row_id || 0),
      channel,
      eventType,
      deliveryStatus,
      providerMessageId: providerMessageId || null,
      errorDetail: errorDetail ? redactSensitiveLogText(errorDetail) : null,
    },
    deliveryStatus === 'failed' ? 502 : 201
  );
}
