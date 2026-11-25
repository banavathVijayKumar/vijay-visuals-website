// ============================================================================
// Supabase password-recovery helpers
// Pure, dependency-free helpers used by AuthModal/useAuth and local tests.
// Reset requests are gated by the server-side D1 rate limiter; no fake success
// paths exist and completion still requires the real Supabase recovery session.
// ============================================================================

export const PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS = 60;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const PASSWORD_RESET_COOLDOWN_STORAGE_KEY = 'vv_password_reset_requested_at';
export const PASSWORD_RESET_HOURLY_BLOCK_STORAGE_KEY = 'vv_password_reset_hourly_block_until';

export const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for this email, password reset instructions have been sent. Please check your inbox.';
export const PASSWORD_RESET_UNAVAILABLE_MESSAGE =
  'Password reset is unavailable right now. Please try again later.';
export const PASSWORD_RESET_RATE_LIMIT_MESSAGE =
  'Too many reset requests. Please wait before trying again.';
export const PASSWORD_RESET_INVALID_EMAIL_MESSAGE = 'Please enter a valid email address.';
export const PASSWORD_RESET_NO_CALLBACK_MESSAGE =
  'Unable to determine the password reset callback URL. Please try again from the site.';
export const AUTH_PROVIDER_ERROR_MESSAGE =
  'Unable to complete this request right now. Please try again.';
export const PASSWORD_RECOVERY_INVALID_MESSAGE =
  'This password reset link is invalid or has expired. Please request a new one.';
export const PASSWORD_UPDATE_INVALID_PASSWORD_MESSAGE =
  'New password must be at least 6 characters long.';
export const PASSWORD_UPDATE_MISMATCH_MESSAGE = 'Passwords do not match.';
export const PASSWORD_UPDATE_FAILED_MESSAGE =
  'Unable to update your password right now. Please request a new reset link or try again later.';
export const PASSWORD_UPDATE_SUCCESS_MESSAGE =
  'Password updated successfully. You can now continue signed in.';
export const PASSWORD_UPDATE_REVOCATION_WARNING_MESSAGE =
  'Password updated, but other active sessions could not be signed out. Please sign out on all devices manually.';

interface ProviderResult {
  error?: { message?: string } | null;
}

interface SessionResult {
  data?: { session?: RecoverySession | null } | null;
  error?: { message?: string } | null;
}

export interface RecoverySession {
  access_token?: string;
  user?: { id?: string | null } | null;
}

/** Minimal structural type so these helpers can be unit tested without a browser SDK. */
export interface PasswordRecoveryClient {
  auth: {
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<ProviderResult>;
    getSession(): Promise<SessionResult>;
    updateUser(attributes: { password: string }): Promise<ProviderResult>;
    signOut?(options?: { scope: 'others' | 'global' | 'local' }): Promise<ProviderResult>;
  };
}

export interface RecoveryActionResult {
  ok: boolean;
  message: string;
  code:
    | 'SUCCESS'
    | 'SUCCESS_WITHOUT_REVOCATION'
    | 'INVALID_EMAIL'
    | 'NO_CLIENT'
    | 'NO_CALLBACK'
    | 'RATE_LIMITED'
    | 'PROVIDER_ERROR'
    | 'INVALID_RECOVERY_SESSION'
    | 'INVALID_PASSWORD'
    | 'PASSWORD_MISMATCH';
  sessionsRevoked?: boolean;
  remainingSeconds?: number;
  rateLimitCode?: 'COOLDOWN' | 'HOURLY_LIMIT';
  blockUntil?: number;
}

export function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(raw: unknown): boolean {
  const email = normalizeEmail(raw);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getPasswordResetRedirectUrl(origin: unknown): string {
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  return cleanOrigin ? `${cleanOrigin}/` : '';
}

export function remainingResetCooldownSeconds(
  lastRequestedAt: number | null | undefined,
  now: number = Date.now()
): number {
  if (!lastRequestedAt || !Number.isFinite(lastRequestedAt)) return 0;
  const remaining = Math.ceil(
    (lastRequestedAt + PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS * 1000 - now) / 1000
  );
  return remaining > 0 ? remaining : 0;
}

export interface CooldownStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage holds only a timestamp — no email, token, or reset link. */
export function getPasswordResetCooldownStorage(): CooldownStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
  return null;
}

export function loadPasswordResetRequestTimestamp(
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage()
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PASSWORD_RESET_COOLDOWN_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.min(value, Date.now());
  } catch {
    return null;
  }
}

export function savePasswordResetRequestTimestamp(
  timestamp: number,
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage()
): number {
  const now = Date.now();
  const clean = Number.isFinite(timestamp) && timestamp > 0 ? Math.min(timestamp, now) : now;
  try {
    storage?.setItem(PASSWORD_RESET_COOLDOWN_STORAGE_KEY, String(clean));
  } catch {
    // In-memory state still enforces the cooldown for this session.
  }
  return clean;
}

export function restorePasswordResetCooldown(
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage(),
  now: number = Date.now()
): { lastRequestedAt: number | null; remainingSeconds: number } {
  const lastRequestedAt = loadPasswordResetRequestTimestamp(storage);
  return {
    lastRequestedAt,
    remainingSeconds: remainingResetCooldownSeconds(lastRequestedAt, now),
  };
}

/** Absolute server-derived hourly block timestamp — no email, token, or reset link stored. */
export function remainingPasswordResetHourlyBlockSeconds(
  blockedUntil: number | null | undefined,
  now: number = Date.now()
): number {
  if (!blockedUntil || !Number.isFinite(blockedUntil)) return 0;
  return Math.max(0, Math.ceil((blockedUntil - now) / 1000));
}

