// ============================================================================
// POST /api/ai/setup-assistant — Tenant-authorized, D1-metered website draft AI
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
  rateLimitResponse,
  safeParseJson,
  sanitizeText,
  toSlug,
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

  const rl = await checkRateLimit(env, `ai_setup:${auth.user.id}`, 10, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'AI setup limit reached for this hour. Please try again later.');

  const body = await parseJsonBody<{
    businessBrief?: string;
    prompt?: string;
    language?: string;
    tenantId?: number | string;
    websiteId?: string;
    requestId?: string;
  }>(request);
  const prompt = sanitizeText(body?.businessBrief || body?.prompt, 600);
  if (!prompt || prompt.length < 5) {
    return jsonResponse({ error: 'Please describe your business in at least a few words.' }, 400);
  }

  // Client input is only an identifier hint. Ownership, membership, publication
  // status and plan allowance are resolved server-side before any provider call.
  const access = await requireAuthorizedAiTenant(env, auth.user, body?.tenantId || body?.websiteId);
  if (!access.ok) return access.response;
  const { row, parsed } = access;

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId: row.website_id,
      tenantRowId: row.rowid ? Number(row.rowid) : undefined,
      userId: auth.user.id,
      serviceSlug: 'setup-assistant',
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: parsed.planTier,
      promptSnippet: prompt.slice(0, 100),
      executeAiCall: async () =>
        callGeminiEdge(
          `Create a structured website starter draft JSON for this business description: "${prompt}".
Return strictly valid JSON with keys: name, slug, category, tagline, description, seoTitle, seoDescription, primaryColor (hex), accentColor (hex), logoText (2-3 uppercase letters), categories (string[]), starterProducts (array of {name, category, price, description}), faqs (array of {q, a}).`,
          env,
          { responseMimeType: 'application/json' }
        ),
    });

    const draft = safeParseJson(result.output);
    if (!draft?.name) {
      throw new Error('AI returned an incomplete draft.');
    }
    draft.slug = toSlug(draft.slug || draft.name) || 'my-business-site';
    return jsonResponse({
      draft,
      creditsUsed: result.creditsUsed,
      creditsRemaining: result.creditsRemaining,
      isDuplicate: result.isDuplicate,
      quota: result.quota,
    });
  } catch (err: any) {
    if (err?.code === 'AI_LEDGER_UNAVAILABLE' || err?.code === 'AI_REQUEST_ALREADY_USED' || err?.code === 'AI_REQUEST_CONFLICT') {
      return jsonResponse({ error: err.message, code: err.code }, err?.status || 503);
    }
    if (err?.status === 403 || err?.code === 'AI_QUOTA_EXHAUSTED') {
      return jsonResponse(
        { error: err.message, code: 'AI_QUOTA_EXHAUSTED', quota: err.quota },
        403
      );
    }
    return jsonResponse({ error: formatAiError(err) }, 502);
  }
}
