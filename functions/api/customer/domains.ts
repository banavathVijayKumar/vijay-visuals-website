// ============================================================================
// GET /api/customer/domains — Authenticated Customer Domain Dashboard
// Express parity mapped to D1: all customer publications, their tenant_domains,
// notifications, events, health checks, and honest integration status.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  errorJson,
  handleOptions,
  json,
} from '../_shared';
import { mapPublicationToTenant } from '../_tenantMapper';
import { TenantDomainRow } from '../domains/_helpers';
import {
  deriveDomainFields,
  getDomainsChannelStatus,
  getDomainsCloudflareSaasStatus,
  mapDomainEventRow,
  mapDomainNotificationRow,
  mapHealthCheckRow,
  refreshTenantRenewalReminders,
} from '../owner/tenants/[tenantId]/domains/index';

interface PublicationRow {
  rowid?: number | null;
  website_id: string;
  owner_id: string;
  public_slug: string;
  business_name: string;
  website_json: string;
  status: string;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function parseWebsiteJson(raw: string): Record<string, any> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DB) return errorJson('Database binding is not configured.', 503);

    const userId = auth.user.id;
    const authSub = auth.user.authSubject;

    const publicationRes = auth.user.isSuperAdmin
      ? await env.DB.prepare(
          `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status,
                  published_at, created_at, updated_at
           FROM customer_website_publications
           ORDER BY created_at DESC`
        ).all<PublicationRow>()
      : await env.DB.prepare(
          `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status,
                  published_at, created_at, updated_at
           FROM customer_website_publications
           WHERE owner_id = ? OR owner_id = ?
           ORDER BY created_at DESC`
        )
          .bind(userId, authSub)
          .all<PublicationRow>();

    const seen = new Set<string>();
    const publications = (publicationRes.results || []).filter((row) => {
      if (!row.website_id || seen.has(row.website_id)) return false;
      seen.add(row.website_id);
      return true;
    });

    const tenants = publications.map((row) => {
      const parsed = parseWebsiteJson(row.website_json);
      const tenant = mapPublicationToTenant(row, parsed);
      return {
        ...tenant,
        ownerUserId: row.owner_id,
        websiteId: row.website_id,
        tenantId: Number(row.rowid || 0),
      };
    });

    const websiteIds = publications.map((row) => row.website_id);
    const cloudflareSaas = getDomainsCloudflareSaasStatus(env);
    const channelStatus = getDomainsChannelStatus(env);
    const registrarConfigured = Boolean((env.DOMAIN_REGISTRAR_API_KEY || '').trim());

    if (websiteIds.length === 0) {
      return json({
        tenants,
        domains: [],
        notifications: [],
        events: [],
        healthChecks: [],
        cloudflareSaas,
        channelStatus,
        registrarConfigured,
      });
    }

    for (const websiteId of websiteIds) {
      try {
        await refreshTenantRenewalReminders(env, websiteId);
      } catch (err) {
        console.error('Customer domain renewal scan failed:', err);
      }
    }

    // D1 has no IN-parameter binding helper here; query by owner_id directly
    // (the same ownership rule used for publication selection) and filter by
    // the authorized website_id set so no cross-tenant rows can leak.
    const ownerIds = [...new Set(publications.map((row) => row.owner_id).filter(Boolean))];
    const domainRows: TenantDomainRow[] = [];
    const notifRows: Record<string, any>[] = [];
    const eventRows: Record<string, any>[] = [];
    const checkRows: Record<string, any>[] = [];

    for (const ownerId of ownerIds) {
      const [d, n, e, c] = await Promise.all([
        env.DB.prepare(
          `SELECT * FROM tenant_domains WHERE owner_id = ? ORDER BY is_primary DESC, created_at DESC`
        )
          .bind(ownerId)
          .all<TenantDomainRow>(),
        env.DB.prepare(
          `SELECT * FROM domain_notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100`
        )
          .bind(ownerId)
          .all<Record<string, any>>(),
        env.DB.prepare(
          `SELECT * FROM domain_events WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100`
        )
          .bind(ownerId)
          .all<Record<string, any>>(),
        env.DB.prepare(
          `SELECT * FROM domain_health_checks WHERE website_id IN (SELECT website_id FROM tenant_domains WHERE owner_id = ?)
           ORDER BY checked_at DESC LIMIT 100`
        )
          .bind(ownerId)
          .all<Record<string, any>>(),
      ]);
      domainRows.push(...(d.results || []));
      notifRows.push(...(n.results || []));
      eventRows.push(...(e.results || []));
      checkRows.push(...(c.results || []));
    }

    const allowed = new Set(websiteIds);
    const rowidByWebsite = new Map(
      publications.map((row) => [row.website_id, Number(row.rowid || 0)] as const)
    );
    const myDomains = domainRows
      .filter((row) => allowed.has(row.website_id))
      .sort((a, b) => Number(b.is_primary || 0) - Number(a.is_primary || 0));
    const myChecks = checkRows.filter((row) => allowed.has(String(row.website_id || '')));
    const myNotifs = notifRows.filter((row) => allowed.has(String(row.website_id || '')));
    const myEvents = eventRows.filter((row) => allowed.has(String(row.website_id || '')));

    return json({
      tenants,
      domains: myDomains.map((row) =>
        deriveDomainFields(
          row,
          rowidByWebsite.get(row.website_id) || 0,
          env,
          myChecks.find((c) => Number(c.domain_id) === Number(row.id)) || null
        )
      ),
      notifications: myNotifs.map((n) =>
        mapDomainNotificationRow(n, rowidByWebsite.get(String(n.website_id || '')) || 0)
      ),
      events: myEvents.map((e) => mapDomainEventRow(e, rowidByWebsite.get(String(e.website_id || '')) || 0)),
      healthChecks: myChecks.map((c) => mapHealthCheckRow(c)),
      cloudflareSaas,
      channelStatus,
      registrarConfigured,
    });
  } catch (err) {
    console.error('GET /api/customer/domains failed:', err);
    return errorJson('Unable to load customer domain dashboard.', 500);
  }
}
