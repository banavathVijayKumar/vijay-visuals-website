// ============================================================================
// GET /api/customer/tickets — Authenticated Customer's Own Support Tickets
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { isMissingTableError } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) return jsonResponse({ tickets: [] });

  try {
    const res = await env.DB.prepare(
      `SELECT id, subject, category, status, messages_json, created_at
       FROM support_tickets
       WHERE owner_id = ? OR owner_id = ?
       ORDER BY created_at DESC LIMIT 50`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all<Record<string, any>>();

    const tickets = (res.results || []).map((t) => {
      let message = '';
      try {
        const msgs = JSON.parse(String(t.messages_json || '[]'));
        if (Array.isArray(msgs) && msgs[0]?.text) message = String(msgs[0].text);
      } catch {}
      return {
        id: Number(t.id),
        tenantId: null,
        userId: 1,
        customerName: auth.user.fullName,
        customerEmail: auth.user.email,
        customerPhone: '',
        subject: String(t.subject || ''),
        message,
        category: String(t.category || 'general'),
        status: String(t.status || 'open'),
        createdAt: String(t.created_at || ''),
      };
    });

    return jsonResponse({ tickets });
  } catch (err) {
    if (isMissingTableError(err)) return jsonResponse({ tickets: [] });
    return jsonResponse({ error: 'Unable to load support tickets.' }, 500);
  }
}
