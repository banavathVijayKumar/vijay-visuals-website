// Cloudflare Pages Function: POST /api/ai/support-chatbot
import {
  CloudflareEnv,
  jsonResponse,
  handleOptions,
  callGeminiEdge,
  formatAiError
} from '../_shared';
import { requireAiEntitlement, isAiAccessResponse, recordAiUsage } from '../marketplace/_entitlements';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { message, history = [], businessContext, tenantId = 'default-tenant' } = body;

    if (!message) {
      return jsonResponse({ error: 'message is required.' }, 400);
    }
    const access = await requireAiEntitlement(context.request, context.env, 'customer-support-ai');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

    const bizName = businessContext?.name || 'Vijay Visuals';
    const bizCategory = businessContext?.category || 'Digital Services';
    const bizCity = businessContext?.city || 'Hyderabad';
    const bizPhone = businessContext?.phone || '+91 93813 62201';

    const systemInstruction = `You are the polite, intelligent AI Virtual Concierge for "${bizName}" (${bizCategory}) based in ${bizCity}.
Business Details:
- Store Phone / WhatsApp: ${bizPhone}
- Fast delivery is managed by our dedicated Vijay Visuals logistics fleet.
- Keep answers helpful, concise, professional, and warmly welcoming.
- Answer questions regarding products, timings, location, delivery tracking, and order placement.
- If unsure or if the customer wants human help, offer to connect them via WhatsApp at ${bizPhone}.`;

    const contents: any[] = [];
    if (Array.isArray(history)) {
      history.slice(-6).forEach((h: any) => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }],
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const reply = await callGeminiEdge(contents, context.env, {
      systemInstruction,
    });

    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({
      success: true,
      reply: reply || 'I am here to assist you with any questions about our products and services!',
      quota,
    });
  } catch (error: any) {
    console.error('Edge Chatbot Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
