// ============================================================================
// GET /api/auth/config — Public Supabase Client Bootstrap Config (Cloudflare Pages)
// Reuses the existing Cloudflare Pages environment/encrypted secrets
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) for the browser Supabase Auth
// client without ever exposing private server secrets (never service_role).
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from '../_shared';

const PLACEHOLDER_URLS = new Set(['https://your-project.supabase.co', 'https://your_project_ref.supabase.co']);
const PLACEHOLDER_KEYS = new Set(['your-anon-key', 'your_supabase_anon_key']);

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (PLACEHOLDER_URLS.has(lower)) return false;
  try {
    const parsed = new URL(url);
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
  const supabaseUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();

  const configured = isValidSupabaseUrl(supabaseUrl) && isValidAnonKey(supabaseAnonKey);

  return jsonResponse(
    configured
      ? {
          configured: true,
          supabaseUrl,
          supabaseAnonKey,
        }
      : {
          configured: false,
          supabaseUrl: '',
          supabaseAnonKey: '',
        },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
