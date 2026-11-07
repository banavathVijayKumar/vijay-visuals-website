// Cloudflare Pages Functions - Shared AI Utilities & Quota Management
// Compatible with Cloudflare Workers / Edge V8 Runtime (Zero Node dependencies)

export interface CloudflareEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_GENAI_API_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  [key: string]: any;
}

export interface TenantUsage {
  requestsCount: number;
  dailyLimit: number;
  lastReset: string;
}

// In-memory tenant store for Cloudflare Workers isolate lifetime
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
  return { allowed: true, remaining: tenant.dailyLimit - tenant.requestsCount, limit: tenant.dailyLimit };
}

// Standard CORS and JSON response helper
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

// Helper to safely extract JSON from model outputs
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

// User-friendly error message formatter
export function formatAiError(error: any): string {
  if (!error) return 'AI service temporarily unavailable. Please try again.';
  const msg = typeof error === 'string' ? error : error.message || '';
  if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'Gemini AI is currently experiencing high demand. Please try again in a few moments.';
  }
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'AI request limit reached. Please wait or request a quota increase from admin.';
  }
  return msg || 'AI generation encountered an unexpected error.';
}

// Cloudflare Edge-native Gemini REST Caller (Multi-model fallback & timeout)
export async function callGeminiEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY secret is not configured in Cloudflare Pages Environment Variables.');
  }

  // Model fallback chain supported in Gemini API
  const models = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of models) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000);

    try {
      // Build Google Gemini REST payload
      const payload: any = {};

      if (config?.systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: config.systemInstruction }],
        };
      }

      if (typeof prompt === 'string') {
        payload.contents = [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ];
      } else if (Array.isArray(prompt)) {
        payload.contents = prompt;
      }

      if (config?.responseMimeType) {
        payload.generationConfig = {
          responseMimeType: config.responseMimeType,
        };
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'aistudio-build-cloudflare',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google API ${res.status}: ${errorText}`);
      }

      const resJson: any = await res.json();
      const candidateText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return candidateText;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err;
      console.warn(`[Cloudflare Edge Model ${model}] failed or timed out:`, err?.message || err);
    }
  }

  throw lastError;
}
