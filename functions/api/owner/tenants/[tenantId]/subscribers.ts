// ============================================================================
// GET /api/owner/tenants/:tenantId/subscribers
// Cloudflare Pages / D1 port of the Express newsletter subscriber listing.
// The live opt-in endpoint (POST /api/newsletter/subscribe) writes consented
// subscribers into crm_contacts_leads, so this endpoint reads that D1 table.
// ============================================================================

import { requireUser, type TenantRole } from '../../../_auth';
import { PagesContext, errorJson, handleOptions, jsonResponse } from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

const ALLOWED_ROLES: TenantRole[] = ['business_owner', 'business_manager', 'business_staff'];

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toIso(value: unknown): string {
  const s = String(value || '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(' ', 'T')}Z`;
  return s;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, ALLOWED_ROLES);
  if (!access.ok) return access.response;

  if (!env.DB) return errorJson('Database storage is not configured.', 503);

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);

  try {
    const res = await env.DB.prepare(
      `SELECT id, full_name, email, source, marketing_consent, unsubscribed_at, created_at
       FROM crm_contacts_leads
       WHERE website_id = ? AND marketing_consent = 1 AND unsubscribed_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();

    const subscribers = (res.results || []).map((r) => ({
      id: toInt(r.id),
      tenantId: tenantRowId,
      email: String(r.email || ''),
      name: String(r.full_name || ''),
      source: String(r.source || 'newsletter'),
      consentGiven: Boolean(r.marketing_consent) && !r.unsubscribed_at,
      createdAt: toIso(r.created_at),
    }));

    return jsonResponse({ subscribers });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error: 'Newsletter subscribers require D1 migration 0003.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Failed to load subscribers.' }, 500);
  }
}
