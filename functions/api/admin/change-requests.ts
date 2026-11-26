// ============================================================================
// /api/admin/change-requests — Platform Admin Change Request & Quotation Management
// Enforces server-side super_admin or platform_staff role.
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

const ALLOWED_STATUSES = new Set([
  'submitted',
  'under_review',
  'quoted',
  'approved',
  'rejected',
  'in_progress',
  'review_ready',
  'completed',
  'cancelled',
]);
const LOCKED_STATUSES = new Set(['approved', 'in_progress', 'review_ready', 'completed']);

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!auth.user.isSuperAdmin && !auth.user.isPlatformStaff) {
    return jsonResponse({ error: 'Forbidden: staff role required.' }, 403);
  }

  if (!env.DB) return jsonResponse({ requests: [] });

  try {
    const rows = await env.DB.prepare(
      `SELECT cr.*, p.business_name, p.public_slug
       FROM website_change_requests cr
       LEFT JOIN customer_website_publications p ON p.website_id = cr.website_id
       ORDER BY cr.id DESC LIMIT 100`
    ).all<Record<string, any>>();

    const requests = (rows.results || []).map((r) => {
      let attachments: string[] = [];
      try {
        attachments = JSON.parse(r.attachments_json || '[]');
      } catch {}

      return {
        id: r.id,
        requestNumber: r.request_number,
        websiteId: r.website_id,
        businessName: r.business_name || 'Store',
        publicSlug: r.public_slug || '',
        category: r.category,
        isBugFix: Boolean(r.is_bug_fix),
        title: r.title,
        description: r.description,
        attachments,
        aiSummary: r.ai_summary,
        quotationInr: Number(r.quotation_inr || 0),
        estimatedHours: Number(r.estimated_hours || 0),
        deliveryDays: Number(r.delivery_days || 1),
        status: r.status,
        customerNotes: r.customer_notes,
        adminNotes: r.admin_notes,
        approvedAt: r.approved_at,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return jsonResponse({ requests });
  } catch (err) {
    return jsonResponse({ error: 'Failed to load change requests.' }, 500);
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
    requestId?: number;
    quotationInr?: number;
    estimatedHours?: number;
    deliveryDays?: number;
    adminNotes?: string;
    status?: string;
  }>(request);

  if (!body || !body.requestId) {
    return jsonResponse({ error: 'requestId is required.' }, 400);
  }

  const reqId = Number(body.requestId);
  const quotationInr = typeof body.quotationInr === 'number' ? Math.max(0, body.quotationInr) : undefined;
  const estimatedHours = typeof body.estimatedHours === 'number' ? Math.max(0, body.estimatedHours) : undefined;
  const deliveryDays = typeof body.deliveryDays === 'number' ? Math.max(1, body.deliveryDays) : undefined;
  const adminNotes = body.adminNotes !== undefined ? sanitizeText(body.adminNotes, 2000) : undefined;
  const nextStatus = body.status;

  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM website_change_requests WHERE id = ? LIMIT 1`
    )
      .bind(reqId)
      .first<Record<string, any>>();

    if (!existing) {
      return jsonResponse({ error: 'Change request not found.' }, 404);
    }

    if (nextStatus !== undefined && !ALLOWED_STATUSES.has(nextStatus)) {
      return jsonResponse({ error: 'Unsupported change request status.' }, 400);
    }
    if (
      LOCKED_STATUSES.has(existing.status) &&
      (quotationInr !== undefined || estimatedHours !== undefined || deliveryDays !== undefined)
    ) {
      return jsonResponse(
        { error: 'Quotation and timeline are locked after approval.' },
        409
      );
    }

    const qInr = quotationInr !== undefined ? quotationInr : existing.quotation_inr;
    const estH = estimatedHours !== undefined ? estimatedHours : existing.estimated_hours;
    const delD = deliveryDays !== undefined ? deliveryDays : existing.delivery_days;
    const aNotes = adminNotes !== undefined ? adminNotes : existing.admin_notes;
    const status = nextStatus || (quotationInr !== undefined ? 'quoted' : existing.status);
    const completedAt = status === 'completed' ? new Date().toISOString() : existing.completed_at;

    await env.DB.prepare(
      `UPDATE website_change_requests
       SET quotation_inr = ?, estimated_hours = ?, delivery_days = ?,
           admin_notes = ?, status = ?, completed_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(qInr, estH, delD, aNotes, status, completedAt, reqId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'admin_update_change_quotation',
      targetType: 'change_request',
      targetId: String(reqId),
      details: { quotationInr: qInr, status, estimatedHours: estH },
    });

    return jsonResponse({
      success: true,
      requestId: reqId,
      status,
      quotationInr: qInr,
      estimatedHours: estH,
      deliveryDays: delD,
      adminNotes: aNotes,
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update change request.' }, 500);
  }
}
