// ============================================================================
// VIJAY VISUALS — META WHATSAPP BUSINESS WEBHOOK HANDLER (CLOUDFLARE PAGES EDGE)
// Handles GET verification challenge and POST delivery receipt updates.
// POST authenticity is verified with X-Hub-Signature-256 (HMAC-SHA256 over the
// exact raw body using the Meta app secret). D1 `notification_logs` is only
// touched after verification succeeds.
// ============================================================================

import {
  PagesContext,
  handleOptions,
  jsonResponse,
  hmacSha256Hex,
  safeEqual,
} from '../_shared';

const SIGNATURE_PREFIX = 'sha256=';

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

/**
 * GET /api/webhooks/whatsapp — Meta Webhook Verification
 * Only WHATSAPP_WEBHOOK_VERIFY_TOKEN is accepted. No hardcoded or Cloud API
 * token fallback is permitted.
 */
export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const configuredToken = (env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (!configuredToken) {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || !token || !safeEqual(token, configuredToken)) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!challenge) {
    return new Response('Missing hub.challenge', { status: 400 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * POST /api/webhooks/whatsapp — Delivery Status Updates
 * Verifies Meta's official X-Hub-Signature-256 before parsing or writing.
 */
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const appSecret = (env.WHATSAPP_APP_SECRET || '').trim();
  if (!appSecret) {
    return errorResponse('WhatsApp app secret is not configured.', 500);
  }

  const signatureHeader = (request.headers.get('x-hub-signature-256') || '').trim();
  if (!signatureHeader.toLowerCase().startsWith(SIGNATURE_PREFIX)) {
    return errorResponse('Missing or malformed X-Hub-Signature-256 header.', 401);
  }
  const providedSignature = signatureHeader.slice(SIGNATURE_PREFIX.length).trim();
  if (!providedSignature) {
    return errorResponse('Missing X-Hub-Signature-256 value.', 401);
  }

  // Meta signs the exact raw JSON body; never re-stringify before verifying.
  const rawBody = await request.text();
  const expectedSignature = await hmacSha256Hex(appSecret, rawBody);
  if (!safeEqual(providedSignature.toLowerCase(), expectedSignature)) {
    return errorResponse('Invalid WhatsApp webhook signature.', 401);
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('Invalid webhook JSON payload.', 400);
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
