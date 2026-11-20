// Cloudflare Pages Function: POST /api/ai/seo-generator
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
    const { businessName, category, city = 'Hyderabad', keyOfferings, tenantId = 'default-tenant' } = body;
    const access = await requireAiEntitlement(context.request, context.env, 'ai-content-generator');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

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
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge SEO Generator Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
