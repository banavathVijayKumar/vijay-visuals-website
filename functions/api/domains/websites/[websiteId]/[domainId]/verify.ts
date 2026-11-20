// ============================================================================
// POST /api/domains/websites/:websiteId/:domainId/verify
// Live Cloudflare DNS-over-HTTPS + HTTPS verification (NEVER fakes live/SSL!)
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../../../_auth';
import { PagesContext, checkRateLimit, errorJson, json } from '../../../../_shared';
import {
  TenantDomainRow,
  buildDnsInstructions,
  recordDomainEvent,
  runLiveDomainVerification,
} from '../../../_helpers';

export async function onRequestPost(
  context: PagesContext<{ websiteId: string; domainId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireWebsiteAccess(env, auth.user, params.websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rl = await checkRateLimit(env, `domain_verify:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) {
    return errorJson('Verification rate limit reached. Wait a few minutes before retrying DNS check.', 429);
  }

  const domainId = Number(params.domainId);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return errorJson('Invalid domain ID.', 400);
  }

  const domainRow = await env.DB.prepare(
    'SELECT * FROM tenant_domains WHERE id = ? AND website_id = ? LIMIT 1'
  )
    .bind(domainId, params.websiteId)
    .first<TenantDomainRow>();

  if (!domainRow) {
    return errorJson('Domain not found for this website.', 404);
  }
  if (domainRow.status === 'suspended') {
    return errorJson('This domain is suspended by platform administration and cannot be verified until reactivated.', 403);
  }

  const result = await runLiveDomainVerification(domainRow, env);

  await env.DB.prepare(
    `INSERT INTO domain_health_checks
      (domain_id, website_id, check_source, txt_matched, cname_matched, a_record_matched, www_matched,
       https_reachable, http_status, observed_records_json, error_summary, checked_at)
     VALUES (?, ?, 'cloudflare_doh', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      domainRow.id,
      domainRow.website_id,
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
     WHERE id = ?`
  )
    .bind(
      result.nextStatus,
      result.nextDnsStatus,
      result.nextDnsStatus,
      result.nextWwwStatus,
      result.nextSslStatus,
      result.errorSummary,
      domainRow.id
    )
    .run();

  await recordDomainEvent(env, {
    domainId: domainRow.id,
    websiteId: domainRow.website_id,
    ownerId: domainRow.owner_id,
    eventType: result.sslActive
      ? 'domain_verified_live'
      : result.dnsVerified
        ? 'dns_verified_ssl_pending'
        : 'dns_verification_failed',
    actorRole: access.effectiveRole,
    actorId: auth.user.id,
    reason: result.errorSummary || 'Live DoH and HTTPS check passed',
    details: {
      txtMatched: result.txtMatched,
      cnameMatched: result.cnameMatched,
      wwwMatched: result.wwwMatched,
      httpsReachable: result.httpsReachable,
      httpStatus: result.httpStatus,
      cfPagesCheck: result.cfPagesCheck,
    },
  });

  const updated = await env.DB.prepare('SELECT * FROM tenant_domains WHERE id = ? LIMIT 1')
    .bind(domainRow.id)
    .first<TenantDomainRow>();

  return json({
    verified: result.dnsVerified,
    live: result.sslActive,
    verification: result,
    domain: updated
      ? {
          ...updated,
          is_primary: Boolean(updated.is_primary),
          dnsInstructions: buildDnsInstructions(updated.domain_name, updated.verification_token, env),
        }
      : null,
  });
}
