// ============================================================================
// VIJAY VISUALS — DEPRECATED RAZORPAY EDGE MODULE
// Razorpay has been decommissioned across the entire platform.
// All payments use Cashfree Payments (functions/api/payments/_cashfree.ts).
// ============================================================================

import { CloudflareEnv } from '../_shared';

export interface EdgeRazorpayStatus {
  configured: boolean;
  mode: 'unconfigured' | 'test' | 'live';
  webhookConfigured: boolean;
  routeEnabled: boolean;
  message: string;
}

export function getEdgeRazorpayStatus(_env: CloudflareEnv): EdgeRazorpayStatus {
  return {
    configured: false,
    mode: 'unconfigured',
    webhookConfigured: false,
    routeEnabled: false,
    message: 'Razorpay has been decommissioned. Cashfree Payments is the sole payment gateway.',
  };
}
