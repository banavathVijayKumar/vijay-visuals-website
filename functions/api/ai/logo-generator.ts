// Cloudflare Pages Function: POST /api/ai/logo-generator
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
    const { businessName, category, style = 'minimalist-gold', primaryColor = '#DFBA5A', tenantId = 'default-tenant' } = body;

    const quota = checkAndIncrementQuota(tenantId);
    if (!quota.allowed) {
      return jsonResponse({
        error: 'Daily AI usage limit reached for your business account.',
        details: `Your daily quota of ${quota.limit} AI calls has been exhausted. Admin can increase this limit in Platform Controls.`,
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }

    const prompt = `You are a world-class luxury brand identity designer.
Generate SVG code and visual brand guidelines for:
Business Name: "${businessName}"
Category: "${category}"
Style: "${style}" (e.g. minimalist-gold, royal-crest, modern-geometric, monogram)
Primary Brand Color: "${primaryColor}"

Create a clean, scalable vector SVG logo (viewBox="0 0 200 200") with gold metallic gradient or refined vector paths, and output a JSON:
{
  "monogram": "2 letters",
  "svgCode": "<svg viewBox=\\"0 0 200 200\\" xmlns=\\"http://www.w3.org/2000/svg\\">...</svg>",
  "fontRecommendation": "Cinzel or Plus Jakarta Sans",
  "palette": ["#08080A", "${primaryColor}", "#ECC86A", "#1C1C26"],
  "designRationale": "1-2 sentences explaining the visual symbolism."
}`;

    const text = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const data = safeParseJson(text);
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Logo Generator Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
