// ============================================================================
// /api/tickets — Multi-Tenant Customer Support Center (Module 3)
// Supports 12 Categories, File/Screenshot Attachments, Admin Priority & Replies,
// Status Workflow: Open -> In Progress -> Waiting for Customer -> Review -> Completed -> Closed
// Strict Tenant Isolation & Audit Logging.
// ============================================================================

import { requireUser } from './_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from './_shared';
import { isMissingTableError, requireTenantOwnerAccess } from './_tenantAccess';

export const SUPPORT_CATEGORIES = [
  'design_changes',
  'logo_banner',
  'product_content',
  'new_page',
  'website_redesign',
  'domain_dns',
  'payment_gateway',
  'checkout_orders',
  'technical_bugs',
  'security_problems',
  'feature_request',
  'general_assistance',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_customer',
  'review',
  'completed',
  'closed',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ tickets: [] });

  const reqUrl = new URL(request.url);
  const websiteIdParam = reqUrl.searchParams.get('websiteId') || reqUrl.searchParams.get('tenantId');

  try {
    const isSuperAdmin = auth.user.isSuperAdmin || auth.user.isPlatformStaff;
    let rows: { results?: any[] } = { results: [] };

    if (isSuperAdmin) {
      if (websiteIdParam) {
        rows = await env.DB.prepare(
          'SELECT * FROM support_tickets WHERE website_id = ? ORDER BY id DESC LIMIT 100'
        )
          .bind(websiteIdParam)
          .all<Record<string, any>>();
      } else {
        rows = await env.DB.prepare(
          'SELECT * FROM support_tickets ORDER BY id DESC LIMIT 100'
        ).all<Record<string, any>>();
      }
    } else {
      if (websiteIdParam) {
        // Enforce tenant isolation
        const access = await requireTenantOwnerAccess(env, auth.user, websiteIdParam);
        if (!access.ok) return access.response;

        rows = await env.DB.prepare(
          'SELECT * FROM support_tickets WHERE website_id = ? ORDER BY id DESC LIMIT 50'
        )
          .bind(access.row.website_id)
          .all<Record<string, any>>();
      } else {
        rows = await env.DB.prepare(
          'SELECT * FROM support_tickets WHERE owner_id = ? OR owner_id = ? ORDER BY id DESC LIMIT 50'
        )
          .bind(auth.user.id, auth.user.authSubject || auth.user.id)
          .all<Record<string, any>>();
      }
    }

    const tickets = (rows.results || []).map((t) => {
      let messages: Array<{
        sender: string;
        senderName?: string;
        text: string;
        at: string;
        attachmentUrl?: string;
        attachments?: string[];
      }> = [];
      try {
        messages = JSON.parse(t.messages_json || '[]');
      } catch {}

      return {
        id: t.id,
        ticketNumber: `TKT-${String(t.id).padStart(4, '0')}`,
        websiteId: t.website_id,
        ownerId: t.owner_id,
        subject: t.subject,
        category: t.category,
        priority: t.priority || 'normal',
        status: t.status || 'open',
        assignedStaffId: t.assigned_staff_id || null,
        messages,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    return jsonResponse({
      tickets,
      categories: SUPPORT_CATEGORIES,
      statuses: TICKET_STATUSES,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ tickets: [], categories: SUPPORT_CATEGORIES, statuses: TICKET_STATUSES });
    }
    return jsonResponse({ error: 'Unable to load tickets.' }, 500);
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ error: 'Support storage is not configured.' }, 503);

  const body = await parseJsonBody<{
    subject?: string;
    message?: string;
    category?: string;
    priority?: string;
    websiteId?: string;
    tenantId?: string | number;
    attachments?: string[];
    attachmentUrl?: string;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const subject = sanitizeText(body.subject, 160);
  const message = sanitizeText(body.message, 2500);
  const categoryRaw = sanitizeText(body.category, 60).toLowerCase();
  const category = (SUPPORT_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw
    : 'general_assistance';

  const priorityRaw = sanitizeText(body.priority, 20).toLowerCase();
  const priority = ['low', 'normal', 'high', 'urgent'].includes(priorityRaw)
    ? priorityRaw
    : 'normal';

  const rawWebsiteId = body.websiteId || (body.tenantId ? String(body.tenantId) : '');
  let resolvedWebsiteId = '';

  if (rawWebsiteId) {
    const access = await requireTenantOwnerAccess(env, auth.user, rawWebsiteId);
    if (!access.ok) return access.response;
    resolvedWebsiteId = access.row.website_id;
  } else {
    // Resolve caller's default owned website
    const userPub = await env.DB.prepare(
      `SELECT website_id FROM customer_website_publications
       WHERE owner_id = ? OR owner_id = ? LIMIT 1`
    )
      .bind(auth.user.id, auth.user.authSubject || auth.user.id)
      .first<{ website_id: string }>();
    resolvedWebsiteId = userPub?.website_id || '';
  }

  if (!subject || !message) {
    return jsonResponse({ error: 'Subject and message are required.' }, 400);
  }

  const attachments: string[] = [];
  if (Array.isArray(body.attachments)) {
    for (const a of body.attachments) {
      if (typeof a === 'string' && a.trim()) {
        attachments.push(sanitizeText(a.trim(), 500));
      }
    }
  } else if (body.attachmentUrl) {
    attachments.push(sanitizeText(body.attachmentUrl, 500));
  }

  try {
    const initialMessage = {
      sender: auth.user.email,
      senderName: auth.user.fullName || auth.user.email,
      text: message,
      attachments: attachments.slice(0, 5),
      at: new Date().toISOString(),
    };

    const res = await env.DB.prepare(
      `INSERT INTO support_tickets (website_id, owner_id, subject, category, priority, status, messages_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, datetime('now'), datetime('now'))`
    )
      .bind(
        resolvedWebsiteId || null,
        auth.user.id,
        subject,
        category,
        priority,
        JSON.stringify([initialMessage])
      )
      .run();

    const newId = Number(res?.meta?.last_row_id || 0);
    const ticketNumber = `TKT-${String(newId).padStart(4, '0')}`;

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_support_ticket',
      targetType: 'ticket',
      targetId: String(newId),
      details: { ticketNumber, subject, category, priority, websiteId: resolvedWebsiteId },
    });

    return jsonResponse(
      {
        success: true,
        ticket: {
          id: newId,
          ticketNumber,
          websiteId: resolvedWebsiteId,
          subject,
          category,
          priority,
          status: 'open',
          messages: [initialMessage],
          createdAt: new Date().toISOString(),
        },
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Support tickets require D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit support ticket.' }, 500);
  }
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ error: 'Support storage is not configured.' }, 503);

  const body = await parseJsonBody<{
    ticketId?: number;
    message?: string;
    status?: TicketStatus;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    assignedStaffId?: string;
    attachments?: string[];
  }>(request);

  if (!body || !body.ticketId) {
    return jsonResponse({ error: 'ticketId is required.' }, 400);
  }

  const ticketId = Number(body.ticketId);
  const text = sanitizeText(body.message || '', 2500);
  const nextStatus = body.status;
  const nextPriority = body.priority;
  const isStaffOrAdmin = auth.user.isSuperAdmin || auth.user.isPlatformStaff;

  try {
    const existing = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1')
      .bind(ticketId)
      .first<Record<string, any>>();

    if (!existing) {
      return jsonResponse({ error: 'Ticket not found.' }, 404);
    }

    // Tenant isolation: customers can only reply to their own tickets
    if (existing.owner_id !== auth.user.id && existing.owner_id !== auth.user.authSubject && !isStaffOrAdmin) {
      return jsonResponse({ error: 'Unauthorized to reply or modify this ticket.' }, 403);
    }

    let messages: Array<{
      sender: string;
      senderName?: string;
      text: string;
      at: string;
      attachments?: string[];
    }> = [];
    try {
      messages = JSON.parse(existing.messages_json || '[]');
    } catch {}

    const attachments: string[] = [];
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        if (typeof a === 'string' && a.trim()) {
          attachments.push(sanitizeText(a.trim(), 500));
        }
      }
    }

    if (text) {
      messages.push({
        sender: auth.user.email,
        senderName: auth.user.fullName || (isStaffOrAdmin ? 'Vijay Visuals Support' : auth.user.email),
        text,
        attachments: attachments.slice(0, 5),
        at: new Date().toISOString(),
      });
    }

    // Determine new status
    let updatedStatus = existing.status;
    if (nextStatus && (TICKET_STATUSES as readonly string[]).includes(nextStatus)) {
      // Customers can reopen or close their tickets; staff can transition any status
      if (isStaffOrAdmin || ['closed', 'waiting_customer', 'review'].includes(nextStatus)) {
        updatedStatus = nextStatus;
      }
    } else if (text) {
      // Auto-transition based on respondent
      if (isStaffOrAdmin) {
        updatedStatus = 'waiting_customer';
      } else {
        updatedStatus = 'in_progress';
      }
    }

    const updatedPriority = isStaffOrAdmin && nextPriority ? nextPriority : existing.priority;
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE support_tickets 
       SET messages_json = ?, status = ?, priority = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(JSON.stringify(messages), updatedStatus, updatedPriority, nowIso, ticketId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'reply_support_ticket',
      targetType: 'ticket',
      targetId: String(ticketId),
      details: { status: updatedStatus, priority: updatedPriority },
    });

    return jsonResponse({
      success: true,
      ticket: {
        id: ticketId,
        ticketNumber: `TKT-${String(ticketId).padStart(4, '0')}`,
        status: updatedStatus,
        priority: updatedPriority,
        messages,
        updatedAt: nowIso,
      },
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update ticket.' }, 500);
  }
}
