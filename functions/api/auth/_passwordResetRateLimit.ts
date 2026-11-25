// ============================================================================
// Server-side password reset request rate limiting for Cloudflare Pages.
// Stores only a one-way hash of the normalized email plus timing metadata.
// Consumption is a single conditional D1 UPSERT so concurrent requests cannot
// both observe the same allowance. No Supabase dashboard changes are required.
// ============================================================================

import { CloudflareEnv, D1Database } from '../_shared';

export const PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const MAX_PASSWORD_RESET_REQUESTS_PER_HOUR = 5;

const COOLDOWN_MS = PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS * 1000;
const WINDOW_MS = PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS * 1000;

export type PasswordResetRateLimitCode = 'OK' | 'COOLDOWN' | 'HOURLY_LIMIT' | 'UNAVAILABLE';

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

function countChanges(result: { meta?: { changes?: number }; changes?: number } | undefined): number {
  const metaChanges = Number(result?.meta?.changes);
  if (Number.isFinite(metaChanges)) return metaChanges;
  const directChanges = Number(result?.changes);
  return Number.isFinite(directChanges) ? directChanges : 0;
}

/**
 * Atomically consumes one password reset request allowance.
 *
 * The conditional UPSERT is the authority: D1 serializes writes to the same
 * email_hash row, and the WHERE clause prevents both the 60-second cooldown and
 * the 5-per-hour limit from being bypassed by concurrent requests.
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

  // One statement: insert a new allowance, or conditionally advance an existing
  // allowance only when both the cooldown and hourly window permit it.
  const consumeSql = `
    INSERT INTO password_reset_rate_limits
      (email_hash, last_requested_at, window_started_at, request_count, updated_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(email_hash) DO UPDATE SET
      last_requested_at = excluded.last_requested_at,
      window_started_at = CASE
        WHEN excluded.last_requested_at - password_reset_rate_limits.window_started_at >= ${WINDOW_MS}
          THEN excluded.last_requested_at
        ELSE password_reset_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN excluded.last_requested_at - password_reset_rate_limits.window_started_at >= ${WINDOW_MS}
          THEN 1
        ELSE password_reset_rate_limits.request_count + 1
      END,
      updated_at = datetime('now')
    WHERE excluded.last_requested_at - password_reset_rate_limits.last_requested_at >= ${COOLDOWN_MS}
      AND (
        excluded.last_requested_at - password_reset_rate_limits.window_started_at >= ${WINDOW_MS}
        OR password_reset_rate_limits.request_count < ${MAX_PASSWORD_RESET_REQUESTS_PER_HOUR}
      )
  `;

  let consumed;
  try {
    consumed = await db
      .prepare(consumeSql)
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

  if (countChanges(consumed as { meta?: { changes?: number }; changes?: number }) > 0) {
    return {
      allowed: true,
      code: 'OK',
      remainingSeconds: PASSWORD_RESET_RATE_LIMIT_COOLDOWN_SECONDS,
      emailHash,
    };
  }

  // The write was rejected. Read-only lookup to explain why; no quota is consumed.
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

  if (!existing) {
    throw new PasswordResetRateLimitUnavailableError(
      'Password reset rate limit state could not be resolved.'
    );
  }

  const lastRequestedAt = Number(existing.last_requested_at) || 0;
  const cooldownRemaining = Math.ceil((lastRequestedAt + COOLDOWN_MS - now) / 1000);
  if (cooldownRemaining > 0) {
    return {
      allowed: false,
      code: 'COOLDOWN',
      remainingSeconds: Math.max(1, cooldownRemaining),
      emailHash,
    };
  }

  const windowStartedAt = Number(existing.window_started_at) || now;
  const hourlyRemaining = Math.ceil((windowStartedAt + WINDOW_MS - now) / 1000);
  return {
    allowed: false,
    code: 'HOURLY_LIMIT',
    remainingSeconds: Math.max(1, hourlyRemaining),
    emailHash,
  };
}
