// ============================================================================
// VIJAY VISUALS — PREVIEW-ONLY GMAIL OAUTH DELIVERY ADAPTER
// Uses a dedicated Gmail sender with the narrow `gmail.send` scope.
// ZERO secrets, OTP codes, or email bodies are logged.
// ============================================================================

import { CloudflareEnv, isValidEmailAddress, sanitizeText } from './_shared';

/** The only OAuth scope this adapter can ever request or use. */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const GMAIL_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const PREVIEW_SENDER_NAME = 'Vijay Visuals Preview';

interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
}

export interface GmailOAuthSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface GmailOAuthSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Reads trimmed Gmail OAuth secrets without ever returning them to callers. */
function readGmailOAuthConfig(env: CloudflareEnv): GmailOAuthConfig | null {
  const clientId = String(env.GMAIL_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GMAIL_OAUTH_CLIENT_SECRET || '').trim();
  const refreshToken = String(env.GMAIL_OAUTH_REFRESH_TOKEN || '').trim();
  const senderEmail = String(env.GMAIL_SENDER_EMAIL || '').trim().toLowerCase();

  if (!clientId || !clientSecret || !refreshToken || !isValidEmailAddress(senderEmail)) {
    return null;
  }
  return { clientId, clientSecret, refreshToken, senderEmail };
}

/** Safe boolean only; never exposes credential values or sender identity. */
export function isGmailOAuthConfigured(env: CloudflareEnv): boolean {
  return Boolean(readGmailOAuthConfig(env));
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(value: string): string {
  return base64Utf8(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeHeader(value: string): string {
  const clean = sanitizeText(value, 200).replace(/[\r\n]+/g, ' ').trim();
  return `=?UTF-8?B?${base64Utf8(clean)}?=`;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Builds a minimal multipart/alternative RFC 5322 message. All headers are
 * sanitized and encoded so user-controlled values cannot inject headers.
 */
function buildRawMessage(config: GmailOAuthConfig, options: GmailOAuthSendOptions): string | null {
  const to = String(options.to || '').trim().toLowerCase();
  if (!isValidEmailAddress(to)) return null;

  const plainText = sanitizeText(options.text || options.html || 'This message contains HTML content.', 20000);
  const htmlText = String(options.html || '');
  const boundary = `vv_${Date.now()}_${randomHex(8)}`;

  const mime = [
    `From: ${encodeHeader(PREVIEW_SENDER_NAME)} <${config.senderEmail}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(options.subject || 'Notification')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(plainText),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(htmlText),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return base64Url(mime);
}

/**
 * Exchanges the refresh token for a short-lived access token. Provider error
 * bodies are deliberately discarded so secrets and recipient data cannot leak.
 */
async function getAccessToken(config: GmailOAuthConfig): Promise<string | null> {
  try {
    const res = await fetch(GMAIL_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
        scope: GMAIL_SEND_SCOPE,
      }).toString(),
    });
    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
    const token = typeof data?.access_token === 'string' ? data.access_token.trim() : '';
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Sends one message through Gmail API using OAuth. Callers receive only a
 * generic failure reason; no token, MIME body, or provider response is exposed.
 */
export async function sendGmailOAuthMessage(
  env: CloudflareEnv,
  options: GmailOAuthSendOptions
): Promise<GmailOAuthSendResult> {
  const config = readGmailOAuthConfig(env);
  if (!config) {
    return { ok: false, error: 'Gmail OAuth sender is not configured.' };
  }

  const raw = buildRawMessage(config, options);
  if (!raw) {
    return { ok: false, error: 'Invalid recipient email address.' };
  }

  const accessToken = await getAccessToken(config);
  if (!accessToken) {
    return { ok: false, error: 'Gmail OAuth token exchange failed.' };
  }

  try {
    const res = await fetch(GMAIL_SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      return { ok: false, error: 'Gmail API dispatch failed.' };
    }

    const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
    const messageId = typeof data?.id === 'string' && data.id ? data.id : `gmail_${Date.now()}`;
    return { ok: true, messageId };
  } catch {
    return { ok: false, error: 'Gmail API dispatch failed.' };
  }
}
