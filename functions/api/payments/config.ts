// ============================================================================
// GET /api/payments/config — Non-Secret Razorpay Readiness Status
// Never exposes RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, or raw keys.
// ============================================================================

import { PagesContext, json } from '../_shared';
import { getEdgeRazorpayStatus } from './_razorpay';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const status = getEdgeRazorpayStatus(context.env);
  return json({
    razorpay: {
      configured: status.configured,
      mode: status.mode,
      webhookConfigured: status.webhookConfigured,
      liveApproved: status.liveApproved,
      routeEnabled: status.routeEnabled,
      message: status.message,
    },
    moneyFlowPolicy: {
      platformPaymentsRecipient: 'Vijay Visuals Razorpay Account',
      sellerCustomerPaymentsPolicy:
        'Shop owner customer payments are strictly separated and never settle into Vijay Visuals personal account without verified Razorpay Route Linked Account routing.',
    },
  });
}
