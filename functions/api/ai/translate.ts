// Cloudflare Pages Function: POST /api/ai/translate
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
    const { text, sourceLang = 'en', targetLang = 'te', context: ctx = 'business', tenantId = 'default-tenant' } = body;

    if (!text) {
      return jsonResponse({ error: 'text is required for translation.' }, 400);
    }

    const quota = checkAndIncrementQuota(tenantId);
    if (!quota.allowed) {
      return jsonResponse({
        error: 'Daily AI usage limit reached for your business account.',
        details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in Platform Controls.`,
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }

    const prompt = `Translate the following text accurately with natural, professional phrasing suitable for a high-end website.
Source Language: ${sourceLang}
Target Language: ${targetLang} (en: English, te: Telugu, hi: Hindi)
Context: ${ctx} (e.g. food menu, luxury jewelry, doctor appointments, legal services)

Text to translate:
"""
${text}
"""

Return JSON:
{
  "translatedText": "the translated string in target language script (Telugu script if te, Devanagari script if hi, Latin if en)",
  "phoneticOrNotes": "Optional brief pronunciation note or cultural nuance"
}`;

    const raw = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(raw);
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Translation Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
