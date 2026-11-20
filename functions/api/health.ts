// ============================================================================
// VIJAY VISUALS — UNIFIED CLOUDFLARE PAGES EDGE HEALTH ENDPOINT
// Preserves all GitHub health fields + new integration readiness booleans
// ZERO secrets exposed.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  let dbReachable = false;
  if (env.DB) {
    try {
      await env.DB.prepare('SELECT 1 AS ok').first();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }

  const razorpayConfigured = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const razorpayMode = !razorpayConfigured
    ? 'not_configured'
    : env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && env.RAZORPAY_LIVE_APPROVED === 'true'
      ? 'live'
      : 'test';

  const hasSupabaseAuth = Boolean(
    (env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
  );
  const hasGeminiKey = Boolean(env.GEMINI_API_KEY);
  const hasClaudeKey = Boolean(env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY);
  const nowIso = new Date().toISOString();

  return jsonResponse({
    status: 'online',
    runtime: 'cloudflare-pages-edge',
    platform: 'VIJAY VISUALS Multi-Tenant Platform',
    aiProvider: env.AI_PROVIDER || 'gemini',
    hasGeminiKey,
    hasClaudeKey,
    hasDatabase: Boolean(env.DB),
    databaseReachable: dbReachable,
    hasSupabaseAuth,
    hasRazorpayConfig: razorpayConfigured,
    razorpayMode,
    hasCloudflareApi: Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID),
    hasRegistrarApi: Boolean(env.DOMAIN_REGISTRAR_PROVIDER && env.DOMAIN_REGISTRAR_API_KEY),
    hasSmtp: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
    hasWhatsApp: Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    hasGoogleMaps: Boolean(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY),
    integrations: {
      supabaseAuth: hasSupabaseAuth,
      cloudflareD1: dbReachable,
      gemini: hasGeminiKey,
      razorpay: razorpayConfigured,
      googleMaps: Boolean(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY),
      whatsapp: Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    },
    serverTime: nowIso,
    timestamp: nowIso,
  });
}
