// Cloudflare Pages Function: GET /api/ai/usage-stats
import { CloudflareEnv, jsonResponse, handleOptions, edgeUsageStore } from '../_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { request: Request; env: CloudflareEnv }) {
  const url = new URL(context.request.url);
  const tenantId = url.searchParams.get('tenantId') || 'default-tenant';
  const tenant = edgeUsageStore[tenantId] || { requestsCount: 0, dailyLimit: 50, lastReset: new Date().toISOString() };

  return jsonResponse({
    tenantId,
    usage: tenant,
    totalTenantsActive: Object.keys(edgeUsageStore).length,
    allUsage: edgeUsageStore,
    runtime: 'cloudflare-pages-edge',
  });
}
