// ============================================================================
// GET /api/plans — Public Transparent Packages from Cloudflare D1
// Separates one-time website purchase packages from legacy monthly SaaS tiers.
// Default response returns ONLY authoritative website purchase packages.
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';

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

const DEFAULT_PLANS = [
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
      'Mobile-responsive business website across 35 industry templates',
      'Free subdomain (/site/your-brand) on Cloudflare Pages infrastructure',
      'Up to 15 product or service catalog items',
      'Contact, WhatsApp enquiry & Call lead forms',
      'Standard Cloudflare edge delivery (100MB media storage)',
      'One-click upgrade to custom domain & payment gateway anytime',
    ]),
    thirdPartyDisclosure:
      'Free hosting provided on VIJAY VISUALS Cloudflare Pages infrastructure. Custom domain connection and direct merchant payment gateway require upgrading to a paid package.',
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
    thirdPartyDisclosure:
      'Starting software setup fee. Domain registration/renewal, third-party hosting beyond free tier, payment gateway MDR, and WhatsApp/SMS API fees are billed separately.',
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
    thirdPartyDisclosure:
      'Customer owns and pays for their own domain, external hosting, and third-party payment gateway accounts. Free domain, payment gateway charges, and unverified third-party services are not included.',
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
      'Full e-commerce storefront with categories, variants, stock alerts & coupons',
      'Cart, wishlist, COD/UPI & Cashfree checkout, GST invoices & order tracking',
      'Wholesale B2B tiers, customer reviews, sales reports & refund tracking',
      'Includes all Business Website SEO, custom domain DNS & CRM capabilities',
    ]),
    thirdPartyDisclosure:
      'Cashfree transaction MDR, custom domain registration/renewal, courier shipping charges, and WhatsApp/SMS API conversation fees apply directly from third-party providers.',
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
      'Unique /site/your-brand URL & custom domain support',
      'Inventory, orders, GST invoice generator & COD / UPI checkout',
      'Owner, Customer & Delivery Partner dashboards',
    ]),
    thirdPartyDisclosure:
      'Custom domain registration, payment gateway fees, and shipping charges apply directly from respective third-party providers.',
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
    thirdPartyDisclosure:
      'PWA is a browser-installable web app (Android Chrome / iOS Safari), not a native Google Play Store binary. Third-party fees apply separately.',
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
      'Bespoke UX architecture & custom ERP / POS integrations',
      'Dedicated multi-branch inventory & wholesale B2B pricing tiers',
      'Custom WhatsApp Business Cloud API & Cashfree webhook deployment',
      'Priority engineering SLA with Vijay Visuals',
    ]),
    thirdPartyDisclosure:
      'Cloud hosting overages, dedicated API services, and custom developer credentials apply separately.',
  },
];

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
                 WHERE is_active = 1 AND code IN ('free-start', 'starter-website', 'business-website', 'ecommerce-website', 'website-only', 'website-plus-pwa', 'custom-dev-enterprise')
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
          return {
            id: r.id || 1,
            code: r.code,
            name: r.name,
            category: isSaas ? 'saas' : 'website',
            billingCycle: isSaas ? 'monthly' : 'one_time',
            priceInr: Number(r.monthly_price_inr || 0),
            includesPwa: r.code === 'website-plus-pwa' || r.code.includes('pwa'),
            active: Boolean(r.is_active),
            featuresJson: (r.features_json || '[]').replace(/Razorpay/gi, 'Cashfree'),
            thirdPartyDisclosure:
              'Third-party domain, Cashfree gateway MDR, WhatsApp Cloud API, and external courier fees are billed separately by their providers.',
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
