// ============================================================================
// Lifecycle notification dispatch (order → owner → delivery → customer).
//
// Compliance boundary for this deployment:
//   * Writes one durable IN-APP notification_logs row per lifecycle event.
//   * Records external provider readiness but deliberately makes NO external
//     provider call: real customer contact requires separate approval/config.
//   * Never blocks or fails the underlying order mutation.
// ============================================================================

import { CloudflareEnv, getNotificationChannelStatus, sanitizeText } from './_shared';
import { redactSensitiveLogText } from './_email';
import { maskContactForLog, redactPiiText } from './_pii';

export const LIFECYCLE_NOTIFICATION_EVENTS = new Set([
  'new_order_owner_alert',
  'order_assigned',
  'order_accepted',
  'order_status_updated',
  'order_ready_for_pickup',
  'order_out_for_delivery',
  'order_delivered',
  'order_returned',
  'order_cancelled',
  'proof_of_delivery_recorded',
  'delivery_exception',
  'rider_earnings_posted',
]);

export interface LifecycleNotificationInput {
  websiteId: string;
  eventType: string;
  subject: string;
  message: string;
  recipientUserId?: string | null;
  recipientContact?: string | null;
}

export type LifecycleNotificationResult =
  | { recorded: false; reason: 'unavailable' | 'invalid' }
  | { recorded: true; status: 'in_app'; externalChannelsReady: string[] };

/**
 * Records a lifecycle notification. Safe to call after a successful write;
 * failures are swallowed so notifications can never turn a saved order into a
 * client-visible failure.
 */
export async function dispatchLifecycleNotification(
  env: CloudflareEnv,
  input: LifecycleNotificationInput
): Promise<LifecycleNotificationResult> {
  if (!env.DB) return { recorded: false, reason: 'unavailable' };

  const websiteId = sanitizeText(input.websiteId, 120);
  const eventType = sanitizeText(input.eventType, 60);
  if (!websiteId || !LIFECYCLE_NOTIFICATION_EVENTS.has(eventType)) {
    return { recorded: false, reason: 'invalid' };
  }

  const readiness = getNotificationChannelStatus(env);
  const externalChannelsReady = (['email', 'whatsapp', 'sms'] as const).filter(
    (channel) => readiness[channel] === 'configured'
  );

  // notification_logs is durable: never persist a raw customer email/phone or
  // a name/POD reference interpolated into a subject/message. Only masked
  // display forms and non-sensitive operational metadata are stored.
  const piiValues = [input.recipientContact];
  const subject = redactPiiText(
    redactSensitiveLogText(sanitizeText(input.subject || eventType, 160)),
    { values: piiValues }
  );
  const message = redactPiiText(
    redactSensitiveLogText(sanitizeText(input.message, 1500)),
    { values: piiValues }
  );
  const recipientContact = maskContactForLog(sanitizeText(input.recipientContact || '', 140));

  const detailParts = [
    'External delivery is not enabled for this deployment; in-app record only.',
    `email=${readiness.email}`,
    `whatsapp=${readiness.whatsapp}`,
    `sms=${readiness.sms}`,
  ];
  if (externalChannelsReady.length > 0) {
    detailParts.push(`configured_but_contact_not_authorized=${externalChannelsReady.join(',')}`);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO notification_logs
        (website_id, recipient_user_id, recipient_contact, channel, event_type,
         subject, message_preview, consent_verified, delivery_status,
         provider_message_id, error_detail, created_at)
       VALUES (?, ?, ?, 'in_app', ?, ?, ?, 1, 'delivered', '', ?, datetime('now'))`
    )
      .bind(
        websiteId,
        sanitizeText(input.recipientUserId || '', 120) || null,
        recipientContact,
        eventType,
        subject,
        message,
        detailParts.join(' | ')
      )
      .run();
    return { recorded: true, status: 'in_app', externalChannelsReady };
  } catch {
    // notification_logs is not available on this deployment. Never fail the
    // order/delivery write because a notification could not be recorded.
    return { recorded: false, reason: 'unavailable' };
  }
}
