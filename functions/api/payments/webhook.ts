// ============================================================================
// POST, GET, OPTIONS /api/payments/webhook — Alias Endpoint for Webhook Processor
// Forwards directly to official Cashfree webhook processor
// ============================================================================

import { PagesContext } from '../_shared';
import {
  onRequestGet as getCashfreeWebhook,
  onRequestOptions as optionsCashfreeWebhook,
  onRequestPost as postCashfreeWebhook,
} from '../webhooks/cashfree';

export async function onRequestOptions(): Promise<Response> {
  return optionsCashfreeWebhook();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return getCashfreeWebhook(context);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return postCashfreeWebhook(context);
}
