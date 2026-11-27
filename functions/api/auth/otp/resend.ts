// ============================================================================
// POST /api/auth/otp/resend — Resend 6-Digit Email Verification Code
// - Strictly validates 60-second cooldown timer
// - Invalidates previous OTP
// - Generates fresh cryptographic 6-digit code and dispatches via Resend
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  errorJson,
  getClientIp,
  handleOptions,
  isValidEmailAddress,
  json,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../../_shared';
import { sendTransactionalEmail, buildOtpEmailHtml, getCustomerOtpSender } from '../../_email';
import {
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  ensureOtpTable,
  generateSalt,
  generateSecureNumericOtp,
  hashOtp,
  MAX_OTP_ATTEMPTS,
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
    console.error('Failed to verify OTP persistence in resend.ts:', err);
    return errorJson('Database persistence for OTP is currently unavailable.', 503);
  }

  const body = await parseJsonBody<{ email?: string }>(request);

  if (!body || !body.email) {
    return errorJson('Email address is required.', 400);
  }

  const cleanEmail = sanitizeText(body.email, 254).trim().toLowerCase();
  if (!isValidEmailAddress(cleanEmail)) {
    return errorJson('Please provide a valid email address.', 400);
  }
  // Registration is the only purpose served by this endpoint.
  const purpose = 'registration' as const;
  const clientIp = getClientIp(request);

  // Fail-closed IP throttle: prevents one caller from enumerating many recipients.
  const ipLimit = await checkRateLimit(env, `otp_resend_ip:${clientIp || 'unknown'}`, 20, 3600);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, 'Too many verification code requests. Please try again later.');
  }

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
      0, ${MAX_OTP_ATTEMPTS}, datetime('now', '+${OTP_EXPIRY_MINUTES} minutes'),
      datetime('now', '+${RESEND_COOLDOWN_SECONDS} seconds'),
      datetime('now'), ?
    )`
  )
    .bind(cleanEmail, otpHash, salt, purpose, metadataJson, clientIp)
    .run();

  // 5. Send Branded Email via Resend
  const emailHtml = buildOtpEmailHtml(rawOtp, OTP_EXPIRY_MINUTES);
  const emailText = `Your fresh verification code is ${rawOtp}. Your account is not created until this code is verified. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Never share this code with anyone.`;
  const otpSender = getCustomerOtpSender(env);

  const sendResult = await sendTransactionalEmail(env, {
    to: cleanEmail,
    subject: 'Your new verification code',
    html: emailHtml,
    text: emailText,
    eventType: 'registration_otp_resend',
    audience: 'customer',
    tenantBrandName: otpSender.name,
    verifiedSenderEmail: otpSender.email,
    verifiedSenderDomain: otpSender.email.split('@')[1] || '',
    idempotencyKey: `otp_resend_${cleanEmail}_${Date.now()}`,
  });

  if (!sendResult.ok) {
    await env.DB.prepare(
      `UPDATE auth_email_otps SET consumed_at = datetime('now')
       WHERE email = ? AND purpose = ? AND consumed_at IS NULL`
    )
      .bind(cleanEmail, purpose)
      .run();
    console.error('OTP resend email delivery failed; status:', sendResult.status || 'unknown');
    return errorJson(EMAIL_DELIVERY_UNAVAILABLE_MESSAGE, 503, {
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
    });
  }

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
