// ============================================================================
// VIJAY VISUALS — RESEND WEBHOOK HANDLER (CLOUDFLARE PAGES EDGE)
// Handles Resend webhook events (delivered, bounced, complained).
// Authenticity is verified with the official Svix/Resend signature scheme over
// the raw request body. D1 `notification_logs` is only touched after the
// signature and timestamp have been verified.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse, readBoundedText, safeEqual } from '../_shared';

const SVIX_SECRET_PREFIX = 'whsec_';
const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 300;

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

function decodeBase64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Svix signs `${svix-id}.${svix-timestamp}.${rawBody}` with the base64 key from whsec_*. */
async function computeSvixSignature(
  secret: string,
  messageId: string,
  timestamp: string,
  rawBody: string
): Promise<string | null> {
  if (!secret.startsWith(SVIX_SECRET_PREFIX)) return null;
  const keyBytes = decodeBase64ToBytes(secret.slice(SVIX_SECRET_PREFIX.length));
  if (!keyBytes || keyBytes.length === 0) return null;

  // Copy into a concrete ArrayBuffer so the key material is a valid BufferSource.
  const keyBuffer = new ArrayBuffer(keyBytes.length);
  new Uint8Array(keyBuffer).set(keyBytes);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedContent = `${messageId}.${timestamp}.${rawBody}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  return bytesToBase64(new Uint8Array(signature));
}

/** Official Svix replay protection: reject timestamps outside a short window. */
function isFreshTimestamp(timestamp: string): boolean {
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds)) return false;
  return Math.abs(Math.floor(Date.now() / 1000) - seconds) <= SVIX_TIMESTAMP_TOLERANCE_SECONDS;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const secret = (env.RESEND_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return errorResponse('Resend webhook signing secret is not configured.', 500);
  }

  const messageId = (request.headers.get('svix-id') || '').trim();
  const timestamp = (request.headers.get('svix-timestamp') || '').trim();
  const signatureHeader = (request.headers.get('svix-signature') || '').trim();
  if (!messageId || !timestamp || !signatureHeader) {
    return errorResponse('Missing Resend webhook signature headers.', 401);
  }
  if (!isFreshTimestamp(timestamp)) {
    return errorResponse('Resend webhook timestamp is missing, malformed, or expired.', 401);
  }

  // The exact raw body is the only value used for verification. JSON.parse is
  // deliberately deferred until after the signature has been proven valid.
  const rawBody = await readBoundedText(request);
  if (rawBody === null) return errorResponse('Webhook payload is too large.', 413);
  const expectedSignature = await computeSvixSignature(secret, messageId, timestamp, rawBody);
  if (!expectedSignature) {
    return errorResponse('Resend webhook signing secret is invalid.', 500);
  }

  const candidates = signatureHeader
    .split(/\s+/)
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3).trim())
    .filter(Boolean);
  if (candidates.length === 0) {
    return errorResponse('Missing v1 Resend webhook signature.', 401);
  }

  let signatureValid = false;
  for (const candidate of candidates) {
    if (safeEqual(candidate, expectedSignature)) {
      signatureValid = true;
      break;
    }
  }
  if (!signatureValid) {
    return errorResponse('Invalid Resend webhook signature.', 401);
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse('Invalid webhook JSON payload.', 400);
  }

  const eventType = body?.type;
  const emailId = body?.data?.email_id;

  if (env.DB && emailId && eventType) {
    try {
      let mappedStatus: 'delivered' | 'failed' | 'sent' | null = null;
      let errorDetail = '';

      if (eventType === 'email.delivered') {
        mappedStatus = 'delivered';
      } else if (eventType === 'email.bounced' || eventType === 'email.complained') {
        mappedStatus = 'failed';
        errorDetail = `Email ${String(eventType).replace('email.', '')}`;
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
