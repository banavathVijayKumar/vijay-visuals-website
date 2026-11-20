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
