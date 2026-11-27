// ============================================================================
// Delivery POD OTP helper.
//
// Reuses the existing OTP ledger without a migration. The production CHECK
// permits purpose='login', which currently has no consumer. All rows are
// scoped by a server-minted metadata marker containing only the order identity
// and website, never client-supplied authorization data.
//
// The code is shown only by an authenticated, order-owning customer endpoint;
// no email, SMS, or external notification provider is called.
// ============================================================================

import type { CloudflareEnv } from '../_shared';
import {
  ensureOtpTable,
  generateSalt,
  generateSecureNumericOtp,
  hashOtp,
  timingSafeEqual,
} from '../auth/_otpShared';

const DELIVERY_OTP_PURPOSE = 'login';

export interface DeliveryOtpMetadata {
  kind: 'delivery_pod';
  orderId: number;
  websiteId: string;
}

export function deliveryOtpMetadata(orderId: number, websiteId: string): string {
  const metadata: DeliveryOtpMetadata = {
    kind: 'delivery_pod',
    orderId: Number(orderId),
    websiteId: String(websiteId),
  };
  return JSON.stringify(metadata);
}

export interface IssueDeliveryOtpResult {
  ok: boolean;
  otp?: string;
  code?: 'invalid' | 'cooldown' | 'database_unavailable' | 'issued';
  retryAfterSeconds?: number;
}

