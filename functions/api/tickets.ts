// ============================================================================
// POST /api/tickets — Submit Customer Support Ticket
// ============================================================================

import { requireUser } from './_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from './_shared';
import { isMissingTableError } from './_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ tickets: [] });

  try {
    const isSuperAdmin = auth.user.isSuperAdmin;
    const rows = isSuperAdmin
      ? await env.DB.prepare('SELECT * FROM support_tickets ORDER BY id DESC LIMIT 50').all<Record<string, any>>()
      : await env.DB.prepare('SELECT * FROM support_tickets WHERE owner_id = ? ORDER BY id DESC LIMIT 50')
          .bind(auth.user.id)
          .all<Record<string, any>>();

    const tickets = (rows.results || []).map((t) => {
      let messages: Array<{ sender: string; text: string; at: string; attachmentUrl?: string }> = [];
      try {
        messages = JSON.parse(t.messages_json || '[]');
      } catch {}
      return {
        id: t.id,
        ownerId: t.owner_id,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        messages,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    return jsonResponse({ tickets });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ tickets: [] });
    }
    return jsonResponse({ error: 'Unable to load tickets.' }, 500);
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
    status?: 'open' | 'in_progress' | 'resolved' | 'closed';
    attachmentUrl?: string;
  }>(request);

  if (!body || !body.ticketId) {
    return jsonResponse({ error: 'Ticket ID is required.' }, 400);
  }

  const ticketId = Number(body.ticketId);
  const text = sanitizeText(body.message || '', 2000);
  const nextStatus = body.status;
  const attachmentUrl = body.attachmentUrl ? sanitizeText(body.attachmentUrl, 500) : undefined;

  try {
    const existing = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1')
      .bind(ticketId)
      .first<Record<string, any>>();

    if (!existing) {
      return jsonResponse({ error: 'Ticket not found.' }, 404);
    }

    // Tenant isolation: customers can only reply to their own tickets
    if (existing.owner_id !== auth.user.id && !auth.user.isSuperAdmin) {
      return jsonResponse({ error: 'Unauthorized to reply to this ticket.' }, 403);
    }

    let messages: Array<{ sender: string; text: string; at: string; attachmentUrl?: string }> = [];
    try {
      messages = JSON.parse(existing.messages_json || '[]');
    } catch {}

    if (text) {
      messages.push({
        sender: auth.user.email,
        text,
        at: new Date().toISOString(),
        attachmentUrl,
      });
    }

    const updatedStatus = nextStatus || (auth.user.isSuperAdmin ? 'answered' : 'open');
    const nowIso = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE support_tickets 
       SET messages_json = ?, status = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(JSON.stringify(messages), updatedStatus, nowIso, ticketId)
      .run();

    return jsonResponse({
      success: true,
      ticket: {
        id: ticketId,
        status: updatedStatus,
        messages,
        updatedAt: nowIso,
      },
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to update ticket.' }, 500);
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
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const subject = sanitizeText(body.subject, 160);
  const message = sanitizeText(body.message, 2000);
  const category = sanitizeText(body.category, 60) || 'platform_support';

  if (!subject || !message) {
    return jsonResponse({ error: 'Subject and message are required.' }, 400);
  }

  try {
    const msgs = JSON.stringify([
      {
        sender: auth.user.email,
        text: message,
        at: new Date().toISOString(),
      },
    ]);
    const res = await env.DB.prepare(
      `INSERT INTO support_tickets (owner_id, subject, category, priority, status, messages_json)
       VALUES (?, ?, ?, 'normal', 'open', ?)`
    )
      .bind(auth.user.id, subject, category, msgs)
      .run();

    return jsonResponse(
      {
        ticket: {
          id: Number(res?.meta?.last_row_id || 0),
          subject,
          category,
          status: 'open',
          message,
          createdAt: new Date().toISOString(),
        },
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Support tickets require D1 migration 0003 (support_tickets).', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit support ticket.' }, 500);
  }
}
