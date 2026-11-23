// ============================================================================
// POST, GET, OPTIONS /api/payments/cashfree/webhook — Alias Endpoint for Cashfree Webhooks
// Forwards directly to official webhook processor at functions/api/webhooks/cashfree
// ============================================================================

import { PagesContext } from '../../_shared';
import {
  onRequestGet as processGet,
  onRequestOptions as processOptions,
  onRequestPost as processPost,
} from '../../webhooks/cashfree';

export async function onRequestOptions(): Promise<Response> {
  return processOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  return processGet(context);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return processPost(context);
}
