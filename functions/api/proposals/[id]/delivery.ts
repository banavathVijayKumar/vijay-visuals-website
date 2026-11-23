// ============================================================================
// POST /api/proposals/:id/delivery — Multi-Channel Delivery (WhatsApp & Email)
// Formats personalized messages, integrates transactional email providers,
// builds WhatsApp click-to-chat links, and logs delivery audit records.
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { env, params, request } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const id = Number(params?.id);
  if (!id) return errorJson('Invalid proposal ID.', 400);

  const body = await parseJsonBody<{
    channel: 'whatsapp' | 'email';
    customRecipient?: string;
  }>(request);

  if (!body || !body.channel) return errorJson('Channel (whatsapp or email) is required.', 400);

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal) return errorJson('Proposal not found.', 404);

  const baseUrl = 'https://master.vijay-visuals-site.pages.dev';
  const proposalUrl = `${baseUrl}/proposal/${proposal.secure_token}`;
  const amountFormatted = `₹${(proposal.grand_total_inr || proposal.development_fee_inr || 7999).toLocaleString('en-IN')}`;

  if (body.channel === 'whatsapp') {
    const rawPhone = (body.customRecipient || proposal.customer_phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.startsWith('91') && rawPhone.length === 12
      ? rawPhone
      : rawPhone.length === 10
      ? `91${rawPhone}`
      : rawPhone;

    const messageText = [
      `🌟 *VIJAY VISUALS — Website Proposal for ${proposal.business_name}* 🌟`,
      ``,
      `Hello ${proposal.customer_name},`,
      `We have crafted a premium, custom website proposal and responsive business future preview for *${proposal.business_name}*.`,
      ``,
      `📋 *Package:* ${proposal.package_tier || 'STARTER'} Website Package`,
      `💰 *Total Investment:* ${amountFormatted} (Transparent 18% GST itemized)`,
      `⏱ *Delivery Timeline:* 3–5 Business Days`,
      ``,
      `🔍 *Interactive Future Website Preview & Proposal Link:*`,
      `${proposalUrl}`,
      ``,
      `You can review your future online storefront, download the luxury A4 PDF proposal, and approve directly on your phone.`,
      ``,
      `Warm regards,`,
      `Vijay Visuals — Digital Agency`,
      `Official Mobile: +91 9381362201`,
      `Official Email: vk66278@gmail.com`,
      `Hyderabad, Telangana`,
    ].join('\n');

    const clickToChatUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    // Update counts & status
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET whatsapp_share_count = whatsapp_share_count + 1,
           delivery_status = CASE WHEN delivery_status IN ('draft', 'ready') THEN 'shared' ELSE delivery_status END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(id)
      .run();

    // Log notification
    await env.DB.prepare(
      `INSERT INTO notification_logs (
        website_id, recipient_contact, channel, event_type, subject,
        message_preview, consent_verified, delivery_status, created_at
      ) VALUES (?, ?, 'whatsapp', 'proposal_shared', 'Website Proposal WhatsApp Dispatch', ?, 1, 'sent', datetime('now'))`
    )
      .bind(proposal.website_id, cleanPhone, messageText.slice(0, 200))
      .run();

    return json({
      channel: 'whatsapp',
      recipientPhone: cleanPhone,
      messageText,
      clickToChatUrl,
      deliveryStatus: 'shared',
      message: 'WhatsApp message prepared with prefilled proposal details.',
    });
  }

  if (body.channel === 'email') {
    const recipientEmail = sanitizeText(body.customRecipient || proposal.customer_email || '', 140);
    const subject = `Vijay Visuals — Official Website Proposal & Future Preview: ${proposal.business_name}`;

    const htmlBody = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0A0A0F; color: #FFFFFF; padding: 32px 20px; max-width: 600px; margin: 0 auto; border-radius: 8px; border: 1px solid #D4AF37;">
        <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #222230;">
          <h1 style="color: #D4AF37; margin: 0; font-size: 24px; letter-spacing: 2px;">VIJAY VISUALS</h1>
          <p style="color: #8E8EA2; font-size: 11px; margin-top: 4px; text-transform: uppercase;">Premium Digital Agency & Website Solutions</p>
        </div>

        <div style="padding: 24px 0;">
          <h2 style="color: #FFFFFF; font-size: 18px; margin-top: 0;">Dear ${proposal.customer_name},</h2>
          <p style="color: #CCCCCC; font-size: 14px; line-height: 1.6;">
            We are excited to share the bespoke digital proposal and interactive online preview tailored specifically for <strong>${proposal.business_name}</strong>.
          </p>

          <div style="background-color: #12121A; border: 1px solid #2A2A38; border-radius: 6px; padding: 18px; margin: 20px 0;">
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">PROPOSAL NUMBER: <strong style="color: #FFFFFF;">${proposal.proposal_number}</strong></p>
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">SELECTED TIER: <strong style="color: #D4AF37;">${proposal.package_tier || 'STARTER'}</strong></p>
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">TOTAL INVESTMENT: <strong style="color: #ECC86A; font-size: 16px;">${amountFormatted}</strong> (incl. 18% GST)</p>
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">TIMELINE: <strong style="color: #FFFFFF;">3–5 Business Days</strong></p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${proposalUrl}" style="background: linear-gradient(135deg, #ECC86A 0%, #D4AF37 50%, #B89628 100%); color: #08080A; text-decoration: none; padding: 14px 28px; font-weight: bold; border-radius: 6px; font-size: 14px; display: inline-block;">
              View Interactive Proposal & Download PDF
            </a>
          </div>

          <p style="color: #8E8EA2; font-size: 12px; line-height: 1.5;">
            Before paying, you can preview exactly how your homepage, catalog, checkout, and mobile layouts will appear, and download your luxury A4 print-ready PDF proposal.
          </p>
        </div>

        <div style="border-top: 1px solid #222230; padding-top: 20px; font-size: 11px; color: #717182; text-align: center;">
          <p style="margin: 0; color: #D4AF37; font-weight: bold;">VIJAY VISUALS · Digital Architecture</p>
          <p style="margin: 4px 0;">Official Mobile: <a href="tel:+919381362201" style="color: #ECC86A; text-decoration: none;">+91 9381362201</a> · Official Email: <a href="mailto:vk66278@gmail.com" style="color: #ECC86A; text-decoration: none;">vk66278@gmail.com</a></p>
          <p style="margin: 4px 0;">Customer Ownership of Domain & Payment Gateway Guaranteed · Hyderabad, Telangana</p>
        </div>
      </div>
    `;

    // Check if transactional email provider API key is present in Cloudflare Pages env
    const resendApiKey = (env as any)?.RESEND_API_KEY;
    const sendgridApiKey = (env as any)?.SENDGRID_API_KEY;

    let emailSent = false;
    let providerNotice = '';

    if (resendApiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Vijay Visuals <proposals@vijayvisuals.com>',
            to: recipientEmail,
            subject,
            html: htmlBody,
          }),
        });
        if (emailRes.ok) emailSent = true;
      } catch (e) {
        console.error('Resend email error:', e);
      }
    } else if (sendgridApiKey) {
      try {
        const emailRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: recipientEmail }] }],
            from: { email: 'proposals@vijayvisuals.com', name: 'Vijay Visuals' },
            subject,
            content: [{ type: 'text/html', value: htmlBody }],
          }),
        });
        if (emailRes.status === 202) emailSent = true;
      } catch (e) {
        console.error('SendGrid email error:', e);
      }
    }

    if (!resendApiKey && !sendgridApiKey) {
      providerNotice = 'Transactional email provider (RESEND_API_KEY / SENDGRID_API_KEY) is not yet configured in Cloudflare Pages. Template generated and ready for direct send.';
    }

    // Update counts & status
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET email_sent_count = email_sent_count + 1,
           delivery_status = CASE WHEN delivery_status IN ('draft', 'ready', 'shared') THEN 'email_sent' ELSE delivery_status END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(id)
      .run();

    // Log in notification_logs
    await env.DB.prepare(
      `INSERT INTO notification_logs (
        website_id, recipient_contact, channel, event_type, subject,
        message_preview, consent_verified, delivery_status, created_at
      ) VALUES (?, ?, 'email', 'proposal_email_sent', ?, ?, 1, ?, datetime('now'))`
    )
      .bind(
        proposal.website_id,
        recipientEmail,
        subject,
        `Proposal #${proposal.proposal_number} sent to ${recipientEmail}`,
        emailSent ? 'delivered' : 'setup_required'
      )
      .run();

    return json({
      channel: 'email',
      recipientEmail,
      subject,
      emailSent,
      providerConfigured: Boolean(resendApiKey || sendgridApiKey),
      providerNotice,
      htmlPreview: htmlBody,
      deliveryStatus: emailSent ? 'email_sent' : 'ready',
      message: emailSent
        ? `Proposal email successfully dispatched to ${recipientEmail}.`
        : `Email template prepared for ${recipientEmail}. ${providerNotice}`,
    });
  }

  return errorJson('Invalid delivery channel.', 400);
}
