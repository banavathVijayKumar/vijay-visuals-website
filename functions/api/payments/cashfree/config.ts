// ============================================================================
// GET /api/payments/cashfree/config — Public Cashfree Readiness & Configuration
// NEVER exposes CASHFREE_CLIENT_SECRET, CASHFREE_WEBHOOK_SECRET, or raw credentials.
// ============================================================================

import { PagesContext, json } from '../../_shared';
import { getEdgeCashfreeStatus } from '../_cashfree';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const status = getEdgeCashfreeStatus(context.env);

  return json({
    cashfree: {
      configured: status.configured,
      mode: status.mode,
      webhookConfigured: status.webhookConfigured,
      apiVersion: status.apiVersion,
      webhookUrl: 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree',
      message: status.message,
    },
    policy: {
      gateway: 'Cashfree Payment Gateway (Official PG 2023-08-01 API)',
      currency: 'INR',
      supportedMethods: ['UPI', 'Credit/Debit Cards', 'Net Banking', 'Wallets'],
      sandboxDocumentation: 'https://www.cashfree.com/docs/payments',
    },
  });
}
