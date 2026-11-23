// ============================================================================
// POST /api/payments/seller/verify
// Razorpay Route verification has been decommissioned across Vijay Visuals.
// All online payment verifications use POST /api/payments/cashfree/verify.
// ============================================================================

import { PagesContext, errorJson } from '../../_shared';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return errorJson(
    'Razorpay Route verification has been decommissioned. Please verify store orders via POST /api/payments/cashfree/verify.',
    410
  );
}
