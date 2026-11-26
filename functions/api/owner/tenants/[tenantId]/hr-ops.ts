// ============================================================================
// GET /api/owner/tenants/:tenantId/hr-ops
// Cloudflare Pages / D1 port of the Express HR + staff task listing.
// D1 sources: tenant_memberships, developer_tasks, staff_attendance_payroll.
// Salary figures are only returned to the tenant owner / super admin.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import { PagesContext, errorJson, handleOptions, jsonResponse } from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

const D1_TASK_TO_UI_STATUS: Record<string, string> = {
  assigned: 'pending',
  in_progress: 'in_progress',
  review_pending: 'in_progress',
  completed: 'completed',
  blocked: 'in_progress',
};

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toIso(value: unknown): string {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(' ', 'T')}Z`;
  return s;
}

function parseJsonObject(raw: unknown): Record<string, any> {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;
  const canViewPayroll =
    auth.user.isSuperAdmin ||
    access.effectiveRole === 'super_admin' ||
    access.effectiveRole === 'business_owner';

  try {
    const [staffRes, taskRes, attendanceRes] = await Promise.all([
      env.DB.prepare(
        `SELECT id, email, full_name, role, status, created_at
         FROM tenant_memberships WHERE website_id = ? AND status = 'active'
         ORDER BY id DESC LIMIT 200`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, title, description, priority, status, assigned_developer_id,
                assigned_developer_name, deadline, internal_notes, created_at, updated_at
         FROM developer_tasks WHERE website_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 500`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
      env.DB.prepare(
        `SELECT id, membership_id, work_date, status, notes, created_at
         FROM staff_attendance_payroll WHERE website_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 100`
      )
        .bind(websiteId)
        .all<Record<string, any>>(),
    ]);

    const staff = (staffRes.results || []).map((s) => ({
      id: toInt(s.id),
      tenantId: tenantRowId,
      name: String(s.full_name || s.email || ''),
      email: String(s.email || ''),
      staffRole: String(s.role || 'business_staff'),
      active: String(s.status || 'active') === 'active',
      createdAt: toIso(s.created_at),
    }));

    const tasks = (taskRes.results || []).map((t) => {
      const meta = parseJsonObject(t.internal_notes);
      const rawStatus = String(t.status || 'assigned');
      const staffIdValue = Number(t.assigned_developer_id || 0);
      return {
        id: toInt(t.id),
        tenantId: tenantRowId,
        staffId: Number.isInteger(staffIdValue) && staffIdValue > 0 ? staffIdValue : null,
        staffName: String(t.assigned_developer_name || 'Unassigned'),
        title: String(t.title || ''),
        description: String(t.description || ''),
        priority: ['low', 'normal', 'high', 'urgent'].includes(String(t.priority))
          ? String(t.priority)
          : 'normal',
        dueDate: String(t.deadline || ''),
        status: D1_TASK_TO_UI_STATUS[rawStatus] || 'pending',
        assignedBy: String(meta.assignedBy || ''),
        createdAt: toIso(t.created_at),
        updatedAt: toIso(t.updated_at),
      };
    });

    const attendance = (attendanceRes.results || []).map((a) => {
      const rawNotes = String(a.notes || '');
      const meta = rawNotes.trimStart().startsWith('{') ? parseJsonObject(rawNotes) : {};
      const salaryPaidInr = Math.max(0, toInt(meta.salaryPaidInr, 0));
      return {
        id: toInt(a.id),
        tenantId: tenantRowId,
        staffId: toInt(a.membership_id, 0),
        recordDate: String(a.work_date || ''),
        status: String(a.status || 'present'),
        salaryPaidInr: canViewPayroll ? salaryPaidInr : null,
        notes: String(meta.notes || rawNotes || ''),
        createdAt: toIso(a.created_at),
      };
    });

    return jsonResponse({
      canViewPayroll,
      staff,
      tasks,
      attendance,
    });
  } catch {
    return jsonResponse({ error: 'Unable to load HR and staff tasks.' }, 500);
  }
}
