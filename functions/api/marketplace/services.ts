// GET /api/marketplace/services
// Reads only published services and active plans from D1. No hard-coded prices.
import { CloudflareEnv, jsonResponse, handleOptions } from '../_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestGet(context: { env: CloudflareEnv }) {
  const db = context.env.DB;
  if (!db) {
    return jsonResponse({
      error: 'Marketplace database is not configured yet.',
      code: 'D1_NOT_CONFIGURED',
    }, 503, { 'Cache-Control': 'no-store' });
  }

  try {
    const result = await db.prepare(`
      SELECT
        s.id, s.slug, s.name, s.short_description, s.description,
        s.category, s.icon, s.demo_enabled,
        p.id AS plan_id, p.billing_period, p.price_minor,
        p.currency, p.usage_limit, p.features_json
      FROM ai_services s
      LEFT JOIN ai_service_plans p
        ON p.service_id = s.id AND p.is_active = 1
      WHERE s.is_active = 1
      ORDER BY s.sort_order ASC, s.name ASC,
        CASE p.billing_period WHEN 'monthly' THEN 1 WHEN 'yearly' THEN 2 ELSE 3 END
    `).all<any>();

    const byId = new Map<string, any>();
    for (const row of result.results || []) {
      if (!byId.has(row.id)) {
        byId.set(row.id, {
          id: row.id,
          slug: row.slug,
          name: row.name,
          shortDescription: row.short_description,
          description: row.description,
          category: row.category,
          icon: row.icon,
          demoEnabled: Boolean(row.demo_enabled),
          plans: [],
        });
      }
      if (row.plan_id) {
        let features: unknown[] = [];
        try { features = JSON.parse(row.features_json || '[]'); } catch {}
        byId.get(row.id).plans.push({
          id: row.plan_id,
          billingPeriod: row.billing_period,
          priceMinor: row.price_minor,
          currency: row.currency,
          usageLimit: row.usage_limit,
          features,
        });
      }
    }

    return jsonResponse({ services: Array.from(byId.values()) }, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (error: any) {
    console.error('Marketplace services query failed:', error);
    return jsonResponse({ error: 'Unable to load marketplace services.' }, 500);
  }
}
