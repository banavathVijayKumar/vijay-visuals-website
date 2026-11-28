// ============================================================================
// GET/PATCH /api/platform-owner/template-pricing — OWNER-ONLY TEMPLATE PRICING
// The authoritative control for per-template one-time prices and stated terms.
// Super Admins and Customers are denied by requireOwner. PATCH updates only the
// selected, server-validated tpl-* row in the existing subscription_plans table.
// No secret, credential, payment or publishing state is exposed or changed.
// ============================================================================

import { requireOwner } from '../_auth';
import { isTemplatePlanCode, planCodeForTemplate } from '../_planTiers';
import {
  PagesContext,
  errorJson,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../_shared';

interface PlanRow {
  code: string;
  name: string;
  monthly_price_inr: number;
  yearly_price_inr: number;
  is_active: number | boolean;
  features_json: string;
  updated_at?: string;
}

interface PricingPatchBody {
  templateId?: unknown;
  priceInr?: unknown;
  active?: unknown;
  updatePeriodMonths?: unknown;
  supportPeriodMonths?: unknown;
  paidMaintenanceAfterSupport?: unknown;
  included?: unknown;
  excluded?: unknown;
  maintenanceTerms?: unknown;
  disclosures?: unknown;
}

interface TemplateTerms {
  updatePeriodMonths: number;
  supportPeriodMonths: number;
  paidMaintenanceAfterSupport: boolean;
  included: string[];
  excluded: string[];
  maintenanceTerms: string;
  disclosures: string[];
  renewal: string;
}

interface ValidatedList {
  ok: boolean;
  value?: string[];
  error?: string;
}

const DEFAULT_INCLUDED: readonly string[] = [
  'responsive design editing',
  'catalog editor',
  'responsive preview',
  'white-label published site',
];

const DEFAULT_EXCLUDED: readonly string[] = [
  'domain fees',
  'merchant gateway approval and MDR',
  'separately quoted optional work',
];

const DEFAULT_MAINTENANCE_TERMS =
  'After the stated support period, continued maintenance is available only as a separately accepted paid maintenance plan.';

const FORBIDDEN_PROMISE = /\b(lifetime|unlimited|free forever|guaranteed ranking|guaranteed results|permanent|never expire)\b/i;

function isIntInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function hasMisleadingPromise(text: string): boolean {
  return FORBIDDEN_PROMISE.test(text);
}

function parseStringArray(raw: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [...fallback];
  const cleaned = raw
    .map((item) => sanitizeText(item, 240))
    .filter((item) => item.length > 0)
    .slice(0, 10);
  return cleaned.length > 0 ? cleaned : [...fallback];
}

function parseTerms(raw: unknown): TemplateTerms {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
    } catch {
      // Fall back to conservative defaults rather than trusting malformed JSON.
    }
  }

  const maintenanceTerms =
    sanitizeText(parsed.maintenanceTerms, 600) || DEFAULT_MAINTENANCE_TERMS;

  return {
    updatePeriodMonths: isIntInRange(parsed.updatePeriodMonths, 0, 120)
      ? Number(parsed.updatePeriodMonths)
      : 12,
    supportPeriodMonths: isIntInRange(parsed.supportPeriodMonths, 0, 120)
      ? Number(parsed.supportPeriodMonths)
      : 12,
    paidMaintenanceAfterSupport: parsed.paidMaintenanceAfterSupport !== false,
    included: parseStringArray(parsed.included, DEFAULT_INCLUDED),
    excluded: parseStringArray(parsed.excluded, DEFAULT_EXCLUDED),
    maintenanceTerms,
    disclosures: Array.isArray(parsed.disclosures)
      ? parsed.disclosures
          .map((item) => sanitizeText(item, 240))
          .filter((item) => item.length > 0)
          .slice(0, 8)
      : [],
    renewal:
      sanitizeText(parsed.renewal, 160) || 'none; optional paid maintenance after support',
  };
}

function mapRow(row: PlanRow): Record<string, unknown> {
  const code = String(row.code || '').toLowerCase();
  const templateId = code.startsWith('tpl-') ? code.slice(4) : code;
  return {
    templateId,
    code,
    name: String(row.name || ''),
    priceInr: Number(row.monthly_price_inr || 0),
    active: Boolean(row.is_active),
    category: 'template',
    billingCycle: 'one_time',
    gstPercent: 18,
    ...parseTerms(row.features_json),
    updatedAt: row.updated_at || null,
  };
}

