// ============================================================================
// POST /api/platform/ai-assistant
// Tenant-Scoped Gemini Business Assistant & 9-Tool AI Studio (12 Languages)
// - Languages: EN, TE, HI, TA, KN, ML, MR, BN, GU, PA, OR, UR
// - Tool Modes: assistant, website_content, product_description,
//   seo_suggestions, business_names, promo_copy, social_media,
//   customer_support, business_insights
// - Uses unified server-side Gemini Edge integration with stable model fallback
// - Grounded ONLY in the authenticated tenant's real D1 database counts
// - Enforces monthly plan AI credit limits via tenant_ai_usage
// - Requires explicit user confirmation before financial/bulk/publish actions
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  callGeminiEdge,
  checkRateLimit,  rateLimitResponse,
  errorJson,
  formatAiError,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../_shared';
import { executeWithAiCreditDeduction } from '../_aiCredits';
import { requireAuthorizedAiTenant } from '../_aiTenantAccess';

const SENSITIVE_ACTION_PATTERN = /\b(delete|refund|charge|payout|send bulk|blast|publish all|cancel all)\b/i;

export const AI_SUPPORTED_LANGUAGES: Record<string, { name: string; instruction: string }> = {
  en: { name: 'English', instruction: 'Respond in clear, concise, professional English.' },
  te: { name: 'Telugu', instruction: 'Respond in clear, natural Telugu (తెలుగు) using proper Unicode script, keeping essential technical/business terms easy to understand.' },
  hi: { name: 'Hindi', instruction: 'Respond in clear, natural Hindi (हिन्दी) using proper Devanagari Unicode script.' },
  ta: { name: 'Tamil', instruction: 'Respond in clear, natural Tamil (தமிழ்) using proper Tamil Unicode script.' },
  kn: { name: 'Kannada', instruction: 'Respond in clear, natural Kannada (ಕನ್ನಡ) using proper Kannada Unicode script.' },
  ml: { name: 'Malayalam', instruction: 'Respond in clear, natural Malayalam (മലയാളം) using proper Malayalam Unicode script.' },
  mr: { name: 'Marathi', instruction: 'Respond in clear, natural Marathi (मराठी) using proper Devanagari Unicode script.' },
  bn: { name: 'Bengali', instruction: 'Respond in clear, natural Bengali (বাংলা) using proper Bengali Unicode script.' },
  gu: { name: 'Gujarati', instruction: 'Respond in clear, natural Gujarati (ગુજરાતી) using proper Gujarati Unicode script.' },
  pa: { name: 'Punjabi', instruction: 'Respond in clear, natural Punjabi (ਪੰਜਾਬੀ) using proper Gurmukhi Unicode script.' },
  or: { name: 'Odia', instruction: 'Respond in clear, natural Odia (ଓଡ଼ିଆ) using proper Odia Unicode script.' },
  ur: { name: 'Urdu', instruction: 'Respond in clear, natural Urdu (اردو) using proper right-to-left Urdu Unicode script.' },
};

