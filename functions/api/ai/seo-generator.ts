// Cloudflare Pages Function: POST /api/ai/seo-generator
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
    const { businessName, category, city = 'Hyderabad', keyOfferings, tenantId = 'default-tenant' } = body;

    const quota = checkAndIncrementQuota(tenantId);
    if (!quota.allowed) {
      return jsonResponse({
        error: 'Daily AI usage limit reached for your business account.',
        details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in Platform Controls.`,
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }

    const prompt = `Generate Google-optimized SEO metadata for:
Business: "${businessName}"
Industry: "${category}"
City / Target Region: "${city}"
Key Offerings: "${keyOfferings || 'Bespoke high-end services'}"

Output strict JSON:
{
  "seoTitle": "Title tag (STRICTLY under 60 characters, with high-intent keywords and brand name)",
  "metaDescription": "Meta description (STRICTLY between 135 and 155 characters with CTA)",
  "keywords": ["5-7 high-ranking long-tail keywords"],
  "ogTitle": "OpenGraph title for social media share cards",
  "ogDescription": "OpenGraph description",
  "jsonLdSchema": "Valid Schema.org LocalBusiness or Product JSON-LD string"
}`;

    const text = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(text);
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge SEO Generator Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
