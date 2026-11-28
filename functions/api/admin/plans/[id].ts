// ============================================================================
// PATCH /api/admin/plans/:id — Super Admin plan update by numeric id
// Ported from server.ts (Express) to Cloudflare Pages + D1.
// D1 subscription_plans has a TEXT code primary key and rowid; the numeric id
// used by the admin UI is resolved through rowid with a list-order fallback.
// ============================================================================

import { requireAdmin } from '../../_auth';
import {
  PagesContext,
  errorJson,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';

interface PlanRow {
  code: string;
  name: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
  setup_fee_inr: number;
  max_websites: number;
  max_custom_domains: number;
  max_products: number;
  max_staff: number;
  storage_quota_mb: number;
  monthly_ai_credits: number;
  features_json: string;
  is_active: number | boolean;
}

interface PlanPatchBody {
  name?: unknown;
  priceInr?: unknown;
  billingCycle?: unknown;
  includesPwa?: unknown;
  aiCreditsIncluded?: unknown;
  storageGb?: unknown;
  thirdPartyDisclosure?: unknown;
  active?: unknown;
}

const LEGACY_SAAS_PLAN_CODES = new Set(['starter', 'business', 'ecommerce', 'premium', 'enterprise']);
const BILLING_CYCLES = new Set(['one_time', 'monthly', 'yearly']);

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isFiniteIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

async function resolvePlanById(
  env: PagesContext['env'],
  id: number
): Promise<PlanRow | null> {
  // D1 exposes SQLite rowid even though subscription_plans.code is the PK.
  try {
    const byRowId = await env.DB!.prepare('SELECT * FROM subscription_plans WHERE rowid = ? LIMIT 1')
      .bind(id)
      .first<PlanRow>();
    if (byRowId) return byRowId;
  } catch {
    // Fall through to the UI-compatible list index below.
  }

  // admin/overview.ts exposes plans with id = index + 1 from this exact ordering.
  const listed = await env.DB!.prepare(
    'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_inr ASC LIMIT 200'
  ).all<PlanRow>();
  return listed.results?.[id - 1] || null;
}

function mapPlan(row: PlanRow, id: number): Record<string, unknown> {
  const code = String(row.code || '').toLowerCase();
  const isSaas = LEGACY_SAAS_PLAN_CODES.has(code);
  const isPwa = code === 'website-plus-pwa' || code.includes('pwa');

  return {
    id,
    code,
    name: String(row.name || ''),
    category: isSaas ? 'saas' : 'website',
    priceInr: Number(row.monthly_price_inr || 0),
    billingCycle: isSaas ? 'monthly' : 'one_time',
    includesPwa: isPwa,
    aiCreditsIncluded: Number(row.monthly_ai_credits || 0),
    storageGb: Math.round(Number(row.storage_quota_mb || 0) / 1024),
    featuresJson: String(row.features_json || '[]'),
    thirdPartyDisclosure:
      'Applicable taxes will be confirmed before payment. Domain registration and renewal are paid directly to the registrar.',
    active: Boolean(row.is_active ?? true),
  };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = parseId(params.id || '');
  const body = await parseJsonBody<PlanPatchBody>(request);
  if (id === null || !body) {
    return errorJson('Invalid plan update payload.', 400);
  }

  // Validate exactly the fields accepted by Express updatePlanSchema.
  if (
    body.name !== undefined &&
    (typeof body.name !== 'string' || sanitizeText(body.name, 140).length < 2)
  ) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (body.priceInr !== undefined && !isFiniteIntInRange(body.priceInr, 0, 5_000_000)) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (
    body.billingCycle !== undefined &&
    (typeof body.billingCycle !== 'string' || !BILLING_CYCLES.has(body.billingCycle))
  ) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (body.includesPwa !== undefined && typeof body.includesPwa !== 'boolean') {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (body.aiCreditsIncluded !== undefined && !isFiniteIntInRange(body.aiCreditsIncluded, 0, 1_000_000)) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (body.storageGb !== undefined && !isFiniteIntInRange(body.storageGb, 0, 10_000)) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (
    body.thirdPartyDisclosure !== undefined &&
    (typeof body.thirdPartyDisclosure !== 'string' ||
      sanitizeText(body.thirdPartyDisclosure, 2000).length > 1000)
  ) {
    return errorJson('Invalid plan update payload.', 400);
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return errorJson('Invalid plan update payload.', 400);
  }

  try {
    const existing = await resolvePlanById(env, id);
    if (!existing) return errorJson('Plan not found.', 404);

    const name =
      body.name !== undefined ? sanitizeText(body.name, 140) : String(existing.name || '');
    const monthlyPriceInr =
      body.priceInr !== undefined
        ? Number(body.priceInr)
        : Number(existing.monthly_price_inr || 0);
    const aiCredits =
      body.aiCreditsIncluded !== undefined
        ? Number(body.aiCreditsIncluded)
        : Number(existing.monthly_ai_credits || 0);
    const storageGb =
      body.storageGb !== undefined ? Number(body.storageGb) : Number(existing.storage_quota_mb || 0) / 1024;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : Number(existing.is_active ?? 1);

    await env.DB.prepare(
      `UPDATE subscription_plans
       SET name = ?, monthly_price_inr = ?, monthly_ai_credits = ?, storage_quota_mb = ?,
           is_active = ?, updated_at = datetime('now')
       WHERE code = ?`
    )
      .bind(
        name,
        Math.round(monthlyPriceInr),
        Math.round(aiCredits),
        Math.round(storageGb * 1024),
        active,
        existing.code
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ? LIMIT 1')
      .bind(existing.code)
      .first<PlanRow>();
    if (!updated) return errorJson('Plan not found.', 404);

    await writeAuditLog(env, {
      actorId: auth.user.id || auth.user.email,
      actorRole: auth.user.platformRole,
      action: 'PLAN_UPDATED',
      targetType: 'subscription_plans',
      targetId: existing.code,
      details: {
        code: existing.code,
        name: updated.name,
        priceInr: Number(updated.monthly_price_inr || 0),
      },
    });

    return jsonResponse({ plan: mapPlan(updated, id) });
  } catch {
    return errorJson('Failed to update plan.', 500);
  }
}
