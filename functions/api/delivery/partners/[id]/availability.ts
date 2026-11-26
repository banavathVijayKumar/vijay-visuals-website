// ============================================================================
// PATCH /api/delivery/partners/:id/availability — Toggle Partner Online Status
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const partnerId = Number(params.id);
  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return jsonResponse({ error: 'Invalid partner ID.' }, 400);
  }

  const body = await parseJsonBody<{ available?: boolean }>(request);
  const nextStatus = body?.available ? 'active' : 'suspended';

  try {
    const result = auth.user.isSuperAdmin
      ? await env.DB.prepare(
          `UPDATE tenant_memberships SET status = ? WHERE id = ? AND role = 'delivery_partner'`
        )
          .bind(nextStatus, partnerId)
          .run()
      : await env.DB.prepare(
          `UPDATE tenant_memberships SET status = ?
           WHERE id = ? AND role = 'delivery_partner'
             AND (user_id = ? OR user_id = ? OR email = ?)`
        )
          .bind(nextStatus, partnerId, auth.user.id, auth.user.authSubject, auth.user.email)
          .run();

    if (!auth.user.isSuperAdmin && result.meta?.changes === 0) {
      return jsonResponse({ error: 'Delivery partner profile not found.' }, 404);
    }

    return jsonResponse({ success: true, available: body?.available ?? true });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update partner availability.' }, 500);
  }
}
