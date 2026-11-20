// ============================================================================
// GET /api/domains/pricing — Transparent Indicative TLD Pricing & GST
// ============================================================================

import { PagesContext, errorJson, json } from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const registrarConfigured = Boolean(env.DOMAIN_REGISTRAR_PROVIDER && env.DOMAIN_REGISTRAR_API_KEY);

  const rows = await env.DB.prepare(
    `SELECT extension, registration_inr, renewal_inr, gst_percent, service_fee_inr, is_enabled, pricing_source, notes, updated_at
     FROM domain_pricing_config
     WHERE is_enabled = 1
     ORDER BY registration_inr ASC`
  ).all<{
    extension: string;
    registration_inr: number;
    renewal_inr: number;
    gst_percent: number;
    service_fee_inr: number;
    is_enabled: number;
    pricing_source: string;
    notes: string;
    updated_at: string;
  }>();

  const pricing = (rows.results || []).map((row) => {
    const subtotalFirstYear = row.registration_inr + row.service_fee_inr;
    const gstFirstYear = Math.round((subtotalFirstYear * row.gst_percent) / 100);
    const totalFirstYear = subtotalFirstYear + gstFirstYear;

    const subtotalRenewal = row.renewal_inr + row.service_fee_inr;
    const gstRenewal = Math.round((subtotalRenewal * row.gst_percent) / 100);
    const totalRenewal = subtotalRenewal + gstRenewal;

    return {
      extension: row.extension,
      registrationInr: row.registration_inr,
      renewalInr: row.renewal_inr,
      serviceFeeInr: row.service_fee_inr,
      gstPercent: row.gst_percent,
      gstFirstYearInr: gstFirstYear,
      totalFirstYearInr: totalFirstYear,
      gstRenewalInr: gstRenewal,
      totalRenewalInr: totalRenewal,
      pricingSource: registrarConfigured ? env.DOMAIN_REGISTRAR_PROVIDER : row.pricing_source,
      isIndicativeEstimate: !registrarConfigured,
      notes: row.notes,
      updatedAt: row.updated_at,
    };
  });

  return json({
    registrarConnected: registrarConfigured,
    registrarProvider: registrarConfigured ? env.DOMAIN_REGISTRAR_PROVIDER : null,
    notice: registrarConfigured
      ? `Connected to ${env.DOMAIN_REGISTRAR_PROVIDER}. Confirm final checkout price before payment.`
      : 'Integration Required: Live registrar API is not connected. Prices shown are indicative reference estimates only — Vijay Visuals never fakes live registrar availability or checkout prices.',
    pricing,
  });
}
