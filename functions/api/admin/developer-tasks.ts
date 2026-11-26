// ============================================================================
// /api/admin/developer-tasks — Internal Developer Task Management (Module 5)
// Features: Task Assignment, Priority & Deadlines, Estimated & Actual Work Hours,
// Overdue Tracking, Internal Notes, Activity Logs & Role-based Authorization.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!auth.user.isSuperAdmin && !auth.user.isPlatformStaff) {
    return jsonResponse({ error: 'Forbidden: developer or staff role required.' }, 403);
  }

  if (!env.DB) return jsonResponse({ tasks: [] });

  const reqUrl = new URL(request.url);
  const developerFilter = reqUrl.searchParams.get('developerId');
  const statusFilter = reqUrl.searchParams.get('status');
  const websiteIdFilter = reqUrl.searchParams.get('websiteId');

  try {
    let sql = `
      SELECT dt.*, p.business_name, p.public_slug, cr.request_number as change_request_number, cr.is_bug_fix
      FROM developer_tasks dt
      LEFT JOIN customer_website_publications p ON p.website_id = dt.website_id
      LEFT JOIN website_change_requests cr ON cr.id = dt.change_request_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (developerFilter) {
      sql += ' AND dt.assigned_developer_id = ?';
      params.push(developerFilter);
    }
    if (statusFilter) {
      sql += ' AND dt.status = ?';
      params.push(statusFilter);
    }
    if (websiteIdFilter) {
      sql += ' AND dt.website_id = ?';
      params.push(websiteIdFilter);
    }

    sql += ' ORDER BY dt.id DESC LIMIT 100';

    const rows = await env.DB.prepare(sql).bind(...params).all<Record<string, any>>();
    const nowIso = new Date().toISOString();

    const tasks = (rows.results || []).map((t) => {
      let attachments: string[] = [];
      let activityLog: Array<{ action: string; actor: string; at: string; note?: string }> = [];
      try { attachments = JSON.parse(t.attachments_json || '[]'); } catch {}
      try { activityLog = JSON.parse(t.activity_log_json || '[]'); } catch {}

      const isOverdue = t.deadline && t.deadline < nowIso && t.status !== 'completed';

      return {
        id: t.id,
        taskNumber: t.task_number,
        websiteId: t.website_id,
        businessName: t.business_name || 'Store',
        publicSlug: t.public_slug || '',
        changeRequestId: t.change_request_id,
        changeRequestNumber: t.change_request_number || null,
        ticketId: t.ticket_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        assignedDeveloperId: t.assigned_developer_id,
        assignedDeveloperName: t.assigned_developer_name,
        estimatedHours: Number(t.estimated_hours || 0),
        actualHours: Number(t.actual_hours || 0),
        deadline: t.deadline,
        isOverdue: Boolean(isOverdue),
        internalNotes: t.internal_notes,
        attachments,
        activityLog,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    const summary = {
      totalTasks: tasks.length,
      assigned: tasks.filter((t) => t.status === 'assigned').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      reviewPending: tasks.filter((t) => t.status === 'review_pending').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      overdueCount: tasks.filter((t) => t.isOverdue).length,
      totalHoursLogged: tasks.reduce((acc, t) => acc + t.actualHours, 0),
    };

    return jsonResponse({ tasks, summary });
  } catch (err) {
    return jsonResponse({ error: 'Failed to load developer tasks.' }, 500);
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!auth.user.isSuperAdmin && !auth.user.isPlatformStaff) {
    return jsonResponse({ error: 'Forbidden: staff role required.' }, 403);
  }

  if (!env.DB) return jsonResponse({ error: 'Database binding not configured.' }, 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    changeRequestId?: number;
    ticketId?: number;
    title?: string;
    description?: string;
    priority?: string;
    assignedDeveloperId?: string;
    assignedDeveloperName?: string;
    estimatedHours?: number;
    deadline?: string;
    internalNotes?: string;
    attachments?: string[];
  }>(request);

  if (!body || !body.websiteId || !body.title) {
    return jsonResponse({ error: 'websiteId and title are required.' }, 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const title = sanitizeText(body.title, 180);
  const description = sanitizeText(body.description || '', 4000);
  const priorityRaw = sanitizeText(body.priority || 'normal', 20).toLowerCase();
  const priority = ['low', 'normal', 'high', 'urgent'].includes(priorityRaw) ? priorityRaw : 'normal';

  const devId = sanitizeText(body.assignedDeveloperId || auth.user.id, 120);
  const devName = sanitizeText(body.assignedDeveloperName || auth.user.fullName || auth.user.email, 120);
  const estHours = Math.max(0, Number(body.estimatedHours || 0));
  const deadline = body.deadline ? sanitizeText(body.deadline, 40) : null;
  const internalNotes = sanitizeText(body.internalNotes || '', 2000);

  const attachments: string[] = [];
  if (Array.isArray(body.attachments)) {
    for (const a of body.attachments) {
      if (typeof a === 'string' && a.trim()) attachments.push(sanitizeText(a.trim(), 500));
    }
  }

  const taskNumber = `TSK-${Date.now().toString().slice(-6)}`;
  const nowIso = new Date().toISOString();

  const initialLog = [
    {
      action: 'task_created',
      actor: auth.user.email,
      at: nowIso,
      note: `Task assigned to ${devName} with ${estHours} estimated hours.`,
    },
  ];

  try {
    const res = await env.DB.prepare(
      `INSERT INTO developer_tasks (
        task_number, website_id, change_request_id, ticket_id, title,
        description, priority, status, assigned_developer_id, assigned_developer_name,
        estimated_hours, actual_hours, deadline, internal_notes, attachments_json,
        activity_log_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, 0, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        taskNumber,
        websiteId,
        body.changeRequestId || null,
        body.ticketId || null,
        title,
        description,
        priority,
        devId,
        devName,
        estHours,
        deadline,
        internalNotes,
        JSON.stringify(attachments),
        JSON.stringify(initialLog)
      )
      .run();

    const newId = Number(res?.meta?.last_row_id || 0);

    // If linked to change request, update change request status to 'in_progress'
    if (body.changeRequestId) {
      try {
        await env.DB.prepare(
          `UPDATE website_change_requests SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?`
        ).bind(body.changeRequestId).run();
      } catch {}
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_developer_task',
      targetType: 'developer_task',
      targetId: String(newId),
      details: { taskNumber, assignedDeveloper: devName, websiteId },
    });

    return jsonResponse(
      {
        success: true,
        task: {
          id: newId,
          taskNumber,
          title,
          status: 'assigned',
          assignedDeveloperName: devName,
          estimatedHours: estHours,
          createdAt: nowIso,
        },
      },
      201
    );
  } catch (err) {
    return jsonResponse({ error: 'Failed to create developer task.' }, 500);
  }
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!auth.user.isSuperAdmin && !auth.user.isPlatformStaff) {
    return jsonResponse({ error: 'Forbidden: staff role required.' }, 403);
  }

  if (!env.DB) return jsonResponse({ error: 'Database binding not configured.' }, 503);

  const body = await parseJsonBody<{
    taskId?: number;
    hoursToAdd?: number;
    status?: 'assigned' | 'in_progress' | 'review_pending' | 'completed' | 'blocked';
    internalNotes?: string;
    priority?: string;
  }>(request);

  if (!body || !body.taskId) {
    return jsonResponse({ error: 'taskId is required.' }, 400);
  }

  const taskId = Number(body.taskId);
  const hoursToAdd = typeof body.hoursToAdd === 'number' ? Math.max(0, body.hoursToAdd) : 0;
  const nextStatus = body.status;
  const nextPriority = body.priority;
  const appendNotes = body.internalNotes ? sanitizeText(body.internalNotes, 2000) : '';

  const allowedStatuses = ['assigned', 'in_progress', 'review_pending', 'completed', 'blocked'];
  if (nextStatus !== undefined && !allowedStatuses.includes(nextStatus)) {
    return jsonResponse({ error: 'Unsupported developer task status.' }, 400);
  }
  if (nextPriority !== undefined && !['low', 'normal', 'high', 'urgent'].includes(nextPriority)) {
    return jsonResponse({ error: 'Unsupported developer task priority.' }, 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT * FROM developer_tasks WHERE id = ? LIMIT 1')
      .bind(taskId)
      .first<Record<string, any>>();

    if (!existing) {
      return jsonResponse({ error: 'Developer task not found.' }, 404);
    }

    const currentActual = Number(existing.actual_hours || 0);
    const newActual = currentActual + hoursToAdd;
    const updatedStatus = nextStatus || existing.status;
    const updatedPriority = nextPriority || existing.priority;
    const nowIso = new Date().toISOString();

    let activityLog: Array<{ action: string; actor: string; at: string; note?: string }> = [];
    try { activityLog = JSON.parse(existing.activity_log_json || '[]'); } catch {}

    if (hoursToAdd > 0) {
      activityLog.push({
        action: 'hours_logged',
        actor: auth.user.email,
        at: nowIso,
        note: `Logged +${hoursToAdd} hrs (Total: ${newActual} hrs).`,
      });
    }

    if (nextStatus && nextStatus !== existing.status) {
      activityLog.push({
        action: 'status_changed',
        actor: auth.user.email,
        at: nowIso,
        note: `Status changed from ${existing.status} to ${nextStatus}.`,
      });
    }

    let updatedNotes = existing.internal_notes || '';
    if (appendNotes) {
      updatedNotes = updatedNotes ? `${updatedNotes}\n[${nowIso.slice(0, 10)}] ${appendNotes}` : appendNotes;
    }

    await env.DB.prepare(
      `UPDATE developer_tasks
       SET actual_hours = ?, status = ?, priority = ?, internal_notes = ?,
           activity_log_json = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(newActual, updatedStatus, updatedPriority, updatedNotes, JSON.stringify(activityLog.slice(-30)), taskId)
      .run();

    // If completed and linked to a change request, transition change request to review_ready
    if (updatedStatus === 'completed' && existing.change_request_id) {
      try {
        await env.DB.prepare(
          `UPDATE website_change_requests SET status = 'review_ready', updated_at = datetime('now')
           WHERE id = ? AND status IN ('approved', 'in_progress')`
        ).bind(existing.change_request_id).run();
      } catch {}
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'update_developer_task',
      targetType: 'developer_task',
      targetId: String(taskId),
      details: { taskNumber: existing.task_number, status: updatedStatus, actualHours: newActual },
    });

    return jsonResponse({
      success: true,
      taskId,
      status: updatedStatus,
      actualHours: newActual,
      priority: updatedPriority,
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update developer task.' }, 500);
  }
}
