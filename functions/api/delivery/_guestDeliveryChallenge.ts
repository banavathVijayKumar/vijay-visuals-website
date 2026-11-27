// ============================================================================
// Signed, short-lived order challenge for guest delivery-code requests.
//
// Uses only existing shared HMAC helpers and existing env secrets. The payload
// contains an order number and expiry only: no OTP, phone, email, or PII.
// ============================================================================

import { hmacSha256Hex, safeEqual } from '../_shared';

const CHALLENGE_TTL_SECONDS = 10 * 60;

export interface DeliveryChallenge {
  orderNumber: string;
  expiresAt: number;
  signature: string;
}

function challengeSecret(env: { [key: string]: any }): string {
  return String(
    env?.DELIVERY_CHALLENGE_SECRET ||
      env?.CRON_SECRET ||
      env?.CASHFREE_WEBHOOK_SECRET ||
      ''
  ).trim();
}

function challengeMessage(orderNumber: string, expiresAt: number): string {
  return `delivery-code:${String(orderNumber || '').trim().toUpperCase()}:${expiresAt}`;
}

export function deliveryChallengeEnabled(env: { [key: string]: any }): boolean {
  return challengeSecret(env).length > 0;
}

export async function createDeliveryChallenge(
  env: { [key: string]: any },
  orderNumber: string
): Promise<DeliveryChallenge | null> {
  const secret = challengeSecret(env);
  const normalized = String(orderNumber || '').trim().toUpperCase();
  if (!secret || !normalized) return null;
  const expiresAt = Date.now() + CHALLENGE_TTL_SECONDS * 1000;
  const signature = await hmacSha256Hex(secret, challengeMessage(normalized, expiresAt));
  return { orderNumber: normalized, expiresAt, signature };
}

export async function verifyDeliveryChallenge(
  env: { [key: string]: any },
  input: { orderNumber?: unknown; expiresAt?: unknown; signature?: unknown }
): Promise<boolean> {
  const secret = challengeSecret(env);
  const normalized = String(input.orderNumber || '').trim().toUpperCase();
  const expiresAt = Number(input.expiresAt);
  const signature = String(input.signature || '').trim();
  if (!secret || !normalized || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (!Number.isInteger(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = await hmacSha256Hex(secret, challengeMessage(normalized, expiresAt));
  return safeEqual(expected.toLowerCase(), signature.toLowerCase());
}
