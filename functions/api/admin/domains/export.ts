// ============================================================================
// GET /api/admin/domains/export — Super Admin Domain Fleet Export (CSV / JSON)
// ============================================================================

import { requireAdmin } from '../../_auth';
import { PagesContext, csvEscape, csvResponse, errorJson, json } from '../../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();

  const res = await env.DB.prepare(
    `SELECT
       td.id, td.domain_name, td.website_id, p.public_slug, p.business_name,
       td.owner_id, td.registrar_name, td.status, td.dns_verification_status,
       td.ssl_status, td.www_mode, td.expiry_date, td.renewal_date, td.last_checked_at, td.created_at
     FROM tenant_domains td
     LEFT JOIN customer_website_publications p ON p.website_id = td.website_id
     ORDER BY td.id ASC`
  ).all<Record<string, unknown>>();

  const rows = res.results || [];
  if (format === 'json') {
    return json({ exportedAt: new Date().toISOString(), count: rows.length, domains: rows });
  }

  const headers = [
    'id',
    'domain_name',
    'website_id',
    'public_slug',
    'business_name',
    'owner_id',
    'registrar_name',
    'status',
    'dns_verification_status',
    'ssl_status',
    'www_mode',
    'expiry_date',
    'renewal_date',
    'last_checked_at',
    'created_at',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ];

  return csvResponse(lines.join('\n'), `vijay-visuals-domains-${new Date().toISOString().slice(0, 10)}.csv`);
}
