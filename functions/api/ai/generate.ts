// ============================================================================
// POST /api/ai/generate — Authenticated Business Copy & Product Description AI
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

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(env, `ai_gen:${auth.user.id}`, 20, 3600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Hourly AI generation limit reached. Please try again later.' }, 429);
  }

  const body = await parseJsonBody<{
    prompt?: string;
    input?: string;
    task?: string;
    taskType?: string;
    language?: string;
  }>(request);
  const taskLabel = sanitizeText(body?.task || body?.taskType, 60);
  const rawInput = sanitizeText(body?.prompt || body?.input, 1000);
  const prompt = taskLabel ? `${taskLabel}: ${rawInput}` : rawInput;
  if (!rawInput) return jsonResponse({ error: 'Prompt or input text is required.' }, 400);

  try {
    const text = await callGeminiEdge(prompt, env, {
      systemInstruction:
        'You are a concise e-commerce and small business copywriter for Vijay Visuals. Write clear, trustworthy, conversion-ready copy without exaggerated claims or placeholders.',
    });
    return jsonResponse({ output: text, text });
  } catch (err) {
    return jsonResponse({ error: formatAiError(err) }, 503);
  }
}
