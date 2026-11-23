// ============================================================================
// POST /api/payments/seller/create-order
// Razorpay Route has been decommissioned across Vijay Visuals.
// All online orders use Cashfree Payments via POST /api/orders.
// ============================================================================

import { PagesContext, errorJson } from '../../_shared';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return errorJson(
    'Razorpay Route has been decommissioned. Store customer orders are created via POST /api/orders and processed via Cashfree Payments.',
    410
  );
}
