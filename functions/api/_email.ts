// ============================================================================
// VIJAY VISUALS — TRANSACTIONAL EMAIL SERVICE (CLOUDFLARE PAGES EDGE)
// Powered by Resend API with durable D1 notification audit logging.
// 100% Web-Standard Fetch (No Node.js SMTP/TLS dependencies).
// ZERO secrets exposed in logs or API responses.
// ============================================================================

import { CloudflareEnv, escapeHtml, sanitizeText } from './_shared';

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  eventType: string;
  websiteId?: string | null;
  recipientUserId?: string | null;
  idempotencyKey?: string;
  /** Platform messages keep platform branding; customer messages require verified tenant or neutral sender. */
  audience?: 'platform' | 'customer';
  tenantBrandName?: string;
  verifiedSenderEmail?: string;
  verifiedSenderDomain?: string;
}

export interface EmailSendResult {
  ok: boolean;
  status: 'sent' | 'delivered' | 'setup_required' | 'failed' | 'idempotent_duplicate';
  providerMessageId?: string;
  error?: string;
  notice?: string;
}

const DEFAULT_SENDER = 'Vijay Visuals <notifications@vijayvisuals.com>';
const NEUTRAL_CUSTOMER_SENDER = 'Store Notifications <onboarding@resend.dev>';
const NEUTRAL_CUSTOMER_SENDER_EMAIL = 'onboarding@resend.dev';
const NEUTRAL_CUSTOMER_SENDER_NAME = 'Store Notifications';

/**
 * Returns the effective platform sender. Customer store messages never use this
 * platform identity — they use a verified tenant identity or a neutral fallback.
 */
export function getSenderEmail(env: CloudflareEnv): string {
  const custom = (env.RESEND_FROM || '').trim();
  if (custom) return custom;
  return DEFAULT_SENDER;
}

export interface EmailSenderIdentity {
  email: string;
  name: string;
  formatted: string;
}

/**
 * Customer verification mail must never reuse the platform/owner notification
 * identity. A verified business sender is used only when its domain is on the
 * explicit provider-verified allowlist; otherwise the provider's neutral
 * onboarding sender is used and delivery remains blocked for external
 * recipients until a verified domain is configured by the operator.
 */
export function getCustomerOtpSender(env: CloudflareEnv): EmailSenderIdentity {
  const configured = getSenderEmail(env);
  const match = configured.match(/^(.*)<([^>]+)>$/);
  const email = String(match?.[2] || configured).trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  if (domain && configuredVerifiedDomains(env).includes(domain)) {
    const name = safeTenantSenderName(match?.[1] || 'Customer Notifications');
    return { email, name, formatted: `${name} <${email}>` };
  }
  return {
    email: NEUTRAL_CUSTOMER_SENDER_EMAIL,
    name: NEUTRAL_CUSTOMER_SENDER_NAME,
    formatted: NEUTRAL_CUSTOMER_SENDER,
  };
}

function normalizeSenderDomain(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\.$/, '');
}

function configuredVerifiedDomains(env: CloudflareEnv): string[] {
  return String(env.RESEND_VERIFIED_SENDER_DOMAINS || '')
    .split(',')
    .map(normalizeSenderDomain)
    .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain));
}

function safeTenantSenderName(raw: unknown): string {
  const cleaned = sanitizeText(String(raw || ''), 80)
    .replace(/[<>\r\n]/g, ' ')
    .replace(/\bVijay\s+Visuals\b/gi, NEUTRAL_CUSTOMER_SENDER_NAME)
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || NEUTRAL_CUSTOMER_SENDER_NAME;
}

/**
 * Resolves a sender identity without ever spoofing an unverified customer domain.
 * A tenant email is accepted only when both a verified tenant domain and the
 * provider-verified domain allowlist agree.
 */
