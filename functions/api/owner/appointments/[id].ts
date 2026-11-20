// ============================================================================
// PATCH /api/owner/appointments/:id — Owner Updates Appointment Status
// Strictly verifies ownership via appointments.website_id (403 on cross-tenant).
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../_tenantAccess';

const ALLOWED_STATUSES = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']);

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const apptId = Number(params.id);
  if (!Number.isInteger(apptId) || apptId <= 0) {
    return jsonResponse({ error: 'Invalid appointment ID.' }, 400);
  }

  if (!env.DB) return jsonResponse({ error: 'Database storage is not configured.' }, 503);

  let existing: Record<string, any> | null = null;
  try {
    existing = await env.DB.prepare('SELECT * FROM appointments WHERE id = ? LIMIT 1')
      .bind(apptId)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Appointments require D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load appointment.' }, 500);
  }

  if (!existing) return jsonResponse({ error: 'Appointment not found.' }, 404);

  const access = await requireTenantOwnerAccess(env, auth.user, String(existing.website_id), [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{ status?: string; staffAssigned?: string }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const nextStatus = body.status ? String(body.status) : String(existing.status);
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    return jsonResponse({ error: 'Invalid appointment status.' }, 400);
  }
  const nextStaff =
    typeof body.staffAssigned === 'string'
      ? sanitizeText(body.staffAssigned, 100)
      : String(existing.assigned_staff_name || '');

  await env.DB.prepare(
    `UPDATE appointments SET status = ?, assigned_staff_name = ? WHERE id = ? AND website_id = ?`
  )
    .bind(nextStatus, nextStaff, apptId, existing.website_id)
    .run();

  return jsonResponse({ ok: true, id: apptId, status: nextStatus, staffAssigned: nextStaff });
}
