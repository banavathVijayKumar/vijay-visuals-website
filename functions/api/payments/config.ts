// ============================================================================
// GET /api/payments/config — Non-Secret Razorpay Readiness Status
// Never exposes RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, or raw keys.
// ============================================================================

import { PagesContext, json } from '../_shared';
import { getEdgeRazorpayStatus } from './_razorpay';
import { getEdgeCashfreeStatus } from './_cashfree';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const rzpStatus = getEdgeRazorpayStatus(context.env);
  const cfStatus = getEdgeCashfreeStatus(context.env);

  return json({
    razorpay: {
      configured: rzpStatus.configured,
      mode: rzpStatus.mode,
      webhookConfigured: rzpStatus.webhookConfigured,
      liveApproved: rzpStatus.liveApproved,
      routeEnabled: rzpStatus.routeEnabled,
      message: rzpStatus.message,
    },
    cashfree: {
      configured: cfStatus.configured,
      mode: cfStatus.mode,
      webhookConfigured: cfStatus.webhookConfigured,
      apiVersion: cfStatus.apiVersion,
      webhookUrl: 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree',
      message: cfStatus.message,
    },
    moneyFlowPolicy: {
      platformPaymentsRecipient: 'Vijay Visuals Official Accounts',
      sellerCustomerPaymentsPolicy:
        'Shop owner customer payments are strictly separated and never settle into Vijay Visuals personal account without verified Route / Merchant routing.',
    },
  });
}
