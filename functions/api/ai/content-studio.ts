// ============================================================================
// POST /api/ai/content-studio — Gemini AI Multi-Mode Business Content Studio
// Generates SEO metadata, blog articles, ad campaigns, and marketing poster briefs.
// Enforces server-side credit limits and records to tenant_ai_usage ledger.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,  rateLimitResponse,
  formatAiError,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../_shared';
import { requireAuthorizedAiTenant } from '../_aiTenantAccess';
import { executeWithAiCreditDeduction } from '../_aiCredits';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(env, `ai_cs:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Hourly AI Content Studio limit reached. Please try again later.')

  const body = await parseJsonBody<{
    tenantId?: number | string;
    mode?: string;
    topic?: string;
    language?: string;
    requestId?: string;
  }>(request);

  const mode = sanitizeText(body?.mode || 'seo_metadata', 40);
  const topic = sanitizeText(body?.topic, 2000);
  const language = sanitizeText(body?.language || 'en', 20);

  if (!topic) {
    return jsonResponse({ error: 'Topic or input brief is required.' }, 400);
  }

  // Tenant metadata is loaded only after ownership, status, and plan/quota are
  // verified server-side. Client-supplied roles or plan fields are ignored.
  const access = await requireAuthorizedAiTenant(env, auth.user, body?.tenantId);
  if (!access.ok) return access.response;
  const { row, parsed } = access;
  const businessName = String(row.business_name || row.public_slug || 'this store');
  const businessContext = `Business: "${businessName}".`;

  const langInstruction =
    language === 'te'
      ? 'Respond primarily in Telugu (clear, professional Telugu script with essential English brand terms).'
      : language === 'hi'
      ? 'Respond primarily in Hindi (natural Devanagari script with business terminology).'
      : 'Respond in clear, compelling, professional English.';

  let systemInstruction = '';
  let prompt = '';

  switch (mode) {
    case 'seo_metadata':
      systemInstruction =
        'You are a senior technical SEO specialist for small and mid-market Indian enterprises. Generate high-ranking title tags, meta descriptions, and keywords adhering strictly to Google search character limits.';
      prompt = `${businessContext}
Target topic / store: ${topic}
Language: ${language}. ${langInstruction}

Generate:
1. SEO Page Title (50-60 characters, brand included at the end)
2. Meta Description (140-155 characters, includes primary benefit and call-to-action)
3. Primary Keywords (5-7 comma-separated high-intent keywords)
4. OpenGraph Social Share Title & Description
5. Google Rich Snippet Schema recommendation (e.g. LocalBusiness, Product, Organization)`;
      break;

    case 'blog_article':
      systemInstruction =
        'You are an authoritative e-commerce and retail industry content strategist. Write engaging, actionable, and SEO-optimized blog articles that educate customers and drive storefront conversions.';
      prompt = `${businessContext}
Topic / Subject: ${topic}
Language: ${language}. ${langInstruction}

Generate a complete, publish-ready blog article with:
1. Catchy, SEO-rich Headline
2. Engaging 2-sentence hook/introduction
3. 3-4 structured sections with descriptive subheadings and practical insights
4. Bulleted takeaways or practical checklist
5. Clear Call to Action (CTA) directing readers to view products or book an appointment`;
      break;

    case 'ad_campaign':
      systemInstruction =
        'You are a direct-response performance marketing copywriter specializing in Meta Ads (Instagram/Facebook) and Google Search Ads for local and online businesses.';
      prompt = `${businessContext}
Product / Offer: ${topic}
Language: ${language}. ${langInstruction}

Generate a complete high-converting Ad Campaign Kit:
1. Google Search Headlines (3 distinct variations, under 30 characters each)
2. Google Search Descriptions (2 distinct variations, under 90 characters each)
3. Instagram / Facebook Primary Ad Copy (compelling hook, bulleted benefits, urgency trigger)
4. Target Audience & Interest Recommendations (3 specific demographic/interest suggestions)
5. Recommended Call To Action (e.g., Shop Now, Order on WhatsApp, Claim Offer)`;
      break;

    case 'poster_brief':
    default:
      systemInstruction =
        'You are a creative brand director and visual designer. Produce clear creative briefs for promotional posters, social media banners, and print flyers.';
      prompt = `${businessContext}
Campaign / Event / Product: ${topic}
Language: ${language}. ${langInstruction}

Generate a detailed Visual Poster & Banner Design Brief:
1. Main Headline Hook (bold, punchy, maximum 7 words)
2. Supporting Sub-headline (value proposition)
3. Visual Concept & Imagery Description (what imagery/illustration to display)
4. Recommended Color Palette (3 hex or color themes matching the mood)
5. Key Details Section (bullet points for date, offer, discount, or features)
6. Footer Call-to-Action & Contact Badges (Store link, Phone/WhatsApp, Address)`;
      break;
  }

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId: row.website_id,
      tenantRowId: row.rowid ? Number(row.rowid) : undefined,
      userId: auth.user.id,
      serviceSlug: `content-studio:${mode}`,
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: parsed.planTier,
      promptSnippet: `${mode}: ${topic.slice(0, 80)}`,
      executeAiCall: async () => {
        const hasKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
        if (!hasKey) {
          return `=== ${businessName} CONTENT STUDIO ===\nMode: ${mode.toUpperCase()}\nTopic: ${topic}\nLanguage: ${language.toUpperCase()}\n\n1. Content Overview:\nProfessional marketing copy generated for "${topic}".\n- Primary Headline: ${topic} — Exclusive Collection & Premium Services\n- Value Proposition: Crafted with precision, verified quality, and seamless direct delivery.\n- Call To Action: Visit the storefront or connect on WhatsApp for instant orders.`;
        }
        return callGeminiEdge(prompt, env, { systemInstruction });
      },
    });

    return jsonResponse({
      output: result.output,
      text: result.output,
      creditsUsed: result.creditsUsed,
      creditsRemaining: result.creditsRemaining,
      isDuplicate: result.isDuplicate,
      quota: result.quota,
    });
  } catch (err: any) {
    if (err?.status === 403 || err?.code === 'AI_QUOTA_EXHAUSTED') {
      return jsonResponse(
        {
          error: err.message,
          code: 'AI_QUOTA_EXHAUSTED',
          quota: err.quota,
        },
        403
      );
    }
    return jsonResponse({ error: formatAiError(err) }, 502);
  }
}
