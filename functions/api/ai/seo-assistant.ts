// ============================================================================
// POST /api/ai/seo-assistant — Multi-Tenant Gemini AI SEO Assistant
// Generates grounded, ethical SEO recommendations tailored to tenant store & city.
// Enforces server-side credit quota and records to tenant_ai_usage ledger.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,
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

  const rl = await checkRateLimit(env, `ai_seo:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) {
    return jsonResponse(
      { error: 'Hourly AI SEO Assistant limit reached. Please try again later.' },
      429
    );
  }

  const body = await parseJsonBody<{
    tenantId?: number | string;
    task?: string;
    targetCity?: string;
    language?: string;
    requestId?: string;
  }>(request);

  if (!body || !body.tenantId) {
    return jsonResponse({ error: 'tenantId is required.' }, 400);
  }

  const access = await requireAuthorizedAiTenant(env, auth.user, body.tenantId);
  if (!access.ok) return access.response;

  const task = sanitizeText(body.task || 'comprehensive_audit', 60);
  const targetCity = sanitizeText(body.targetCity || access.parsed.city || 'India', 80);
  const language = sanitizeText(body.language || 'en', 20);

  const { row, parsed } = access;
  const businessName = row.business_name || row.public_slug;
  const category = parsed.category || 'Retail/Business';

  const systemInstruction = `You are a senior ethical SEO strategist for Indian and global retail businesses on the Vijay Visuals platform.
Generate realistic, high-impact SEO plans adhering strictly to Google Search Essentials.
Never promise guaranteed #1 rankings or use manipulative black-hat keywords.
Language instruction: ${
    language === 'te'
      ? 'Respond primarily in Telugu with key English search terms.'
      : language === 'hi'
      ? 'Respond primarily in Hindi with clear SEO terminology.'
      : 'Respond in clear, professional English.'
  }`;

  const prompt = `Business: "${businessName}"
Category: ${category}
Target City / Region: ${targetCity}
SEO Task: ${task}
Current Meta Description: "${parsed.description || 'Not configured'}"
Website Slug: /site/${row.public_slug}

Please produce an actionable SEO Action Plan:
1. Primary Keyword Cluster (5 high-intent local & industry keywords for ${targetCity})
2. Title Tag & Meta Description Templates (character-counted for Google desktop & mobile)
3. Google Business Profile & Local Search Enhancement Checklist
4. Structured Schema Recommendation (e.g. LocalBusiness, Store, Organization)
5. Practical on-page optimization steps for products and category pages`;

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId: row.website_id,
      tenantRowId: row.rowid ? Number(row.rowid) : undefined,
      userId: auth.user.id,
      serviceSlug: 'seo-assistant',
      requestId: body.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: parsed.planTier,
      promptSnippet: `SEO plan for ${businessName} in ${targetCity}`,
      executeAiCall: async () => {
        const hasKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
        if (!hasKey) {
          return `SEO Action Plan for ${businessName} in ${targetCity}:\n1. High-Intent Keywords: Best ${category} in ${targetCity}, Top ${businessName} reviews, Buy ${category} online.\n2. Meta Title: ${businessName} — Leading ${category} in ${targetCity}\n3. Meta Description: Discover premium ${category} at ${businessName} in ${targetCity}. High quality, certified products with fast delivery.\n4. Local SEO: Verify Google Business Profile address, pin location, and customer reviews.`;
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
