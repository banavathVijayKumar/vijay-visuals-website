// Cloudflare Pages Function: POST /api/ai/product-description
import {
  CloudflareEnv,
  jsonResponse,
  handleOptions,
  checkAndIncrementQuota,
  callGeminiEdge,
  safeParseJson,
  formatAiError
} from '../_shared';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context: { request: Request; env: CloudflareEnv }) {
  try {
    const body: any = await context.request.json().catch(() => ({}));
    const { productName, category, price, features, language = 'en', tenantId = 'default-tenant' } = body;

    const quota = checkAndIncrementQuota(tenantId);
    if (!quota.allowed) {
      return jsonResponse({
        error: 'Daily AI usage limit reached for your business account.',
        details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in Platform Controls.`,
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }

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
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Product Description Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
