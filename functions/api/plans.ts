// ============================================================================
// GET /api/plans — Public Transparent Packages from Cloudflare D1
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';

const DEFAULT_PLANS = [
  {
    id: 1,
    code: 'business-website',
    name: 'Starter Business Website',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 4999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Responsive industry storefront + /site/your-brand URL',
      '12 Indian & global languages + Technical SEO schema',
      'Custom domain DNS TXT wizard (100% owner-controlled)',
      'Cash on Delivery & WhatsApp order inquiry ready',
    ]),
    thirdPartyDisclosure:
      'Excludes third-party domain registration/renewal, Razorpay transaction MDR, and optional WhatsApp Business API messaging fees.',
  },
  {
    id: 2,
    code: 'ecommerce-growth',
    name: 'Professional E-Commerce + CRM',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 12999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Full product catalog, variants, coupons & GST invoices',
      'Delivery partner portal, branch locations & order tracking',
      'Verified-purchase customer reviews & CRM lead desk',
      'Gemini AI Studio (12 languages, 9 business tools)',
    ]),
    thirdPartyDisclosure:
      'Excludes third-party domain renewals, Razorpay/Route gateway charges, courier AWB fees, and external SMTP/WhatsApp API usage.',
  },
  {
    id: 3,
    code: 'website-plus-pwa',
    name: 'Flagship Store + Optional Branded PWA',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 19999,
    includesPwa: true,
    active: true,
    featuresJson: JSON.stringify([
      'Everything in Professional E-Commerce + CRM',
      'Optional installable Progressive Web App (browser-installable, not Play Store)',
      'Custom brand icon, offline caching & priority onboarding',
      'Multi-currency live FX display & global storefront settings',
    ]),
    thirdPartyDisclosure:
      'PWA is a browser-installable web app (Android Chrome / iOS Safari), not a native Google Play Store binary. Third-party fees apply separately.',
  },
];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        `SELECT id, code, name, monthly_price_inr, annual_price_inr, includes_pwa, features_json, is_active
         FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_inr ASC`
      ).all<{
        id: number;
        code: string;
        name: string;
        monthly_price_inr: number;
        annual_price_inr: number;
        includes_pwa: number;
        features_json: string;
        is_active: number;
      }>();

      if (res.results && res.results.length > 0) {
        const plans = res.results.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          category: 'website',
          billingCycle: 'monthly',
          priceInr: Number(r.monthly_price_inr || 0),
          includesPwa: Boolean(r.includes_pwa),
          active: Boolean(r.is_active),
          featuresJson: r.features_json || '[]',
          thirdPartyDisclosure:
            'Third-party domain, Razorpay gateway MDR, WhatsApp Cloud API, and external courier fees are billed separately by their providers.',
        }));
        return jsonResponse({ plans });
      }
    } catch {
      // Fallback to transparent default catalog before migration 0003
    }
  }

  return jsonResponse({ plans: DEFAULT_PLANS });
}
