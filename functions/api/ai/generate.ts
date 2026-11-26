// ============================================================================
// POST /api/ai/generate — Authenticated Business Copy & Product Description AI
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

  const rl = await checkRateLimit(env, `ai_gen:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Hourly AI generation limit reached. Please try again later.')

  const body = await parseJsonBody<{
    tenantId?: number | string;
    prompt?: string;
    input?: string;
    task?: string;
    taskType?: string;
    language?: string;
    requestId?: string;
  }>(request);

  const taskLabel = sanitizeText(body?.task || body?.taskType, 60);
  const rawInput = sanitizeText(body?.prompt || body?.input, 1500);
  const prompt = taskLabel ? `${taskLabel}: ${rawInput}` : rawInput;
  if (!rawInput) return jsonResponse({ error: 'Prompt or input text is required.' }, 400);

  const access = await requireAuthorizedAiTenant(env, auth.user, body?.tenantId);
  if (!access.ok) return access.response;
  const { row, parsed } = access;
  const businessName = String(row.business_name || row.public_slug || 'this store');

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId: row.website_id,
      tenantRowId: row.rowid ? Number(row.rowid) : undefined,
      userId: auth.user.id,
      serviceSlug: `generate:${taskLabel || 'copy'}`,
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier: parsed.planTier,
      promptSnippet: prompt.slice(0, 100),
      executeAiCall: async () => {
        const hasKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
        if (!hasKey) {
          return `${businessName} copy for "${prompt}": Handcrafted with premium ingredients, authentic quality, and dedicated care. Order online for swift direct delivery.`;
        }
        return callGeminiEdge(prompt, env, {
          systemInstruction: `You are a concise e-commerce and small business copywriter for ${businessName}. Write clear, trustworthy, conversion-ready copy without exaggerated claims or placeholders.`,
        });
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
