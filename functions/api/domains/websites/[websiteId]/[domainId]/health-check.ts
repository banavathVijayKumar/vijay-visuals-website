// ============================================================================
// POST /api/domains/websites/:websiteId/:domainId/health-check
// Live Cloudflare DoH + HTTPS diagnostics logged into domain_health_checks
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../../../../_auth';
import { PagesContext, errorJson, json } from '../../../../_shared';
import { TenantDomainRow, runLiveDomainVerification } from '../../../_helpers';

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

  const result = await runLiveDomainVerification(domainRow, env);

  await env.DB.prepare(
    `INSERT INTO domain_health_checks
      (domain_id, website_id, check_source, txt_matched, cname_matched, a_record_matched, www_matched,
       https_reachable, http_status, observed_records_json, error_summary, checked_at)
     VALUES (?, ?, 'cloudflare_doh_health', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
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
    `UPDATE tenant_domains SET last_checked_at = datetime('now'), last_error = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(result.errorSummary, domainRow.id)
    .run();

  return json({
    domainId: domainRow.id,
    domainName: domainRow.domain_name,
    healthy: result.dnsVerified && result.httpsReachable,
    diagnostics: result,
    checkedAt: new Date().toISOString(),
  });
}
