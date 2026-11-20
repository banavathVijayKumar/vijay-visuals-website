// ============================================================================
// POST /api/admin/domains/run-renewal-scan
// Authorizes either a Super Admin Supabase JWT OR X-Cron-Secret header.
// Idempotently emits 30d/15d/7d/3d/0d expiry reminders without duplicates.
// ============================================================================

import { requireAdmin } from '../../_auth';
import { PagesContext, errorJson, json, safeEqual } from '../../_shared';
import { runRenewalScanForDomains } from '../../domains/_helpers';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const cronHeader = request.headers.get('X-Cron-Secret') || '';
  const authorizedByCron = Boolean(env.CRON_SECRET && cronHeader && safeEqual(cronHeader, env.CRON_SECRET));

  if (!authorizedByCron) {
    const auth = await requireAdmin(request, env);
    if (!auth.ok) return auth.response;
  }

  const summary = await runRenewalScanForDomains(env);
  return json({
    ok: true,
    triggeredBy: authorizedByCron ? 'cron_secret' : 'super_admin',
    ...summary,
    scannedAt: new Date().toISOString(),
  });
}