export function loadPasswordResetHourlyBlock(
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage(),
  now: number = Date.now()
): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PASSWORD_RESET_HOURLY_BLOCK_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= now) return null;
    return value;
  } catch {
    return null;
  }
}

export function savePasswordResetHourlyBlock(
  blockedUntil: number,
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage()
): number | null {
  const now = Date.now();
  const clean = Number.isFinite(blockedUntil) && blockedUntil > now ? blockedUntil : 0;
  try {
    storage?.setItem(PASSWORD_RESET_HOURLY_BLOCK_STORAGE_KEY, String(clean));
  } catch {
    // In-memory state still enforces the block for this session.
  }
  return clean || null;
}

export function restorePasswordResetHourlyBlock(
  storage: CooldownStorage | null | undefined = getPasswordResetCooldownStorage(),
  now: number = Date.now()
): { blockedUntil: number | null; remainingSeconds: number } {
  const blockedUntil = loadPasswordResetHourlyBlock(storage, now);
  return {
    blockedUntil,
    remainingSeconds: remainingPasswordResetHourlyBlockSeconds(blockedUntil, now),
  };
}

export function isRecoverySession(session: unknown): session is RecoverySession {
  if (!session || typeof session !== 'object') return false;
  const candidate = session as RecoverySession;
  return Boolean(candidate.access_token && candidate.user?.id);
}

export async function verifyRecoverySession(client: PasswordRecoveryClient): Promise<boolean> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return false;
    return isRecoverySession(data?.session);
  } catch {
    return false;
  }
}

export type PasswordResetFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

/**
 * Requests a reset through the server-side D1 rate-limit gate. The redirect is
 * chosen server-side from PASSWORD_RESET_ALLOWED_ORIGINS; any client redirect
 * argument is ignored and is never sent to the server or Supabase.
 */
export async function requestPasswordReset(
  _client: PasswordRecoveryClient | null | undefined,
  rawEmail: unknown,
  _ignoredRedirectTo?: unknown,
  fetchImpl: PasswordResetFetch = (input, init) => fetch(input, init)
): Promise<RecoveryActionResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, code: 'INVALID_EMAIL', message: PASSWORD_RESET_INVALID_EMAIL_MESSAGE };
  }

  try {
    const response = await fetchImpl('/api/auth/password/reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      remainingSeconds?: number;
    };
    const remainingSeconds =
      Number.isFinite(payload.remainingSeconds) && Number(payload.remainingSeconds) > 0
        ? Math.ceil(Number(payload.remainingSeconds))
        : 0;
    const rateLimitCode =
      payload.code === 'HOURLY_LIMIT' || payload.code === 'COOLDOWN' ? payload.code : undefined;

    if (response.ok && payload.ok) {
      return {
        ok: true,
        code: 'SUCCESS',
        message: PASSWORD_RESET_GENERIC_MESSAGE,
        remainingSeconds: remainingSeconds || PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS,
      };
    }

    if (rateLimitCode || response.status === 429) {
      const effectiveSeconds =
        remainingSeconds ||
        (rateLimitCode === 'HOURLY_LIMIT'
          ? PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS
          : PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS);
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message:
          rateLimitCode === 'HOURLY_LIMIT'
            ? PASSWORD_RESET_RATE_LIMIT_MESSAGE
            : `Please wait ${effectiveSeconds} seconds before requesting another reset link.`,
        remainingSeconds: effectiveSeconds,
        rateLimitCode,
        blockUntil:
          rateLimitCode === 'HOURLY_LIMIT' ? Date.now() + effectiveSeconds * 1000 : undefined,
      };
    }

    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: AUTH_PROVIDER_ERROR_MESSAGE,
      remainingSeconds,
    };
  } catch {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: AUTH_PROVIDER_ERROR_MESSAGE,
      remainingSeconds: 0,
    };
  }
}

export async function completePasswordRecovery(
  client: PasswordRecoveryClient | null | undefined,
  password: unknown,
  confirmPassword: unknown
): Promise<RecoveryActionResult> {
  if (!client) {
    return { ok: false, code: 'NO_CLIENT', message: PASSWORD_RESET_UNAVAILABLE_MESSAGE };
  }
  if (typeof password !== 'string' || password.length < 6) {
    return {
      ok: false,
      code: 'INVALID_PASSWORD',
      message: PASSWORD_UPDATE_INVALID_PASSWORD_MESSAGE,
    };
  }
  if (password !== confirmPassword) {
    return { ok: false, code: 'PASSWORD_MISMATCH', message: PASSWORD_UPDATE_MISMATCH_MESSAGE };
  }

  const hasRecoverySession = await verifyRecoverySession(client);
  if (!hasRecoverySession) {
    return {
      ok: false,
      code: 'INVALID_RECOVERY_SESSION',
      message: PASSWORD_RECOVERY_INVALID_MESSAGE,
    };
  }

  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      return { ok: false, code: 'PROVIDER_ERROR', message: PASSWORD_UPDATE_FAILED_MESSAGE };
    }

    let sessionsRevoked = false;
    if (typeof client.auth.signOut === 'function') {
      try {
        const { error: revokeError } = await client.auth.signOut({ scope: 'others' });
        sessionsRevoked = !revokeError;
      } catch {
        sessionsRevoked = false;
      }
    }

    return {
      ok: true,
      code: sessionsRevoked ? 'SUCCESS' : 'SUCCESS_WITHOUT_REVOCATION',
      message: sessionsRevoked
        ? PASSWORD_UPDATE_SUCCESS_MESSAGE
        : PASSWORD_UPDATE_REVOCATION_WARNING_MESSAGE,
      sessionsRevoked,
    };
  } catch {
    return { ok: false, code: 'PROVIDER_ERROR', message: PASSWORD_UPDATE_FAILED_MESSAGE };
  }
}
