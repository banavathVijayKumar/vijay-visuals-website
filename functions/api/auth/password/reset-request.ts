// ============================================================================
// POST /api/auth/password/reset-request
// Server-side password reset request gate for Cloudflare Pages.
// - D1-backed atomic cooldown/hourly limit keyed by a hash of the email
// - Redirect is chosen ONLY from a strict server-side origin allowlist
// - Calls Supabase GoTrue /auth/v1/recover with the existing anon key only
// - No client-provided redirect origin is ever forwarded
// - Always returns a generic response to prevent account enumeration
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  handleOptions,
  json,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../../_shared';
import {
  PasswordResetRateLimitUnavailableError,
  authorizePasswordResetRequest,
} from '../_passwordResetRateLimit';

const GENERIC_RESET_MESSAGE =
  'If an account exists for this email, password reset instructions have been sent. Please check your inbox.';
const GENERIC_UNAVAILABLE_MESSAGE =
  'Password reset is unavailable right now. Please try again later.';
const GENERIC_INVALID_MESSAGE = 'Please enter a valid email address.';

/** Exact application origins approved by the operator. Never derived from the client. */
const ALLOWED_ORIGINS_ENV = 'PASSWORD_RESET_ALLOWED_ORIGINS';

function isValidEmail(raw: unknown): boolean {
  const email = String(raw || '').trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function approvedOrigins(env: PagesContext['env']): string[] {
  const configured = String((env as Record<string, unknown>)?.[ALLOWED_ORIGINS_ENV] || '');
  const origins: string[] = [];
  for (const raw of configured.split(',')) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value);
      const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) continue;
      if (parsed.username || parsed.password) continue;
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) continue;
      if (!origins.includes(parsed.origin)) origins.push(parsed.origin);
    } catch {
      // Invalid entries are ignored; a missing/empty allowlist fails closed.
    }
  }
  return origins;
}

function serverApprovedCallbackUrl(env: PagesContext['env']): string {
  const origins = approvedOrigins(env);
  return origins.length ? `${origins[0]}/` : '';
}

function configuredSupabase(env: PagesContext['env']): { url: string; anonKey: string } {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  try {
    // The only client field consumed is the email. `redirectTo` is intentionally ignored.
    const body = await parseJsonBody<{ email?: string }>(request);
    const email = sanitizeText(body?.email || '', 254).trim().toLowerCase();
    if (!isValidEmail(email)) {
      return json({ ok: false, code: 'INVALID_EMAIL', message: GENERIC_INVALID_MESSAGE }, 400);
    }

    // Required configuration is checked BEFORE consuming a rate-limit allowance.
    const callbackUrl = serverApprovedCallbackUrl(env);
    const { url, anonKey } = configuredSupabase(env);
    if (!callbackUrl || !url || !anonKey) {
      return json(
        {
          ok: false,
          code: 'PROVIDER_UNAVAILABLE',
          message: GENERIC_UNAVAILABLE_MESSAGE,
          remainingSeconds: 0,
        },
        503
      );
    }

    // Per-IP throttle complements the per-email limiter so one caller cannot
    // target many distinct mailboxes. Fail closed via the shared helper.
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
    const ipLimit = await checkRateLimit(env, `password_reset_ip:${clientIp || 'unknown'}`, 20, 3600);
    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit, 'Too many password reset requests. Please try again later.');
    }

    let rateLimit;
    try {
      rateLimit = await authorizePasswordResetRequest(env, email);
    } catch (error) {
      if (error instanceof PasswordResetRateLimitUnavailableError) {
        console.error('Password reset rate limit unavailable:', error.message);
        return json(
          {
            ok: false,
            code: 'RATE_LIMIT_UNAVAILABLE',
            message: GENERIC_UNAVAILABLE_MESSAGE,
            remainingSeconds: 0,
          },
          503
        );
      }
      throw error;
    }

    if (!rateLimit.allowed) {
      return json(
        {
          ok: false,
          code: rateLimit.code,
          message:
            rateLimit.code === 'HOURLY_LIMIT'
              ? 'Too many reset requests. Please try again later.'
              : `Please wait ${rateLimit.remainingSeconds} seconds before requesting another reset link.`,
          remainingSeconds: rateLimit.remainingSeconds,
        },
        429
      );
    }

    let providerOk = false;
    try {
      const response = await fetch(`${url}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ email, redirect_to: callbackUrl }),
      });
      providerOk = response.ok;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      console.error('Password reset provider request failed:', error instanceof Error ? error.message : error);
    }

    if (!providerOk) {
      return json(
        {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: GENERIC_UNAVAILABLE_MESSAGE,
          remainingSeconds: rateLimit.remainingSeconds,
        },
        502
      );
    }

    return json(
      {
        ok: true,
        code: 'SUCCESS',
        message: GENERIC_RESET_MESSAGE,
        remainingSeconds: rateLimit.remainingSeconds,
      },
      200
    );
  } catch (error) {
    console.error('Password reset request failed:', error instanceof Error ? error.message : error);
    return json(
      {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: GENERIC_UNAVAILABLE_MESSAGE,
        remainingSeconds: 0,
      },
      500
    );
  }
}
