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

export const PLAN_TIER_SET: ReadonlySet<string> = new Set<string>(PLAN_TIERS);

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && PLAN_TIER_SET.has(value);
}
