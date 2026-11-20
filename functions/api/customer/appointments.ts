// ============================================================================
// GET /api/customer/appointments — Authenticated Customer's Own Bookings
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { isMissingTableError } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ appointments: [] });

  try {
    const res = await env.DB.prepare(
      `SELECT a.*, p.rowid AS tenant_rowid
       FROM appointments a
       LEFT JOIN customer_website_publications p ON p.website_id = a.website_id
       WHERE LOWER(a.customer_email) = LOWER(?)
       ORDER BY a.created_at DESC LIMIT 50`
    )
      .bind(auth.user.email)
      .all<Record<string, any>>();

    const appointments = (res.results || []).map((a) => {
      const parts = String(a.scheduled_start || '').split(' ');
      return {
        id: Number(a.id),
        tenantId: Number(a.tenant_rowid || 0),
        customerUserId: 1,
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
    if (isMissingTableError(err)) return jsonResponse({ appointments: [] });
    return jsonResponse({ error: 'Unable to load appointments.' }, 500);
  }
}
