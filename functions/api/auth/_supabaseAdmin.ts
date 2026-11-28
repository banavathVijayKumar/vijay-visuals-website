// ============================================================================
// SERVER-ONLY SUPABASE ADMIN PROVISIONING
// This module must never be imported from browser/client code. The service
// role/secret key is read only from Cloudflare Pages secrets and is never
// returned in API responses, logs, or error details.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { CloudflareEnv } from '../_shared';
import { resolveSupabaseBootstrap } from '../_previewSupabase';

export type AdminKeyFormat = 'jwt' | 'secret_text' | 'opaque';

export interface SupabaseAdminConfig {
  url: string;
  key: string;
  keyFormat: AdminKeyFormat;
}

export interface ProvisionCustomerInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export type ProvisionCustomerResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; code: string; status: number };

export interface AdminUserRef {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
}

export interface AdminError {
  message?: string;
  status?: number;
}

interface AdminClientLike {
  auth: {
    admin: {
      createUser: (attributes: Record<string, unknown>) => Promise<{
        data: { user?: AdminUserRef } | null;
        error: AdminError | null;
      }>;
      updateUserById: (
        id: string,
        attributes: Record<string, unknown>
      ) => Promise<{
        data: { user?: AdminUserRef } | null;
        error: AdminError | null;
      }>;
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users?: AdminUserRef[] };
        error: AdminError | null;
      }>;
    };
  };
}

interface AdminDeps {
  client?: AdminClientLike;
}

export function getSupabaseAdminConfig(env: CloudflareEnv): SupabaseAdminConfig | null {
  const rawUrl = resolveSupabaseBootstrap(env).url.trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!rawUrl || !key || key.length < 20) return null;
  if (/your[-_]?(service|secret|role)[-_]?key/i.test(key)) return null;
  let url = rawUrl.replace(/\/+$/, '');
  try {
    url = new URL(url).origin;
  } catch {
    url = rawUrl.replace(/\/(auth|rest)\/v1\/?$/i, '').replace(/\/+$/, '');
  }
  const keyFormat = getSupabaseAdminKeyFormat(key);
  if (!keyFormat) return null;
  return { url, key, keyFormat };
}

export function getSupabaseAdminKeyFormat(key: string): AdminKeyFormat | null {
  const clean = String(key || '').trim();
  if (clean.length < 20) return null;
  if (clean.startsWith('sb_secret_')) return 'secret_text';
  return clean.split('.').length === 3 ? 'jwt' : 'opaque';
}

export function createSupabaseAdminClient(config: SupabaseAdminConfig): AdminClientLike {
  const client = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return client as unknown as AdminClientLike;
}

function providerFailure(error: AdminError | null): ProvisionCustomerResult {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  if (status === 429 || message.includes('rate limit') || message.includes('over_email_send')) {
    return { ok: false, code: 'SUPABASE_RATE_LIMITED', status: 429 };
  }
  if (message.includes('email') && (message.includes('invalid') || message.includes('address'))) {
    return { ok: false, code: 'EMAIL_ADDRESS_INVALID', status: 400 };
  }
  if (message.includes('password')) {
    return { ok: false, code: 'PASSWORD_REJECTED', status: 400 };
  }
  return { ok: false, code: 'PROVISIONING_FAILED', status: 502 };
}

function isDuplicateEmailError(error: AdminError | null): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('already exists') ||
    message.includes('email_exists') ||
    message.includes('duplicate key') ||
    Number(error?.status || 0) === 409
  );
}

async function findExistingUserId(
  client: AdminClientLike,
  email: string
): Promise<{ id: string; error: AdminError | null }> {
  // Auth Admin listUsers is paginated and does not expose an email filter in
  // the pinned SDK. A bounded scan is sufficient for duplicate protection and
  // avoids relying on an undocumented GoTrue query parameter.
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { id: '', error };
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (match?.id) return { id: String(match.id), error: null };
    if (users.length < 1000) break;
  }
  return { id: '', error: null };
}

async function updateExistingCustomer(
  client: AdminClientLike,
  id: string,
  attributes: Record<string, unknown>
): Promise<ProvisionCustomerResult> {
  const { data, error } = await client.auth.admin.updateUserById(id, attributes);
  if (error || !data?.user?.id) return providerFailure(error || null);
  return { ok: true, userId: String(data.user.id), created: false };
}

/**
 * Creates or confirms a Supabase identity after first-party OTP validation.
 * `email_confirm: true` prevents a second confirmation email. Existing email
 * addresses are treated idempotently: mailbox control was already proven by
 * the OTP, so an unconfirmed/stuck registration can be completed safely.
 */
