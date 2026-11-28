// Honest, non-promised template purchase disclosures. Runtime prices always
// come from the server's subscription_plans rows; nothing here invents a price.

import type { PlatformPlanRecord } from '../types/platform';
import { planCodeForTemplate } from '@/functions/api/_planTiers';

export interface TemplatePriceView {
  code: string;
  configured: boolean;
  active: boolean;
  priceInr: number | null;
  label: string;
}

export const TEMPLATE_TAX_NOTE = 'Applicable taxes will be confirmed before payment.';

export const TEMPLATE_PURCHASE_INCLUSIONS = [
  'One-time website template purchase for one website.',
  'Editable responsive design: colours, fonts, banners, images, logo, header, footer, text and section order.',
  'Product or service catalogue editor with names, descriptions, categories, prices, availability and inventory fields.',
  'Live responsive preview on desktop, tablet and mobile before purchase.',
  'Published white-label customer site using the customer brand only, once eligible.',
  'Domain connection guidance; the customer supplies and controls their own domain.',
] as const;

export const TEMPLATE_PURCHASE_EXCLUSIONS = [
  'Domain registration/renewal fees, hosting beyond the included platform allowance, and third-party app or API charges.',
  'Merchant payment-gateway approval, gateway commissions, refunds, payouts and delivery charges.',
  'Cashfree Live credentials or Live payments in Preview; only SANDBOX is usable for development testing.',
  'Unlimited storage, unlimited products, unlimited revisions, lifetime support, or guaranteed search rankings.',
  'Content creation, photography, logo design, marketing campaigns and ongoing business operations.',
] as const;

export const TEMPLATE_UPDATE_TERMS = [
  'Compatibility and bug-fix updates are included only for the published update period stated by the Owner for the purchased template.',
  'Security fixes are applied when available and technically compatible with the delivered website.',
  'Optional new features may be quoted separately and are never promised as free forever.',
  'After the support period, continued maintenance is available only as a separately accepted paid maintenance plan.',
] as const;

export const TEMPLATE_PURCHASE_DETAILS = [
  { label: 'Pages', value: 'Home, catalogue/services, gallery, contact and editable custom pages where supported by the selected template.' },
  { label: 'Edit capabilities', value: 'No-code brand, text, media, layout, catalogue, pricing, inventory, SEO, policies and publish controls.' },
  { label: 'Domain & hosting', value: 'Platform subdomain included; custom domain connection guided. Customer pays registrar and any separately quoted hosting overages.' },
  { label: 'Payment gateway', value: 'Merchant online payments require the merchant’s own approved Cashfree setup or an approved marketplace settlement arrangement. COD is recorded only after actual collection.' },
  { label: 'Renewal', value: 'One-time base price. Renewal is not automatic; optional maintenance after the stated support period is quoted separately.' },
  { label: 'Support', value: 'Support covers template usage and delivery issues for the stated support period; business outcomes are not guaranteed.' },
] as const;

export function findTemplatePlan(plans: PlatformPlanRecord[], templateId: string): PlatformPlanRecord | null {
  const code = planCodeForTemplate(templateId);
  return plans.find((plan) => plan.code === code) || null;
}

export function describeTemplatePrice(plans: PlatformPlanRecord[], templateId: string): TemplatePriceView {
  const code = planCodeForTemplate(templateId);
  const plan = findTemplatePlan(plans, templateId);
  if (!plan) {
    return {
      code,
      configured: false,
      active: false,
      priceInr: null,
      label: 'Owner pricing pending',
    };
  }
  if (!plan.active) {
    return {
      code,
      configured: true,
      active: false,
      priceInr: Number(plan.priceInr || 0),
      label: 'Not available yet',
    };
  }
  return {
    code,
    configured: true,
    active: true,
    priceInr: Number(plan.priceInr || 0),
    label: Number(plan.priceInr || 0) === 0 ? 'Free · ₹0 total' : `₹${Number(plan.priceInr).toLocaleString('en-IN')} base price`,
  };
}
