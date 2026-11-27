// ============================================================================
// GET /api/auth/config — Public Supabase Client Bootstrap Config (Cloudflare Pages)
// Reuses the existing Cloudflare Pages environment/encrypted secrets
// (SUPABASE_URL / SUPABASE_ANON_KEY, with VITE_* aliases as fallbacks) for the browser Supabase Auth
// client without ever exposing private server secrets (never service_role).
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { resolveSupabaseBootstrap } from '../_previewSupabase';
import { getSupabaseAdminConfig, probeSupabaseAdminClient } from './_supabaseAdmin';

const PLACEHOLDER_URLS = new Set(['https://your-project.supabase.co', 'https://your_project_ref.supabase.co']);
const PLACEHOLDER_KEYS = new Set(['your-anon-key', 'your_supabase_anon_key']);

/**
 * Normalizes a Supabase project URL to its root origin (e.g. "https://xxxx.supabase.co").
 * Strips accidental paths such as "/rest/v1", "/auth/v1", and trailing slashes.
 */
export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/auth\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  const clean = normalizeSupabaseUrl(url);
  const lower = clean.toLowerCase();
  if (PLACEHOLDER_URLS.has(lower)) return false;
  try {
    const parsed = new URL(clean);
    return parsed.protocol === 'https:' && parsed.hostname.length > 3;
  } catch {
    return false;
  }
}

function isValidAnonKey(key: string): boolean {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (PLACEHOLDER_KEYS.has(lower)) return false;
  return key.length >= 20;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  // Read ONLY public Supabase browser client credentials from Cloudflare env/secrets.
  // Never read or return SUPABASE_SERVICE_ROLE_KEY or any private backend key.
  const bootstrap = resolveSupabaseBootstrap(env);
  const supabaseUrl = normalizeSupabaseUrl(bootstrap.url);
  const supabaseAnonKey = bootstrap.anonKey.trim();

  const configured = isValidSupabaseUrl(supabaseUrl) && isValidAnonKey(supabaseAnonKey);
  // Boolean-only server diagnostics. The service-role/secret key value is never
  // returned to the browser or written to logs. The probe only lists one user
  // and proves that the configured admin credential belongs to this project.
  const admin = getSupabaseAdminConfig(env);
  const adminProbe = admin ? await probeSupabaseAdminClient(env) : null;
  const adminDiagnostics = {
    hasServerAdminCredential: Boolean(admin),
    serverAdminKeyFormat: admin?.keyFormat || null,
    serverAdminProjectMatches: adminProbe?.ok === true,
  };

  return jsonResponse(
    configured
      ? {
          configured: true,
          supabaseUrl,
          supabaseAnonKey,
          ...adminDiagnostics,
        }
      : {
          configured: false,
          supabaseUrl: '',
          supabaseAnonKey: '',
          ...adminDiagnostics,
        },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
