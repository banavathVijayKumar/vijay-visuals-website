// Cloudflare Pages Function: POST /api/ai/product-description
import {
  CloudflareEnv,
  jsonResponse,
  handleOptions,
  callGeminiEdge,
  safeParseJson,
  formatAiError
} from '../_shared';
import { requireAiEntitlement, isAiAccessResponse, recordAiUsage } from '../marketplace/_entitlements';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { productName, category, price, features, language = 'en', tenantId = 'default-tenant' } = body;
    const access = await requireAiEntitlement(context.request, context.env, 'ai-content-generator');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

    const prompt = `Create a luxury e-commerce product description for:
Product Name: "${productName}"
Category: "${category}"
Price: "${price}"
Key Specifications / Ingredients: "${features || 'High-end craftsmanship'}"
Language: "${language}"

Return JSON:
{
  "catchyHeadline": "Engaging product headline",
  "shortHook": "1-2 sentence hook for catalog listing",
  "fullDescription": "Rich, sensory description highlighting benefits and craftsmanship.",
  "bulletPoints": [
    "Key benefit / spec 1",
    "Key benefit / spec 2",
    "Key benefit / spec 3",
    "Key benefit / spec 4"
  ],
  "deliveryCallout": "e.g. Express 30-min delivery or Insured Doorstep Courier available",
  "seoKeywords": ["keyword1", "keyword2", "keyword3"]
}`;

    const text = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(text);
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Product Description Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
