// Legacy endpoint retained for compatibility. Plan usage limits are managed in D1 plans.
import { CloudflareEnv, jsonResponse, handleOptions } from '../../_shared';
import { requireUser, isResponse } from '../../marketplace/_auth';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  const user = await requireUser(context.request, context.env);
  if (isResponse(user)) return user;
  if (user.role !== 'admin') {
    return jsonResponse({ error: 'Admin access is required.', code: 'FORBIDDEN' }, 403);
  }
  return jsonResponse({
    error: 'Tenant-level in-memory quotas are retired. Configure usage_limit on the service plan in Marketplace Admin.',
    code: 'USE_D1_PLAN_LIMITS',
  }, 409);
}
