// ============================================================================
// VIJAY VISUALS — TRANSACTIONAL EMAIL SERVICE (CLOUDFLARE PAGES EDGE)
// Powered by Resend API with durable D1 notification audit logging.
// 100% Web-Standard Fetch (No Node.js SMTP/TLS dependencies).
// ZERO secrets exposed in logs or API responses.
// ============================================================================

import { CloudflareEnv, sanitizeText } from './_shared';

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  eventType: string;
  websiteId?: string | null;
  recipientUserId?: string | null;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  ok: boolean;
  status: 'sent' | 'delivered' | 'setup_required' | 'failed' | 'idempotent_duplicate';
  providerMessageId?: string;
  error?: string;
  notice?: string;
}

const DEFAULT_SENDER = 'Vijay Visuals <notifications@vijayvisuals.com>';
const ONBOARDING_SENDER = 'Vijay Visuals <onboarding@resend.dev>';

/**
 * Returns the effective sender address.
 * If user configured RESEND_FROM, uses that. Otherwise defaults to official domain,
 * or onboarding@resend.dev if testing with unverified domain.
 */
export function getSenderEmail(env: CloudflareEnv): string {
  const custom = (env.RESEND_FROM || '').trim();
  if (custom) return custom;
  return DEFAULT_SENDER;
}

/**
 * Sends a transactional email using Resend API.
 * Automatically records durable audit logs in D1 table `notification_logs`.
 */
