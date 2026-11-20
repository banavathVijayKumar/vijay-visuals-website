// Cloudflare Pages Function: POST /api/ai/content-writer
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
    const { businessName, category, contentType, tone = 'luxury', language = 'en', topic, tenantId = 'default-tenant' } = body;
    const access = await requireAiEntitlement(context.request, context.env, 'ai-content-generator');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

    const prompt = `Write professional, high-converting content for:
Business: "${businessName}" (${category})
Content Type to write: "${contentType}" (e.g. About Story, Hero Banner Headline, Announcement, Services List, FAQ)
Tone: "${tone}"
Language: "${language}" (en: English, te: Telugu, hi: Hindi)
Specific Instructions / Topic: "${topic || 'General high-end appeal'}"

Provide 2 distinct variations. Return JSON:
{
  "variation1": "Option 1 text",
  "variation2": "Option 2 text",
  "headline": "Recommended short headline"
}`;

    const text = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(text);
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Content Writer Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
