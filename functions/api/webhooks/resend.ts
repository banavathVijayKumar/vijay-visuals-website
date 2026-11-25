// ============================================================================
// VIJAY VISUALS — RESEND WEBHOOK HANDLER (CLOUDFLARE PAGES EDGE)
// Handles Resend webhook events (delivered, bounced, complained).
// Updates D1 `notification_logs` to accurately distinguish 'delivered' vs 'sent' vs 'failed'.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventType = body?.type; // e.g. 'email.delivered', 'email.bounced'
  const emailId = body?.data?.email_id;

  if (env.DB && emailId && eventType) {
    try {
      let mappedStatus: 'delivered' | 'failed' | 'sent' | null = null;
      let errorDetail = '';

      if (eventType === 'email.delivered') {
        mappedStatus = 'delivered';
      } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
        mappedStatus = 'failed';
        errorDetail = `Email ${eventType.replace('email.', '')}`;
      }

      if (mappedStatus) {
        await env.DB.prepare(
          `UPDATE notification_logs
           SET delivery_status = ?,
               error_detail = CASE WHEN ? = 'failed' THEN ? ELSE error_detail END
           WHERE provider_message_id = ?`
        )
          .bind(mappedStatus, mappedStatus, errorDetail, emailId)
          .run();
      }
    } catch (err) {
      console.error('Error updating Resend delivery status:', err);
    }
  }

  return jsonResponse({ ok: true });
}
