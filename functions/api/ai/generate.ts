// ============================================================================
// POST /api/ai/generate — Authenticated Business Copy & Product Description AI
// Enforces server-side credit limits and records to tenant_ai_usage ledger.
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
import { executeWithAiCreditDeduction } from '../_aiCredits';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(env, `ai_gen:${auth.user.id}`, 30, 3600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Hourly AI generation limit reached. Please try again later.' }, 429);
  }

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

  let websiteId = '';
  let tenantRowId: number | undefined;
  let fallbackPlanTier = 'business-website';

  if (env.DB && body?.tenantId) {
    try {
      const isNum = typeof body.tenantId === 'number' || /^\d+$/.test(String(body.tenantId));
      let row: Record<string, any> | null = null;
      if (isNum) {
        row = await env.DB.prepare(
          `SELECT rowid, website_id, website_json FROM customer_website_publications WHERE rowid = ? OR website_id = ? LIMIT 1`
        )
          .bind(Number(body.tenantId), String(body.tenantId))
          .first();
      } else {
        row = await env.DB.prepare(
          `SELECT rowid, website_id, website_json FROM customer_website_publications WHERE public_slug = ? OR website_id = ? LIMIT 1`
        )
          .bind(String(body.tenantId), String(body.tenantId))
          .first();
      }
      if (row) {
        websiteId = String(row.website_id || '');
        tenantRowId = row.rowid ? Number(row.rowid) : undefined;
        try {
          const parsed = JSON.parse(row.website_json || '{}');
          if (parsed.planTier) fallbackPlanTier = parsed.planTier;
        } catch {}
      }
    } catch {}
  }

  try {
    const result = await executeWithAiCreditDeduction(env, {
      websiteId: websiteId || `user_${auth.user.id}`,
      tenantRowId,
      userId: auth.user.id,
      serviceSlug: `generate:${taskLabel || 'copy'}`,
      requestId: body?.requestId,
      creditsNeeded: 1,
      fallbackPlanTier,
      promptSnippet: prompt.slice(0, 100),
      executeAiCall: async () => {
        const hasKey = Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
        if (!hasKey) {
          return `Vijay Visuals copy for "${prompt}": Handcrafted with premium ingredients, authentic quality, and dedicated care. Order online for swift direct delivery.`;
        }
        return callGeminiEdge(prompt, env, {
          systemInstruction:
            'You are a concise e-commerce and small business copywriter for Vijay Visuals. Write clear, trustworthy, conversion-ready copy without exaggerated claims or placeholders.',
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
