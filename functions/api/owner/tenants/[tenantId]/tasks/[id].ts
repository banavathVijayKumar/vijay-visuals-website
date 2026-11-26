// ============================================================================
// PATCH /api/owner/tenants/:tenantId/tasks/:id
// Cloudflare Pages / D1 port of the Express staff task status update.
// D1 equivalent: developer_tasks (UI "pending" maps to D1 "assigned").
// ============================================================================

import { requireUser, type TenantRole } from '../../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../../../../_shared';
import { requireTenantOwnerAccess } from '../../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

const UI_TO_D1_STATUS: Record<string, string> = {
  pending: 'assigned',
  in_progress: 'in_progress',
  completed: 'completed',
};

const D1_TO_UI_STATUS: Record<string, string> = {
  assigned: 'pending',
  in_progress: 'in_progress',
  review_pending: 'in_progress',
  completed: 'completed',
  blocked: 'in_progress',
};

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

function mapTask(row: Record<string, any>, tenantRowId: number): Record<string, unknown> {
  const meta = parseJsonObject(row.internal_notes);
  const staffIdValue = Number(row.assigned_developer_id || 0);
  return {
    id: Number(row.id) || 0,
    tenantId: tenantRowId,
    staffId: Number.isInteger(staffIdValue) && staffIdValue > 0 ? staffIdValue : null,
    staffName: String(row.assigned_developer_name || 'Unassigned'),
    title: String(row.title || ''),
    description: String(row.description || ''),
    priority: ['low', 'normal', 'high', 'urgent'].includes(String(row.priority))
      ? String(row.priority)
      : 'normal',
    dueDate: String(row.deadline || ''),
    status: D1_TO_UI_STATUS[String(row.status || 'assigned')] || 'pending',
    assignedBy: String(meta.assignedBy || ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string; id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Task not found.' }, 404);
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);

  try {
    const existing = await env.DB.prepare(
      `SELECT id, assigned_developer_id, assigned_developer_name, title, description, priority,
              deadline, status, internal_notes, created_at, updated_at
       FROM developer_tasks WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(id, websiteId)
      .first<Record<string, any>>();

    if (!existing) return jsonResponse({ error: 'Task not found.' }, 404);

    const body = (await parseJsonBody<Record<string, any>>(request)) || {};
    const currentUiStatus = D1_TO_UI_STATUS[String(existing.status || 'assigned')] || 'pending';
    const nextUiStatus = body.status ? String(body.status) : currentUiStatus;

    if (!Object.prototype.hasOwnProperty.call(UI_TO_D1_STATUS, nextUiStatus)) {
      return jsonResponse({ error: 'Invalid task status.' }, 400);
    }

    await env.DB.prepare(
      `UPDATE developer_tasks SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(UI_TO_D1_STATUS[nextUiStatus], id, websiteId)
      .run();

    const updated = await env.DB.prepare(
      `SELECT id, assigned_developer_id, assigned_developer_name, title, description, priority,
              deadline, status, internal_notes, created_at, updated_at
       FROM developer_tasks WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(id, websiteId)
      .first<Record<string, any>>();

    const task = updated
      ? mapTask(updated, tenantRowId)
      : { ...mapTask(existing, tenantRowId), status: nextUiStatus };

    return jsonResponse({ task });
  } catch {
    return jsonResponse({ error: 'Unable to update staff task.' }, 500);
  }
}
