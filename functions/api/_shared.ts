// Cloudflare Pages Functions shared AI utilities.
// API credentials stay server-side in Cloudflare secrets. No browser-side keys.


export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export interface CloudflareEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  AI_PROVIDER?: 'gemini' | 'claude';
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  DB?: {
    prepare(query: string): D1Statement;
    batch?(statements: D1Statement[]): Promise<any[]>;
  };
  [key: string]: any;
}

export interface TenantUsage {
  requestsCount: number;
  dailyLimit: number;
  lastReset: string;
}

// Temporary isolate-local quota only. Production quotas should be stored in D1.
export const edgeUsageStore: Record<string, TenantUsage> = {
  'default-tenant': { requestsCount: 0, dailyLimit: 50, lastReset: new Date().toISOString() },
};

export function checkAndIncrementQuota(tenantId = 'default-tenant') {
  const today = new Date().toISOString().slice(0, 10);
  if (!edgeUsageStore[tenantId]) {
    edgeUsageStore[tenantId] = { requestsCount: 0, dailyLimit: 50, lastReset: today };
  }
  const tenant = edgeUsageStore[tenantId];
  if (!tenant.lastReset.startsWith(today)) {
    tenant.requestsCount = 0;
    tenant.lastReset = today;
  }
  if (tenant.requestsCount >= tenant.dailyLimit) {
    return { allowed: false, remaining: 0, limit: tenant.dailyLimit };
  }
  tenant.requestsCount += 1;
  return { allowed: true, remaining: tenant.dailyLimit - tenant.requestsCount, limit: tenant.dailyLimit };
}

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders,
    },
  });
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function safeParseJson(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try { return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)); } catch {}
    }
    return {};
  }
}

export function formatAiError(error: any): string {
  const msg = typeof error === 'string' ? error : error?.message || '';
  if (!msg) return 'AI service temporarily unavailable. Please try again.';
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return 'AI service is temporarily busy. Please try again shortly.';
  }
  if (/429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) {
    return 'AI free-tier request limit reached. Please wait and try again.';
  }
  if (/API key|authentication|unauthorized|401|403/i.test(msg)) {
    return 'AI provider authentication failed. Please check the server-side API secret.';
  }
  return msg;
}

function normalizeGeminiContents(prompt: string | any[]) {
  if (typeof prompt === 'string') {
    return { contents: [{ role: 'user', parts: [{ text: prompt }] }], systemText: '' };
  }
  const contents: any[] = [];
  const systemParts: string[] = [];
  for (const item of Array.isArray(prompt) ? prompt : []) {
    const rawRole = item?.role;
    const role = rawRole === 'assistant' ? 'model' : rawRole;
    const parts = Array.isArray(item?.parts)
      ? item.parts.filter((p: any) => typeof p?.text === 'string' && p.text.trim()).map((p: any) => ({ text: p.text }))
      : typeof item?.content === 'string' && item.content.trim()
        ? [{ text: item.content }]
        : [];
    if (!parts.length) continue;
    if (role === 'system') systemParts.push(parts.map((p: any) => p.text).join('\n'));
    else if (role === 'user' || role === 'model') contents.push({ role, parts });
  }
  return { contents, systemText: systemParts.join('\n\n') };
}

async function callGeminiDirect(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY secret is not configured in Cloudflare Pages.');

  // Use a free-tier model by default. No paid-provider fallback is attempted.
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const normalized = normalizeGeminiContents(prompt);
  if (!normalized.contents.length) throw new Error('No valid user content was provided to Gemini.');

  const systemText = [config?.systemInstruction, normalized.systemText].filter(Boolean).join('\n\n');
  const payload: any = { contents: normalized.contents };
  if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
  if (config?.responseMimeType) payload.generationConfig = { responseMimeType: config.responseMimeType };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.error?.message || `Request failed (${response.status})`;
      throw new Error(`Gemini API ${response.status}: ${message}`);
    }
    const parts = result?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part: any) => part?.text || '').join('\n').trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callClaudeEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  const apiKey = env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY secret is not configured in Cloudflare Pages.');

  const messages: any[] = [];
  const systemParts: string[] = [config?.systemInstruction || ''];
  if (typeof prompt === 'string') {
    messages.push({ role: 'user', content: prompt });
  } else {
    for (const item of Array.isArray(prompt) ? prompt : []) {
      const role = item?.role === 'model' || item?.role === 'assistant' ? 'assistant' : item?.role;
      const content = Array.isArray(item?.parts)
        ? item.parts.map((part: any) => part?.text || '').join('\n')
        : item?.content || '';
      if (!content) continue;
      if (role === 'system') systemParts.push(content);
      else if (role === 'user' || role === 'assistant') messages.push({ role, content });
    }
  }
  if (!messages.length) throw new Error('No valid messages were provided to Claude.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || 'claude-3-5-haiku-latest',
        max_tokens: 4096,
        system: systemParts.filter(Boolean).join('\n\n') || undefined,
        messages,
      }),
      signal: controller.signal,
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Claude API ${response.status}: ${result?.error?.message || 'Request failed'}`);
    const text = (result?.content || []).filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('\n').trim();
    if (!text) throw new Error('Claude returned an empty response.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// Existing endpoints call this stable function name. Provider selection is explicit;
// Gemini remains the default so Claude is never used or billed unless deliberately configured.
export async function callAIProviderEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  if (env.AI_PROVIDER === 'claude') return callClaudeEdge(prompt, env, config);
  return callGeminiDirect(prompt, env, config);
}

// Backward-compatible name used by all existing AI endpoints.
export async function callGeminiEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  return callAIProviderEdge(prompt, env, config);
}
