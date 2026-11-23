// ============================================================================
// POST /api/payments/cashfree/webhook — Alias Endpoint for Cashfree Webhooks
// Forwards directly to official webhook processor at functions/api/webhooks/cashfree
// ============================================================================

import { PagesContext } from '../../_shared';
import { onRequestPost as processWebhook } from '../../webhooks/cashfree';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return processWebhook(context);
}
