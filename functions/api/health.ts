// Cloudflare Pages Function: GET /api/health
import { CloudflareEnv, jsonResponse, handleOptions } from './_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { env: CloudflareEnv }) {
  const env = context.env;
  return jsonResponse({
    status: 'online',
    runtime: 'cloudflare-pages-edge',
    platform: 'VIJAY VISUALS Multi-Tenant Platform',
    aiProvider: env.AI_PROVIDER || 'gemini',
    hasGeminiKey: Boolean(env.GEMINI_API_KEY),
    hasClaudeKey: Boolean(env.CLAUDE_API_KEY),
    hasDatabase: Boolean(env.DB),
    hasRazorpayConfig: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
    serverTime: new Date().toISOString(),
  });
}
