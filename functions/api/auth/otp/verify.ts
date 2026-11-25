// ============================================================================
// POST /api/auth/otp/verify — Verify 6-Digit Email Verification Code
// - Constant-time cryptographic verification
// - Enforces max attempts (brute-force protection)
// - Enforces server-side 10-minute expiry
// - Marks OTP consumed upon successful verification or attempt exhaustion
// - Synchronizes verified user profile in D1 `users` ledger
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';
import { ensureOtpTable, hashOtp, timingSafeEqual } from '../_otpShared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  await ensureOtpTable(env.DB);

  const body = await parseJsonBody<{
    email?: string;
    otp?: string;
    purpose?: 'registration' | 'password_recovery' | 'login';
  }>(request);

  if (!body || !body.email || !body.otp) {
    return errorJson('Email address and 6-digit verification code are required.', 400);
  }

  const cleanEmail = sanitizeText(body.email, 140).trim().toLowerCase();
  const rawOtp = sanitizeText(body.otp, 10).trim();
  const purpose = body.purpose || 'registration';

  if (!/^\d{6}$/.test(rawOtp)) {
    return errorJson('Verification code must be exactly 6 digits.', 400);
  }

  // 1. Retrieve the latest active unconsumed OTP record
  const record = await env.DB.prepare(
    `SELECT id, otp_hash, salt, attempts, max_attempts, expires_at, metadata_json,
            datetime('now') > expires_at AS is_expired
     FROM auth_email_otps
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`
  )
    .bind(cleanEmail, purpose)
    .first<{
      id: number;
      otp_hash: string;
      salt: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
      metadata_json: string;
      is_expired: number;
    }>();

  if (!record) {
    return errorJson(
      'No active verification code found for this email. Please request a new code.',
      404
    );
  }

  // 2. Check if already exceeded maximum attempts
  if (record.attempts >= record.max_attempts) {
    await env.DB.prepare('UPDATE auth_email_otps SET consumed_at = datetime(\'now\') WHERE id = ?')
      .bind(record.id)
      .run();
    return json(
      {
        ok: false,
        error: 'Too many incorrect attempts. This verification code has been invalidated. Please request a new code.',
        code: 'MAX_ATTEMPTS_EXCEEDED',
      },
      429
    );
  }

  // 3. Check if expired
  if (record.is_expired === 1) {
    await env.DB.prepare('UPDATE auth_email_otps SET consumed_at = datetime(\'now\') WHERE id = ?')
      .bind(record.id)
      .run();
    return json(
      {
        ok: false,
        error: 'This verification code has expired. Please request a new code.',
        code: 'OTP_EXPIRED',
      },
      400
    );
  }

  // 4. Constant-Time Verification
  const computedHash = await hashOtp(rawOtp, record.salt);
  const isMatch = timingSafeEqual(computedHash, record.otp_hash);

  if (!isMatch) {
    const nextAttempts = record.attempts + 1;
    const remaining = Math.max(0, record.max_attempts - nextAttempts);

    if (nextAttempts >= record.max_attempts) {
      // Invalidate code upon hitting maximum attempts
      await env.DB.prepare(
        'UPDATE auth_email_otps SET attempts = ?, consumed_at = datetime(\'now\') WHERE id = ?'
      )
        .bind(nextAttempts, record.id)
        .run();

      return json(
        {
          ok: false,
          error: 'Too many incorrect attempts. This verification code has been invalidated. Please request a new code.',
          code: 'MAX_ATTEMPTS_EXCEEDED',
          remainingAttempts: 0,
        },
        429
      );
    }

    // Increment attempt count
    await env.DB.prepare('UPDATE auth_email_otps SET attempts = ? WHERE id = ?')
      .bind(nextAttempts, record.id)
      .run();

    return json(
      {
        ok: false,
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        code: 'INVALID_OTP',
        remainingAttempts: remaining,
      },
      400
    );
  }

  // 5. Success: Mark OTP as consumed
  await env.DB.prepare('UPDATE auth_email_otps SET consumed_at = datetime(\'now\') WHERE id = ?')
    .bind(record.id)
    .run();

  // 6. Extract Metadata and Synchronize with D1 users table
  let metadata: Record<string, any> = {};
  try {
    metadata = JSON.parse(record.metadata_json || '{}');
  } catch {}

  const fullName = sanitizeText(metadata.fullName || '', 100);
  const phone = sanitizeText(metadata.phone || '', 20);
  const requestedRole = sanitizeText(metadata.requestedRole || 'customer', 40);

  try {
    // Generate deterministic or random user UID
    const userUid = `usr_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`;
    await env.DB.prepare(
      `INSERT INTO users (uid, email, name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         name = CASE WHEN users.name IS NULL OR users.name = '' THEN excluded.name ELSE users.name END,
         updated_at = datetime('now')`
    )
      .bind(userUid, cleanEmail, fullName || cleanEmail.split('@')[0], requestedRole)
      .run();
  } catch (syncErr) {
    console.error('Failed to sync verified user with D1 users table:', syncErr);
  }

  return json({
    ok: true,
    verified: true,
    message: 'Email address successfully verified.',
    email: cleanEmail,
    purpose,
    profile: {
      email: cleanEmail,
      fullName,
      phone,
      role: requestedRole,
      emailVerified: true,
    },
  });
}
