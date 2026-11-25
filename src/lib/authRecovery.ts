// ============================================================================
// Supabase password-recovery helpers
// Pure, dependency-free helpers used by AuthModal/useAuth and local tests.
// No fake success paths: every success requires a real Supabase client call.
// ============================================================================

export const PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS = 60;

export const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account exists for this email, password reset instructions have been sent. Please check your inbox.';
export const PASSWORD_RESET_UNAVAILABLE_MESSAGE =
  'Password reset is unavailable right now. Please try again later.';
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
    | 'INVALID_EMAIL'
    | 'NO_CLIENT'
    | 'NO_CALLBACK'
    | 'PROVIDER_ERROR'
    | 'INVALID_RECOVERY_SESSION'
    | 'INVALID_PASSWORD'
    | 'PASSWORD_MISMATCH';
  sessionsRevoked?: boolean;
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

export async function requestPasswordReset(
  client: PasswordRecoveryClient | null | undefined,
  rawEmail: unknown,
  redirectTo: unknown
): Promise<RecoveryActionResult> {
  if (!client) {
    return { ok: false, code: 'NO_CLIENT', message: PASSWORD_RESET_UNAVAILABLE_MESSAGE };
  }

  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    return { ok: false, code: 'INVALID_EMAIL', message: PASSWORD_RESET_INVALID_EMAIL_MESSAGE };
  }

  const callbackUrl = getPasswordResetRedirectUrl(redirectTo);
  if (!callbackUrl) {
    return { ok: false, code: 'NO_CALLBACK', message: PASSWORD_RESET_NO_CALLBACK_MESSAGE };
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl,
    });
    if (error) {
      return { ok: false, code: 'PROVIDER_ERROR', message: AUTH_PROVIDER_ERROR_MESSAGE };
    }
    // Identical response for registered and unregistered emails to prevent enumeration.
    return { ok: true, code: 'SUCCESS', message: PASSWORD_RESET_GENERIC_MESSAGE };
  } catch {
    return { ok: false, code: 'PROVIDER_ERROR', message: AUTH_PROVIDER_ERROR_MESSAGE };
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
      code: 'SUCCESS',
      message: PASSWORD_UPDATE_SUCCESS_MESSAGE,
      sessionsRevoked,
    };
  } catch {
    return { ok: false, code: 'PROVIDER_ERROR', message: PASSWORD_UPDATE_FAILED_MESSAGE };
  }
}
