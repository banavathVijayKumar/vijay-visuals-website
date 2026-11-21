// ============================================================================
// VIJAY VISUALS — CLIENT-SIDE RAZORPAY CHECKOUT & VERIFICATION INTEGRATION
// Handles official Razorpay checkout script loading, server order binding,
// and automatic server-side signature verification & subscription activation.
// ============================================================================

import { apiFetch } from './api';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (event: string, handler: (response: any) => void) => void;
    };
  }
}

export function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

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
  onSuccess?: (result: { verified: boolean; subscriptionId?: number; payment: any }) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

export async function initiatePlatformCheckout(options: PlatformCheckoutOptions): Promise<void> {
  // 1. Create order on server (authoritative price calculation from active subscription plans)
  const orderRes = await apiFetch<{
    keyId: string;
    mode: string;
    recipient?: string;
    razorpayOrder: {
      id: string;
      amount: number;
      currency: string;
    };
    invoiceBreakdown?: {
      planName: string;
      billingCycle: string;
      baseAmountInr: number;
      setupFeeInr: number;
      gstPercent: number;
      gstAmountInr: number;
      totalAmountInr: number;
    };
  }>('/api/payments/platform/create-order', {
    method: 'POST',
    body: JSON.stringify({
      planCode: options.planCode,
      billingCycle: options.billingCycle || 'monthly',
      websiteId: options.websiteId,
      tenantId: options.tenantId,
      purpose: 'website_purchase',
    }),
  });

  // 2. Load official Razorpay checkout script
  const loaded = await loadRazorpayCheckoutScript();
  if (!loaded || !window.Razorpay) {
    throw new Error('Unable to load official Razorpay Checkout. Please check your network connection.');
  }

  // 3. Open official Razorpay modal
  return new Promise((resolve, reject) => {
    let completed = false;

    const rzp = new window.Razorpay!({
      key: orderRes.keyId,
      amount: orderRes.razorpayOrder.amount,
      currency: orderRes.razorpayOrder.currency,
      name: 'Vijay Visuals Platform',
      description: `${orderRes.invoiceBreakdown?.planName || options.planName || options.planCode} (${orderRes.mode.toUpperCase()})`,
      order_id: orderRes.razorpayOrder.id,
      prefill: {
        name: options.prefill?.name || '',
        email: options.prefill?.email || '',
        contact: options.prefill?.contact || '',
      },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        completed = true;
        try {
          // 4. Server-side payment signature verification and automatic subscription activation
          const verifyRes = await apiFetch<{
            verified: boolean;
            idempotentReplay?: boolean;
            subscriptionId?: number;
            payment: any;
          }>('/api/payments/platform/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              websiteId: options.websiteId,
              tenantId: options.tenantId,
              publishWebsite: options.publishWebsite,
            }),
          });

          if (!verifyRes.verified) {
            throw new Error('Payment verification failed on server.');
          }

          options.onSuccess?.(verifyRes);
          resolve();
        } catch (err) {
          const e = err instanceof Error ? err : new Error('Payment verification failed.');
          options.onError?.(e);
          reject(e);
        }
      },
      modal: {
        ondismiss: () => {
          if (!completed) {
            options.onDismiss?.();
            resolve();
          }
        },
      },
      theme: { color: '#D4AF37' },
    });

    rzp.open();
  });
}
