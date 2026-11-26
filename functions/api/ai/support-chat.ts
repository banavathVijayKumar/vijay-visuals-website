// ============================================================================
// POST /api/ai/support-chat — Public Storefront AI Support Assistant
// Uses real published business data from D1 + server-side Gemini API.
// ============================================================================

import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,  rateLimitResponse,
  formatAiError,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../_shared';
import { findPublicationByIdentifier } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const rl = await checkRateLimit(env, `ai_chat:${getClientIp(request)}`, 20, 600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many chat messages. Please wait a moment.')

  const body = await parseJsonBody<{
    tenantSlug?: string;
    message?: string;
    language?: string;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const message = sanitizeText(body.message, 600);
  const tenantSlug = sanitizeText(body.tenantSlug, 80).toLowerCase();
  const language = sanitizeText(body.language, 10) || 'en';
  if (!message) return jsonResponse({ error: 'Message is required.' }, 400);

  if (!tenantSlug || !env.DB) {
    return jsonResponse(
      { error: 'A published business is required before support chat is available.' },
      404
    );
  }
  const pub = await findPublicationByIdentifier(env, tenantSlug);
  if (!pub || pub.status !== 'published') {
    return jsonResponse({ error: 'Published business not found.' }, 404);
  }

  let parsed: Record<string, any> = {};
  try {
    parsed = pub.website_json ? JSON.parse(pub.website_json) : {};
  } catch {}
  // Never inject the platform identity into a customer-facing storefront prompt.
  const businessSummary = `Business Name: ${pub.business_name}. Category: ${parsed.category || 'General'}. Tagline: ${parsed.tagline || ''}. Description: ${parsed.description || ''}. Address: ${parsed.address || parsed.city || ''}. Phone: ${parsed.phone || ''}. WhatsApp: ${parsed.whatsapp || ''}. Hours: ${parsed.businessHours || 'Contact business directly'}.`;

  try {
    const reply = await callGeminiEdge(
      `Customer question: ${message}`,
      env,
      {
        systemInstruction: `You are a helpful, concise customer support assistant for this business: ${businessSummary}. Answer ONLY from the business details provided. Never claim live inventory, order status, prices, offers, or contact details that are not in those details. If the answer is unavailable, say so plainly and ask the customer to contact the business directly. Respond in ${language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English'} in under 80 words.`,
      }
    );
    return jsonResponse({ reply });
  } catch (err) {
    return jsonResponse({ error: formatAiError(err) }, 503);
  }
}
