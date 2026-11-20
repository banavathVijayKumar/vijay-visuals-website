// ============================================================================
// PUT /api/admin/domains/pricing/:extension — Super Admin TLD Pricing Manager
// ============================================================================

import { requireAdmin } from '../../../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../../../_shared';

export async function onRequestPut(
  context: PagesContext<{ extension: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rawExt = decodeURIComponent(params.extension || '').trim().toLowerCase();
  const extension = rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
  if (!/^\.[a-z0-9.]{2,15}$/.test(extension)) {
    return errorJson('Invalid domain extension format (example: .com or .co.in).', 400);
  }

  const body = await parseJsonBody<{
    registrationInr?: number;
    renewalInr?: number;
    gstPercent?: number;
    serviceFeeInr?: number;
    isEnabled?: boolean;
    notes?: string;
  }>(request);
  if (!body) return errorJson('Invalid JSON payload.', 400);

  const registrationInr = Number(body.registrationInr);
  const renewalInr = Number(body.renewalInr);
  const gstPercent = body.gstPercent !== undefined ? Number(body.gstPercent) : 18;
  const serviceFeeInr = body.serviceFeeInr !== undefined ? Number(body.serviceFeeInr) : 0;

  if (!Number.isFinite(registrationInr) || registrationInr < 0 || !Number.isFinite(renewalInr) || renewalInr < 0) {
    return errorJson('registrationInr and renewalInr must be non-negative numbers.', 400);
  }
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 28) {
    return errorJson('gstPercent must be between 0 and 28.', 400);
  }
  if (!Number.isFinite(serviceFeeInr) || serviceFeeInr < 0) {
    return errorJson('serviceFeeInr must be non-negative.', 400);
  }

  const isEnabled = body.isEnabled === false ? 0 : 1;
  const notes = sanitizeText(
    body.notes || 'Indicative reference rate updated by Super Admin. Verify live checkout price at registrar.',
    300
  );

  await env.DB.prepare(
    `INSERT INTO domain_pricing_config
      (extension, registration_inr, renewal_inr, gst_percent, service_fee_inr, is_enabled, notes, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(extension) DO UPDATE SET
       registration_inr = excluded.registration_inr,
       renewal_inr = excluded.renewal_inr,
       gst_percent = excluded.gst_percent,
       service_fee_inr = excluded.service_fee_inr,
       is_enabled = excluded.is_enabled,
       notes = excluded.notes,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`
  )
    .bind(
      extension,
      Math.round(registrationInr),
      Math.round(renewalInr),
      Math.round(gstPercent),
      Math.round(serviceFeeInr),
      isEnabled,
      notes,
      auth.user.id
    )
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: 'super_admin',
    action: 'domain_pricing_updated',
    targetType: 'domain_pricing_config',
    targetId: extension,
    details: { registrationInr, renewalInr, gstPercent, serviceFeeInr, isEnabled },
  });

  const saved = await env.DB.prepare('SELECT * FROM domain_pricing_config WHERE extension = ?')
    .bind(extension)
    .first();

  return json({ pricing: saved });
}
