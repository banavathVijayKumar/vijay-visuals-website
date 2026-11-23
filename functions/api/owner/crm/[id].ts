// ============================================================================
// PATCH /api/owner/crm/:id — Update CRM Lead Stage, Loyalty & Marketing Consent
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const leadId = Number(params.id);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return jsonResponse({ error: 'Invalid lead ID.' }, 400);
  }

  const body = await parseJsonBody<{
    stage?: string;
    loyaltyPoints?: number;
    unsubscribed?: boolean;
    notes?: string;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  try {
    // Check if lead exists in crm_contacts_leads
    const lead = await env.DB.prepare(
      `SELECT website_id, owner_id FROM crm_contacts_leads WHERE id = ? LIMIT 1`
    )
      .bind(leadId)
      .first<{ website_id: string; owner_id: string }>();

    if (lead) {
      if (!auth.user.isSuperAdmin && lead.owner_id !== auth.user.id && lead.owner_id !== auth.user.authSubject) {
        return jsonResponse({ error: 'Forbidden: not authorized to update this lead.' }, 403);
      }

      if (body.stage) {
        const stage = sanitizeText(body.stage, 30);
        await env.DB.prepare(
          `UPDATE crm_contacts_leads SET stage = ? WHERE id = ?`
        )
          .bind(stage, leadId)
          .run();
      }

      if (typeof body.loyaltyPoints === 'number') {
        await env.DB.prepare(
          `UPDATE crm_contacts_leads SET loyalty_points = ? WHERE id = ?`
        )
          .bind(Math.max(0, body.loyaltyPoints), leadId)
          .run();
      }

      if (body.unsubscribed) {
        await env.DB.prepare(
          `UPDATE crm_contacts_leads SET unsubscribed_at = datetime('now'), marketing_consent = 0 WHERE id = ?`
        )
          .bind(leadId)
          .run();
      }

      return jsonResponse({ success: true });
    }

    // Fallback: search in website_json of all publications
    const pubs = await env.DB.prepare(
      `SELECT website_id, owner_id, website_json FROM customer_website_publications`
    ).all<{ website_id: string; owner_id: string; website_json: string }>();

    for (const pub of pubs.results || []) {
      try {
        const parsed = JSON.parse(pub.website_json || '{}');
        const leads: any[] = Array.isArray(parsed.crmLeads) ? parsed.crmLeads : [];
        const match = leads.find((l) => Number(l.id) === leadId);
        if (match) {
          if (!auth.user.isSuperAdmin && pub.owner_id !== auth.user.id && pub.owner_id !== auth.user.authSubject) {
            return jsonResponse({ error: 'Forbidden: not authorized to update this lead.' }, 403);
          }
          if (body.stage) match.stage = sanitizeText(body.stage, 30);
          if (typeof body.loyaltyPoints === 'number') match.loyaltyPoints = Math.max(0, body.loyaltyPoints);
          if (body.unsubscribed) {
            match.unsubscribed = true;
            match.marketingConsent = false;
          }
          await env.DB.prepare(
            `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
          )
            .bind(JSON.stringify(parsed), pub.website_id)
            .run();
          return jsonResponse({ success: true });
        }
      } catch {}
    }

    return jsonResponse({ error: 'Lead not found.' }, 404);
  } catch (err) {
    return jsonResponse({ error: 'Failed to update lead.' }, 500);
  }
}
