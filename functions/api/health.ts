
import { CloudflareEnv, jsonResponse, handleOptions } from './_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { env: CloudflareEnv }) {
  const hasOpenAIKey = Boolean(context.env.OPENAI_API_KEY);

  return jsonResponse({
    status: 'online',
    runtime: 'cloudflare-pages-edge',
    platform: 'VIJAY VISUALS Multi-Tenant Platform',
    hasOpenAIKey,
    serverTime: new Date().toISOString(),
  });
}
