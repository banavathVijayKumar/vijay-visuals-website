// ============================================================================
// POST /api/marketplace/payments/create
// DECOMMISSIONED: Razorpay payments are no longer supported across Vijay Visuals.
// All payments use Cashfree Payments (functions/api/payments/_cashfree.ts).
// ============================================================================

import { CloudflareEnv, errorJson, handleOptions } from '../../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(_context: { request: Request; env: CloudflareEnv }): Promise<Response> {
  return errorJson(
    'Legacy Razorpay payment creation has been permanently decommissioned. Cashfree Payments is the sole authorized payment provider across Vijay Visuals.',
    410
  );
}
