// ============================================================================
// VIJAY VISUALS — DEPRECATED RAZORPAY ADAPTER
// Razorpay has been decommissioned. All platform payments route via Cashfree Payments.
// ============================================================================

import { initiateCashfreePlatformCheckout } from './cashfreeClient';

export interface PlatformCheckoutOptions {
  planCode: string;
  planName?: string;
  websiteId?: string;
  tenantId?: string | number;
  billingCycle?: 'monthly' | 'yearly';
  publishWebsite?: boolean;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

export async function loadRazorpayCheckoutScript(): Promise<boolean> {
  // Deprecated: No Razorpay SDK loaded
  return false;
}

export async function initiatePlatformCheckout(options: PlatformCheckoutOptions): Promise<void> {
  return initiateCashfreePlatformCheckout(options);
}
