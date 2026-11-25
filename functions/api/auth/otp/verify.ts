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

  try {
    await ensureOtpTable(env.DB);
  } catch (err: any) {
    console.error('Failed to verify OTP persistence in verify.ts:', err);
    return errorJson('Database persistence for OTP is currently unavailable.', 503);
  }

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

  // 5. Extract Metadata and Synchronize with canonical D1 vv_users table
  let metadata: Record<string, any> = {};
  try {
    metadata = JSON.parse(record.metadata_json || '{}');
  } catch {}

  const fullName = sanitizeText(metadata.fullName || '', 100);
  const phone = sanitizeText(metadata.phone || '', 20);
  const requestedRole = sanitizeText(metadata.requestedRole || 'customer', 40);
  const resolvedName = fullName.trim() || cleanEmail.split('@')[0];

  let effectiveUserId: string;
  let effectiveRole: string = 'customer';

  try {
    // Check for existing profile in canonical vv_users
    const existingUser = await env.DB.prepare(
      `SELECT id, auth_provider, auth_subject, email, full_name, role, status
       FROM vv_users
       WHERE LOWER(email) = LOWER(?) OR auth_subject = ?
       LIMIT 1`
    )
      .bind(cleanEmail, cleanEmail)
      .first<{
        id: string;
        auth_provider: string;
        auth_subject: string;
        email: string;
        full_name: string;
        role: string;
        status: string;
      }>();

    if (existingUser) {
      effectiveUserId = existingUser.id;
      // Rule: Never overwrite an existing owner/admin role with customer
      const isExistingAdmin = existingUser.role === 'admin';
      effectiveRole = isExistingAdmin ? 'admin' : (requestedRole === 'admin' ? 'admin' : 'customer');
      const targetName = (existingUser.full_name && existingUser.full_name.trim()) ? existingUser.full_name : resolvedName;

      await env.DB.prepare(
        `UPDATE vv_users
         SET full_name = ?,
             role = CASE WHEN role = 'admin' THEN 'admin' ELSE ? END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(targetName, effectiveRole, existingUser.id)
        .run();
    } else {
      effectiveUserId = crypto.randomUUID ? crypto.randomUUID() : `usr_${Date.now()}`;
      effectiveRole = requestedRole === 'admin' ? 'admin' : 'customer';

      await env.DB.prepare(
        `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at)
         VALUES (?, 'email_otp', ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
        .bind(effectiveUserId, effectiveUserId, cleanEmail, resolvedName, effectiveRole)
        .run();
    }
  } catch (syncErr: any) {
    console.error('Failed to sync verified user with D1 vv_users table:', syncErr);
    return errorJson('Failed to persist customer profile. Please try again.', 500);
  }

  // 6. Success: Mark OTP as consumed (only after profile persistence succeeds)
  await env.DB.prepare('UPDATE auth_email_otps SET consumed_at = datetime(\'now\') WHERE id = ?')
    .bind(record.id)
    .run();

  return json({
    ok: true,
    verified: true,
    message: 'Email address successfully verified.',
    email: cleanEmail,
    purpose,
    profile: {
      id: effectiveUserId,
      email: cleanEmail,
      fullName: resolvedName,
      phone,
      role: effectiveRole,
      emailVerified: true,
    },
  });
}
