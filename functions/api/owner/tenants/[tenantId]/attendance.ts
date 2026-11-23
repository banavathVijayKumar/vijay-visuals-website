// ============================================================================
// POST /api/owner/tenants/:tenantId/attendance — Record Staff Daily Attendance
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    staffId?: number;
    status?: string;
    salaryPaidInr?: number;
    notes?: string;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const staffId = Number(body.staffId) || 0;
  const status = ['present', 'half_day', 'absent', 'leave'].includes(String(body.status || ''))
    ? String(body.status)
    : 'present';
  const salaryPaidInr = Math.max(0, Math.trunc(Number(body.salaryPaidInr) || 0));
  const notes = sanitizeText(body.notes, 300);
  const todayDate = new Date().toISOString().slice(0, 10);

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const res = await env.DB!.prepare(
      `INSERT INTO staff_attendance_payroll (website_id, membership_id, work_date, status, notes)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(websiteId, staffId, todayDate, status, notes)
      .run();

    const createdAtt = {
      id: Number(res.meta?.last_row_id || Date.now()),
      tenantId: tenantRowId,
      staffId,
      recordDate: todayDate,
      status,
      salaryPaidInr,
      notes,
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'record_attendance',
      targetType: 'staff',
      targetId: String(staffId),
      details: { websiteId, status, workDate: todayDate },
    });

    return jsonResponse({ success: true, attendance: createdAtt });
  } catch (err) {
    if (isMissingTableError(err)) {
      const currentAtt: any[] = Array.isArray(access.parsed.attendance) ? [...access.parsed.attendance] : [];
      const createdAtt = {
        id: Date.now(),
        tenantId: tenantRowId,
        staffId,
        recordDate: todayDate,
        status,
        salaryPaidInr,
        notes,
      };
      currentAtt.unshift(createdAtt);
      access.parsed.attendance = currentAtt;

      await env.DB!.prepare(
        `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(JSON.stringify(access.parsed), websiteId)
        .run();

      return jsonResponse({ success: true, attendance: createdAtt });
    }
    return jsonResponse({ error: 'Failed to record attendance.' }, 500);
  }
}