export function resolveEmailSender(
  env: CloudflareEnv,
  options: Pick<EmailSendOptions, 'audience' | 'tenantBrandName' | 'verifiedSenderEmail' | 'verifiedSenderDomain'> = {}
): EmailSenderIdentity {
  if (options.audience === 'customer') {
    const domain = normalizeSenderDomain(options.verifiedSenderDomain);
    const email = String(options.verifiedSenderEmail || '').trim().toLowerCase();
    const emailDomain = email.split('@')[1] || '';
    if (
      domain &&
      email.includes('@') &&
      emailDomain === domain &&
      configuredVerifiedDomains(env).includes(domain)
    ) {
      const name = safeTenantSenderName(options.tenantBrandName);
      return { email, name, formatted: `${name} <${email}>` };
    }
    return {
      email: NEUTRAL_CUSTOMER_SENDER_EMAIL,
      name: NEUTRAL_CUSTOMER_SENDER_NAME,
      formatted: NEUTRAL_CUSTOMER_SENDER,
    };
  }

  const configured = getSenderEmail(env);
  const match = configured.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return { email: configured, name: '', formatted: configured };
  }
  return {
    email: match[2].trim(),
    name: match[1].trim().replace(/^"|"$/g, ''),
    formatted: configured,
  };
}

/** Reads a verified customer domain from D1; never invents or fabricates verification. */
export async function resolveVerifiedTenantSender(
  env: CloudflareEnv,
  websiteId?: string | null
): Promise<{ email: string; domain: string } | null> {
  if (!env.DB || !websiteId) return null;
  const allowedDomains = configuredVerifiedDomains(env);
  if (allowedDomains.length === 0) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT domain_name
       FROM tenant_domains
       WHERE website_id = ?
         AND dns_verification_status = 'verified'
         AND ssl_status = 'active'
         AND status IN ('live', 'expiring_soon')
       ORDER BY is_primary DESC, id ASC
       LIMIT 1`
    )
      .bind(websiteId)
      .first<{ domain_name: string }>();
    const domain = normalizeSenderDomain(row?.domain_name);
    if (!domain || !allowedDomains.includes(domain)) return null;
    return { email: `notifications@${domain}`, domain };
  } catch {
    return null;
  }
}

/**
 * Removes credential-like values before any email body preview is persisted.
 * OTP codes are numeric, so standalone 4-8 digit sequences are always masked.
 */
export function redactSensitiveLogText(raw: unknown): string {
  const text = sanitizeText(String(raw || ''), 500);
  return text
    .replace(/\+91[\s()-]*(?:\d[\s()-]*){10}/g, '[REDACTED]')
    .replace(/\b\d{9,12}\b/g, '[REDACTED]')
    .replace(/\b\d{4,8}\b/g, '[REDACTED]')
    .replace(
      /\b(reset[_-]?link|reset[_-]?token|token|otp|code|password)\s*[=:]\s*\S+/gi,
      '$1=[REDACTED]'
    )
    .slice(0, 200);
}

/**
 * Sends a transactional email using Resend API.
 * Automatically records durable audit logs in D1 table `notification_logs`.
 */
export async function sendTransactionalEmail(
  env: CloudflareEnv,
  options: EmailSendOptions
): Promise<EmailSendResult> {
  const {
    to,
    subject,
    html,
    text,
    eventType,
    websiteId,
    recipientUserId,
    idempotencyKey,
    audience = 'platform',
    tenantBrandName,
    verifiedSenderEmail,
    verifiedSenderDomain,
  } = options;
  const cleanEmail = sanitizeText(to || '', 140).toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, status: 'failed', error: 'Invalid recipient email address.' };
  }

  // Durable key-based dedupe: an explicit idempotency key suppresses a repeat
  // send for the lifetime of the notification ledger record. Callers that want
  // a time window must encode it in the key itself.
  if (env.DB && idempotencyKey) {
    try {
      const existing = await env.DB.prepare(
        `SELECT id, provider_message_id, delivery_status FROM notification_logs
         WHERE recipient_contact = ? AND event_type = ?
           AND (idempotency_key = ? OR (idempotency_key = '' AND provider_message_id = ?))
         LIMIT 1`
      )
        .bind(cleanEmail, eventType, idempotencyKey, idempotencyKey)
        .first<{ id: number; provider_message_id: string; delivery_status: string }>();

      // A failed or setup-required attempt must never permanently suppress a
      // later retry with the same key. Only a delivered send is a true duplicate.
      if (existing && (existing.delivery_status === 'sent' || existing.delivery_status === 'delivered')) {
        return {
          ok: true,
          status: 'idempotent_duplicate',
          providerMessageId: existing.provider_message_id,
          notice: 'Duplicate email send safely skipped.',
        };
      }
    } catch {
      // Non-fatal if table check fails
    }
  }

  const resendApiKey = (env.RESEND_API_KEY || '').trim();
  const sendgridApiKey = (env.SENDGRID_API_KEY || '').trim();

  // If no email provider secret is configured
  if (!resendApiKey && !sendgridApiKey) {
    const notice = 'Transactional email provider (RESEND_API_KEY) is not yet configured in Cloudflare Pages secrets.';
    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO notification_logs (
            website_id, recipient_user_id, recipient_contact, channel, event_type,
            subject, message_preview, consent_verified, delivery_status,
            idempotency_key, error_detail, created_at
          ) VALUES (?, ?, ?, 'email', ?, ?, ?, 1, 'setup_required', ?, ?, datetime('now'))`
        )
          .bind(
            websiteId || null,
            recipientUserId || null,
            cleanEmail,
            eventType,
            redactSensitiveLogText(subject),
            redactSensitiveLogText(text || subject),
            idempotencyKey || '',
            notice
          )
          .run();
      } catch (logErr) {
        console.error('Failed to log unconfigured email attempt:', logErr);
      }
    }

    return {
      ok: false,
      status: 'setup_required',
      notice,
      error: notice,
    };
  }

  let deliveryStatus: 'sent' | 'failed' = 'failed';
  let providerMessageId = '';
  let errorDetail = '';

  // 1. Resend API Dispatch
  if (resendApiKey) {
    const sender = resolveEmailSender(env, {
      audience,
      tenantBrandName,
      verifiedSenderEmail,
      verifiedSenderDomain,
    });
    try {
      const payload: Record<string, any> = {
        from: sender.formatted,
        to: cleanEmail,
        subject,
        html,
      };
      if (text) payload.text = text;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
        statusCode?: number;
      };

      if (res.ok && data.id) {
        deliveryStatus = 'sent';
        providerMessageId = data.id;
      } else {
        deliveryStatus = 'failed';
        errorDetail = data.message || `Resend API returned HTTP ${res.status}`;
      }
    } catch (err: any) {
      deliveryStatus = 'failed';
      errorDetail = err?.message || 'Resend network communication error';
    }
  } else if (sendgridApiKey) {
    // 2. Fallback to SendGrid if configured
    const sender = resolveEmailSender(env, {
      audience,
      tenantBrandName,
      verifiedSenderEmail,
      verifiedSenderDomain,
    });
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: cleanEmail }] }],
          from:
            audience === 'customer'
              ? { email: sender.email, name: sender.name }
              : { email: 'notifications@vijayvisuals.com', name: 'Vijay Visuals' },
          subject,
          content: [
            ...(text ? [{ type: 'text/plain', value: text }] : []),
            { type: 'text/html', value: html },
          ],
        }),
      });

      if (res.status === 202) {
        deliveryStatus = 'sent';
        providerMessageId = res.headers.get('x-message-id') || `sg_${Date.now()}`;
      } else {
        const sgData = await res.text().catch(() => '');
        deliveryStatus = 'failed';
        errorDetail = `SendGrid returned HTTP ${res.status}: ${sgData.slice(0, 100)}`;
      }
    } catch (err: any) {
      deliveryStatus = 'failed';
      errorDetail = err?.message || 'SendGrid network communication error';
    }
  }

  // Record audit log in D1. A keyed retry updates the existing attempt row so
  // a prior transient failure can transition to sent and suppress later dupes.
  if (env.DB) {
    try {
      const finalProviderId = providerMessageId || (idempotencyKey ? `idemp_${idempotencyKey}` : '');
      const safeSubject = redactSensitiveLogText(subject);
      const safePreview = redactSensitiveLogText(text || subject);
      const safeError = redactSensitiveLogText(errorDetail);
      let recorded = false;

      if (idempotencyKey) {
        const updated = await env.DB.prepare(
          `UPDATE notification_logs
           SET delivery_status = ?, provider_message_id = ?, error_detail = ?,
               subject = ?, message_preview = ?, consent_verified = 1
           WHERE recipient_contact = ? AND event_type = ? AND idempotency_key = ?`
        )
          .bind(
            deliveryStatus,
            finalProviderId,
            safeError,
            safeSubject,
            safePreview,
            cleanEmail,
            eventType,
            idempotencyKey
          )
          .run();
        recorded = (updated.meta?.changes || 0) > 0;
      }

      if (!recorded) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO notification_logs (
            website_id, recipient_user_id, recipient_contact, channel, event_type,
            subject, message_preview, consent_verified, delivery_status,
            provider_message_id, idempotency_key, error_detail, created_at
          ) VALUES (?, ?, ?, 'email', ?, ?, ?, 1, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            websiteId || null,
            recipientUserId || null,
            cleanEmail,
            eventType,
            safeSubject,
            safePreview,
            deliveryStatus,
            finalProviderId,
            idempotencyKey || '',
            safeError
          )
          .run();
      }
    } catch (logErr) {
      console.error('Failed to log email audit record:', logErr);
    }
  }

  return {
    ok: deliveryStatus === 'sent',
    status: deliveryStatus,
    providerMessageId: providerMessageId || undefined,
    error: errorDetail || undefined,
  };
}

