// ============================================================================
// PATCH /api/admin/tickets/:id — Super Admin support ticket status update
// Ported from server.ts (Express), with Pages status conventions from
// functions/api/tickets.ts. Express-only "resolved" remains accepted for the
// Super Admin console dropdown.
// ============================================================================

import { requireAdmin } from '../../_auth';
import { PagesContext, errorJson, jsonResponse, parseJsonBody } from '../../_shared';
import { TICKET_STATUSES } from '../../tickets';

const ALLOWED_ADMIN_STATUSES = new Set<string>([...TICKET_STATUSES, 'resolved']);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function mapTicket(row: Record<string, any>): Record<string, unknown> {
  let messages: unknown[] = [];
  try {
    const parsed = JSON.parse(row.messages_json || '[]');
    if (Array.isArray(parsed)) messages = parsed;
  } catch {
    messages = [];
  }

  return {
    id: Number(row.id || 0),
    ticketNumber: `TKT-${String(row.id || 0).padStart(4, '0')}`,
    websiteId: row.website_id || '',
    ownerId: row.owner_id || '',
    subject: String(row.subject || ''),
    category: String(row.category || 'general_assistance'),
    priority: String(row.priority || 'normal'),
    status: String(row.status || 'open'),
    assignedStaffId: row.assigned_staff_id || null,
    messages,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = parseId(params.id || '');
  const body = await parseJsonBody<{ status?: unknown }>(request);
  const status = String(body?.status || '');

  if (id === null || !ALLOWED_ADMIN_STATUSES.has(status)) {
    return errorJson('Invalid ticket status.', 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, any>>();
    if (!existing) return errorJson('Ticket not found.', 404);

    await env.DB.prepare(
      'UPDATE support_tickets SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(status, id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM support_tickets WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, any>>();

    return jsonResponse({ ticket: updated ? mapTicket(updated) : null });
  } catch {
    return errorJson('Failed to update ticket status.', 500);
  }
}
