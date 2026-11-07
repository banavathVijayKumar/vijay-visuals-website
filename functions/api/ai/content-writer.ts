// Cloudflare Pages Function: POST /api/ai/content-writer
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
    const { businessName, category, contentType, tone = 'luxury', language = 'en', topic, tenantId = 'default-tenant' } = body;

    const quota = checkAndIncrementQuota(tenantId);
    if (!quota.allowed) {
      return jsonResponse({
        error: 'Daily AI usage limit reached for your business account.',
        details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in Platform Controls.`,
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }

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
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Content Writer Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
