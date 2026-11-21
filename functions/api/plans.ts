// ============================================================================
// GET /api/plans — Public Transparent Packages from Cloudflare D1
// ============================================================================

import { PagesContext, handleOptions, jsonResponse } from './_shared';

const DEFAULT_PLANS = [
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
      'Mobile-responsive business website across 16 industry templates',
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
      'Cart, wishlist, COD/UPI & Razorpay checkout, GST invoices & order tracking',
      'Wholesale B2B tiers, customer reviews, sales reports & refund tracking',
      'Includes all Business Website SEO, custom domain DNS & CRM capabilities',
    ]),
    thirdPartyDisclosure:
      'Razorpay transaction MDR, custom domain registration/renewal, courier shipping charges, and WhatsApp/SMS API conversation fees apply directly from third-party providers.',
  },
  {
    id: 4,
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
];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        `SELECT rowid as id, code, name, monthly_price_inr, yearly_price_inr, setup_fee_inr, gst_percent, features_json, is_active
         FROM subscription_plans WHERE is_active = 1 ORDER BY monthly_price_inr ASC`
      ).all<{
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
        const plans = res.results.map((r) => ({
          id: r.id || 1,
          code: r.code,
          name: r.name,
          category: 'website',
          billingCycle: 'one_time',
          priceInr: Number(r.monthly_price_inr || 0),
          includesPwa: r.code === 'website-plus-pwa' || r.code.includes('pwa'),
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
