// ============================================================================
// POST /api/platform/ai-assistant
// Tenant-Scoped Gemini Business Assistant & 9-Tool AI Studio (12 Languages)
// - Languages: EN, TE, HI, TA, KN, ML, MR, BN, GU, PA, OR, UR
// - Tool Modes: assistant, website_content, product_description,
//   seo_suggestions, business_names, promo_copy, social_media,
//   customer_support, business_insights
// - Uses @google/genai with model 'gemini-4-hydrogen'
// - Grounded ONLY in the authenticated tenant's real D1 database counts
// - Enforces monthly plan AI credit limits via vv_ai_usage
// - Requires explicit user confirmation before financial/bulk/publish actions
// ============================================================================

import { GoogleGenAI } from '@google/genai';
import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  checkRateLimit,
  errorJson,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../_shared';

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
  if (!rl.allowed) {
    return errorJson('AI assistant hourly rate limit reached. Please wait a few minutes.', 429);
  }

  const body = await parseJsonBody<{
    websiteId?: string;
    prompt?: string;
    language?: string;
    tool?: string;
    confirmedAction?: boolean;
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

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
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

  // Enforce monthly plan AI credit limit
  const [planLimitRow, usageRow] = await Promise.all([
    env.DB.prepare(
      `SELECT sp.monthly_ai_credits
       FROM tenant_subscriptions ts
       INNER JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(websiteId)
      .first<{ monthly_ai_credits: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS used_count FROM vv_ai_usage
       WHERE user_id = ? AND created_at >= datetime('now', '-30 days')`
    )
      .bind(auth.user.id)
      .first<{ used_count: number }>()
      .catch(() => ({ used_count: 0 })),
  ]);

  const monthlyCredits = planLimitRow?.monthly_ai_credits ?? 50;
  const usedCredits = Number(usageRow?.used_count || 0);
  if (!auth.user.isSuperAdmin && usedCredits >= monthlyCredits) {
    return errorJson(
      `Monthly AI assistant credit limit reached (${usedCredits}/${monthlyCredits}). Upgrade your plan for additional AI credits.`,
      429
    );
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
    businessName: access.website.business_name,
    publicSlug: access.website.public_slug,
    websiteStatus: access.website.status,
    activeProducts: Number(prodCount?.cnt || 0),
    totalOrders: Number(orderStats?.cnt || 0),
    recordedOrderVolumeInr: Number(orderStats?.revenue_inr || 0),
    crmLeads: Number(leadCount?.cnt || 0),
    liveCustomDomains: Number(domainCount?.cnt || 0),
  };

  if (!env.GEMINI_API_KEY) {
    return json(
      {
        status: 'setup_required',
        error: 'Integration Required: GEMINI_API_KEY is not configured in Cloudflare Pages Secrets.',
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

  try {
    const ai = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: [
          'You are the Vijay Visuals Business Assistant (Made in India. Built for the World.) for a single business tenant.',
          `ACTIVE TOOL MODE (${tool}): ${toolInstruction}`,
          `LANGUAGE (${languageMeta.name}): ${languageMeta.instruction}`,
          'STRICT FACTUALITY RULE: Use ONLY the verified tenant metrics below. Never invent revenue numbers, customer counts, Google reviews, government certifications, or #1 SEO rankings, and never claim external actions were executed.',
          `VERIFIED TENANT METRICS JSON: ${JSON.stringify(tenantContext)}`,
        ].join('\n'),
      },
    });

    const replyText = (response.text || '').trim();

    // Meter usage in existing vv_ai_usage table
    try {
      await env.DB.prepare(
        `INSERT INTO vv_ai_usage (id, user_id, service_slug, prompt_tokens, completion_tokens, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'success', datetime('now'))`
      )
        .bind(
          `ai_${randomHex(10)}`,
          auth.user.id,
          `ai_${tool}`,
          Math.ceil(prompt.length / 4),
          Math.ceil(replyText.length / 4)
        )
        .run();
    } catch {
      // Non-fatal if legacy vv_ai_usage columns differ
    }

    return json({
      reply: replyText,
      model: 'gemini-4-hydrogen',
      language,
      tool,
      creditsUsed: usedCredits + 1,
      creditsLimit: monthlyCredits,
      tenantContext,
    });
  } catch (err) {
    return errorJson(
      `Gemini AI request failed: ${err instanceof Error ? err.message : 'Unknown upstream error'}`,
      502
    );
  }
}
