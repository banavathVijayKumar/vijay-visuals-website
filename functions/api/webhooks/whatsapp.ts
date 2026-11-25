// ============================================================================
// VIJAY VISUALS — META WHATSAPP BUSINESS WEBHOOK HANDLER (CLOUDFLARE PAGES EDGE)
// Handles GET verification challenge and POST delivery receipt updates.
// Updates D1 `notification_logs` with verified delivery timestamps.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/**
 * GET /api/webhooks/whatsapp — Meta Webhook Verification
 */
export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expectedToken = (env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_CLOUD_API_TOKEN || 'vijay_visuals_wa_verify').trim();

  if (mode === 'subscribe' && token === expectedToken) {
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Forbidden', { status: 403 });
}

/**
 * POST /api/webhooks/whatsapp — Delivery Status Updates
 */
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (env.DB && body?.entry) {
    try {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const statuses = change.value?.statuses || [];
          for (const statusObj of statuses) {
            const messageId = statusObj.id;
            const newStatus = statusObj.status; // 'sent', 'delivered', 'read', 'failed'
            if (messageId && newStatus) {
              const mappedStatus =
                newStatus === 'delivered' || newStatus === 'read'
                  ? 'delivered'
                  : newStatus === 'sent'
                  ? 'sent'
                  : newStatus === 'failed'
                  ? 'failed'
                  : 'sent';

              await env.DB.prepare(
                `UPDATE notification_logs
                 SET delivery_status = ?,
                     error_detail = CASE WHEN ? = 'failed' THEN ? ELSE error_detail END
                 WHERE provider_message_id = ?`
              )
                .bind(
                  mappedStatus,
                  mappedStatus,
                  statusObj.errors?.[0]?.message || 'WhatsApp delivery failed',
                  messageId
                )
                .run();
            }
          }
        }
      }
    } catch (err) {
      console.error('Error updating WhatsApp delivery receipts:', err);
    }
  }

  return jsonResponse({ ok: true });
}
