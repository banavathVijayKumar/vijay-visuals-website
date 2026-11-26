// ============================================================================
// POST /api/owner/tenants/:tenantId/domains/:domainId/health-check
// Express-dashboard parity: logs a live Cloudflare DoH + HTTPS diagnostic and
// returns the dashboard domain record with lastHealthStatus / latestHealthCheck.
// ============================================================================

import { requireUser } from '../../../../../_auth';
import { PagesContext, errorJson, handleOptions, json } from '../../../../../_shared';
import { requireTenantOwnerAccess } from '../../../../../_tenantAccess';
import {
  TenantDomainRow,
  createDomainNotification,
  recordDomainEvent,
  runLiveDomainVerification,
} from '../../../../../domains/_helpers';
import { deriveDomainFields, mapHealthCheckRow } from '../index';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  try {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;
    if (!env.DB) return errorJson('Database binding is not configured.', 503);

    const domainId = Number(params.domainId);
    if (!Number.isInteger(domainId) || domainId <= 0) {
      return errorJson('Invalid domain ID.', 400);
    }
    const websiteId = access.row.website_id;
    const tenantRowId = Number(access.row.rowid || 0);

    const domainRow = await env.DB.prepare(
      'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(domainId, websiteId)
      .first<TenantDomainRow>();
    if (!domainRow) return errorJson('Domain not found.', 404);

    const result = await runLiveDomainVerification(domainRow, env);
    const wasLive = domainRow.status === 'live';

    await env.DB.prepare(
      `INSERT INTO domain_health_checks
        (domain_id, website_id, check_source, txt_matched, cname_matched, a_record_matched, www_matched,
         https_reachable, http_status, observed_records_json, error_summary, checked_at)
       VALUES (?, ?, 'cloudflare_doh_health', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        domainId,
        websiteId,
        result.txtMatched ? 1 : 0,
        result.cnameMatched ? 1 : 0,
        result.aRecordMatched ? 1 : 0,
        result.wwwMatched ? 1 : 0,
        result.httpsReachable ? 1 : 0,
        result.httpStatus,
        JSON.stringify(result.observedRecords),
        result.errorSummary
      )
      .run();

    // D1 has no last_health_status / ssl_issuer columns on tenant_domains; only
    // observation-backed diagnostic fields are persisted here.
    await env.DB.prepare(
      `UPDATE tenant_domains
       SET www_status = ?,
           ssl_status = ?,
           last_checked_at = datetime('now'),
           last_error = ?,
           updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(result.nextWwwStatus, result.nextSslStatus, result.errorSummary, domainId, websiteId)
      .run();

    await recordDomainEvent(env, {
      domainId,
      websiteId,
      ownerId: domainRow.owner_id,
      eventType: 'health_check',
      actorRole: access.effectiveRole,
      actorId: auth.user.id,
      reason:
        result.errorSummary ||
        `DNS ${result.dnsVerified ? 'OK' : 'pending'}, HTTPS ${result.httpsReachable ? `OK (HTTP ${result.httpStatus})` : 'unavailable'}`,
      details: {
        txtMatched: result.txtMatched,
        cnameMatched: result.cnameMatched,
        aRecordMatched: result.aRecordMatched,
        wwwMatched: result.wwwMatched,
        httpsReachable: result.httpsReachable,
        httpStatus: result.httpStatus,
      },
    });

    const latestCheck = await env.DB.prepare(
      `SELECT * FROM domain_health_checks
       WHERE domain_id = ? AND website_id = ?
       ORDER BY checked_at DESC, id DESC LIMIT 1`
    )
      .bind(domainId, websiteId)
      .first<Record<string, any>>();
    const healthStatus = latestCheck
      ? (() => {
          const routing = Boolean(
            latestCheck.cname_matched || latestCheck.a_record_matched || latestCheck.www_matched
          );
          const dnsOk = Boolean(latestCheck.txt_matched && routing);
          const httpsOk = Boolean(latestCheck.https_reachable);
          if (dnsOk && httpsOk) return 'healthy';
          if (dnsOk || httpsOk) return 'degraded';
          return 'down';
        })()
      : 'pending';

    if (healthStatus === 'down' && wasLive) {
      await createDomainNotification(env, {
        domainId,
        websiteId,
        ownerId: domainRow.owner_id,
        notificationType: 'domain_connection_problem',
        title: `Domain Alert: ${domainRow.domain_name} is Unreachable`,
        message: result.errorSummary || 'Live health check detected a problem with this domain.',
        severity: 'warning',
      });
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(domainId, websiteId)
      .first<TenantDomainRow>();

    return json({
      domain: updated ? deriveDomainFields(updated, tenantRowId, env, latestCheck) : null,
      healthCheck: latestCheck ? mapHealthCheckRow(latestCheck, updated || domainRow) : null,
      domainId,
      domainName: domainRow.domain_name,
      healthy: result.dnsVerified && result.httpsReachable,
      lastHealthStatus: healthStatus,
      diagnostics: result,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('POST tenant domain health check failed:', err);
    return errorJson('Domain health check failed.', 500);
  }
}
