// Cloudflare Pages Function: POST /api/ai/logo-generator
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
    const { businessName, category, style = 'minimalist-gold', primaryColor = '#DFBA5A', tenantId = 'default-tenant' } = body;
    const access = await requireAiEntitlement(context.request, context.env, 'ai-content-generator');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

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
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data, quota });
  } catch (error: any) {
    console.error('Edge Logo Generator Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
