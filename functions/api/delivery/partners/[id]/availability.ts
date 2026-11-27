// ============================================================================
// PATCH /api/delivery/partners/:id/availability — Toggle Partner Online Status
//
// Online/offline is durable rider state inside permissions_json. It never
// writes membership status: offline keeps an active approved membership and
// assignment authority, while only auto-assignment and ETA exclude the rider.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../../../_shared';
import {
  hasDurableOwnerApproval,
  readRiderState,
  withRiderState,
} from '../../_riderState';

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
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return jsonResponse({ error: 'Invalid partner ID.' }, 400);
  }

  const body = await parseJsonBody<{ available?: boolean }>(request);
  const availability = body?.available === true ? 'online' : 'offline';

  try {
    const current = await env.DB.prepare(
      `SELECT id, website_id, role, status, permissions_json, user_id, email
       FROM tenant_memberships
       WHERE id = ? AND role = 'delivery_partner'
       LIMIT 1`
    )
      .bind(partnerId)
      .first<Record<string, any>>();

    if (!current?.id) {
      return jsonResponse({ error: 'Delivery partner profile not found.' }, 404);
    }

    if (!auth.user.isSuperAdmin) {
      const isSelf =
        String(current.user_id || '') === auth.user.id ||
        String(current.user_id || '') === auth.user.authSubject ||
        String(current.email || '').toLowerCase() === String(auth.user.email || '').toLowerCase();
      if (!isSelf) {
        return jsonResponse({ error: 'You can only change your own availability.' }, 403);
      }
    }

    // Durable approval, not membership status, gates going online. Suspended or
    // unapproved riders stay blocked; an approved rider needs no reapproval.
    if (!hasDurableOwnerApproval(current)) {
      return jsonResponse(
        { error: 'Owner approval is required before going online.' },
        403
      );
    }

    const observedPermissionsJson = String(current.permissions_json || '');
    const nextPermissionsJson = withRiderState(observedPermissionsJson, { availability });
    const result = await env.DB.prepare(
      `UPDATE tenant_memberships
       SET permissions_json = ?, updated_at = datetime('now')
       WHERE id = ? AND role = 'delivery_partner' AND permissions_json = ?`
    )
      .bind(nextPermissionsJson, partnerId, observedPermissionsJson)
      .run();

    if (!result.meta?.changes) {
      return jsonResponse(
        { error: 'Availability changed concurrently. Reload and retry.' },
        409
      );
    }

    return jsonResponse({
      success: true,
      availability,
      available: availability === 'online',
      deliveryApproval: readRiderState(nextPermissionsJson).deliveryApproval,
    });
  } catch {
    return jsonResponse({ error: 'Failed to update partner availability.' }, 500);
  }
}
