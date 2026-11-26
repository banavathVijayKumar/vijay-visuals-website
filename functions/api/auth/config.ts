// ============================================================================
// GET /api/auth/config — Public Supabase Client Bootstrap Config (Cloudflare Pages)
// Reuses the existing Cloudflare Pages environment/encrypted secrets
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) for the browser Supabase Auth
// client without ever exposing private server secrets (never service_role).
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { getSupabaseAdminConfig } from './_supabaseAdmin';

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
  const rawUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '');
  const supabaseUrl = normalizeSupabaseUrl(rawUrl);
  const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();

  const configured = isValidSupabaseUrl(supabaseUrl) && isValidAnonKey(supabaseAnonKey);
  // Boolean-only server diagnostic. The service-role/secret key value is never
  // returned to the browser or written to logs.
  const admin = getSupabaseAdminConfig(env);

  return jsonResponse(
    configured
      ? {
          configured: true,
          supabaseUrl,
          supabaseAnonKey,
          hasServerAdminCredential: Boolean(admin),
          serverAdminKeyFormat: admin?.keyFormat || null,
        }
      : {
          configured: false,
          supabaseUrl: '',
          supabaseAnonKey: '',
          hasServerAdminCredential: Boolean(admin),
          serverAdminKeyFormat: admin?.keyFormat || null,
        },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