// ============================================================================
// LUXURY VIJAY VISUALS BRANDED EMAIL TEMPLATES
// ============================================================================

interface EmailWrapperOptions {
  brandName?: string;
  brandSubtitle?: string;
  footerHtml?: string;
}

const DEFAULT_EMAIL_FOOTER_HTML = `
              <p style="margin: 0 0 8px 0; color: #B38D2C; font-weight: 600;">
                Vijay Visuals — Hyderabad, Telangana, India
              </p>
              <p style="margin: 0 0 8px 0;">
                Official Support: <a href="tel:+919361024823" style="color: #DFBA5A; text-decoration: none;">+91 93610 24823</a> ·
                <a href="mailto:vk66278@gmail.com" style="color: #DFBA5A; text-decoration: none;">vk66278@gmail.com</a>
              </p>
              <p style="margin: 0; font-size: 10px; color: #505062;">
                This is an automated system transmission. Please do not reply directly with passwords or private tokens.
              </p>`;

const NEUTRAL_CUSTOMER_EMAIL_FOOTER_HTML = `
              <p style="margin: 0 0 8px 0; color: #B38D2C; font-weight: 600;">
                Order updates are sent by the store.
              </p>
              <p style="margin: 0 0 8px 0;">
                Please contact the business directly if you need help with this order.
              </p>
              <p style="margin: 0; font-size: 10px; color: #505062;">
                This is an automated order notification. Please do not reply with passwords or private tokens.
              </p>`;

