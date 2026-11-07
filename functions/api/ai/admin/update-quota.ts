// Cloudflare Pages Function: POST /api/ai/admin/update-quota
import { CloudflareEnv, jsonResponse, handleOptions, edgeUsageStore } from '../../_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { tenantId, dailyLimit } = body;

    if (!tenantId || typeof dailyLimit !== 'number') {
      return jsonResponse({ error: 'tenantId and dailyLimit (number) required.' }, 400);
    }

    if (!edgeUsageStore[tenantId]) {
      edgeUsageStore[tenantId] = { requestsCount: 0, dailyLimit, lastReset: new Date().toISOString() };
    } else {
      edgeUsageStore[tenantId].dailyLimit = dailyLimit;
    }

    return jsonResponse({ success: true, updated: edgeUsageStore[tenantId] });
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Failed to update quota.' }, 500);
  }
}
