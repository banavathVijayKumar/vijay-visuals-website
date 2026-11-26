// ============================================================================
// POST /api/owner/tenants/:tenantId/tasks
// Cloudflare Pages / D1 port of Express staff task assignment.
// D1 equivalent: developer_tasks (UI "pending" is stored as D1 "assigned").
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function toOptionalId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const staffId = toOptionalId(body.staffId);
  const staffName = sanitizeText(body.staffName, 100) || 'Unassigned';
  const title = sanitizeText(body.title, 160);
  const description = sanitizeText(body.description, 500);
  const priority = body.priority ? String(body.priority) : 'normal';
  const dueDate = sanitizeText(body.dueDate, 20);

  if (title.length < 3 || !PRIORITIES.includes(priority)) {
    return jsonResponse({ error: 'Enter a task title (minimum 3 characters).' }, 400);
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);
  const assignedBy = auth.user.email || auth.user.id;

  try {
    if (staffId) {
      const staff = await env.DB.prepare(
        `SELECT id FROM tenant_memberships WHERE id = ? AND website_id = ? AND status = 'active' LIMIT 1`
      )
        .bind(staffId, websiteId)
        .first<{ id: number }>();
      if (!staff) return jsonResponse({ error: 'Staff member not found in this business.' }, 404);
    }

    const taskNumber = `TSK-${tenantRowId}-${Date.now().toString().slice(-6)}-${randomHex(3)}`;
    const nowIso = new Date().toISOString();

    const insertRes = await env.DB.prepare(
      `INSERT INTO developer_tasks
        (task_number, website_id, title, description, priority, status,
         assigned_developer_id, assigned_developer_name, deadline, internal_notes,
         activity_log_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, '[]', datetime('now'), datetime('now'))`
    )
      .bind(
        taskNumber,
        websiteId,
        title,
        description,
        priority,
        staffId ? String(staffId) : '',
        staffName,
        dueDate || null,
        JSON.stringify({ assignedBy, sourceStatus: 'pending' })
      )
      .run();

    const task = {
      id: Number(insertRes.meta?.last_row_id || 0),
      tenantId: tenantRowId,
      staffId,
      staffName,
      title,
      description,
      priority,
      dueDate,
      status: 'pending',
      assignedBy,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return jsonResponse({ task }, 201);
  } catch {
    return jsonResponse({ error: 'Unable to assign staff task.' }, 500);
  }
}