function baseEmailWrapper(
  contentHtml: string,
  title = 'Vijay Visuals',
  options: EmailWrapperOptions = {}
): string {
  const brandName = escapeHtml(sanitizeText(options.brandName || 'VIJAY VISUALS', 120));
  const brandSubtitle = escapeHtml(
    sanitizeText(options.brandSubtitle || 'Architectural Web & Digital Systems', 120)
  );
  const footerHtml = options.footerHtml || DEFAULT_EMAIL_FOOTER_HTML;
  const safeTitle = escapeHtml(sanitizeText(title, 160));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #08080C; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #08080C; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #0F0F17; border: 1px solid #282838; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #1E1E2C; background: linear-gradient(180deg, #161622 0%, #0F0F17 100%);">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 3px; color: #DFBA5A; text-transform: uppercase;">
                ${brandName}
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 1.5px; color: #8A8A9E; text-transform: uppercase;">
                ${brandSubtitle}
              </p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #0A0A10; border-top: 1px solid #1A1A26; text-align: center; font-size: 11px; color: #707085; line-height: 1.6;">${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 6-Digit Email OTP Verification Template
 */
export function buildOtpEmailHtml(otpCode: string, expiresMinutes = 10): string {
  const content = `
    <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #FFFFFF;">
      Confirm Your Email Address
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      You requested a verification code. Your account is not created until this code is verified. Please enter the following 6-digit code to continue:
    </p>

    <!-- OTP Code Display Box -->
    <div style="margin: 28px 0; text-align: center;">
      <div style="display: inline-block; background-color: #171724; border: 2px solid #DFBA5A; border-radius: 10px; padding: 18px 36px; box-shadow: 0 4px 20px rgba(223, 186, 90, 0.15);">
        <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #DFBA5A; font-family: 'Courier New', Courier, monospace;">
          ${otpCode}
        </span>
      </div>
    </div>

    <p style="margin: 0 0 16px 0; font-size: 13px; color: #E0C068; text-align: center; font-weight: 500;">
      ⏱ This code will expire in ${expiresMinutes} minutes.
    </p>

    <div style="background-color: #14141E; border-left: 3px solid #DFBA5A; border-radius: 4px; padding: 14px 18px; margin: 24px 0 0 0;">
      <p style="margin: 0; font-size: 12px; color: #9A9AB0; line-height: 1.5;">
        <strong style="color: #FFFFFF;">Security Notice:</strong> No support team member will ever contact you asking for your verification code or password. If you did not initiate this request, you can safely ignore this email.
      </p>
    </div>
  `;
  return baseEmailWrapper(content, 'Your Verification Code', {
    brandName: 'Verification Service',
    brandSubtitle: 'Secure email verification',
    footerHtml: NEUTRAL_CUSTOMER_EMAIL_FOOTER_HTML,
  });
}

/**
 * Order Received Confirmation Template
 */
export function buildOrderConfirmationEmailHtml(params: {
  customerName: string;
  orderNumber: string;
  packageName: string;
  amountFormatted: string;
  dashboardUrl: string;
  /** Present for customer store orders; absent for platform service orders. */
  businessName?: string;
  storeUrl?: string;
}): string {
  const { customerName, orderNumber, packageName, amountFormatted, dashboardUrl } = params;
  const tenantBrand = sanitizeText(params.businessName, 120);
  const isStoreOrder = Boolean(tenantBrand);
  const safeCustomer = escapeHtml(sanitizeText(customerName, 80));
  const safeOrder = escapeHtml(sanitizeText(orderNumber, 80));
  const safePackage = escapeHtml(sanitizeText(packageName, 100));
  const safeAmount = escapeHtml(sanitizeText(amountFormatted, 40));

  const intro = isStoreOrder
    ? `We have received your order from <strong>${escapeHtml(tenantBrand)}</strong>. The store will review your order and share updates.`
    : `We have received your website development order for <strong>${safePackage}</strong>. Our engineering and creative team is reviewing your requirements.`;
  const statusLabel = isStoreOrder ? 'ORDER STATUS' : 'ESTIMATED DELIVERY';
  const statusValue = isStoreOrder ? 'Received — awaiting store confirmation' : '3–5 Business Days';
  const actionUrl = isStoreOrder && params.storeUrl ? escapeHtml(params.storeUrl) : escapeHtml(dashboardUrl);
  const actionLabel = isStoreOrder && params.storeUrl ? 'View Store' : 'View Order in Dashboard';
  const tenantFooter = isStoreOrder
    ? `
              <p style="margin: 0 0 8px 0; color: #B38D2C; font-weight: 600;">
                ${escapeHtml(tenantBrand)}
              </p>
              <p style="margin: 0 0 8px 0;">
                Order updates are sent by the store. Please contact the business directly.
              </p>
              <p style="margin: 0; font-size: 10px; color: #505062;">
                This is an automated order confirmation. Please do not reply with passwords or private tokens.
              </p>`
    : undefined;

  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #FFFFFF;">
      Order Received & Confirmed
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${safeCustomer},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      ${intro}
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #14141E; border: 1px solid #242436; border-radius: 8px; margin: 20px 0; padding: 16px;">
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94;">ORDER NUMBER</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; text-align: right;">${safeOrder}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">PACKAGE</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #DFBA5A; text-align: right; border-top: 1px solid #1E1E2C;">${safePackage}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">TOTAL</td>
        <td style="padding: 8px 12px; font-size: 15px; font-weight: 800; color: #ECC86A; text-align: right; border-top: 1px solid #1E1E2C;">${safeAmount}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">${statusLabel}</td>
        <td style="padding: 8px 12px; font-size: 13px; color: #FFFFFF; text-align: right; border-top: 1px solid #1E1E2C;">${statusValue}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${actionUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        ${actionLabel}
      </a>
    </div>
  `;
  return baseEmailWrapper(content, `Order Confirmed: ${orderNumber}`, {
    brandName: isStoreOrder ? tenantBrand : undefined,
    brandSubtitle: isStoreOrder ? 'Order Confirmation' : undefined,
    footerHtml: tenantFooter,
  });
}

/**
 * Payment Receipt Template
 */
export function buildPaymentReceiptEmailHtml(params: {
  customerName: string;
  orderNumber: string;
  paymentId: string;
  amountFormatted: string;
  paymentTime: string;
  dashboardUrl: string;
}): string {
  const { customerName, orderNumber, paymentId, amountFormatted, paymentTime, dashboardUrl } = params;
  const safeCustomer = escapeHtml(sanitizeText(customerName, 80));
  const safeOrder = escapeHtml(sanitizeText(orderNumber, 120));
  const safePaymentId = escapeHtml(sanitizeText(paymentId, 120));
  const safeAmount = escapeHtml(sanitizeText(amountFormatted, 60));
  const safeTime = escapeHtml(sanitizeText(paymentTime, 80));
  const safeDashboardUrl = escapeHtml(sanitizeText(dashboardUrl, 300));
  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #22C55E;">
      ✓ Payment Successfully Verified
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${safeCustomer},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We have successfully received and verified your payment through <strong>Cashfree Payment Gateway</strong>. Your project is now scheduled for development.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #14141E; border: 1px solid #242436; border-radius: 8px; margin: 20px 0; padding: 16px;">
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94;">ORDER NUMBER</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; text-align: right;">${safeOrder}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">CASHFREE PAYMENT ID</td>
        <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; color: #DFBA5A; text-align: right; border-top: 1px solid #1E1E2C;">${safePaymentId}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">AMOUNT PAID</td>
        <td style="padding: 8px 12px; font-size: 15px; font-weight: 800; color: #22C55E; text-align: right; border-top: 1px solid #1E1E2C;">${safeAmount}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">TIMESTAMP</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #FFFFFF; text-align: right; border-top: 1px solid #1E1E2C;">${safeTime}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${safeDashboardUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        Track Project Progress
      </a>
    </div>
  `;
  return baseEmailWrapper(content, `Payment Receipt: ${sanitizeText(orderNumber, 120)}`);
}

/**
 * Customer storefront payment confirmation — deliberately separate from the
 * platform subscription receipt above. No platform dashboard, no VIJAY VISUALS
 * branding, and no invented delivery timeline.
 */
export function buildStorePaymentReceiptEmailHtml(params: {
  customerName: string;
  orderNumber: string;
  paymentId: string;
  amountFormatted: string;
  paymentTime: string;
  storeName: string;
  storeUrl: string;
}): string {
  const storeName = sanitizeText(params.storeName, 120) || 'Your Store';
  const safeCustomer = escapeHtml(sanitizeText(params.customerName, 80));
  const safeOrder = escapeHtml(sanitizeText(params.orderNumber, 80));
  const safePaymentId = escapeHtml(sanitizeText(params.paymentId, 80));
  const safeAmount = escapeHtml(sanitizeText(params.amountFormatted, 40));
  const safeTime = escapeHtml(sanitizeText(params.paymentTime, 60));
  const safeStoreUrl = escapeHtml(sanitizeText(params.storeUrl, 300));

  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #22C55E;">
      ✓ Payment Confirmed
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${safeCustomer},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We have received payment for your order from <strong>${escapeHtml(storeName)}</strong>. The store will confirm fulfilment directly.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #14141E; border: 1px solid #242436; border-radius: 8px; margin: 20px 0; padding: 16px;">
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94;">ORDER NUMBER</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; text-align: right;">${safeOrder}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">PAYMENT ID</td>
        <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; color: #DFBA5A; text-align: right; border-top: 1px solid #1E1E2C;">${safePaymentId}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">AMOUNT PAID</td>
        <td style="padding: 8px 12px; font-size: 15px; font-weight: 800; color: #22C55E; text-align: right; border-top: 1px solid #1E1E2C;">${safeAmount}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">PAYMENT TIME</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #FFFFFF; text-align: right; border-top: 1px solid #1E1E2C;">${safeTime}</td>
      </tr>
    </table>

    ${safeStoreUrl ? `
    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${safeStoreUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        View Store
      </a>
    </div>` : ''}
  `;
  return baseEmailWrapper(content, `Payment Confirmed: ${safeOrder}`, {
    brandName: storeName,
    brandSubtitle: 'Order Payment Confirmation',
    footerHtml: NEUTRAL_CUSTOMER_EMAIL_FOOTER_HTML,
  });
}

/** WhatsApp copy for customer storefront payments; no platform claims or timelines. */
export function buildStorePaymentWhatsAppText(params: {
  storeName: string;
  customerName: string;
  orderNumber: string;
  amountFormatted: string;
  paymentId: string;
  storeUrl: string;
}): string {
  const storeName = sanitizeText(params.storeName, 120) || 'Your Store';
  const customerName = sanitizeText(params.customerName, 80) || 'Customer';
  const orderNumber = sanitizeText(params.orderNumber, 80);
  const amountFormatted = sanitizeText(params.amountFormatted, 40);
  const paymentId = sanitizeText(params.paymentId, 80);
  const storeUrl = sanitizeText(params.storeUrl, 300);

  return [
    `*${storeName} — Payment Confirmed*`,
    ``,
    `Dear ${customerName},`,
    `Your payment of *${amountFormatted}* for order *#${orderNumber}* has been received.`,
    ``,
    `Payment ID: ${paymentId}`,
    `Store order: ${orderNumber}`,
    `Track your order and contact the store: ${storeUrl}`,
    ``,
    `Thank you for shopping with us!`,
  ].join('\n');
}

/**
 * Website Final Delivery Notification Template
 */
export function buildWebsiteDeliveryEmailHtml(params: {
  customerName: string;
  businessName: string;
  liveUrl: string;
  dashboardUrl: string;
  orderNumber: string;
}): string {
  const { customerName, businessName, liveUrl, dashboardUrl, orderNumber } = params;
  const safeCustomer = escapeHtml(sanitizeText(customerName, 80));
  const safeBusiness = escapeHtml(sanitizeText(businessName, 120));
  const safeLiveUrl = escapeHtml(sanitizeText(liveUrl, 300));
  const safeDashboardUrl = escapeHtml(sanitizeText(dashboardUrl, 300));
  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #DFBA5A;">
      🎉 Your Website is Live!
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${safeCustomer},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We are thrilled to announce that your bespoke digital storefront for <strong>${safeBusiness}</strong> has been successfully built, deployed, and published to the Cloudflare Edge global network!
    </p>

    <!-- Prominent Live Site Box -->
    <div style="background-color: #14141E; border: 1px solid #DFBA5A; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 11px; color: #8E8EA2; text-transform: uppercase; letter-spacing: 1px;">YOUR OFFICIAL LIVE WEBSITE</p>
      <a href="${safeLiveUrl}" style="font-size: 18px; font-weight: 700; color: #ECC86A; text-decoration: underline; word-break: break-all;">
        ${safeLiveUrl}
      </a>
    </div>

    <!-- Management Dashboard Box -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #101018; border: 1px solid #222234; border-radius: 8px; margin: 20px 0; padding: 18px;">
      <tr>
        <td>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #FFFFFF;">How to Manage Your Website</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #A0A0B2; line-height: 1.6;">
            <li>Log in to your <strong>Customer Dashboard</strong> to update products, prices, and banners.</li>
            <li>Use the <strong>Website Customizer</strong> to change colors, themes, and branding.</li>
            <li>Connect your own custom domain at any time through the Domain Settings tab.</li>
          </ul>
        </td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${safeDashboardUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        Open Management Dashboard
      </a>
    </div>

    <div style="background-color: #14141E; border-left: 3px solid #22C55E; border-radius: 4px; padding: 14px 18px; margin: 24px 0 0 0;">
      <p style="margin: 0; font-size: 12px; color: #9A9AB0; line-height: 1.5;">
        <strong style="color: #FFFFFF;">Continuous Support:</strong> If you need any assistance, our dedicated engineering team is reachable on WhatsApp at <strong>+91 93610 24823</strong>.
      </p>
    </div>
  `;
  return baseEmailWrapper(content, `Your Website is Live: ${sanitizeText(businessName, 120)}`);
}
