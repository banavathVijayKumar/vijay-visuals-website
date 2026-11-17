// Cloudflare Pages Function: POST /api/ai/website-generator
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
    const { businessName, businessType, location, language = 'en', specialFeatures, tenantId = 'default-tenant' } = body;

    if (!businessName || !businessType) {
      return jsonResponse({ error: 'businessName and businessType are required.' }, 400);
    }
    const access = await requireAiEntitlement(context.request, context.env, 'ai-website-builder');
    if (isAiAccessResponse(access)) return access;
    const quota = { allowed: true, remaining: access.remaining, limit: access.limit };

    const prompt = `You are an expert luxury web designer and copywriter for Vijay Visuals Multi-Tenant Website Builder.
Generate a complete, high-converting business website content plan for:
Business Name: ${businessName}
Business Category: ${businessType}
Location: ${location || 'Hyderabad, India'}
Language: ${language} (en = English, te = Telugu, hi = Hindi)
Special Features / Notes: ${specialFeatures || 'Fast delivery, online shopping, luxury finish'}

Return ONLY a valid JSON object matching this structure:
{
  "tagline": "A striking luxury tagline",
  "heroTitle": "Captivating Headline for Hero section",
  "heroSubtitle": "2-sentence high-impact subheadline conveying trust, elegance and speed",
  "primaryCta": "Button label e.g. Explore Collection / Order Now",
  "aboutUs": "A compelling 3-4 sentence brand story highlighting artisanal heritage, reliability and customer dedication.",
  "features": [
    { "title": "Feature 1", "description": "Short explanation" },
    { "title": "Feature 2", "description": "Short explanation" },
    { "title": "Feature 3", "description": "Short explanation" },
    { "title": "Feature 4", "description": "Short explanation" }
  ],
  "productsOrServices": [
    { "name": "Item 1", "price": "₹499", "description": "Crisp description" },
    { "name": "Item 2", "price": "₹899", "description": "Crisp description" },
    { "name": "Item 3", "price": "₹1,499", "description": "Crisp description" }
  ],
  "faq": [
    { "question": "Question 1?", "answer": "Clear, reassuring answer." },
    { "question": "Question 2?", "answer": "Clear, reassuring answer." }
  ],
  "suggestedThemeColor": "#DFBA5A",
  "suggestedFont": "Cinzel"
}`;

    const text = await callGeminiEdge(prompt, context.env, {
      responseMimeType: 'application/json',
    });

    const parsed = safeParseJson(text);
    await recordAiUsage(context.env, access, 'success');
    return jsonResponse({ success: true, data: parsed, quota });
  } catch (error: any) {
    console.error('Edge Website Generator Error:', error);
    return jsonResponse({ error: formatAiError(error) }, 500);
  }
}
