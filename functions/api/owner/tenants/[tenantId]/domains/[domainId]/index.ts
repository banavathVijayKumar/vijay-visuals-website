// ============================================================================
// PATCH & DELETE /api/owner/tenants/:tenantId/domains/:domainId
// Express-dashboard-compatible detail operations on Cloudflare Pages D1.
// DELETE disconnects (never hard-deletes) and promotes a remaining domain.
// ============================================================================

import { requireUser, type AuthenticatedUser, type TenantRole } from '../../../../../_auth';
import {
  CloudflareEnv,
  PagesContext,
  errorJson,
  getCnameTarget,
  handleOptions,
  json,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../../../_shared';
import { requireTenantOwnerAccess } from '../../../../../_tenantAccess';
import {
  TenantDomainRow,
  createDomainNotification,
  recordDomainEvent,
} from '../../../../../domains/_helpers';
import {
  deriveDomainFields,
  getDomainsChannelStatus,
  getDomainsCloudflareSaasStatus,
  refreshTenantRenewalReminders,
} from '../index';

type DomainDb = NonNullable<CloudflareEnv['DB']>;

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

interface DomainAccess {
  websiteId: string;
  ownerId: string;
  tenantRowId: number;
  role: string;
  db: DomainDb;
}

async function loadAuthorizedDomain(
  env: CloudflareEnv,
  authUser: AuthenticatedUser,
  tenantId: string,
  domainId: string,
  roles: TenantRole[]
): Promise<
  | { ok: true; domain: TenantDomainRow; access: DomainAccess }
  | { ok: false; response: Response }
> {
  const access = await requireTenantOwnerAccess(env, authUser, tenantId, roles);
  if (!access.ok) return { ok: false, response: access.response };
  if (!env.DB) return { ok: false, response: errorJson('Database binding is not configured.', 503) };
  const db = env.DB;

  const domain = await db.prepare(
    'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
  )
    .bind(Number(domainId), access.row.website_id)
    .first<TenantDomainRow>();
  if (!domain) {
    return {
      ok: false,
      response: errorJson('Domain not found for this business account.', 404),
    };
  }

  return {
    ok: true,
    domain,
    access: {
      websiteId: access.row.website_id,
      ownerId: access.row.owner_id,
      tenantRowId: Number(access.row.rowid || 0),
      role: access.effectiveRole,
      db,
    },
  };
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const loaded = await loadAuthorizedDomain(
      env,
      auth.user,
      params.tenantId,
      params.domainId,
      ['business_owner', 'business_manager']
    );
    if (!loaded.ok) return loaded.response;
    const { domain, access } = loaded;

    const body = await parseJsonBody<Record<string, any>>(request);
    if (!body) return errorJson('Invalid JSON payload.', 400);

    const updates: Record<string, any> = {};
    const set = (column: string, value: any) => {
      updates[column] = value;
    };

    if (body.wwwPreference !== undefined || body.wwwMode !== undefined) {
      const mode = body.wwwPreference || body.wwwMode;
      if (mode !== 'redirect_to_root' && mode !== 'redirect_to_www' && mode !== 'both') {
        return errorJson('Invalid www routing preference.', 400);
      }
      set('www_mode', mode);
    }
    if (body.isPrimary !== undefined) {
      if (body.isPrimary) {
        await access.db.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE website_id = ?')
          .bind(access.websiteId)
          .run();
        set('is_primary', 1);
      } else if (Number(domain.is_primary) === 1) {
        return errorJson('At least one domain must remain primary.', 400);
      } else {
        set('is_primary', 0);
      }
    }
    if (body.registrarName !== undefined) {
      const registrar = sanitizeText(body.registrarName, 100);
      if (registrar.length < 2) return errorJson('Registrar name must be at least 2 characters.', 400);
      set('registrar_name', registrar);
    }
    // D1 stores renewal_date; Express renewalReminderDate is mapped onto it.
    const reminder = body.renewalReminderDate || body.renewalDate;
    if (reminder !== undefined) set('renewal_date', reminder ? sanitizeText(reminder, 20) : null);
    if (body.expiryDate !== undefined) {
      set('expiry_date', body.expiryDate ? sanitizeText(body.expiryDate, 20) : null);
    }

    const mutableStatuses = new Set([
      'pending_dns',
      'dns_verifying',
      'dns_verified',
      'ssl_pending',
      'live',
      'dns_error',
      'ssl_error',
      'suspended',
      'expiring_soon',
      'expired',
    ]);
    if (body.status !== undefined) {
      const status = sanitizeText(body.status, 40);
      if (!mutableStatuses.has(status)) return errorJson('Invalid domain status.', 400);
      set('status', status);
      if (status === 'suspended') set('last_error', sanitizeText(body.reason || body.note || '', 300));
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) return errorJson('No valid fields to update.', 400);

    const sql = `UPDATE tenant_domains SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND website_id = ?`;
    await access.db.prepare(sql)
      .bind(...keys.map((k) => updates[k]), domain.id, access.websiteId)
      .run();

    if (body.isPrimary && domain.domain_name) {
      const publication = await access.db.prepare(
        'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(access.websiteId)
        .first<{ website_json: string }>();
      if (publication) {
        let parsed: Record<string, any> = {};
        try {
          const candidate = JSON.parse(publication.website_json || '{}');
          if (candidate && typeof candidate === 'object') parsed = candidate;
        } catch {
          parsed = {};
        }
        parsed.customDomain = domain.domain_name;
        await access.db.prepare(
          "UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?"
        )
          .bind(JSON.stringify(parsed), access.websiteId)
          .run();
      }
    }

    if (body.expiryDate || body.renewalDate || body.renewalReminderDate) {
      await refreshTenantRenewalReminders(env, access.websiteId);
    }

    const updated = await access.db.prepare(
      'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(domain.id, access.websiteId)
      .first<TenantDomainRow>();

    await recordDomainEvent(env, {
      domainId: Number(domain.id),
      websiteId: access.websiteId,
      ownerId: access.ownerId,
      eventType: 'domain_updated',
      actorRole: access.role,
      actorId: auth.user.id,
      reason: `Domain ${domain.domain_name} settings updated`,
      details: updates,
    });
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.role,
      action: 'DOMAIN_UPDATED',
      targetType: 'domain',
      targetId: String(domain.id),
      details: { domain: domain.domain_name, fields: Object.keys(updates) },
    });

    return json({
      domain: updated ? deriveDomainFields(updated, access.tenantRowId, env, null) : null,
      message: 'Domain settings updated.',
      cloudflareSaas: getDomainsCloudflareSaasStatus(env),
      channelStatus: getDomainsChannelStatus(env),
      registrarConfigured: Boolean((env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
      dnsTarget: getCnameTarget(env),
    });
  } catch (err) {
    console.error('PATCH tenant domain failed:', err);
    return errorJson('Failed to update custom domain.', 500);
  }
}

export async function onRequestDelete(
  context: PagesContext<{ tenantId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const loaded = await loadAuthorizedDomain(
      env,
      auth.user,
      params.tenantId,
      params.domainId,
      ['business_owner', 'business_manager']
    );
    if (!loaded.ok) return loaded.response;
    const { domain, access } = loaded;

    // Tenant isolation is enforced by the SELECT above; all subsequent writes
    // are scoped by both domain id and website_id.
    await access.db.prepare(
      "UPDATE tenant_domains SET status = 'disconnected', is_primary = 0, updated_at = datetime('now') WHERE id = ? AND website_id = ?"
    )
      .bind(domain.id, access.websiteId)
      .run();

    const remaining = await access.db.prepare(
      `SELECT id, domain_name FROM tenant_domains
       WHERE website_id = ? AND status NOT IN ('disconnected', 'rejected')
       ORDER BY is_primary DESC, created_at ASC LIMIT 1`
    )
      .bind(access.websiteId)
      .first<{ id: number; domain_name: string }>();

    if (remaining) {
      await access.db.prepare(
        'UPDATE tenant_domains SET is_primary = 1 WHERE id = ? AND website_id = ?'
      )
        .bind(remaining.id, access.websiteId)
        .run();
      const publication = await access.db.prepare(
        'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(access.websiteId)
        .first<{ website_json: string }>();
      if (publication) {
        let parsed: Record<string, any> = {};
        try {
          const candidate = JSON.parse(publication.website_json || '{}');
          if (candidate && typeof candidate === 'object') parsed = candidate;
        } catch {
          parsed = {};
        }
        parsed.customDomain = remaining.domain_name;
        await access.db.prepare(
          "UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?"
        )
          .bind(JSON.stringify(parsed), access.websiteId)
          .run();
      }
    } else {
      const publication = await access.db.prepare(
        'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(access.websiteId)
        .first<{ website_json: string }>();
      if (publication) {
        let parsed: Record<string, any> = {};
        try {
          const candidate = JSON.parse(publication.website_json || '{}');
          if (candidate && typeof candidate === 'object') parsed = candidate;
        } catch {
          parsed = {};
        }
        delete parsed.customDomain;
        await access.db.prepare(
          "UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?"
        )
          .bind(JSON.stringify(parsed), access.websiteId)
          .run();
      }
    }

    const disconnected = await access.db.prepare(
      'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(domain.id, access.websiteId)
      .first<TenantDomainRow>();

    await recordDomainEvent(env, {
      domainId: Number(domain.id),
      websiteId: access.websiteId,
      ownerId: access.ownerId,
      eventType: 'domain_removed',
      actorRole: access.role,
      actorId: auth.user.id,
      reason: `Domain ${domain.domain_name} disconnected`,
      details: { replacementPrimary: remaining?.domain_name || '' },
    });
    await createDomainNotification(env, {
      domainId: Number(domain.id),
      websiteId: access.websiteId,
      ownerId: access.ownerId,
      notificationType: 'domain_disconnected',
      title: `Custom domain ${domain.domain_name} disconnected`,
      message: remaining
        ? `${remaining.domain_name} is now the primary domain.`
        : 'No custom domain is currently connected.',
      severity: 'info',
    });
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.role,
      action: 'DOMAIN_DELETED',
      targetType: 'domain',
      targetId: String(domain.id),
      details: { domain: domain.domain_name, replacementPrimary: remaining?.domain_name || '' },
    });

    return json({
      success: true,
      message: remaining
        ? `Domain disconnected. ${remaining.domain_name} is now primary.`
        : 'Domain disconnected.',
      domain: disconnected ? deriveDomainFields(disconnected, access.tenantRowId, env, null) : null,
      promotedPrimary: remaining?.domain_name || null,
      cloudflareSaas: getDomainsCloudflareSaasStatus(env),
      channelStatus: getDomainsChannelStatus(env),
      registrarConfigured: Boolean((env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
      dnsTarget: getCnameTarget(env),
    });
  } catch (err) {
    console.error('DELETE tenant domain failed:', err);
    return errorJson('Failed to disconnect custom domain.', 500);
  }
}
