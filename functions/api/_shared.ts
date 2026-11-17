
// Cloudflare Pages Functions - Shared AI Utilities & Quota Management
// OpenAI API - Cloudflare Workers compatible

export interface CloudflareEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  [key: string]: any;
}

export interface TenantUsage {
  requestsCount: number;
  dailyLimit: number;
  lastReset: string;
}

export const edgeUsageStore: Record<string, TenantUsage> = {
  'default-tenant': { requestsCount: 3, dailyLimit: 50, lastReset: new Date().toISOString() },
  'biz-01': { requestsCount: 8, dailyLimit: 100, lastReset: new Date().toISOString() },
  'biz-02': { requestsCount: 5, dailyLimit: 50, lastReset: new Date().toISOString() },
};

export function checkAndIncrementQuota(tenantId: string = 'default-tenant'): { allowed: boolean; remaining: number; limit: number } {
  const today = new Date().toISOString().split('T')[0];

  if (!edgeUsageStore[tenantId]) {
    edgeUsageStore[tenantId] = { requestsCount: 0, dailyLimit: 50, lastReset: today };
  } else if (!edgeUsageStore[tenantId].lastReset.startsWith(today)) {
    edgeUsageStore[tenantId].requestsCount = 0;
    edgeUsageStore[tenantId].lastReset = today;
  }

  const tenant = edgeUsageStore[tenantId];

  if (tenant.requestsCount >= tenant.dailyLimit) {
    return { allowed: false, remaining: 0, limit: tenant.dailyLimit };
  }

  tenant.requestsCount += 1;

  return {
    allowed: true,
    remaining: tenant.dailyLimit - tenant.requestsCount,
    limit: tenant.dailyLimit
  };
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

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (inner) {
        console.error('Safe JSON extraction failed on Edge:', inner);
      }
    }

    return {};
  }
}

export function formatAiError(error: any): string {
  if (!error) return 'AI service temporarily unavailable. Please try again.';

  const msg = typeof error === 'string' ? error : error.message || '';

  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'OpenAI service is temporarily unavailable. Please try again shortly.';
  }

  if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.includes('rate_limit')) {
    return 'AI request limit reached. Please wait and try again.';
  }

  return msg || 'AI generation encountered an unexpected error.';
}

export async function callOpenAIEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY secret is not configured in Cloudflare Pages.');
  }

  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages: any[] = [];

  if (config?.systemInstruction) {
    messages.push({ role: 'system', content: config.systemInstruction });
  }

  if (typeof prompt === 'string') {
    messages.push({ role: 'user', content: prompt });
  } else if (Array.isArray(prompt)) {
    for (const item of prompt) {
      const role = item?.role === 'model' ? 'assistant' : item?.role;

      const content = Array.isArray(item?.parts)
        ? item.parts.map((part: any) => part?.text || '').join('\n')
        : item?.content || '';

      if ((role === 'user' || role === 'assistant' || role === 'system') && content) {
        messages.push({ role, content });
      }
    }
  }

  if (messages.length === 0) {
    throw new Error('No valid messages were provided to OpenAI.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const payload: any = { model, messages };

    if (config?.responseMimeType === 'application/json') {
      payload.response_format = { type: 'json_object' };
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result: any = await res.json();

    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}: ${result?.error?.message || 'Request failed'}`);
    }

    const text = result?.choices?.[0]?.message?.content;

    if (typeof text !== 'string' || !text) {
      throw new Error('OpenAI returned an empty response.');
    }

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Keep existing AI endpoint imports working
export const callGeminiEdge = callOpenAIEdge;
