// ============================================================================
// POST /api/auth/otp/resend — Resend 6-Digit Email Verification Code
// - Strictly validates 60-second cooldown timer
// - Invalidates previous OTP
// - Generates fresh cryptographic 6-digit code and dispatches via Resend
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

  await ensureOtpTable(env.DB);

  const body = await parseJsonBody<{
    email?: string;
    purpose?: 'registration' | 'password_recovery' | 'login';
  }>(request);

  if (!body || !body.email) {
    return errorJson('Email address is required.', 400);
  }

  const cleanEmail = sanitizeText(body.email, 140).trim().toLowerCase();
  const purpose = body.purpose || 'registration';
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';

  // 1. Check existing active OTP for cooldown
  const activeOtp = await env.DB.prepare(
    `SELECT id, resend_available_at, metadata_json,
            datetime('now') < resend_available_at AS in_cooldown,
            ROUND((strftime('%s', resend_available_at) - strftime('%s', datetime('now')))) AS remaining_seconds
     FROM auth_email_otps
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL
     ORDER BY id DESC LIMIT 1`
  )
    .bind(cleanEmail, purpose)
    .first<{
      id: number;
      resend_available_at: string;
      metadata_json: string;
      in_cooldown: number;
      remaining_seconds: number;
    }>();

  if (activeOtp && activeOtp.in_cooldown === 1 && activeOtp.remaining_seconds > 0) {
    return json(
      {
        ok: false,
        error: `Please wait ${activeOtp.remaining_seconds} seconds before requesting a new code.`,
        cooldownRemaining: activeOtp.remaining_seconds,
      },
      429
    );
  }

  // 2. Invalidate any prior active OTPs
  await env.DB.prepare(
    `UPDATE auth_email_otps
     SET consumed_at = datetime('now')
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL`
  )
    .bind(cleanEmail, purpose)
    .run();

  // 3. Generate New Cryptographic 6-Digit OTP & Salt
  const rawOtp = generateSecureNumericOtp();
  const salt = generateSalt();
  const otpHash = await hashOtp(rawOtp, salt);
  const metadataJson = activeOtp?.metadata_json || '{}';

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
  const emailText = `Your fresh Vijay Visuals verification code is ${rawOtp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Never share this code with anyone.`;

  const sendResult = await sendTransactionalEmail(env, {
    to: cleanEmail,
    subject: `${rawOtp} is your new Vijay Visuals verification code`,
    html: emailHtml,
    text: emailText,
    eventType: 'registration_otp_resend',
    idempotencyKey: `otp_resend_${cleanEmail}_${Date.now()}`,
  });

  return json({
    ok: true,
    message: 'A fresh 6-digit verification code has been dispatched to your email.',
    email: cleanEmail,
    cooldownSeconds: RESEND_COOLDOWN_SECONDS,
    expiresMinutes: OTP_EXPIRY_MINUTES,
    emailDeliveryStatus: sendResult.status,
    providerNotice: sendResult.notice || undefined,
  });
}
