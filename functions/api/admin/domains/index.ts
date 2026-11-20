// ============================================================================
// GET /api/admin/domains — Super Admin & Platform Staff Domain Fleet Overview
// ============================================================================

import { requirePlatformStaff } from '../../_auth';
import { PagesContext, errorJson, json } from '../../_shared';
import { buildDnsInstructions } from '../../domains/_helpers';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requirePlatformStaff(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const statusFilter = (url.searchParams.get('status') || '').trim().toLowerCase();
  const search = (url.searchParams.get('q') || '').trim().toLowerCase();

  const allRes = await env.DB.prepare(
    `SELECT
       td.*,
       p.public_slug,
       p.business_name,
       p.status AS website_status,
       u.email AS owner_email,
       u.full_name AS owner_name
     FROM tenant_domains td
     LEFT JOIN customer_website_publications p ON p.website_id = td.website_id
     LEFT JOIN vv_users u ON u.id = td.owner_id OR u.auth_subject = td.owner_id
     ORDER BY td.updated_at DESC`
  ).all<Record<string, unknown>>();

  const rows = (allRes.results || []).filter((r) => {
    if (statusFilter && statusFilter !== 'all' && String(r.status || '') !== statusFilter) {
      return false;
    }
    if (search) {
      const hay = `${r.domain_name || ''} ${r.business_name || ''} ${r.public_slug || ''} ${r.owner_email || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const allRows = allRes.results || [];
  const kpis = {
    total: allRows.length,
    live: allRows.filter((r) => r.status === 'live').length,
    pendingDns: allRows.filter((r) => r.status === 'pending_dns' || r.status === 'dns_verifying').length,
    sslPending: allRows.filter((r) => r.status === 'ssl_pending').length,
    errors: allRows.filter((r) => r.status === 'dns_error' || r.status === 'ssl_error').length,
    expiringSoon: allRows.filter((r) => r.status === 'expiring_soon').length,
    expired: allRows.filter((r) => r.status === 'expired').length,
    suspended: allRows.filter((r) => r.status === 'suspended').length,
  };

  const pricingRes = await env.DB.prepare(
    'SELECT * FROM domain_pricing_config ORDER BY registration_inr ASC'
  ).all();

  return json({
    kpis,
    domains: rows.map((d) => ({
      ...d,
      is_primary: Boolean(d.is_primary),
      dnsInstructions: buildDnsInstructions(
        String(d.domain_name || ''),
        String(d.verification_token || ''),
        env
      ),
    })),
    pricing: pricingRes.results || [],
  });
}
