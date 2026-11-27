// ============================================================================
// PREVIEW-ONLY PUBLIC SUPABASE BOOTSTRAP FALLBACK
// These values are public browser credentials (never the service-role key).
// They restore Preview runtime config after Pages rejected wrangler preview
// vars. Production resolves its own environment values and is never affected.
// ============================================================================

export const VERIFIED_PREVIEW_SUPABASE_URL = 'https://nflqxcrgwxoqvqbveisq.supabase.co';
export const VERIFIED_PREVIEW_SUPABASE_ANON_KEY = 'sb_publishable_BxyDJmuSmWNZaCFK1All7w_qqRN-LHW';

const KNOWN_STALE_PREVIEW_REF = 'nflqxcrgwxoqvqvbvejsa';

export interface SupabaseBootstrapConfig {
  url: string;
  anonKey: string;
  usedPreviewFallback: boolean;
}

export function resolveSupabaseBootstrap(env: {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): SupabaseBootstrapConfig {
  const envUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim();
  const needsPreviewFallback =
    !envUrl || envUrl.includes(KNOWN_STALE_PREVIEW_REF);

  if (needsPreviewFallback) {
    return {
      url: VERIFIED_PREVIEW_SUPABASE_URL,
      anonKey: VERIFIED_PREVIEW_SUPABASE_ANON_KEY,
      usedPreviewFallback: true,
    };
  }

  return {
    url: envUrl,
    anonKey: String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || VERIFIED_PREVIEW_SUPABASE_ANON_KEY).trim(),
    usedPreviewFallback: false,
  };
}