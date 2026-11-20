// ============================================================================
// POST /api/ai/support-chat — Public Storefront AI Support Assistant
// Uses real published business data from D1 + server-side Gemini API.
// ============================================================================

import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,
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
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many chat messages. Please wait a moment.' }, 429);
  }

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

  let businessSummary = 'Vijay Visuals business storefront';
  if (tenantSlug && env.DB) {
    const pub = await findPublicationByIdentifier(env, tenantSlug);
    if (pub && pub.status === 'published') {
      let parsed: Record<string, any> = {};
      try {
        parsed = pub.website_json ? JSON.parse(pub.website_json) : {};
      } catch {}
      businessSummary = `Business Name: ${pub.business_name}. Category: ${parsed.category || 'General'}. Tagline: ${parsed.tagline || ''}. Description: ${parsed.description || ''}. Address: ${parsed.address || parsed.city || ''}. Phone: ${parsed.phone || ''}. WhatsApp: ${parsed.whatsapp || ''}. Hours: ${parsed.businessHours || 'Contact business directly'}.`;
    }
  }

  try {
    const reply = await callGeminiEdge(
      `Customer question: ${message}`,
      env,
      {
        systemInstruction: `You are a helpful, concise customer support assistant for this business: ${businessSummary}. Answer ONLY based on the business details provided. Never invent fake prices, fake offers, or fake contact details. Respond in ${language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English'} in under 80 words.`,
      }
    );
    return jsonResponse({ reply });
  } catch (err) {
    return jsonResponse({ error: formatAiError(err) }, 503);
  }
}