export async function issueDeliveryOtp(
  env: CloudflareEnv,
  input: { orderId: number; websiteId: string; email: string }
): Promise<IssueDeliveryOtpResult> {
  const orderId = Number(input.orderId);
  const websiteId = String(input.websiteId || '');
  // The ledger identity may be an email OR the full phone on a guest order. No
  // provider message is sent; this is only a server-side correlation value.
  const identity = String(input.email || '').toLowerCase();
  if (!env.DB || !Number.isInteger(orderId) || !websiteId || !identity) {
    return { ok: false, code: 'invalid' };
  }

  try {
    await ensureOtpTable(env.DB);
    const metadata = deliveryOtpMetadata(orderId, websiteId);

    const cooling = await env.DB.prepare(
      `SELECT id, resend_available_at FROM auth_email_otps
       WHERE purpose = ? AND metadata_json = ? AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
      .bind(DELIVERY_OTP_PURPOSE, metadata)
      .first<{ id: number; resend_available_at: string }>();

    if (cooling) {
      const retryAt = new Date(String(cooling.resend_available_at).replace(' ', 'T') + 'Z').getTime();
      const retryAfterSeconds = Number.isFinite(retryAt)
        ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
        : 60;
      if (retryAfterSeconds > 0) {
        return { ok: false, code: 'cooldown', retryAfterSeconds };
      }
    }

    await env.DB.prepare(
      `UPDATE auth_email_otps SET consumed_at = datetime('now')
       WHERE purpose = ? AND metadata_json = ? AND consumed_at IS NULL`
    )
      .bind(DELIVERY_OTP_PURPOSE, metadata)
      .run();

    const otp = generateSecureNumericOtp();
    const salt = generateSalt();
    const hash = await hashOtp(otp, salt);
    await env.DB.prepare(
      `INSERT INTO auth_email_otps
        (email, otp_hash, salt, purpose, metadata_json, attempts, max_attempts,
         expires_at, resend_available_at, consumed_at, created_at, ip_address)
       VALUES (?, ?, ?, ?, ?, 0, 5, datetime('now', '+10 minutes'),
               datetime('now', '+60 seconds'), NULL, datetime('now'), '')`
    )
      .bind(identity, hash, salt, DELIVERY_OTP_PURPOSE, metadata)
      .run();

    return { ok: true, otp, code: 'issued' };
  } catch {
    return { ok: false, code: 'database_unavailable' };
  }
}

export type VerifyDeliveryOtpResult =
  | { ok: true; otpId: number; consumed: boolean }
  | {
      ok: false;
      code:
        | 'invalid'
        | 'not_found'
        | 'max_attempts'
        | 'expired'
        | 'incorrect'
        | 'no_longer_valid'
        | 'database_unavailable';
      remainingAttempts?: number;
    };

/**
 * Verifies a code against the order-scoped ledger. `consume: false` lets the
 * secure-POD writer complete its conditional order/assignment writes before the
 * one-time code is spent, so a failed delivery write does not burn the code.
 */
export async function verifyDeliveryOtp(
  env: CloudflareEnv,
  input: { orderId: number; websiteId: string; otp: string; consume?: boolean }
): Promise<VerifyDeliveryOtpResult> {
  const orderId = Number(input.orderId);
  const websiteId = String(input.websiteId || '');
  const otp = String(input.otp || '').trim();
  if (!env.DB || !Number.isInteger(orderId) || !websiteId || !/^\d{6}$/.test(otp)) {
    return { ok: false, code: 'invalid' };
  }

  try {
    await ensureOtpTable(env.DB);
    const metadata = deliveryOtpMetadata(orderId, websiteId);
    const record = await env.DB.prepare(
      `SELECT id, otp_hash, salt, attempts, max_attempts, expires_at
       FROM auth_email_otps
       WHERE purpose = ? AND metadata_json = ? AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
      .bind(DELIVERY_OTP_PURPOSE, metadata)
      .first<{
        id: number;
        otp_hash: string;
        salt: string;
        attempts: number;
        max_attempts: number;
        expires_at: string;
      }>();

    if (!record) return { ok: false, code: 'not_found' };

    if (Number(record.attempts) >= Number(record.max_attempts)) {
      await env.DB.prepare(
        "UPDATE auth_email_otps SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL"
      )
        .bind(record.id)
        .run();
      return { ok: false, code: 'max_attempts' };
    }

    const expired = await env.DB.prepare(
      "SELECT 1 AS expired FROM auth_email_otps WHERE id = ? AND datetime('now') > expires_at LIMIT 1"
    )
      .bind(record.id)
      .first<{ expired: number }>();
    if (expired?.expired) {
      await env.DB.prepare(
        "UPDATE auth_email_otps SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL"
      )
        .bind(record.id)
        .run();
      return { ok: false, code: 'expired' };
    }

    const computedHash = await hashOtp(otp, String(record.salt));
    if (!timingSafeEqual(computedHash, String(record.otp_hash))) {
      const claim = await env.DB.prepare(
        `UPDATE auth_email_otps
         SET attempts = attempts + 1,
             consumed_at = CASE WHEN attempts + 1 >= max_attempts THEN datetime('now') ELSE consumed_at END
         WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts`
      )
        .bind(record.id)
        .run();
      if (!claim.meta?.changes) return { ok: false, code: 'max_attempts' };
      const remaining = Math.max(0, Number(record.max_attempts) - Number(record.attempts) - 1);
      return { ok: false, code: 'incorrect', remainingAttempts: remaining };
    }

    if (input.consume === false) {
      return { ok: true, otpId: Number(record.id), consumed: false };
    }

    const consumed = await consumeDeliveryOtpById(env, Number(record.id));
    if (!consumed) return { ok: false, code: 'no_longer_valid' };

    return { ok: true, otpId: Number(record.id), consumed: true };
  } catch {
    return { ok: false, code: 'database_unavailable' };
  }
}

/** Atomically spends an already-verified, unexpired order-scoped OTP row. */
export async function consumeDeliveryOtpById(
  env: CloudflareEnv,
  otpId: number
): Promise<boolean> {
  if (!env.DB || !Number.isInteger(otpId) || otpId <= 0) return false;
  try {
    await ensureOtpTable(env.DB);
    const result = await env.DB.prepare(
      `UPDATE auth_email_otps SET consumed_at = datetime('now')
       WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts
         AND datetime('now') <= expires_at`
    )
      .bind(otpId)
      .run();
    return Number(result.meta?.changes || 0) > 0;
  } catch {
    return false;
  }
}