function validateList(
  value: unknown,
  label: string,
  maxItems = 10,
  maxChars = 240
): ValidatedList {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} must be a list.` };
  }
  const cleaned = value
    .map((item) => sanitizeText(item, maxChars))
    .filter((item) => item.length > 0);
  if (cleaned.length === 0) {
    return { ok: false, error: `Add at least one ${label.toLowerCase()} item.` };
  }
  if (cleaned.length > maxItems) {
    return { ok: false, error: `${label} supports at most ${maxItems} items.` };
  }
  return { ok: true, value: cleaned };
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireOwner(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  try {
    const result = await env.DB.prepare(
      `SELECT code, name, monthly_price_inr, yearly_price_inr, is_active, features_json, updated_at
       FROM subscription_plans
       WHERE code LIKE 'tpl-%'
       ORDER BY name ASC`
    ).all<PlanRow>();
    const rows = (result.results || []).filter((row) => isTemplatePlanCode(row.code)).map(mapRow);
    return jsonResponse({
      ok: true,
      templates: rows,
      category: 'template',
      billingCycle: 'one_time',
      writeMode: 'owner_authorized',
    });
  } catch {
    return errorJson('Unable to load template pricing.', 500);
  }
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireOwner(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<PricingPatchBody>(request);
  if (!body || typeof body.templateId !== 'string') {
    return errorJson('A valid templateId is required.', 400);
  }
  const templateId = body.templateId.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId)) {
    return errorJson('Invalid template identifier.', 400);
  }
  const code = planCodeForTemplate(templateId);
  if (!isTemplatePlanCode(code)) return errorJson('Invalid template SKU.', 400);

  if (!isIntInRange(body.priceInr, 0, 5_000_000)) {
    return errorJson('One-time base price must be an integer from 0 to 50,00,000.', 400);
  }
  if (typeof body.active !== 'boolean') {
    return errorJson('Active state must be true or false.', 400);
  }
  if (!isIntInRange(body.updatePeriodMonths, 0, 120)) {
    return errorJson('Update period must be 0–120 months.', 400);
  }
  if (!isIntInRange(body.supportPeriodMonths, 0, 120)) {
    return errorJson('Support period must be 0–120 months.', 400);
  }
  if (typeof body.paidMaintenanceAfterSupport !== 'boolean') {
    return errorJson('Paid maintenance after support must be explicitly true or false.', 400);
  }

  const included = validateList(body.included, 'Included features');
  if (!included.ok) return errorJson(included.error || 'Invalid included features.', 400);
  const excluded = validateList(body.excluded, 'Exclusions');
  if (!excluded.ok) return errorJson(excluded.error || 'Invalid exclusions.', 400);

  if (typeof body.maintenanceTerms !== 'string') {
    return errorJson('Maintenance terms must be text.', 400);
  }
  const maintenanceTerms = sanitizeText(body.maintenanceTerms, 600);
  if (!maintenanceTerms) {
    return errorJson('Maintenance terms are required.', 400);
  }

  const disclosures = Array.isArray(body.disclosures)
    ? body.disclosures
        .map((item) => sanitizeText(item, 240))
        .filter((item) => item.length > 0)
        .slice(0, 8)
    : [];

  // Included features, maintenance wording and disclosures are promises to the
  // customer. Exclusions are inherently negative and may honestly name things
  // that are not provided.
  if ([...(included.value || []), maintenanceTerms, ...disclosures].some(hasMisleadingPromise)) {
    return errorJson('Unsupported lifetime, unlimited or guaranteed promises are not allowed.', 400);
  }

  try {
    const existing = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ? LIMIT 1')
      .bind(code)
      .first<PlanRow>();
    if (!existing) {
      return errorJson('Template SKU is not configured. Apply migration 0029 first.', 404);
    }

    const features = {
      templateId,
      purchaseType: 'one_time_template',
      updatePeriodMonths: Number(body.updatePeriodMonths),
      supportPeriodMonths: Number(body.supportPeriodMonths),
      paidMaintenanceAfterSupport: Boolean(body.paidMaintenanceAfterSupport),
      renewal: 'none; optional paid maintenance after support',
      included: included.value,
      excluded: excluded.value,
      maintenanceTerms,
      disclosures,
      configuredBy: sanitizeText(String(auth.user.email || auth.user.id || 'owner'), 140),
    };

    await env.DB.prepare(
      `UPDATE subscription_plans
       SET monthly_price_inr = ?, yearly_price_inr = ?, is_active = ?, features_json = ?,
           updated_at = datetime('now')
       WHERE code = ?`
    )
      .bind(
        Math.round(Number(body.priceInr)),
        Math.round(Number(body.priceInr)),
        body.active ? 1 : 0,
        JSON.stringify(features),
        code
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM subscription_plans WHERE code = ? LIMIT 1')
      .bind(code)
      .first<PlanRow>();
    if (!updated) return errorJson('Template SKU not found after update.', 404);

    await writeAuditLog(env, {
      actorId: auth.user.id || auth.user.email,
      actorRole: auth.user.platformRole,
      action: 'TEMPLATE_PRICING_UPDATED',
      targetType: 'subscription_plans',
      targetId: code,
      details: {
        code,
        priceInr: Number(updated.monthly_price_inr || 0),
        active: Boolean(updated.is_active),
        updatePeriodMonths: features.updatePeriodMonths,
        supportPeriodMonths: features.supportPeriodMonths,
        paidMaintenanceAfterSupport: features.paidMaintenanceAfterSupport,
      },
    });

    return jsonResponse({ ok: true, template: mapRow(updated) });
  } catch {
    return errorJson('Unable to update template pricing.', 500);
  }
}
