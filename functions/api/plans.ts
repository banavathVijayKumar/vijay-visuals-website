// ============================================================================
// GET /api/plans — Public Transparent Packages from Cloudflare D1
// Separates one-time website purchase packages from legacy monthly SaaS tiers.
// Default response returns ONLY authoritative website purchase packages.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';
import { isTemplatePlanCode } from './_planTiers';

export const PLAN_TAX_NOTE = 'Applicable taxes will be confirmed before payment.';

/** Backwards-compatible list for older callers; new code should use the shared helper. */
export const ALLOWED_WEBSITE_PACKAGE_CODES = [
  'free-start',
  'starter-website',
  'business-website',
  'ecommerce-website',
  'website-only',
  'website-plus-pwa',
  'custom-dev-enterprise',
] as const;

export const LEGACY_SAAS_PLAN_CODES = [
  'starter',
  'business',
  'ecommerce',
  'premium',
  'enterprise',
] as const;

export const DEFAULT_PLANS = [
  {
    id: 0,
    code: 'free-start',
    name: 'Free Start Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 0,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Mobile-responsive business website across 16 broad industry groups and 36 ready-to-customize templates',
      'Free subdomain (/site/your-brand) on Cloudflare Pages infrastructure',
      'Up to 15 product or service catalog items',
      'Contact, WhatsApp enquiry & Call lead forms',
      'Standard Cloudflare edge delivery (100MB media storage)',
      'Upgrade options for custom domain connection and merchant payments are shown after package selection',
    ]),
    thirdPartyDisclosure: `Free hosting provided on VIJAY VISUALS Cloudflare Pages infrastructure. Custom domain connection and direct merchant payment gateway require upgrading to a paid package. ${PLAN_TAX_NOTE} Total for this package is ₹0.`,
  },
  {
    id: 1,
    code: 'starter-website',
    name: 'Starter Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 2999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Mobile-responsive business website across 36 industry templates',
      'Temporary preview subdomain (/site/your-brand) + custom domain DNS wizard',
      'Contact, WhatsApp enquiry, Call & Quote Request lead forms',
      'Technical SEO essentials (meta tags, sitemap.xml, robots.txt, JSON-LD)',
    ]),
    thirdPartyDisclosure: `Starting software setup fee. Domain registration/renewal, third-party hosting beyond free tier, payment gateway MDR, and WhatsApp/SMS API fees are billed separately. ${PLAN_TAX_NOTE}`,
  },
  {
    id: 2,
    code: 'business-website',
    name: 'Business Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 7999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Access to own website management dashboard',
      'Edit website design, colours, layout and content',
      'Upload, replace and manage photos and banners',
      'Add, edit and delete products or services',
      'Manage product prices, descriptions and categories',
      'Manage orders and customer information',
      'View reports and website analytics where supported',
      'Manage website settings and publish/unpublish controls',
      'Custom domain connection (customer provides own domain)',
    ]),
    thirdPartyDisclosure: `Customer owns and pays for their own domain, external hosting, and third-party payment gateway accounts. Custom domain connection/setup does not include a free domain; registration, renewal and hosting charges are separate. ${PLAN_TAX_NOTE}`,
  },
  {
    id: 3,
    code: 'ecommerce-website',
    name: 'E-Commerce Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 14999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'E-commerce storefront with categories, product variants, configured coupons and low-stock counts in dashboards',
      'Cart, wishlist, COD/UPI & Cashfree checkout where configured, with basic order records',
      'Wholesale B2B pricing tiers, customer reviews and sales reports where enabled',
      'Includes Business Website SEO and custom domain connection for a customer-owned domain; domain registration/renewal, hosting, automated stock alerts, GST invoices, refund workflows and custom fulfilment are not included by default',
    ]),
    thirdPartyDisclosure: `Cashfree transaction MDR, custom domain registration/renewal, courier shipping charges, and WhatsApp/SMS API conversation fees apply directly from third-party providers. ${PLAN_TAX_NOTE}`,
  },
  {
    id: 4,
    code: 'website-only',
    name: 'Website-Only Business Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 14999,
    includesPwa: false,
    active: true,
    featuresJson: JSON.stringify([
      'Responsive business website & e-commerce storefront',
      'Custom branding (logo, banner, colors, fonts)',
      'Unique /site/your-brand URL and custom domain connection for a customer-owned domain',
      'Inventory, order records and COD / UPI checkout where configured; GST invoices are not generated by default',
      'Owner and customer dashboards; delivery-partner workflows require separate configuration',
    ]),
    thirdPartyDisclosure: `Custom domain registration, payment gateway fees, and shipping charges apply directly from respective third-party providers. ${PLAN_TAX_NOTE}`,
  },
  {
    id: 5,
    code: 'website-plus-pwa',
    name: 'Website + Optional Branded PWA Add-On',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 22999,
    includesPwa: true,
    active: true,
    featuresJson: JSON.stringify([
      'Everything in Business & E-Commerce packages',
      'Optional installable Progressive Web App (browser-installable, not Play Store)',
      'Custom brand icon, offline caching & priority onboarding',
      'Multi-currency live FX display & global storefront settings',
    ]),
    thirdPartyDisclosure: `PWA is a browser-installable web app (Android Chrome / iOS Safari), not a native Google Play Store binary. Third-party fees apply separately. ${PLAN_TAX_NOTE}`,
  },
  {
    id: 6,
    code: 'custom-dev-enterprise',
    name: 'Custom Development & Multi-Branch Enterprise',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 49999,
    includesPwa: true,
    active: true,
    featuresJson: JSON.stringify([
      'Custom-development discovery and written scope review; not automatic software',
      'ERP / POS integration, dedicated AI engines and high-volume automation require a separately approved proposal',
      'Multi-branch routing and wholesale B2B tiers are quoted after requirements review',
      'WhatsApp Business Cloud API and Cashfree webhook deployment require verified credentials and separate approval',
    ]),
    thirdPartyDisclosure: `Cloud hosting overages, dedicated API services, and custom developer credentials apply separately. Priority engineering SLA is included only when accepted in writing. ${PLAN_TAX_NOTE}`,
  },
];

