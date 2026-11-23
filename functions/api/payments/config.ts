// ============================================================================
// GET /api/payments/config — Cashfree Payment Architecture & Readiness Status
// Cashfree Payments is the sole payment gateway across Vijay Visuals.
// Never exposes CASHFREE_CLIENT_SECRET, CASHFREE_WEBHOOK_SECRET, or raw keys.
// ============================================================================

import { PagesContext, json } from '../_shared';
import { getEdgeCashfreeStatus } from './_cashfree';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const cfStatus = getEdgeCashfreeStatus(context.env);

  return json({
    gateway: 'Cashfree Payments',
    cashfree: {
      configured: cfStatus.configured,
      mode: cfStatus.mode,
      webhookConfigured: cfStatus.webhookConfigured,
      apiVersion: cfStatus.apiVersion,
      webhookUrl: 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree',
      message: cfStatus.message,
    },
    settlementPolicy: {
      platformPaymentsRecipient: 'Vijay Visuals Official Accounts',
      sellerCustomerPaymentsPolicy:
        'Customer store payments are strictly segregated. Seller split settlement is pending merchant Cashfree Easy Split activation.',
    },
  });
}
