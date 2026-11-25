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
 * Ensures the `auth_email_otps` table and indexes exist in D1.
 * Safely guards optional db.exec method and throws if required persistence cannot be verified.
 */
export async function ensureOtpTable(db: D1Database): Promise<void> {
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
    if (typeof db.exec === 'function') {
      await db.exec(`
        ${ddl};
        CREATE INDEX IF NOT EXISTS idx_auth_email_otps_lookup ON auth_email_otps(email, purpose, consumed_at);
        CREATE INDEX IF NOT EXISTS idx_auth_email_otps_expiry ON auth_email_otps(expires_at);
      `);
    } else {
      await db.prepare(ddl).run();
      try {
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_email_otps_lookup ON auth_email_otps(email, purpose, consumed_at)').run();
        await db.prepare('CREATE INDEX IF NOT EXISTS idx_auth_email_otps_expiry ON auth_email_otps(expires_at)').run();
      } catch {
        // Indexes are non-fatal optimizations if already present
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || err).toLowerCase();
    if (!msg.includes('already exists')) {
      console.error('Failed to ensure auth_email_otps table in D1:', err);
      throw new Error('Database initialization failed for OTP persistence.', { cause: err });
    }
  }
}
