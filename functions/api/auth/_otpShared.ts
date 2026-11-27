// ============================================================================
// VIJAY VISUALS — SERVER-SIDE OTP SECURITY UTILITIES (CLOUDFLARE EDGE)
// Cryptographically secure 6-digit numeric OTP generation, salt-hashing,
// constant-time verification, and automatic D1 ledger assurance.
// ZERO secrets exposed in logs or API responses.
// ============================================================================

import { D1Database } from '../_shared';

export const OTP_EXPIRY_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Customer-facing delivery-failure copy. The account is never created until a
 * valid OTP is verified, so this message must never imply success.
 */
export const EMAIL_DELIVERY_UNAVAILABLE_MESSAGE =
  'Email verification is temporarily unavailable. Your account has not been created. Please try again later.';

/**
 * Generates a cryptographically secure 6-digit numeric code (100000 - 999999).
 */
export function generateSecureNumericOtp(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 900000) + 100000;
  return code.toString();
}

/**
 * Generates a random cryptographic hex salt.
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes a SHA-256 digest of salt:otp.
 */
export async function hashOtp(otp: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${otp.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string equality comparison to prevent timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Ensures the `auth_email_otps` table is accessible in D1.
 * Verifies table accessibility with a lightweight check, avoiding multi-statement runtime DDL.
 */
export async function ensureOtpTable(db: D1Database): Promise<void> {
  try {
    // 1. Fast read-probe: check if table is accessible
    await db.prepare('SELECT 1 FROM auth_email_otps LIMIT 1').run();
  } catch {
    // 2. Fallback for unmigrated local dev: single-statement table creation without multi-statement exec
    const ddl = `
      CREATE TABLE IF NOT EXISTS auth_email_otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'registration',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        expires_at TEXT NOT NULL,
        resend_available_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip_address TEXT NOT NULL DEFAULT ''
      )
    `;
    try {
      await db.prepare(ddl).run();
    } catch (err: any) {
      console.error('Failed to access or initialize auth_email_otps table in D1:', err);
      throw new Error('Database initialization failed for OTP persistence.', { cause: err });
    }
  }
}