export async function provisionVerifiedCustomer(
  env: CloudflareEnv,
  input: ProvisionCustomerInput,
  deps: AdminDeps = {}
): Promise<ProvisionCustomerResult> {
  const config = getSupabaseAdminConfig(env);
  if (!config) {
    return { ok: false, code: 'ADMIN_CREDENTIAL_MISSING', status: 503 };
  }

  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const fullName = String(input.fullName || '').trim().slice(0, 100);
  const phone = String(input.phone || '').trim().slice(0, 20);
  if (!email.includes('@') || email.length > 254) {
    return { ok: false, code: 'EMAIL_ADDRESS_INVALID', status: 400 };
  }
  if (password.length < 6 || password.length > 128) {
    return { ok: false, code: 'PASSWORD_REJECTED', status: 400 };
  }

  const client = deps.client || createSupabaseAdminClient(config);
  const existing = await findExistingUserId(client, email);
  if (existing.error) {
    return providerFailure(existing.error);
  }

  const metadata = { full_name: fullName, phone, role: 'customer', email_verified: true };
  const attributes = {
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  };

  if (existing.id) {
    return updateExistingCustomer(client, existing.id, attributes);
  }

  const { data, error } = await client.auth.admin.createUser(attributes);
  if (error) {
    if (isDuplicateEmailError(error)) {
      const retry = await findExistingUserId(client, email);
      if (retry.id && !retry.error) {
        return updateExistingCustomer(client, retry.id, attributes);
      }
    }
    return providerFailure(error);
  }
  if (!data?.user?.id) {
    return { ok: false, code: 'PROVISIONING_FAILED', status: 502 };
  }
  return { ok: true, userId: String(data.user.id), created: true };
}

/**
 * Returns only boolean email-confirmation state keyed by provider user id and
 * normalized email. No raw provider profile, token, or secret is returned.
 */
export async function listSupabaseEmailVerification(
  env: CloudflareEnv,
  deps: AdminDeps = {}
): Promise<{ available: boolean; byId: Map<string, boolean>; byEmail: Map<string, boolean> }> {
  const byId = new Map<string, boolean>();
  const byEmail = new Map<string, boolean>();
  const config = getSupabaseAdminConfig(env);
  if (!config) return { available: false, byId, byEmail };

  try {
    const client = deps.client || createSupabaseAdminClient(config);
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return { available: false, byId, byEmail };
      const users = Array.isArray(data?.users) ? data.users : [];
      for (const user of users) {
        const verified = Boolean(user.email_confirmed_at);
        if (user.id) byId.set(String(user.id), verified);
        if (user.email) byEmail.set(String(user.email).trim().toLowerCase(), verified);
      }
      if (users.length < 1000) break;
    }
    return { available: true, byId, byEmail };
  } catch {
    return { available: false, byId, byEmail };
  }
}

/**
 * Safe boolean-only capability probe for the configured admin credential.
 * Never returns the key, user data, or raw provider error text.
 */
export async function probeSupabaseAdminClient(
  env: CloudflareEnv,
  deps: AdminDeps = {}
): Promise<{ ok: boolean; keyFormat: AdminKeyFormat | null; code?: string }> {
  const config = getSupabaseAdminConfig(env);
  if (!config) return { ok: false, keyFormat: null, code: 'ADMIN_CREDENTIAL_MISSING' };
  try {
    const client = deps.client || createSupabaseAdminClient(config);
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, keyFormat: config.keyFormat, code: 'ADMIN_CLIENT_REJECTED' };
    return { ok: true, keyFormat: config.keyFormat };
  } catch {
    return { ok: false, keyFormat: config.keyFormat, code: 'ADMIN_CLIENT_REJECTED' };
  }
}

/**
 * UI role labels are translated to the exact Supabase `profiles.role` values
 * understood by requireUser(). A raw client string is never written directly.
 */
export const UI_ROLE_TO_SUPABASE_PROFILE_ROLE = {
  super_admin: 'super_admin',
  business_owner: 'shop_owner',
  staff: 'business_staff',
  delivery_partner: 'delivery_partner',
  customer: 'customer',
} as const;

export type SupabaseProfileRoleUpdateResult =
  | { ok: true }
  | { ok: false; code: string; status: number };

/**
 * Updates the authoritative Supabase profile role via the service-role key.
 * D1 is only a mirror; callers must not report success unless this succeeds.
 * No key, profile payload, or provider error text is returned to the client.
 */
export async function updateSupabaseProfileRole(
  env: CloudflareEnv,
  authSubject: string,
  supabaseRole: string
): Promise<SupabaseProfileRoleUpdateResult> {
  const config = getSupabaseAdminConfig(env);
  if (!config) return { ok: false, code: 'ADMIN_CREDENTIAL_MISSING', status: 503 };

  const subject = String(authSubject || '').trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(subject)) {
    return { ok: false, code: 'INVALID_USER_SUBJECT', status: 400 };
  }
  const allowedRoles = new Set<string>(Object.values(UI_ROLE_TO_SUPABASE_PROFILE_ROLE));
  if (!allowedRoles.has(supabaseRole)) {
    return { ok: false, code: 'INVALID_ROLE', status: 400 };
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(subject)}&select=id,role`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.key}`,
          apikey: config.key,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ role: supabaseRole }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      const code =
        status === 401 || status === 403
          ? 'PROFILE_UPDATE_FORBIDDEN'
          : status === 404
            ? 'PROFILE_NOT_FOUND'
            : 'PROFILE_UPDATE_FAILED';
      return { ok: false, code, status };
    }

    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, code: 'PROFILE_NOT_FOUND', status: 404 };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'PROFILE_UPDATE_FAILED', status: 502 };
  }
}
