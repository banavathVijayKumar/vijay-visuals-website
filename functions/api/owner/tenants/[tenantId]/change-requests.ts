// ============================================================================
// /api/owner/tenants/:tenantId/change-requests — Website Change Requests & Quotations (Module 4)
// Allows customers to submit change requests, classifies free bug fixes vs paid features,
// lets customers review estimated cost & delivery time, and approve/reject quotations.
// NEVER automatically charges customers without explicit approval.
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
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  if (!env.DB) return jsonResponse({ requests: [] });

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM website_change_requests
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 50`
    )
      .bind(access.row.website_id)
      .all<Record<string, any>>();

    const requests = (rows.results || []).map((r) => {
      let attachments: string[] = [];
      try {
        attachments = JSON.parse(r.attachments_json || '[]');
      } catch {}

      return {
        id: r.id,
        requestNumber: r.request_number,
        websiteId: r.website_id,
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

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  if (!env.DB) return jsonResponse({ error: 'Database binding not configured.' }, 503);

  const body = await parseJsonBody<{
    title?: string;
    description?: string;
    category?: string;
    attachments?: string[];
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const title = sanitizeText(body.title, 160);
  const description = sanitizeText(body.description, 4000);
  const categoryRaw = sanitizeText(body.category, 60).toLowerCase();

  const validCategories = [
    'design_changes',
    'logo_banner',
    'product_content',
    'new_page',
    'website_redesign',
    'domain_dns',
    'payment_gateway',
    'checkout_orders',
    'bug_fix',
    'custom_feature',
    'general',
  ];

  const category = validCategories.includes(categoryRaw) ? categoryRaw : 'general';

  if (!title || !description) {
    return jsonResponse({ error: 'Title and detailed description are required.' }, 400);
  }

  // Automatic classification: distinguish free bug fix from paid change request
  const isBugFix =
    category === 'bug_fix' ||
    /\b(broken|error|defect|glitch|bug|not working|crash|fails)\b/i.test(`${title} ${description}`)
      ? 1
      : 0;

  const attachments: string[] = [];
  if (Array.isArray(body.attachments)) {
    for (const a of body.attachments) {
      if (typeof a === 'string' && a.trim()) {
        attachments.push(sanitizeText(a.trim(), 500));
      }
    }
  }

  // AI Classification & technical requirement summary
  let aiSummary = '';
  if (isBugFix) {
    aiSummary = `Classified as Quality Assurance / Free Bug Fix. Priority triage required. Estimated developer turnaround: 24–48 hours at ₹0 cost.`;
  } else {
    aiSummary = `Feature / Design Change Request (${category.replace(/_/g, ' ')}). Technical review required to formulate official GST quotation and milestone timeline.`;
  }

  const requestNumber = `CR-${Date.now().toString().slice(-6)}`;

  try {
    const res = await env.DB.prepare(
      `INSERT INTO website_change_requests (
        request_number, website_id, owner_id, category, is_bug_fix,
        title, description, attachments_json, ai_summary, quotation_inr,
        estimated_hours, delivery_days, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'))`
    )
      .bind(
        requestNumber,
        access.row.website_id,
        access.row.owner_id,
        category,
        isBugFix,
        title,
        description,
        JSON.stringify(attachments),
        aiSummary,
        0, // Quotation prepared by admin
        isBugFix ? 2 : 8,
        isBugFix ? 1 : 3
      )
      .run();

    const newId = Number(res?.meta?.last_row_id || 0);

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'create_change_request',
      targetType: 'change_request',
      targetId: String(newId),
      details: { requestNumber, category, isBugFix, websiteId: access.row.website_id },
    });

    return jsonResponse(
      {
        success: true,
        changeRequest: {
          id: newId,
          requestNumber,
          category,
          isBugFix: Boolean(isBugFix),
          title,
          description,
          aiSummary,
          status: 'submitted',
          quotationInr: 0,
          createdAt: new Date().toISOString(),
        },
      },
      201
    );
  } catch (err) {
    return jsonResponse({ error: 'Failed to submit change request.' }, 500);
  }
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId);
  if (!access.ok) return access.response;

  if (!env.DB) return jsonResponse({ error: 'Database binding not configured.' }, 503);

  const body = await parseJsonBody<{
    requestId?: number;
    decision?: 'approved' | 'rejected';
    customerNotes?: string;
  }>(request);

  if (!body || !body.requestId || !body.decision) {
    return jsonResponse({ error: 'requestId and decision (approved | rejected) are required.' }, 400);
  }

  const reqId = Number(body.requestId);
  const decision = body.decision;
  const customerNotes = sanitizeText(body.customerNotes || '', 1000);

  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM website_change_requests WHERE id = ? AND website_id = ? LIMIT 1`
    )
      .bind(reqId, access.row.website_id)
      .first<Record<string, any>>();

    if (!existing) {
      return jsonResponse({ error: 'Change request not found for this website.' }, 404);
    }

    const nowIso = new Date().toISOString();
    let newStatus = decision === 'approved' ? 'approved' : 'rejected';

    await env.DB.prepare(
      `UPDATE website_change_requests
       SET status = ?, customer_notes = ?, approved_at = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        newStatus,
        customerNotes || existing.customer_notes,
        decision === 'approved' ? nowIso : null,
        reqId
      )
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: decision === 'approved' ? 'approve_change_quotation' : 'reject_change_quotation',
      targetType: 'change_request',
      targetId: String(reqId),
      details: { requestNumber: existing.request_number, decision, quotationInr: existing.quotation_inr },
    });

    return jsonResponse({
      success: true,
      requestId: reqId,
      status: newStatus,
      decision,
      quotationInr: existing.quotation_inr,
      note: 'Quotation decision recorded. Work begins only after confirmed scheduling and agreement.',
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update change request decision.' }, 500);
  }
}
