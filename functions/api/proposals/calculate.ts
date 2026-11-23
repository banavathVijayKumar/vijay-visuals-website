// ============================================================================
// POST /api/proposals/calculate — Server-Validated Package Cart & Quotation
// Calculates line items, 18% GST, and transparent totals.
// ZERO hidden charges.
// ============================================================================

import {
  PagesContext,
  handleOptions,
  json,
  errorJson,
  parseJsonBody,
} from '../_shared';

export interface PlanPricingItem {
  code: string;
  name: string;
  category: string;
  billingCycle: string;
  cycleLabel: string;
  unitPriceInr: number;
  lineTotalInr: number;
  isRecurring: boolean;
}

const DEFAULT_PLANS_MAP: Record<string, { name: string; category: string; billingCycle: string; priceInr: number }> = {
  'starter-website': {
    name: 'Starter Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 2999,
  },
  'business-website': {
    name: 'Business Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 7999,
  },
  'ecommerce-website': {
    name: 'E-Commerce Website Package',
    category: 'ecommerce',
    billingCycle: 'one_time',
    priceInr: 14999,
  },
  'website-only': {
    name: 'Website-Only Business Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 14999,
  },
  'website-plus-pwa': {
    name: 'Website + Optional Branded PWA Add-On',
    category: 'bundle',
    billingCycle: 'one_time',
    priceInr: 22999,
  },
  'custom-dev-enterprise': {
    name: 'Custom Development & Multi-Branch Enterprise',
    category: 'enterprise',
    billingCycle: 'one_time',
    priceInr: 49999,
  },
  'starter': {
    name: 'Starter SaaS Hosting',
    category: 'saas',
    billingCycle: 'monthly',
    priceInr: 499,
  },
  'business': {
    name: 'Business Growth SaaS',
    category: 'saas',
    billingCycle: 'monthly',
    priceInr: 1499,
  },
  'ecommerce': {
    name: 'Pro Commerce SaaS',
    category: 'saas',
    billingCycle: 'monthly',
    priceInr: 2999,
  },
};

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const body = await parseJsonBody<{
    planCodes?: string[];
    billingPeriod?: 'monthly' | 'yearly';
  }>(request);

  if (!body || !Array.isArray(body.planCodes) || body.planCodes.length === 0) {
    return errorJson('Please select at least one package or add-on.', 400);
  }

  const rawCodes = body.planCodes.map((c) => String(c).trim()).filter(Boolean);
  const uniqueCodes = Array.from(new Set(rawCodes)).slice(0, 20);
  if (uniqueCodes.length === 0) {
    return errorJson('Please select at least one valid package code.', 400);
  }

  const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

  // Attempt to read from D1 if available, otherwise use verified DEFAULT_PLANS_MAP
  const dbPlansMap = new Map<string, { code: string; name: string; category: string; billingCycle: string; priceInr: number }>();

  if (env.DB) {
    try {
      const placeholders = uniqueCodes.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT code, name,
                CASE WHEN code IN ('starter', 'business', 'ecommerce', 'premium', 'enterprise') THEN 'saas' ELSE 'website' END AS category,
                CASE WHEN code IN ('starter', 'business', 'ecommerce', 'premium', 'enterprise') THEN 'monthly' ELSE 'one_time' END AS billingCycle,
                monthly_price_inr AS priceInr
         FROM subscription_plans
         WHERE code IN (${placeholders}) AND is_active = 1`
      )
        .bind(...uniqueCodes)
        .all<any>();

      if (Array.isArray(rows?.results)) {
        for (const r of rows.results) {
          dbPlansMap.set(r.code, {
            code: r.code,
            name: r.name,
            category: r.category || 'website',
            billingCycle: r.billingCycle || 'one_time',
            priceInr: Number(r.priceInr || 0),
          });
        }
      }
    } catch {
      // D1 query failed or table missing; continue with DEFAULT_PLANS_MAP fallback
    }
  }

  // Populate from fallback map for any plan codes not in D1
  for (const code of uniqueCodes) {
    if (!dbPlansMap.has(code) && DEFAULT_PLANS_MAP[code]) {
      const def = DEFAULT_PLANS_MAP[code];
      dbPlansMap.set(code, {
        code,
        name: def.name,
        category: def.category,
        billingCycle: def.billingCycle,
        priceInr: def.priceInr,
      });
    }
  }

  if (dbPlansMap.size === 0) {
    return errorJson('No valid active packages found for the selected codes.', 400);
  }

  let oneTimeSubtotalInr = 0;
  let recurringSubtotalInr = 0;

  const items: PlanPricingItem[] = [];

  for (const code of uniqueCodes) {
    const plan = dbPlansMap.get(code);
    if (!plan) continue;

    const isRecurring = plan.billingCycle === 'monthly' || plan.billingCycle === 'yearly';
    let lineTotal = plan.priceInr;
    let cycleLabel = 'One-Time Setup';

    if (isRecurring) {
      if (billingPeriod === 'yearly' && plan.billingCycle === 'monthly') {
        // 12 months with transparent 15% annual prepay discount
        lineTotal = Math.round(plan.priceInr * 12 * 0.85);
        cycleLabel = 'Yearly Recurring (15% Annual Discount)';
      } else {
        cycleLabel = plan.billingCycle === 'monthly' ? 'Monthly Recurring' : 'Yearly Recurring';
      }
      recurringSubtotalInr += lineTotal;
    } else {
      oneTimeSubtotalInr += lineTotal;
    }

    items.push({
      code: plan.code,
      name: plan.name,
      category: plan.category,
      billingCycle: plan.billingCycle,
      cycleLabel,
      unitPriceInr: plan.priceInr,
      lineTotalInr: lineTotal,
      isRecurring,
    });
  }

  const taxableSubtotalInr = oneTimeSubtotalInr + recurringSubtotalInr;
  const gstInr = Math.round(taxableSubtotalInr * 0.18);
  const grandTotalInr = taxableSubtotalInr + gstInr;

  return json({
    items,
    billingPeriod,
    oneTimeSubtotalInr,
    recurringSubtotalInr,
    discountInr: 0,
    gstRatePct: 18,
    gstInr,
    grandTotalInr,
    thirdPartyNote:
      'Excludes third-party pass-through charges: custom domain registration/renewal, Cashfree transaction MDR, Meta WhatsApp Business API conversation fees, external SMS/SMTP, and cloud hosting/storage overages.',
  });
}
