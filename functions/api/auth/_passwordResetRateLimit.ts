// ============================================================================
// Server-side password reset request rate limiting for Cloudflare Pages.
// Stores only a one-way hash of the normalized email plus timing metadata.
// No Supabase dashboard or hosted configuration changes are required.
// ============================================================================

import { CloudflareEnv, D1Database } from '../_shared';

export const PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const MAX_PASSWORD_RESET_REQUESTS_PER_HOUR = 5;

export type PasswordResetRateLimitCode =
  | 'OK'
  | 'COOLDOWN'
  | 'HOURLY_LIMIT'
  | 'UNAVAILABLE';

export interface PasswordResetRateLimitResult {
  allowed: boolean;
  code: PasswordResetRateLimitCode;
  remainingSeconds: number;
  emailHash?: string;
}

export class PasswordResetRateLimitUnavailableError extends Error {
  constructor(message = 'Password reset rate limiting is unavailable.') {
    super(message);
    this.name = 'PasswordResetRateLimitUnavailableError';
  }
}

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

export async function hashPasswordResetEmail(rawEmail: unknown): Promise<string> {
  const email = normalizeEmail(rawEmail);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isMissingRateLimitTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /no such table|no such column/i.test(message);
}

/**
 * Atomically consumes one password reset request allowance.
 * The email itself is never persisted; only its SHA-256 hash is stored.
 */
export async function authorizePasswordResetRequest(
  env: CloudflareEnv,
  rawEmail: unknown,
  now: number = Date.now()
): Promise<PasswordResetRateLimitResult> {
  if (!env.DB) {
    throw new PasswordResetRateLimitUnavailableError(
      'Database binding is not configured for password reset rate limiting.'
    );
  }

  const emailHash = await hashPasswordResetEmail(rawEmail);
  const db: D1Database = env.DB;

  let existing: {
    email_hash: string;
    last_requested_at: number;
    window_started_at: number;
    request_count: number;
  } | null = null;
  try {
    existing = await db
      .prepare(
        `SELECT email_hash, last_requested_at, window_started_at, request_count
         FROM password_reset_rate_limits
         WHERE email_hash = ?
         LIMIT 1`
      )
      .bind(emailHash)
      .first<{
        email_hash: string;
        last_requested_at: number;
        window_started_at: number;
        request_count: number;
      }>();
  } catch (error) {
    if (isMissingRateLimitTable(error)) {
      throw new PasswordResetRateLimitUnavailableError(
        'Password reset rate limit table is not available.'
      );
    }
    throw error;
  }

  if (existing) {
    const lastRequestedAt = Number(existing.last_requested_at) || 0;
    const cooldownRemaining = Math.ceil(
      (lastRequestedAt + PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS * 1000 - now) / 1000
    );
    if (cooldownRemaining > 0) {
      return {
        allowed: false,
        code: 'COOLDOWN',
        remainingSeconds: cooldownRemaining,
        emailHash,
      };
    }

    const priorWindowStartedAt = Number(existing.window_started_at) || now;
    const hourWindowActive = now - priorWindowStartedAt < PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const windowStartedAt = hourWindowActive ? priorWindowStartedAt : now;
    const priorCount = Number(existing.request_count) || 0;
    const nextCount = hourWindowActive ? priorCount + 1 : 1;

    if (nextCount > MAX_PASSWORD_RESET_REQUESTS_PER_HOUR) {
      const hourlyRemaining = Math.ceil(
        (windowStartedAt + PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS * 1000 - now) / 1000
      );
      return {
        allowed: false,
        code: 'HOURLY_LIMIT',
        remainingSeconds: Math.max(1, hourlyRemaining),
        emailHash,
      };
    }

    try {
      await db
        .prepare(
          `UPDATE password_reset_rate_limits
           SET last_requested_at = ?, window_started_at = ?, request_count = ?,
               updated_at = datetime('now')
           WHERE email_hash = ?`
        )
        .bind(now, windowStartedAt, nextCount, emailHash)
        .run();
    } catch (error) {
      if (isMissingRateLimitTable(error)) {
        throw new PasswordResetRateLimitUnavailableError(
          'Password reset rate limit table is not available.'
        );
      }
      throw error;
    }

    return {
      allowed: true,
      code: 'OK',
      remainingSeconds: PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS,
      emailHash,
    };
  }

  try {
    await db
      .prepare(
        `INSERT INTO password_reset_rate_limits
          (email_hash, last_requested_at, window_started_at, request_count, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'))`
      )
      .bind(emailHash, now, now)
      .run();
  } catch (error) {
    if (isMissingRateLimitTable(error)) {
      throw new PasswordResetRateLimitUnavailableError(
        'Password reset rate limit table is not available.'
      );
    }
    throw error;
  }

  return {
    allowed: true,
    code: 'OK',
    remainingSeconds: PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS,
    emailHash,
  };
}
