// ============================================================================
// POST /api/marketplace/payments/verify
// DECOMMISSIONED: Razorpay payment verification has been decommissioned.
// All payments use Cashfree Payments (functions/api/payments/_cashfree.ts).
// ============================================================================

import { CloudflareEnv, errorJson, handleOptions } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(_context: { request: Request; env: CloudflareEnv }): Promise<Response> {
  return errorJson(
    'Legacy Razorpay payment verification has been permanently decommissioned. Cashfree Payments is the sole authorized payment provider across Vijay Visuals.',
    410
  );
}
