// ============================================================================
// GET /api/domains/my — Authenticated Customer's Own Domains, Events & Alerts
// Strictly scoped to verified Supabase user — zero cross-tenant leakage.
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, errorJson, getCnameTarget, json } from '../_shared';
import { TenantDomainRow, buildDnsInstructions } from './_helpers';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const userId = auth.user.id;
  const authSub = auth.user.authSubject;

  const websitesRes = await env.DB.prepare(
    `SELECT website_id, owner_id, public_slug, business_name, status, published_at, updated_at
     FROM customer_website_publications
     WHERE owner_id = ? OR owner_id = ?
     ORDER BY updated_at DESC`
  )
    .bind(userId, authSub)
    .all<{
      website_id: string;
      owner_id: string;
      public_slug: string;
      business_name: string;
      status: string;
      published_at: string | null;
      updated_at: string;
    }>();

  const domainsRes = await env.DB.prepare(
    `SELECT * FROM tenant_domains
     WHERE owner_id = ? OR owner_id = ?
     ORDER BY is_primary DESC, created_at DESC`
  )
    .bind(userId, authSub)
    .all<TenantDomainRow>();

  const eventsRes = await env.DB.prepare(
    `SELECT id, domain_id, website_id, event_type, actor_role, reason, details_json, created_at
     FROM domain_events
     WHERE owner_id = ? OR owner_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  )
    .bind(userId, authSub)
    .all();

  const notificationsRes = await env.DB.prepare(
    `SELECT id, domain_id, website_id, notification_type, milestone_key, title, message, severity, channels_json, is_read, read_at, created_at
     FROM domain_notifications
     WHERE owner_id = ? OR owner_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  )
    .bind(userId, authSub)
    .all();

  const domains = (domainsRes.results || []).map((d) => ({
    ...d,
    is_primary: Boolean(d.is_primary),
    auto_renew: Boolean(d.auto_renew),
    auto_renew_supported: Boolean(d.auto_renew_supported),
    dnsInstructions: buildDnsInstructions(d.domain_name, d.verification_token, env),
  }));

  return json({
    cnameTarget: getCnameTarget(env),
    websites: websitesRes.results || [],
    domains,
    events: eventsRes.results || [],
    notifications: notificationsRes.results || [],
  });
}
