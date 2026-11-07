// Cloudflare Pages Function: GET /api/health
import { CloudflareEnv, jsonResponse, handleOptions } from './_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { env: CloudflareEnv }) {
  const hasGeminiKey = Boolean(context.env.GEMINI_API_KEY || context.env.GOOGLE_GENAI_API_KEY);
  return jsonResponse({
    status: 'online',
    runtime: 'cloudflare-pages-edge',
    platform: 'VIJAY VISUALS Multi-Tenant Platform',
    hasGeminiKey,
    serverTime: new Date().toISOString(),
  });
}