export async function sendTransactionalEmail(
  env: CloudflareEnv,
  options: EmailSendOptions
): Promise<EmailSendResult> {
  const { to, subject, html, text, eventType, websiteId, recipientUserId, idempotencyKey } = options;
  const cleanEmail = sanitizeText(to || '', 140).toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, status: 'failed', error: 'Invalid recipient email address.' };
  }

  // Idempotency check: if identical event sent within last 120 seconds, prevent duplicate send
  if (env.DB && idempotencyKey) {
    try {
      const existing = await env.DB.prepare(
        `SELECT id, provider_message_id, delivery_status FROM notification_logs
         WHERE recipient_contact = ? AND event_type = ? AND provider_message_id = ?
         LIMIT 1`
      )
        .bind(cleanEmail, eventType, idempotencyKey)
        .first<{ id: number; provider_message_id: string; delivery_status: string }>();

      if (existing) {
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
          `INSERT INTO notification_logs (
            website_id, recipient_user_id, recipient_contact, channel, event_type,
            subject, message_preview, consent_verified, delivery_status, error_detail, created_at
          ) VALUES (?, ?, ?, 'email', ?, ?, ?, 1, 'setup_required', ?, datetime('now'))`
        )
          .bind(
            websiteId || null,
            recipientUserId || null,
            cleanEmail,
            eventType,
            subject,
            sanitizeText(text || subject, 200),
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
    const fromAddress = getSenderEmail(env);
    try {
      const payload: Record<string, any> = {
        from: fromAddress,
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
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: cleanEmail }] }],
          from: { email: 'notifications@vijayvisuals.com', name: 'Vijay Visuals' },
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

  // Record audit log in D1
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO notification_logs (
          website_id, recipient_user_id, recipient_contact, channel, event_type,
          subject, message_preview, consent_verified, delivery_status,
          provider_message_id, error_detail, created_at
        ) VALUES (?, ?, ?, 'email', ?, ?, ?, 1, ?, ?, ?, datetime('now'))`
      )
        .bind(
          websiteId || null,
          recipientUserId || null,
          cleanEmail,
          eventType,
          subject,
          sanitizeText(text || subject, 200),
          deliveryStatus,
          providerMessageId || (idempotencyKey ? `idemp_${idempotencyKey}` : ''),
          errorDetail
        )
        .run();
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

function baseEmailWrapper(contentHtml: string, title = 'Vijay Visuals'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
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
                VIJAY VISUALS
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 11px; letter-spacing: 1.5px; color: #8A8A9E; text-transform: uppercase;">
                Architectural Web & Digital Systems
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
            <td style="padding: 24px 32px; background-color: #0A0A10; border-top: 1px solid #1A1A26; text-align: center; font-size: 11px; color: #707085; line-height: 1.6;">
              <p style="margin: 0 0 8px 0; color: #B38D2C; font-weight: 600;">
                Vijay Visuals — Hyderabad, Telangana, India
              </p>
              <p style="margin: 0 0 8px 0;">
                Official Support: <a href="tel:+919361024823" style="color: #DFBA5A; text-decoration: none;">+91 93610 24823</a> · 
                <a href="mailto:vk66278@gmail.com" style="color: #DFBA5A; text-decoration: none;">vk66278@gmail.com</a>
              </p>
              <p style="margin: 0; font-size: 10px; color: #505062;">
                This is an automated system transmission. Please do not reply directly with passwords or private tokens.
              </p>
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
      Thank you for creating an account with Vijay Visuals. To verify your identity and activate your account, please enter the following 6-digit verification code:
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
        <strong style="color: #FFFFFF;">Security Notice:</strong> Vijay Visuals team members will never contact you asking for your verification code or password. If you did not initiate this request, you can safely ignore this email.
      </p>
    </div>
  `;
  return baseEmailWrapper(content, 'Vijay Visuals — Account Verification Code');
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
}): string {
  const { customerName, orderNumber, packageName, amountFormatted, dashboardUrl } = params;
  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #FFFFFF;">
      Order Received & Confirmed
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${sanitizeText(customerName, 80)},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We have received your website development order for <strong>${sanitizeText(packageName, 100)}</strong>. Our engineering and creative team is reviewing your requirements.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #14141E; border: 1px solid #242436; border-radius: 8px; margin: 20px 0; padding: 16px;">
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94;">ORDER NUMBER</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; text-align: right;">${orderNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">PACKAGE</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #DFBA5A; text-align: right; border-top: 1px solid #1E1E2C;">${packageName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">TOTAL INVESTMENT</td>
        <td style="padding: 8px 12px; font-size: 15px; font-weight: 800; color: #ECC86A; text-align: right; border-top: 1px solid #1E1E2C;">${amountFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">ESTIMATED DELIVERY</td>
        <td style="padding: 8px 12px; font-size: 13px; color: #FFFFFF; text-align: right; border-top: 1px solid #1E1E2C;">3–5 Business Days</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        View Order in Dashboard
      </a>
    </div>
  `;
  return baseEmailWrapper(content, `Order Confirmed: ${orderNumber}`);
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
  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #22C55E;">
      ✓ Payment Successfully Verified
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${sanitizeText(customerName, 80)},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We have successfully received and verified your payment through <strong>Cashfree Payment Gateway</strong>. Your project is now scheduled for development.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #14141E; border: 1px solid #242436; border-radius: 8px; margin: 20px 0; padding: 16px;">
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94;">ORDER NUMBER</td>
        <td style="padding: 8px 12px; font-size: 13px; font-weight: 700; color: #FFFFFF; text-align: right;">${orderNumber}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">CASHFREE PAYMENT ID</td>
        <td style="padding: 8px 12px; font-size: 12px; font-family: monospace; color: #DFBA5A; text-align: right; border-top: 1px solid #1E1E2C;">${paymentId}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">AMOUNT PAID</td>
        <td style="padding: 8px 12px; font-size: 15px; font-weight: 800; color: #22C55E; text-align: right; border-top: 1px solid #1E1E2C;">${amountFormatted}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; font-size: 12px; color: #7F7F94; border-top: 1px solid #1E1E2C;">TIMESTAMP</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #FFFFFF; text-align: right; border-top: 1px solid #1E1E2C;">${paymentTime}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        Track Project Progress
      </a>
    </div>
  `;
  return baseEmailWrapper(content, `Payment Receipt: ${orderNumber}`);
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
  const content = `
    <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 800; color: #DFBA5A;">
      🎉 Your Website is Live!
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 14px; color: #A0A0B2;">
      Dear ${sanitizeText(customerName, 80)},
    </p>
    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #CCCCCC;">
      We are thrilled to announce that your bespoke digital storefront for <strong>${sanitizeText(businessName, 100)}</strong> has been successfully built, deployed, and published to the Cloudflare Edge global network!
    </p>

    <!-- Prominent Live Site Box -->
    <div style="background-color: #14141E; border: 1px solid #DFBA5A; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 11px; color: #8E8EA2; text-transform: uppercase; letter-spacing: 1px;">YOUR OFFICIAL LIVE WEBSITE</p>
      <a href="${liveUrl}" style="font-size: 18px; font-weight: 700; color: #ECC86A; text-decoration: underline; word-break: break-all;">
        ${liveUrl}
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
      <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #DFBA5A 50%, #B38D2C 100%); color: #08080C; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 6px; font-size: 13px; display: inline-block; letter-spacing: 0.5px; text-transform: uppercase;">
        Open Management Dashboard
      </a>
    </div>

    <div style="background-color: #14141E; border-left: 3px solid #22C55E; border-radius: 4px; padding: 14px 18px; margin: 24px 0 0 0;">
      <p style="margin: 0; font-size: 12px; color: #9A9AB0; line-height: 1.5;">
        <strong style="color: #FFFFFF;">Continuous Support:</strong> If you need any assistance, our dedicated engineering team is reachable on WhatsApp at <strong>+91 93610 24823</strong>.
      </p>
    </div>
  `;
  return baseEmailWrapper(content, `Your Website is Live: ${businessName}`);
}
