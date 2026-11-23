// ============================================================================
// POST /api/payments/platform/create-order
// Flow 1: Platform Website / Subscription Purchases (Cashfree Payments Sole Provider)
// Forwards directly to official Cashfree order creation engine
// ============================================================================

import { PagesContext } from '../../_shared';
import { onRequestPost as createCashfreePlatformOrder } from '../cashfree/create-order';

export const ALLOWED_WEBSITE_PACKAGE_CODES = new Set([
  'starter-website',
  'business-website',
  'ecommerce-website',
  'website-only',
  'website-plus-pwa',
  'custom-dev-enterprise',
]);

export const LEGACY_SAAS_PLAN_CODES = new Set([
  'starter',
  'business',
  'ecommerce',
  'premium',
  'enterprise',
]);

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return createCashfreePlatformOrder(context);
}
