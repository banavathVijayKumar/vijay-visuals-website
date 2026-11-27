// ============================================================================
// VIJAY VISUALS — UNIFIED CLOUDFLARE PAGES EDGE HEALTH ENDPOINT
// Preserves all GitHub health fields + new integration readiness booleans
// ZERO secrets exposed.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';
import { isGmailOAuthConfigured } from './_gmailOAuth';
import { getTrimmedEnvVar } from './payments/_cashfree';

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

  const clientId = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_ID');
  const clientSecret = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_SECRET');
  const cashfreeConfigured = Boolean(clientId && clientSecret);
  const cashfreeMode = !cashfreeConfigured
    ? 'not_configured'
    : (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase() === 'production'
      ? 'production'
      : 'sandbox';

  const hasSupabaseAuth = Boolean(
    (env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY)
  );
  const hasGeminiKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  const hasClaudeKey = Boolean(env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY);
  const nowIso = new Date().toISOString();

  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const hasResend = Boolean(env.RESEND_API_KEY);
  const hasGmailOAuth = isGmailOAuthConfigured(env);
  const hasWhatsApp = Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

  return jsonResponse({
    status: 'online',
    runtime: 'cloudflare-pages-edge',
    platform: 'VIJAY VISUALS Multi-Tenant Platform',
    paymentGateway: 'Cashfree Payments',
    hasCashfreeConfig: cashfreeConfigured,
    cashfreeMode,
    aiProvider: env.AI_PROVIDER || 'gemini',
    hasGeminiKey,
    hasClaudeKey,
    hasDatabase: Boolean(env.DB),
    databaseReachable: dbReachable,
    hasSupabaseAuth,
    hasCloudflareApi: Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID),
    hasRegistrarApi: Boolean(env.DOMAIN_REGISTRAR_PROVIDER && env.DOMAIN_REGISTRAR_API_KEY),
    hasSmtp,
    hasResend,
    hasGmailOAuth,
    hasWhatsApp,
    hasGoogleMaps: Boolean(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY),
    integrations: {
      supabaseAuth: hasSupabaseAuth,
      cloudflareD1: dbReachable,
      gemini: hasGeminiKey,
      geminiAi: hasGeminiKey,
      cashfree: cashfreeConfigured,
      cashfreeGateway: cashfreeConfigured,
      googleMaps: Boolean(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY),
      whatsapp: hasWhatsApp,
      whatsappCloudApi: hasWhatsApp,
      smtp: hasSmtp,
      smtpEmail: hasSmtp,
      resend: hasResend,
      resendEmail: hasResend,
      gmailOAuth: hasGmailOAuth,
      gmailOtp: hasGmailOAuth,
    },
    serverTime: nowIso,
    timestamp: nowIso,
  });
}
