// ============================================================================
// POST /api/proposals/:id/delivery — Multi-Channel Delivery (WhatsApp & Email)
// Formats personalized messages, integrates Resend transactional email,
// integrates Meta WhatsApp Business Cloud API with click-to-chat fallback,
// and logs delivery audit records.
// ============================================================================

import { AuthenticatedUser, requireUser } from '../../_auth';
import { PLATFORM_CONTACT } from '../../_platformContact';
import { getSafeRequestOrigin } from '../../payments/_cashfree';
import {
  PagesContext,
  errorJson,
  handleOptions,
  json,
  parseJsonBody,
  safeEqual,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';
import { sendTransactionalEmail } from '../../_email';
import { sendWhatsAppNotification } from '../../_whatsapp';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/**
 * Delivery authorization is intentionally strict: the proposal owner, a
 * super-admin, or a caller holding the unguessable proposal token. Guessed
 * numeric IDs from unrelated authenticated users are treated as not found.
 */
export function isAuthorizedProposalDelivery(
  proposal: Record<string, any>,
  user: AuthenticatedUser,
  token?: string
): boolean {
  if (user.isSuperAdmin) return true;
  const ownerId = String(proposal.owner_id || '');
  if (
    ownerId &&
    (ownerId === user.id || ownerId === user.authSubject)
  ) {
    return true;
  }

  const expectedToken = String(proposal.secure_token || '');
  const suppliedToken = String(token || '').trim();
  if (expectedToken.length < 12 || suppliedToken.length < 12) return false;
  if (!safeEqual(suppliedToken, expectedToken)) return false;

  const expiresAt = Date.parse(String(proposal.expires_at || ''));
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

/**
 * Non-admin callers may only send to the stored customer contact. A custom
 * recipient must exactly match that stored value; super-admins may explicitly
 * override it for support/recovery delivery.
 */
export function resolveProposalDeliveryRecipient(
  proposal: Record<string, any>,
  channel: 'whatsapp' | 'email',
  customRecipient: string | undefined,
  user: AuthenticatedUser
): string {
  const stored = channel === 'whatsapp'
    ? String(proposal.customer_phone || '')
    : String(proposal.customer_email || '');
  const custom = String(customRecipient || '').trim();
  if (!custom) return stored;

  const normalize = (value: string) => channel === 'whatsapp'
    ? value.replace(/\D/g, '')
    : value.trim().toLowerCase();
  if (user.isSuperAdmin) return custom;
  return normalize(custom) === normalize(stored) ? stored : '';
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
    token?: string;
  }>(request);

  if (!body || (body.channel !== 'whatsapp' && body.channel !== 'email')) {
    return errorJson('Channel (whatsapp or email) is required.', 400);
  }

  const proposal = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!proposal || !isAuthorizedProposalDelivery(proposal, auth.user, body.token)) {
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.isSuperAdmin ? 'super_admin' : 'business_owner',
      action: 'PROPOSAL_DELIVERY_DENIED',
      targetType: 'proposal',
      targetId: String(id),
      details: { channel: body.channel, reason: 'authorization_failed' },
    });
    return errorJson('Proposal not found.', 404);
  }

  const recipient = resolveProposalDeliveryRecipient(
    proposal,
    body.channel,
    body.customRecipient,
    auth.user
  );
  if (!recipient) {
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.isSuperAdmin ? 'super_admin' : 'business_owner',
      action: 'PROPOSAL_DELIVERY_DENIED',
      targetType: 'proposal',
      targetId: String(id),
      details: { channel: body.channel, reason: 'custom_recipient_rejected' },
    });
    return errorJson('Custom recipients are not permitted for this proposal.', 403);
  }

  const baseUrl = getSafeRequestOrigin(request, env);
  const proposalUrl = `${baseUrl}/proposal/${proposal.secure_token}`;
  const idempotencyVersion = String(proposal.updated_at || 'initial').replace(/[^A-Za-z0-9]/g, '') || 'initial';
  const amountFormatted = `₹${(proposal.grand_total_inr || proposal.development_fee_inr || 7999).toLocaleString('en-IN')}`;

  if (body.channel === 'whatsapp') {
    const rawPhone = recipient.replace(/[^0-9]/g, '');
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
      `💰 *Quoted Amount:* ${amountFormatted}. Applicable taxes will be confirmed before payment.`,
      `⏱ *Timeline:* Quoted after scope review`,
      ``,
      `🔍 *Interactive Future Website Preview & Proposal Link:*`,
      `${proposalUrl}`,
      ``,
      `You can review your future online storefront, download the luxury A4 PDF proposal, and approve directly on your phone.`,
      ``,
      `Warm regards,`,
      `Vijay Visuals — Digital Agency`,
      `Official Mobile: ${PLATFORM_CONTACT.phone}`,
      `Official Email: ${PLATFORM_CONTACT.email}`,
      `Hyderabad, Telangana`,
    ].join('\n');

    // Attempt Meta WhatsApp Business Cloud API notification (falls back safely to click-to-chat)
    const waResult = await sendWhatsAppNotification(env, {
      toPhone: cleanPhone,
      messageText,
      eventType: 'proposal_shared',
      websiteId: proposal.website_id,
      idempotencyKey: `prop_wa_${id}_${idempotencyVersion}`,
    });

    // Update counts & status in proposal ledger
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET whatsapp_share_count = whatsapp_share_count + 1,
           delivery_status = CASE WHEN delivery_status IN ('draft', 'ready') THEN 'shared' ELSE delivery_status END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.isSuperAdmin ? 'super_admin' : 'business_owner',
      action: 'PROPOSAL_DELIVERY_DISPATCHED',
      targetType: 'proposal',
      targetId: String(id),
      details: {
        channel: 'whatsapp',
        deliveryStatus: waResult.status,
        proposalNumber: sanitizeText(proposal.proposal_number, 80),
      },
    });

    return json({
      channel: 'whatsapp',
      recipientPhone: cleanPhone,
      messageText,
      clickToChatUrl: waResult.clickToChatUrl,
      deliveryStatus: waResult.status,
      providerMessageId: waResult.providerMessageId || null,
      providerNotice: waResult.notice || null,
      message: waResult.ok
        ? `WhatsApp message automated dispatch sent to ${cleanPhone}.`
        : `WhatsApp message prepared. Click-to-chat link ready for direct dispatch.`,
    });
  }

  if (body.channel === 'email') {
    const recipientEmail = sanitizeText(recipient, 140);
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
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">QUOTED AMOUNT: <strong style="color: #ECC86A; font-size: 16px;">${amountFormatted}</strong> · Applicable taxes will be confirmed before payment.</p>
            <p style="margin: 4px 0; font-size: 13px; color: #8E8EA2;">TIMELINE: <strong style="color: #FFFFFF;">Quoted after scope review</strong></p>
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
          <p style="margin: 4px 0;">Official Mobile: <a href="tel:+${PLATFORM_CONTACT.whatsappNumber}" style="color: #ECC86A; text-decoration: none;">${PLATFORM_CONTACT.phone}</a> · Official Email: <a href="mailto:${PLATFORM_CONTACT.email}" style="color: #ECC86A; text-decoration: none;">${PLATFORM_CONTACT.email}</a></p>
          <p style="margin: 4px 0;">Customer Ownership of Domain & Payment Gateway Guaranteed · Hyderabad, Telangana</p>
        </div>
      </div>
    `;

    // Dispatch transactional email via Resend
    const emailResult = await sendTransactionalEmail(env, {
      to: recipientEmail,
      subject,
      html: htmlBody,
      eventType: 'proposal_email_sent',
      websiteId: proposal.website_id,
      idempotencyKey: `prop_em_${id}_${idempotencyVersion}`,
    });

    const emailSent = emailResult.ok;

    // Update counts & status in proposal ledger
    await env.DB.prepare(
      `UPDATE platform_proposals
       SET email_sent_count = CASE WHEN ? = 1 THEN email_sent_count + 1 ELSE email_sent_count END,
           delivery_status = CASE WHEN ? = 1 THEN 'email_sent' ELSE delivery_status END,
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(emailSent ? 1 : 0, emailSent ? 1 : 0, id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.isSuperAdmin ? 'super_admin' : 'business_owner',
      action: 'PROPOSAL_DELIVERY_DISPATCHED',
      targetType: 'proposal',
      targetId: String(id),
      details: {
        channel: 'email',
        deliveryStatus: emailResult.status,
        proposalNumber: sanitizeText(proposal.proposal_number, 80),
      },
    });

    return json({
      channel: 'email',
      recipientEmail,
      subject,
      emailSent,
      providerConfigured: emailResult.status !== 'setup_required',
      providerNotice: emailResult.notice || null,
      providerMessageId: emailResult.providerMessageId || null,
      htmlPreview: htmlBody,
      deliveryStatus: emailSent ? 'email_sent' : (proposal.delivery_status || 'ready'),
      message: emailSent
        ? `Proposal email successfully dispatched to ${recipientEmail}.`
        : `Email template prepared for ${recipientEmail}. ${emailResult.notice || ''}`,
    });
  }

  return errorJson('Invalid delivery channel.', 400);
}
