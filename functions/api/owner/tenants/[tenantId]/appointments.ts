// ============================================================================
// GET /api/owner/tenants/:tenantId/appointments — Owner Views Their Bookings
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  try {
    const res = await env.DB!.prepare(
      `SELECT * FROM appointments WHERE website_id = ? ORDER BY created_at DESC LIMIT 100`
    )
      .bind(access.row.website_id)
      .all<Record<string, any>>();

    const appointments = (res.results || []).map((a) => {
      const parts = String(a.scheduled_start || '').split(' ');
      return {
        id: Number(a.id),
        tenantId: Number(access.row.rowid || 0),
        customerUserId: null,
        customerName: String(a.customer_name || ''),
        customerPhone: String(a.customer_phone || ''),
        customerEmail: String(a.customer_email || ''),
        serviceName: String(a.service_name || ''),
        staffAssigned: String(a.assigned_staff_name || ''),
        bookingDate: parts[0] || '',
        timeSlot: parts.slice(1).join(' ') || '',
        advanceAmountInr: 0,
        status: String(a.status || 'pending'),
        notes: String(a.notes || ''),
        createdAt: String(a.created_at || ''),
      };
    });

    return jsonResponse({ appointments });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ appointments: [] });
    }
    return jsonResponse({ error: 'Unable to load appointments.' }, 500);
  }
}
