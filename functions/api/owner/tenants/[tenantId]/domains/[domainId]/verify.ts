// ============================================================================
// POST /api/owner/tenants/:tenantId/domains/:domainId/verify
// Express-dashboard parity for live DNS ownership + routing + SSL verification.
// Reuses the Pages Cloudflare DoH / HTTPS helper instead of Node sockets.
// ============================================================================

import { requireUser } from '../../../../../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  handleOptions,
  json,
  rateLimitResponse,
} from '../../../../../_shared';
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

    const rl = await checkRateLimit(env, `domain_verify:${auth.user.id}`, 30, 3600);
    if (!rl.allowed) {
      return rateLimitResponse(
        rl,
        'Verification rate limit reached. Wait a few minutes before retrying DNS check.'
      );
    }

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
    if (!domainRow) return errorJson('Domain record not found.', 404);
    if (domainRow.status === 'suspended') {
      return errorJson(
        'This domain is suspended by platform administration and cannot be verified until reactivated.',
        403
      );
    }

    const result = await runLiveDomainVerification(domainRow, env);

    await env.DB.prepare(
      `INSERT INTO domain_health_checks
        (domain_id, website_id, check_source, txt_matched, cname_matched, a_record_matched, www_matched,
         https_reachable, http_status, observed_records_json, error_summary, checked_at)
       VALUES (?, ?, 'cloudflare_doh', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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

    await env.DB.prepare(
      `UPDATE tenant_domains
       SET status = ?,
           dns_verification_status = ?,
           dns_verified_at = CASE WHEN ? = 'verified' THEN COALESCE(dns_verified_at, datetime('now')) ELSE dns_verified_at END,
           www_status = ?,
           ssl_status = ?,
           last_checked_at = datetime('now'),
           last_error = ?,
           updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(
        result.nextStatus,
        result.nextDnsStatus,
        result.nextDnsStatus,
        result.nextWwwStatus,
        result.nextSslStatus,
        result.errorSummary,
        domainId,
        websiteId
      )
      .run();

    await recordDomainEvent(env, {
      domainId,
      websiteId,
      ownerId: domainRow.owner_id,
      eventType: result.sslActive
        ? 'ownership_verified'
        : result.dnsVerified
          ? 'dns_check'
          : 'dns_verification_failed',
      actorRole: access.effectiveRole,
      actorId: auth.user.id,
      reason:
        result.errorSummary ||
        (result.sslActive ? 'All DNS, SSL/TLS, and HTTPS checks passed.' : 'Live DNS check completed.'),
      details: {
        txtMatched: result.txtMatched,
        cnameMatched: result.cnameMatched,
        aRecordMatched: result.aRecordMatched,
        wwwMatched: result.wwwMatched,
        dnsVerified: result.dnsVerified,
        httpsReachable: result.httpsReachable,
        httpStatus: result.httpStatus,
        cfPagesCheck: result.cfPagesCheck,
      },
    });

    if (result.sslActive) {
      await createDomainNotification(env, {
        domainId,
        websiteId,
        ownerId: domainRow.owner_id,
        notificationType: 'domain_published',
        title: `Website Domain Live: ${domainRow.domain_name}`,
        message: `${domainRow.domain_name} passed DNS ownership, routing, SSL/TLS, and HTTPS health checks.`,
        severity: 'info',
      });
    } else if (result.dnsVerified) {
      await createDomainNotification(env, {
        domainId,
        websiteId,
        ownerId: domainRow.owner_id,
        notificationType: 'ssl_pending',
        title: `SSL Certificate Pending for ${domainRow.domain_name}`,
        message:
          result.errorSummary ||
          'Ownership and DNS routing verified. Waiting for SSL/TLS certificate provisioning at the hosting edge.',
        severity: 'warning',
      });
    } else {
      await createDomainNotification(env, {
        domainId,
        websiteId,
        ownerId: domainRow.owner_id,
        notificationType: 'dns_verification_failed',
        title: `DNS Verification Incomplete: ${domainRow.domain_name}`,
        message: result.errorSummary || 'Required DNS TXT or CNAME records were not detected yet.',
        severity: 'critical',
      });
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(domainId, websiteId)
      .first<TenantDomainRow>();
    const latestCheck = await env.DB.prepare(
      `SELECT * FROM domain_health_checks
       WHERE domain_id = ? AND website_id = ?
       ORDER BY checked_at DESC, id DESC LIMIT 1`
    )
      .bind(domainId, websiteId)
      .first<Record<string, any>>();

    return json({
      verified: result.dnsVerified,
      live: result.sslActive,
      verification: result,
      domain: updated
        ? deriveDomainFields(updated, tenantRowId, env, latestCheck)
        : null,
      latestHealthCheck: latestCheck ? mapHealthCheckRow(latestCheck, updated || domainRow) : null,
      liveLookup: {
        ownershipVerified: result.dnsVerified,
        routingConfigured: result.cnameMatched || result.aRecordMatched || result.wwwMatched,
        txtRecords: result.observedRecords.txt,
        cnameRecords: result.observedRecords.cnameRoot,
        aRecords: result.observedRecords.aRoot,
        wwwCnameRecords: result.observedRecords.cnameWww,
        sslHealthy: result.sslActive,
        sslIssuer: String(updated?.ssl_issuer || domainRow.ssl_issuer || ''),
        sslValidTo: String(updated?.ssl_expires_at || domainRow.ssl_expires_at || ''),
        httpsAvailable: result.httpsReachable,
        httpStatusCode: result.httpStatus,
        wwwRedirectHealthy: result.wwwMatched,
        responseTimeMs: 0,
      },
    });
  } catch (err) {
    console.error('POST tenant domain verify failed:', err);
    return errorJson('Live DNS & SSL verification failed.', 500);
  }
}
