// ============================================================================
// POST /api/ai/setup-assistant — Authenticated AI Website Setup Draft Generator
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
  safeParseJson,
  sanitizeText,
  toSlug,
} from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(env, `ai_setup:${auth.user.id}`, 10, 3600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'AI setup limit reached for this hour. Please try again later.' }, 429);
  }

  const body = await parseJsonBody<{ businessBrief?: string; prompt?: string; language?: string }>(
    request
  );
  const prompt = sanitizeText(body?.businessBrief || body?.prompt, 600);
  if (!prompt || prompt.length < 5) {
    return jsonResponse({ error: 'Please describe your business in at least a few words.' }, 400);
  }

  try {
    const raw = await callGeminiEdge(
      `Create a structured website starter draft JSON for this business description: "${prompt}".
Return strictly valid JSON with keys: name, slug, category, tagline, description, seoTitle, seoDescription, primaryColor (hex), accentColor (hex), logoText (2-3 uppercase letters), categories (string[]), starterProducts (array of {name, category, price, description}), faqs (array of {q, a}).`,
      env,
      { responseMimeType: 'application/json' }
    );
    const draft = safeParseJson(raw);
    if (!draft?.name) {
      throw new Error('AI returned an incomplete draft.');
    }
    draft.slug = toSlug(draft.slug || draft.name) || 'my-business-site';
    return jsonResponse({ draft });
  } catch (err) {
    return jsonResponse({ error: formatAiError(err) }, 503);
  }
}