/** Authoritative local catalogue fallback used when D1 has no plan row. */
export function getDefaultWebsitePlan(code: string): (typeof DEFAULT_PLANS)[number] | null {
  return DEFAULT_PLANS.find((plan) => plan.code === code) || null;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const url = new URL(request.url);
  const planType = (url.searchParams.get('type') || 'website').toLowerCase();

  if (env.DB) {
    try {
      let query = '';
      if (planType === 'saas') {
        query = `SELECT rowid as id, code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, features_json, is_active
                 FROM subscription_plans
                 WHERE is_active = 1 AND code IN ('starter', 'business', 'ecommerce', 'premium', 'enterprise')
                 ORDER BY monthly_price_inr ASC`;
      } else if (planType === 'all') {
        query = `SELECT rowid as id, code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, features_json, is_active
                 FROM subscription_plans
                 WHERE is_active = 1
                 ORDER BY monthly_price_inr ASC`;
      } else {
        // Default: strictly website purchase packages
        query = `SELECT rowid as id, code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, features_json, is_active
                 FROM subscription_plans
                 WHERE is_active = 1 AND (code IN ('free-start', 'starter-website', 'business-website', 'ecommerce-website', 'website-only', 'website-plus-pwa', 'custom-dev-enterprise') OR code LIKE 'tpl-%')
                 ORDER BY monthly_price_inr ASC`;
      }

      const res = await env.DB.prepare(query).all<{
        id: number;
        code: string;
        name: string;
        monthly_price_inr: number;
        yearly_price_inr: number;
        setup_fee_inr: number;
        gst_percent: number;
        features_json: string;
        is_active: number;
      }>();

      if (res.results && res.results.length > 0) {
        const plans = res.results.map((r) => {
          const isSaas = (LEGACY_SAAS_PLAN_CODES as readonly string[]).includes(r.code);
          const templatePlan = isTemplatePlanCode(r.code);
          return {
            id: r.id || 1,
            code: r.code,
            name: r.name,
            category: isSaas ? 'saas' : templatePlan ? 'template' : 'website',
            billingCycle: isSaas ? 'monthly' : 'one_time',
            priceInr: Number(r.monthly_price_inr || 0),
            includesPwa: r.code === 'website-plus-pwa' || r.code.includes('pwa'),
            active: Boolean(r.is_active),
            featuresJson: (r.features_json || '[]').replace(/Razorpay/gi, 'Cashfree'),
            thirdPartyDisclosure: `Third-party domain, Cashfree gateway MDR, WhatsApp Cloud API, and external courier fees are billed separately by their providers. ${PLAN_TAX_NOTE}`,
          };
        });
        return jsonResponse({ plans });
      }
    } catch {
      // Fallback to transparent default catalog before migration 0003
    }
  }

  if (planType === 'saas') {
    return jsonResponse({
      plans: [
        {
          id: 101,
          code: 'starter',
          name: 'Starter SaaS',
          category: 'saas',
          billingCycle: 'monthly',
          priceInr: 499,
          includesPwa: false,
          active: true,
          featuresJson: '["Platform cloud hosting","1 business website","Basic catalog management"]',
          thirdPartyDisclosure: 'Monthly SaaS platform tier. Does not replace standalone website development package.',
        },
      ],
    });
  }

  return jsonResponse({ plans: DEFAULT_PLANS });
}
