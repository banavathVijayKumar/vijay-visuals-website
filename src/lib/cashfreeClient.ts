// ============================================================================
// VIJAY VISUALS — CLIENT-SIDE CASHFREE CHECKOUT & VERIFICATION INTEGRATION
// Handles official Cashfree JS SDK v3 loading, payment session initiation,
// and automatic server-side status verification & subscription activation.
// ============================================================================

import { apiFetch } from './api';

declare global {
  interface Window {
    loadCashfree?: (options: { mode: 'sandbox' | 'production' }) => Promise<{
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: '_self' | '_blank' | '_top' | '_modal';
        platform?: string;
      }) => Promise<{
        error?: { message?: string; code?: string };
        redirect?: boolean;
        paymentDetails?: any;
      }>;
    }>;
  }
}

export function loadCashfreeScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.loadCashfree) return resolve(true);

    const existing = document.querySelector('script[src="https://sdk.cashfree.com/js/v3/cashfree.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export interface CashfreePlatformCheckoutOptions {
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
  redirectTarget?: '_modal' | '_self';
  onSuccess?: (result: { verified: boolean; subscriptionId?: number; payment?: any }) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

export async function initiateCashfreePlatformCheckout(
  options: CashfreePlatformCheckoutOptions
): Promise<void> {
  // 1. Authoritative server-side order & paymentSessionId creation
  const orderRes = await apiFetch<{
    orderId: string;
    cfOrderId?: number | string;
    paymentSessionId: string;
    environment: 'sandbox' | 'production';
    currency: string;
    invoiceBreakdown?: {
      planCode: string;
      planName: string;
      billingCycle: string;
      baseAmountInr: number;
      setupFeeInr: number;
      gstPercent: number;
      gstAmountInr: number;
      totalAmountInr: number;
    };
  }>('/api/payments/cashfree/create-order', {
    method: 'POST',
    body: JSON.stringify({
      planCode: options.planCode,
      billingCycle: options.billingCycle || 'monthly',
      websiteId: options.websiteId,
      tenantId: options.tenantId,
      purpose: 'website_purchase',
      customerName: options.prefill?.name,
      customerEmail: options.prefill?.email,
      customerPhone: options.prefill?.contact,
    }),
  });

  if (!orderRes.paymentSessionId) {
    throw new Error('Server did not return a valid Cashfree payment session.');
  }

  // 2. Load official Cashfree SDK
  const loaded = await loadCashfreeScript();
  if (!loaded || !window.loadCashfree) {
    throw new Error('Unable to load official Cashfree SDK. Please check your internet connection.');
  }

  const cashfree = await window.loadCashfree({
    mode: orderRes.environment === 'production' ? 'production' : 'sandbox',
  });

  const redirectTarget = options.redirectTarget || '_modal';

  // 3. Launch Cashfree checkout
  const checkoutResult = await cashfree.checkout({
    paymentSessionId: orderRes.paymentSessionId,
    redirectTarget,
  });

  if (checkoutResult?.error) {
    const err = new Error(checkoutResult.error.message || 'Payment cancelled or dismissed.');
    options.onDismiss?.();
    return;
  }

  // 4. Verify payment on server
  try {
    const verifyRes = await apiFetch<{
      verified: boolean;
      idempotentReplay?: boolean;
      status: string;
      orderId: string;
      subscriptionId?: number;
      websiteId?: string;
      websiteUrl?: string;
    }>('/api/payments/cashfree/verify', {
      method: 'POST',
      body: JSON.stringify({
        orderId: orderRes.orderId,
        websiteId: options.websiteId,
        tenantId: options.tenantId,
        publishWebsite: options.publishWebsite,
      }),
    });

    if (verifyRes.verified) {
      options.onSuccess?.(verifyRes);
    } else {
      throw new Error(`Payment verification status: ${verifyRes.status}`);
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error('Verification failed.');
    options.onError?.(e);
    throw e;
  }
}

export interface CashfreeStorefrontCheckoutOptions {
  paymentSessionId: string;
  orderId: string;
  environment?: 'sandbox' | 'production';
  redirectTarget?: '_modal' | '_self';
  onSuccess?: (result: { verified: boolean; orderId: string; storeOrderId?: number; cfPaymentId?: string }) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

export async function initiateCashfreeStorefrontCheckout(
  options: CashfreeStorefrontCheckoutOptions
): Promise<void> {
  const loaded = await loadCashfreeScript();
  if (!loaded || !window.loadCashfree) {
    throw new Error('Unable to load official Cashfree SDK. Please check your internet connection.');
  }

  const cashfree = await window.loadCashfree({
    mode: options.environment === 'production' ? 'production' : 'sandbox',
  });

  const checkoutResult = await cashfree.checkout({
    paymentSessionId: options.paymentSessionId,
    redirectTarget: options.redirectTarget || '_modal',
  });

  if (checkoutResult?.error) {
    options.onDismiss?.();
    return;
  }

  // Verify storefront order on server
  try {
    const verifyRes = await apiFetch<{
      verified: boolean;
      status: string;
      orderId: string;
      cfPaymentId?: string;
      storeOrderId?: number;
    }>('/api/payments/cashfree/verify', {
      method: 'POST',
      body: JSON.stringify({ orderId: options.orderId }),
    });

    if (verifyRes.verified) {
      options.onSuccess?.(verifyRes);
    } else {
      throw new Error(`Storefront payment status: ${verifyRes.status}`);
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error('Verification failed.');
    options.onError?.(e);
    throw e;
  }
}