export const AI_TOOL_MODES: Record<string, string> = {
  assistant: 'General business operations advisor for this merchant.',
  website_content: 'Write high-converting homepage hero headlines, about sections, and service copy tailored to this business.',
  product_description: 'Write clear, accurate, conversion-ready product descriptions with bullet highlights and care/spec guidance.',
  seo_suggestions: 'Suggest SEO page titles (30-60 chars), meta descriptions (120-160 chars), keywords, and structured data tips without promising #1 search rankings.',
  business_names: 'Generate memorable, brandable Indian and global business name and tagline ideas with domain-friendly slugs.',
  promo_copy: 'Draft honest promotional offers, festival sale banners, and consented WhatsApp/email announcements.',
  social_media: 'Create engaging Instagram, YouTube Shorts, and LinkedIn post captions with relevant local & global hashtags.',
  customer_support: 'Draft polite, accurate customer support replies regarding orders, delivery timelines, and return policies.',
  business_insights: 'Analyze ONLY the verified tenant metrics provided below and recommend practical, actionable growth steps.',
};

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const rl = await checkRateLimit(env, `ai_assistant:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'AI assistant hourly rate limit reached. Please wait a few minutes.')

  const body = await parseJsonBody<{
    websiteId?: string;
    prompt?: string;
    language?: string;
    tool?: string;
    confirmedAction?: boolean;
    requestId?: string;
  }>(request);

  if (!body || !body.websiteId || !body.prompt) {
    return errorJson('websiteId and prompt are required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const prompt = sanitizeText(body.prompt, 1500);
  const langKey = (body.language || 'en').toLowerCase().trim();
  const language = Object.prototype.hasOwnProperty.call(AI_SUPPORTED_LANGUAGES, langKey) ? langKey : 'en';
  const toolKey = (body.tool || 'assistant').toLowerCase().trim();
  const tool = Object.prototype.hasOwnProperty.call(AI_TOOL_MODES, toolKey) ? toolKey : 'assistant';

  const access = await requireAuthorizedAiTenant(env, auth.user, websiteId);
  if (!access.ok) return access.response;

  // Confirmation gate for sensitive actions
  if (SENSITIVE_ACTION_PATTERN.test(prompt) && !body.confirmedAction) {
    return json({
      requiresConfirmation: true,
      warning:
        'This request mentions a potentially sensitive financial, deletion, or bulk action. Please review and re-submit with explicit confirmation.',
      proposedPrompt: prompt,
      language,
      tool,
    });
  }

  // Strictly gather ONLY this tenant's verified real numbers from D1 (zero cross-tenant leakage)
  const [prodCount, orderStats, leadCount, domainCount] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS cnt FROM store_products WHERE website_id = ?')
      .bind(websiteId)
      .first<{ cnt: number }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS cnt, COALESCE(SUM(total_inr), 0) AS revenue_inr FROM store_orders WHERE website_id = ?'
    )
      .bind(websiteId)
      .first<{ cnt: number; revenue_inr: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS cnt FROM crm_contacts_leads WHERE website_id = ?')
      .bind(websiteId)
      .first<{ cnt: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS cnt FROM tenant_domains WHERE website_id = ? AND status = 'live'")
      .bind(websiteId)
      .first<{ cnt: number }>(),
  ]);

  const tenantContext = {
    businessName: access.row.business_name,
    publicSlug: access.row.public_slug,
    websiteStatus: access.row.status,
    activeProducts: Number(prodCount?.cnt || 0),
    totalOrders: Number(orderStats?.cnt || 0),
    recordedOrderVolumeInr: Number(orderStats?.revenue_inr || 0),
    crmLeads: Number(leadCount?.cnt || 0),
    liveCustomDomains: Number(domainCount?.cnt || 0),
  };

  const hasApiKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (!hasApiKey) {
    return json(
      {
        status: 'setup_required',
        error: 'Integration Required: GEMINI_API_KEY (or GOOGLE_API_KEY) is not configured in Cloudflare Pages Secrets.',
        language,
        tool,
        supportedLanguages: Object.keys(AI_SUPPORTED_LANGUAGES),
        supportedTools: Object.keys(AI_TOOL_MODES),
        tenantContext,
      },
      503
    );
  }

  const languageMeta = AI_SUPPORTED_LANGUAGES[language];
  const toolInstruction = AI_TOOL_MODES[tool];

  const systemInstruction = [
    'You are the Vijay Visuals Business Assistant (Made in India. Built for the World.) for a single business tenant.',
    `ACTIVE TOOL MODE (${tool}): ${toolInstruction}`,
    `LANGUAGE (${languageMeta.name}): ${languageMeta.instruction}`,
    'STRICT FACTUALITY RULE: Use ONLY the verified tenant metrics below. Never invent revenue numbers, customer counts, Google reviews, government certifications, or #1 SEO rankings, and never claim external actions were executed.',
    `VERIFIED TENANT METRICS JSON: ${JSON.stringify(tenantContext)}`,
  ].join('\n');

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId,
      userId: auth.user.id,
      serviceSlug: `platform-assistant:${tool}`,
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: access.parsed.planTier,
      promptSnippet: `${tool}: ${prompt.slice(0, 80)}`,
      executeAiCall: async () => {
        return callGeminiEdge(prompt, env, { systemInstruction });
      },
    });

    return json({
      reply: result.output,
      model: env.GEMINI_MODEL || 'gemini-1.5-flash',
      language,
      tool,
      creditsUsed: result.creditsUsed,
      creditsLimit: result.quota.allowance,
      creditsRemaining: result.creditsRemaining,
      tenantContext,
    });
  } catch (err: any) {
    if (err?.status === 403 || err?.code === 'AI_QUOTA_EXHAUSTED') {
      return errorJson(
        err.message || 'Monthly AI credit limit reached for your plan.',
        403
      );
    }
    return errorJson(formatAiError(err), 502);
  }
}
