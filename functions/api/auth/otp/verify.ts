// ============================================================================
// POST /api/auth/otp/verify — Verify 6-Digit Email Verification Code
// - Constant-time cryptographic verification
// - Enforces max attempts (brute-force protection)
// - Enforces server-side 10-minute expiry
// - Marks OTP consumed upon successful verification or attempt exhaustion
// - Synchronizes verified user profile in D1 `users` ledger
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  errorJson,
  getClientIp,
  handleOptions,
  json,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../../_shared';
import { ensureOtpTable, hashOtp, timingSafeEqual } from '../_otpShared';
import { provisionVerifiedCustomer } from '../_supabaseAdmin';

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
    password?: string;
  }>(request);

  if (!body || !body.email || !body.otp) {
    return errorJson('Email address and 6-digit verification code are required.', 400);
  }

  // Send/resend accept up to 254 characters; verification must use the same
  // limit or valid long addresses can never be verified.
  const cleanEmail = sanitizeText(body.email, 254).trim().toLowerCase();
  const rawOtp = sanitizeText(body.otp, 10).trim();
  // This endpoint exists only for customer registration. A client-supplied
  // purpose must never select another flow or skip registration provisioning.
  const purpose = 'registration' as const;
  const password = String(body.password || '');
  if (password.length < 6 || password.length > 128) {
    return errorJson('Password must be between 6 and 128 characters.', 400);
  }

  if (!/^\d{6}$/.test(rawOtp)) {
    return errorJson('Verification code must be exactly 6 digits.', 400);
  }

  // Fail-closed throttles: per-IP and per-email, in addition to the atomic
  // per-code attempt counter below.
  const clientIp = getClientIp(request);
  const ipLimit = await checkRateLimit(env, `otp_verify_ip:${clientIp}`, 30, 600);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, 'Too many verification attempts. Please try again later.');
  }
  const emailLimit = await checkRateLimit(env, `otp_verify_email:${cleanEmail}`, 15, 600);
  if (!emailLimit.allowed) {
    return rateLimitResponse(emailLimit, 'Too many verification attempts. Please try again later.');
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

  // 2. Check if already exceeded maximum attempts. The conditional update also
  // invalidates stale rows left by older concurrent requests.
  if (record.attempts >= record.max_attempts) {
    await env.DB.prepare(
      `UPDATE auth_email_otps SET consumed_at = datetime('now')
       WHERE id = ? AND consumed_at IS NULL`
    )
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
    // Atomic conditional increment: concurrent incorrect submissions cannot
    // both read the same old count and exceed the configured attempt limit.
    const claim = await env.DB.prepare(
      `UPDATE auth_email_otps
       SET attempts = attempts + 1,
           consumed_at = CASE
             WHEN attempts + 1 >= max_attempts THEN datetime('now')
             ELSE consumed_at
           END
       WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts`
    )
      .bind(record.id)
      .run();

    if (!claim.meta?.changes) {
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

    // Read the durable post-claim value so the response cannot report a stale
    // allowance when multiple requests raced.
    const updated = await env.DB.prepare(
      'SELECT attempts, max_attempts, consumed_at FROM auth_email_otps WHERE id = ? LIMIT 1'
    )
      .bind(record.id)
      .first<{ attempts: number; max_attempts: number; consumed_at: string | null }>();

    const nextAttempts = Number(updated?.attempts ?? record.attempts + 1);
    const maxAttempts = Number(updated?.max_attempts ?? record.max_attempts);
    const remaining = Math.max(0, maxAttempts - nextAttempts);

    if (updated?.consumed_at || remaining === 0) {
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

  // 5. Claim the OTP atomically BEFORE provisioning. This closes the race where
  // a concurrent send/resend consumed or expired the record while an external
  // identity was being created. A provisioning failure after this point leaves
  // no redeemable code, so the customer must request a fresh OTP.
  const consume = await env.DB.prepare(
    `UPDATE auth_email_otps SET consumed_at = datetime('now')
     WHERE id = ? AND consumed_at IS NULL AND attempts < max_attempts
       AND datetime('now') <= expires_at`
  )
    .bind(record.id)
    .run();

  if (!consume.meta?.changes) {
    return json(
      {
        ok: false,
        error: 'This verification code is no longer valid. Please request a new code.',
        code: 'OTP_NO_LONGER_VALID',
      },
      409
    );
  }

  // 6. Extract Metadata and Synchronize with canonical D1 vv_users table
  let metadata: Record<string, any> = {};
  try {
    metadata = JSON.parse(record.metadata_json || '{}');
  } catch {}

  const fullName = sanitizeText(metadata.fullName || '', 100);
  const phone = sanitizeText(metadata.phone || '', 20);
  // OTP metadata is client-influenced and must never grant a privileged role.
  // Preserve an already-server-assigned role, otherwise create a customer only.
  const resolvedName = fullName.trim() || cleanEmail.split('@')[0];

  // Registration no longer calls client.auth.signUp(). A confirmed Supabase
  // identity is provisioned server-side after the OTP is proven valid, so no
  // second confirmation email is sent and email rate limits cannot block it.
  let supabaseUserId = '';
  let provisioningCreated = false;
  if (purpose === 'registration') {
    const provision = await provisionVerifiedCustomer(env, {
      email: cleanEmail,
      password,
      fullName: resolvedName,
      phone,
    });
    if (!provision.ok) {
      const safeMessages: Record<string, string> = {
        ADMIN_CREDENTIAL_MISSING: 'Account provisioning is not configured. Please try again later.',
        ADMIN_KEY_FORMAT_INVALID: 'Account provisioning credentials are invalid. Please contact support.',
        SUPABASE_RATE_LIMITED: 'Account creation is temporarily busy. Please wait a moment and retry.',
        EMAIL_ADDRESS_INVALID: 'Please enter a valid email address.',
        PASSWORD_REJECTED: 'Password must be between 6 and 128 characters.',
        ADMIN_LOOKUP_FAILED: 'Account service is temporarily unavailable. Please try again.',
        PROVISIONING_FAILED: 'Account creation failed. Please try again.',
      };
      return json(
        {
          ok: false,
          error: safeMessages[provision.code] || 'Account creation failed. Please try again.',
          code: provision.code,
        },
        provision.status
      );
    }
    supabaseUserId = provision.userId;
    provisioningCreated = provision.created;
  }

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
      .bind(cleanEmail, supabaseUserId || cleanEmail)
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
      // For registration, the canonical D1 identity is the real Supabase UID.
      effectiveUserId = supabaseUserId || existingUser.id;
      // Rule: Never overwrite an existing owner/admin role with customer, and
      // never elevate a role from OTP registration metadata.
      const isExistingAdmin = existingUser.role === 'admin';
      effectiveRole = isExistingAdmin ? 'admin' : 'customer';
      const targetName = (existingUser.full_name && existingUser.full_name.trim()) ? existingUser.full_name : resolvedName;

      const linkedSubject = supabaseUserId || existingUser.auth_subject || existingUser.id;
      await env.DB.prepare(
        `UPDATE vv_users
         SET id = ?, auth_provider = ?, auth_subject = ?, full_name = ?,
             role = CASE WHEN role = 'admin' THEN 'admin' ELSE ? END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
        .bind(
          effectiveUserId,
          supabaseUserId ? 'supabase' : existingUser.auth_provider || 'email_otp',
          linkedSubject,
          targetName,
          effectiveRole,
          existingUser.id
        )
        .run();
    } else {
      effectiveUserId = supabaseUserId || (crypto.randomUUID ? crypto.randomUUID() : `usr_${Date.now()}`);
      effectiveRole = 'customer';

      await env.DB.prepare(
        `INSERT INTO vv_users (id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
        .bind(
          effectiveUserId,
          supabaseUserId ? 'supabase' : 'email_otp',
          effectiveUserId,
          cleanEmail,
          resolvedName,
          effectiveRole
        )
        .run();
    }
  } catch (syncErr: any) {
    console.error('Failed to sync verified user with D1 vv_users table:', syncErr);
    return errorJson('Failed to persist customer profile. Please try again.', 500);
  }

  // 7. Success: the OTP was already claimed atomically before provisioning.
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
      authProvider: supabaseUserId ? 'supabase' : 'email_otp',
      provisioningCreated,
    },
  });
}
