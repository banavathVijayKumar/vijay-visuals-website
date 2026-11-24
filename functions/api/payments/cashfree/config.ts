// ============================================================================
// GET /api/payments/cashfree/config — Public Cashfree Readiness & Configuration
// NEVER exposes CASHFREE_CLIENT_SECRET, CASHFREE_WEBHOOK_SECRET, or raw credentials.
// ============================================================================

import { PagesContext, json } from '../../_shared';
import { getEdgeCashfreeStatus, getSafeCashfreeNotifyUrl, getTrimmedEnvVar } from '../_cashfree';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const status = getEdgeCashfreeStatus(context.env);
  const webhookUrl = getSafeCashfreeNotifyUrl(context.request, context.env);
  const clientId = getTrimmedEnvVar(context.env, 'CASHFREE_CLIENT_ID');
  const clientSecret = getTrimmedEnvVar(context.env, 'CASHFREE_CLIENT_SECRET');
  const webhookSecret = getTrimmedEnvVar(context.env, 'CASHFREE_WEBHOOK_SECRET');
  const envVar = getTrimmedEnvVar(context.env, 'CASHFREE_ENV') || 'unset';

  return json({
    cashfree: {
      configured: status.configured,
      mode: status.mode,
      webhookConfigured: status.webhookConfigured,
      apiVersion: status.apiVersion,
      webhookUrl,
      message: status.message,
      diagnostics: {
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        hasWebhookSecret: Boolean(webhookSecret),
        envVar,
        clientIdPrefix: clientId ? `${clientId.slice(0, 4)}...` : 'none',
      },
    },
    policy: {
      gateway: 'Cashfree Payment Gateway (Official PG 2023-08-01 API)',
      currency: 'INR',
      supportedMethods: ['UPI', 'Credit/Debit Cards', 'Net Banking', 'Wallets'],
      sandboxDocumentation: 'https://www.cashfree.com/docs/payments',
    },
  });
}
