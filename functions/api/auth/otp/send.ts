// ============================================================================
// POST /api/auth/otp/send — Generate & Send 6-Digit Email Verification Code
// - Enforces 60-second cooldown per email
// - Hashes OTP with cryptographic salt before storing in D1
// - Sends luxury branded verification email via Resend
// - ZERO secrets or OTP codes returned in API response or logs
// ============================================================================

import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText } from '../../_shared';
import { sendTransactionalEmail, buildOtpEmailHtml } from '../../_email';
import {
  ensureOtpTable,
  generateSalt,
  generateSecureNumericOtp,
  hashOtp,
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
} from '../_otpShared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  try {
    await ensureOtpTable(env.DB);
  } catch (err: any) {
    console.error('Failed to verify OTP persistence in send.ts:', err);
    return errorJson('Database persistence for OTP is currently unavailable.', 503);
  }

  const body = await parseJsonBody<{
    email?: string;
    fullName?: string;
    phone?: string;
    requestedRole?: string;
    purpose?: 'registration' | 'password_recovery' | 'login';
  }>(request);

  if (!body || !body.email) {
    return errorJson('Email address is required.', 400);
  }

  const cleanEmail = sanitizeText(body.email, 140).trim().toLowerCase();
  if (!cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    return errorJson('Please provide a valid email address.', 400);
  }

  const purpose = body.purpose || 'registration';
  const fullName = sanitizeText(body.fullName || '', 100);
  const phone = sanitizeText(body.phone || '', 20);
  const requestedRole = sanitizeText(body.requestedRole || 'customer', 40);

  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

  // 1. Check Rate Limiting / 60-second Resend Cooldown
  const activeOtp = await env.DB.prepare(
    `SELECT id, resend_available_at, expires_at, created_at FROM auth_email_otps
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND datetime('now') < expires_at
     ORDER BY id DESC LIMIT 1`
  )
    .bind(cleanEmail, purpose)
    .first<{ id: number; resend_available_at: string; expires_at: string; created_at: string }>();

  if (activeOtp) {
    // Check if cooldown has elapsed
    const cooldownCheck = await env.DB.prepare(
      `SELECT datetime('now') < ? AS in_cooldown,
              ROUND((strftime('%s', ?) - strftime('%s', datetime('now')))) AS remaining_seconds`
    )
      .bind(activeOtp.resend_available_at, activeOtp.resend_available_at)
      .first<{ in_cooldown: number; remaining_seconds: number }>();

    if (cooldownCheck && cooldownCheck.in_cooldown === 1 && cooldownCheck.remaining_seconds > 0) {
      return json(
        {
          ok: false,
          error: `Please wait ${cooldownCheck.remaining_seconds} seconds before requesting a new code.`,
          cooldownRemaining: cooldownCheck.remaining_seconds,
        },
        429
      );
    }
  }

  // 2. Invalidate any existing unconsumed OTPs for this email and purpose
  await env.DB.prepare(
    `UPDATE auth_email_otps
     SET consumed_at = datetime('now')
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL`
  )
    .bind(cleanEmail, purpose)
    .run();

  // 3. Generate Cryptographic 6-Digit Numeric OTP & Salt
  const rawOtp = generateSecureNumericOtp();
  const salt = generateSalt();
  const otpHash = await hashOtp(rawOtp, salt);

  const metadataJson = JSON.stringify({
    fullName,
    phone,
    requestedRole,
  });

  // 4. Store in D1 Ledger
  await env.DB.prepare(
    `INSERT INTO auth_email_otps (
      email, otp_hash, salt, purpose, metadata_json,
      attempts, max_attempts, expires_at, resend_available_at, created_at, ip_address
    ) VALUES (
      ?, ?, ?, ?, ?,
      0, 5, datetime('now', '+${OTP_EXPIRY_MINUTES} minutes'),
      datetime('now', '+${RESEND_COOLDOWN_SECONDS} seconds'),
      datetime('now'), ?
    )`
  )
    .bind(cleanEmail, otpHash, salt, purpose, metadataJson, clientIp)
    .run();

  // 5. Send Branded Email via Resend
  const emailHtml = buildOtpEmailHtml(rawOtp, OTP_EXPIRY_MINUTES);
  const emailText = `Your Vijay Visuals verification code is ${rawOtp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Never share this code with anyone.`;

  const sendResult = await sendTransactionalEmail(env, {
    to: cleanEmail,
    subject: 'Your verification code',
    html: emailHtml,
    text: emailText,
    eventType: 'registration_otp',
    idempotencyKey: `otp_${cleanEmail}_${Date.now()}`,
  });

  return json({
    ok: true,
    message: 'A 6-digit verification code has been sent to your email address.',
    email: cleanEmail,
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    expiresMinutes: OTP_EXPIRY_MINUTES,
    emailDeliveryStatus: sendResult.status,
    providerNotice: sendResult.notice || undefined,
  });
}
