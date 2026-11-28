// ============================================================================
// Customer-facing purchase clarity.
// Proposed template prices are an exact source/report mirror of
// reports/vijay-visuals-36-template-pricing-schedule.md. They are DISPLAY ONLY
// until an Owner explicitly configures and activates the corresponding SKU.
// No price is written to D1 here and no purchase is started from this module.
// ============================================================================

import { planCodeForTemplate } from '@/functions/api/_planTiers';
import type { PlatformPlanRecord } from '../types/platform';

/**
 * Exact proposed one-time prices from the approved 36-row schedule.
 * Keyed by catalogue template id; the SKU is always `tpl-<templateId>`.
 */
export const PROPOSED_TEMPLATE_PRICE_BY_ID: Readonly<Record<string, number>> = Object.freeze({
  'grocery-store': 1499,
  supermarket: 1999,
  'clothing-store': 1499,
  'fashion-boutique': 2499,
  'mobile-store': 1999,
  'electronics-store': 1999,
  'medical-store': 2499,
  pharmacy: 2499,
  'hospital-clinic': 3499,
  restaurant: 1999,
  'cloud-kitchen': 1499,
  hotel: 3499,
  bakery: 1499,
  'jewellery-store': 3499,
  'photography-studio': 999,
  'video-editing-studio': 999,
  'wedding-photography': 999,
  'event-management': 2499,
  'real-estate': 2499,
  'automobile-showroom': 2499,
  'bike-garage': 1999,
  'beauty-salon': 1999,
  'spa-wellness': 1499,
  'gym-fitness': 1499,
  'education-coaching': 999,
  'travel-agency': 2499,
  'furniture-store': 2499,
  'interior-design': 2499,
  'hardware-store': 1999,
  'pet-store': 1499,
  'organic-farming': 1499,
  'dairy-business': 1499,
  'florist-gift-store': 1499,
  'legal-financial': 999,
  'digital-marketing': 1999,
  'custom-business': 4999,
});

export interface ProposedTemplatePrice {
  templateId: string;
  sku: string;
  priceInr: number;
}

export function getProposedTemplatePrice(templateId: string): ProposedTemplatePrice | null {
  const priceInr = PROPOSED_TEMPLATE_PRICE_BY_ID[templateId];
  if (!Number.isFinite(priceInr)) return null;
  return { templateId, sku: planCodeForTemplate(templateId), priceInr };
}

