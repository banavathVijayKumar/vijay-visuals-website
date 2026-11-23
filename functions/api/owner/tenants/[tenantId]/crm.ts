// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/crm — Multi-Tenant CRM Leads & Contacts
// Manages customer lead stages, contact channels, loyalty points, and consent.
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
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const res = await env.DB!.prepare(
      `SELECT id, full_name, phone, email, source, stage, loyalty_points, marketing_consent, unsubscribed_at
       FROM crm_contacts_leads
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 200`
    )
      .bind(websiteId)
      .all<Record<string, any>>();

    const leads = (res.results || []).map((r) => ({
      id: Number(r.id),
      tenantId: tenantRowId,
      name: String(r.full_name || ''),
      phone: String(r.phone || ''),
      email: String(r.email || ''),
      source: String(r.source || 'website'),
      stage: String(r.stage || 'new'),
      loyaltyPoints: Number(r.loyalty_points || 0),
      marketingConsent: Boolean(r.marketing_consent),
      unsubscribed: Boolean(r.unsubscribed_at),
    }));

    return jsonResponse({ leads });
  } catch (err) {
    if (isMissingTableError(err)) {
      const fallbackLeads = Array.isArray(access.parsed.crmLeads) ? access.parsed.crmLeads : [];
      return jsonResponse({ leads: fallbackLeads });
    }
    return jsonResponse({ error: 'Unable to load CRM leads.' }, 500);
  }
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
    stage?: string;
    loyaltyPoints?: number;
    marketingConsent?: boolean;
  }>(request);

  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const name = sanitizeText(body.name, 120);
  const phone = sanitizeText(body.phone, 30);
  const email = sanitizeText(body.email, 120).toLowerCase();
  const source = sanitizeText(body.source, 60) || 'website';
  const stage = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'].includes(String(body.stage || ''))
    ? String(body.stage)
    : 'new';
  const loyaltyPoints = Number.isFinite(Number(body.loyaltyPoints)) ? Math.max(0, Number(body.loyaltyPoints)) : 0;
  const marketingConsent = body.marketingConsent ? 1 : 0;

  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Lead name is required (minimum 2 characters).' }, 400);
  }

  const tenantRowId = Number(access.row.rowid || 0);
  const websiteId = access.row.website_id;

  try {
    const insertRes = await env.DB!.prepare(
      `INSERT INTO crm_contacts_leads (website_id, owner_id, full_name, phone, email, source, stage, loyalty_points, marketing_consent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(websiteId, access.row.owner_id, name, phone, email, source, stage, loyaltyPoints, marketingConsent)
      .run();

    const createdLead = {
      id: Number(insertRes.meta?.last_row_id || Date.now()),
      tenantId: tenantRowId,
      name,
      phone,
      email,
      source,
      stage,
      loyaltyPoints,
      marketingConsent: Boolean(marketingConsent),
      unsubscribed: false,
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'create_crm_lead',
      targetType: 'lead',
      targetId: String(createdLead.id),
      details: { websiteId, name, phone, email },
    });

    return jsonResponse({ success: true, lead: createdLead });
  } catch (err) {
    if (isMissingTableError(err)) {
      // Fallback: store in website_json
      const currentLeads: any[] = Array.isArray(access.parsed.crmLeads) ? [...access.parsed.crmLeads] : [];
      const createdLead = {
        id: Date.now(),
        tenantId: tenantRowId,
        name,
        phone,
        email,
        source,
        stage,
        loyaltyPoints,
        marketingConsent: Boolean(marketingConsent),
        unsubscribed: false,
      };
      currentLeads.unshift(createdLead);
      access.parsed.crmLeads = currentLeads;

      await env.DB!.prepare(
        `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(JSON.stringify(access.parsed), websiteId)
        .run();

      return jsonResponse({ success: true, lead: createdLead });
    }
    return jsonResponse({ error: 'Failed to record lead.' }, 500);
  }
}
