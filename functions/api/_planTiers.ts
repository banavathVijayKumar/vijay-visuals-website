// Canonical plan tier values shared by Pages Functions and the React client.

export const PLAN_TIERS = [
  'free_start',
  'starter_website',
  'website_only',
  'ecommerce_website',
  'website_pwa',
  'enterprise_ai',
] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

export const FREE_START_TIER: PlanTier = 'free_start';
export const FREE_START_PLAN_CODE = 'free-start';

/** Per-template one-time SKUs share this prefix and reuse the existing package pipeline. */
export const TEMPLATE_PLAN_CODE_PREFIX = 'tpl-';

export const AUTHORIZED_WEBSITE_PACKAGE_CODES: ReadonlySet<string> = new Set<string>([
  'free-start',
  'starter-website',
  'business-website',
  'ecommerce-website',
  'website-only',
  'website-plus-pwa',
  'custom-dev-enterprise',
]);

export const PLAN_TIER_SET: ReadonlySet<string> = new Set<string>(PLAN_TIERS);

export function isTemplatePlanCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.toLowerCase().startsWith(TEMPLATE_PLAN_CODE_PREFIX) &&
    /^tpl-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.toLowerCase())
  );
}

/**
 * One classification helper for checkout, webhook and publishing decisions.
 * Never trust a client-supplied amount; only the plan code may be supplied.
 */
export function isAuthorizedWebsitePackageCode(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const code = value.toLowerCase();
  return AUTHORIZED_WEBSITE_PACKAGE_CODES.has(code) || isTemplatePlanCode(code);
}

export function planCodeForTemplate(templateId: string): string {
  const normalized = String(templateId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `${TEMPLATE_PLAN_CODE_PREFIX}${normalized}` : '';
}

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && PLAN_TIER_SET.has(value);
}