export function formatInr(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/**
 * The ₹7,999 plan remains the existing D1-backed Business Website Package.
 * We do not rename, duplicate or re-price it.
 */
export const BUSINESS_WEBSITE_PACKAGE_CODE = 'business-website';
export const TAX_CONFIRMATION_NOTE = 'Applicable taxes will be confirmed before payment.';
export const DOMAIN_AND_HOSTING_NOTE =
  'Custom domain connection/setup does not include a free domain. Domain registration, renewal and any hosting charges are shown or paid separately wherever applicable.';

export interface PackagePriceBreakdown {
  name: string;
  code: string;
  basePriceInr: number;
  templateAddOnInr: 0;
  taxNote: string;
  recurringInr: 0;
}

/**
 * Uses the server-loaded plan price when available so the displayed base price
 * can never drift from the existing package catalogue. GST registration and
 * legal applicability are not assumed, so no tax rate or tax amount is quoted.
 */
export function describeBusinessPackagePrice(plans: PlatformPlanRecord[]): PackagePriceBreakdown | null {
  const plan = plans.find((item) => item.code === BUSINESS_WEBSITE_PACKAGE_CODE);
  if (!plan || !plan.active) return null;
  const basePriceInr = Math.round(Number(plan.priceInr || 0));
  return {
    name: plan.name || 'Business Website Package',
    code: plan.code,
    basePriceInr,
    templateAddOnInr: 0,
    taxNote: TAX_CONFIRMATION_NOTE,
    recurringInr: 0,
  };
}

export interface PackageScopeItem {
  label: string;
  detail: string;
  kind: 'verified-platform-capability' | 'owner-service-scope';
}

/**
 * Exact ₹7,999 package scope requested for Owner approval.
 * Items marked `owner-service-scope` are proposed deliverables that require a
 * written, approved scope; they are not advertised as automatic software.
 */
export const BUSINESS_PACKAGE_SCOPE: readonly PackageScopeItem[] = Object.freeze([
  {
    label: 'One selected premium template',
    detail: 'Choose one of the 36 catalogue designs; the builder seeds an independent editable draft.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Up to 7 agreed website pages',
    detail: 'The page list is agreed in writing before work starts; extra pages require an approved quote.',
    kind: 'owner-service-scope',
  },
  {
    label: 'Business logo, brand colours and business details setup',
    detail: 'Brand fields, colours, banners and business identity are editable in the builder.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Product/service catalogue setup',
    detail: 'Names, descriptions, categories, prices, availability and inventory fields are supported.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'WhatsApp enquiry integration',
    detail: 'A verified business WhatsApp number can be stored for customer enquiries.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Contact form and Google Maps integration',
    detail: 'Contact enquiries are supported; map display depends on a configured map URL/API and supported tenant view.',
    kind: 'owner-service-scope',
  },
  {
    label: 'Responsive desktop, tablet and mobile design',
    detail: 'Template previews and published storefronts are responsive where the selected template supports it.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Basic SEO setup',
    detail: 'SEO title, description, sitemap/robots and structured metadata fields are supported where configured.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Customer Dashboard access',
    detail: 'Purchased website owners can access their own dashboard after verified entitlement.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Admin Dashboard access where applicable',
    detail: 'Admin/Owner views remain role-separated; availability depends on the purchased plan and role.',
    kind: 'verified-platform-capability',
  },
  {
    label: 'Two agreed revision rounds',
    detail: 'Bounded service scope. Additional rounds require a separate Owner-approved proposal.',
    kind: 'owner-service-scope',
  },
  {
    label: '30 days of technical support after handover',
    detail: 'Bounded support period for delivery issues. Not lifetime or unlimited support.',
    kind: 'owner-service-scope',
  },
  {
    label: 'Website handover and basic usage training',
    detail: 'Handover/training is an Owner-delivered service and is recorded only when actually completed.',
    kind: 'owner-service-scope',
  },
]);

export const PACKAGE_MILESTONES = [
  '1. Confirm package, template, page list and requirements in writing.',
  '2. Prepare the editable template draft and agreed page structure.',
  '3. Apply approved brand details, catalogue and enquiry settings.',
  '4. Share preview for the two agreed revision rounds.',
  '5. Handover, basic training and support period start.',
] as const;

export const CUSTOMER_RESPONSIBILITIES = [
  'Business name, category, logo, brand colours and approved business details.',
  'Final page list (maximum 7 under this package) and products/services with prices.',
  'Verified WhatsApp/contact information and any domain access you want connected.',
  'Timely review of drafts and consolidated revision feedback.',
  'Any domain, gateway merchant approval or third-party account credentials you choose to use.',
] as const;

export const PACKAGE_EXCLUSIONS = [
  'Custom domain connection/setup is not a free domain. Domain registration and renewal are paid separately to the registrar.',
  'Hosting charges, renewals, storage overages and business email accounts are shown or paid separately wherever applicable.',
  'Premium plugins or third-party licences unless separately purchased.',
  'Payment gateway merchant approval, MDR and gateway settlement charges.',
  'Custom integrations, custom development and data migration.',
  'Content creation, professional photography and paid marketing.',
  'Ongoing paid maintenance after the stated support period.',
  'Unlimited revisions, unlimited support, free lifetime hosting or guaranteed rankings.',
] as const;

export const CUSTOM_REQUIREMENT_MESSAGE = 'Custom Requirement — Quote Required';

/** Detects work that is outside the bounded ₹7,999 scope without inventing a price. */
export function detectCustomRequirement(input: {
  pageCount: number;
  specialFeatures: string;
  domainPreference: string;
}): { outsidePackage: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (Number(input.pageCount) > 7) {
    reasons.push(`Requested pages (${input.pageCount}) exceed the agreed 7-page package scope.`);
  }
  const text = `${input.specialFeatures || ''} ${input.domainPreference || ''}`.toLowerCase();
  const outsideTerms = [
    'custom development',
    'api',
    'webhook',
    'erp',
    'pos',
    'data migration',
    'third-party integration',
    'paid ads',
    'photography',
    'unlimited',
    'lifetime',
  ];
  const matched = outsideTerms.filter((term) => text.includes(term));
  if (matched.length > 0) {
    reasons.push(`Requested work is outside the package: ${matched.join(', ')}.`);
  }
  return { outsidePackage: reasons.length > 0, reasons };
}
