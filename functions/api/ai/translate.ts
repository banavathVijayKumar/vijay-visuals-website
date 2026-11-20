// Cloudflare Pages Function: POST /api/ai/translate
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
    const { text, sourceLang = 'en', targetLang = 'te', context: ctx = 'business', tenantId = 'default-tenant' } = body;

    if (!text) {
      return jsonResponse({ error: 'text is required for translation.' }, 400);
    }
    const access = await requireAiEntitlement(context.request, context.env, 'ai-content-generator');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

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
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Translation Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
