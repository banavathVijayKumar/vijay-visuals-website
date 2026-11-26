// ============================================================================
// GET /api/ai/diagnostic — Safe Live Gemini Model & Connectivity Inspection
// Verifies model availability and tests candidate generation individually
// against Google Generative Language Developer API with preview credentials.
// ZERO secrets, keys, or customer PII are revealed.
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  handleOptions,
  jsonResponse,
  rateLimitResponse,
} from '../_shared';
import { requirePlatformStaff } from '../_auth';
import { redactSecretsAndPii, callGeminiWithFallback } from '../_gemini';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requirePlatformStaff(request, env);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(env, `ai_diagnostic:${auth.user.id}`, 5, 3600);
  if (!rl.allowed) return rateLimitResponse(rl, 'AI diagnostic rate limit reached. Please try again later.');

  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;

  if (!apiKey) {
    return jsonResponse({
      status: 'unconfigured',
      hasGeminiKey: false,
      error: 'GEMINI_API_KEY is not configured in Cloudflare Pages Secrets.',
      timestamp: new Date().toISOString(),
    });
  }

  // 1. Fetch available models from Google API
  let listHttpStatus = 0;
  const supportedModels: string[] = [];
  try {
    const listRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
    });
    listHttpStatus = listRes.status;
    if (listRes.ok) {
      const data: any = await listRes.json().catch(() => ({}));
      for (const m of (data?.models || [])) {
        if (
          Array.isArray(m?.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent')
        ) {
          supportedModels.push(String(m.name || ''));
        }
      }
    }
  } catch {}

  // 2. Probe candidate models individually to observe exact status and quota limits
  const candidateModels = [
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-pro-latest',
    'gemini-2.5-pro',
  ];

  const probeResults: Array<{
    model: string;
    status: number;
    ok: boolean;
    hasQuotaLimitZero: boolean;
    errorSnippet?: string;
    sampleOutput?: string;
  }> = [];

  let workingModelFound: string | null = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: OK' }] }],
          }),
          signal: controller.signal,
        }
      );

      const json: any = await res.json().catch(() => ({}));
      const rawErrMsg = json?.error?.message || `HTTP ${res.status}`;
      const safeErrMsg = redactSecretsAndPii(rawErrMsg);
      const isLimitZero = res.status === 429 && /limit:\s*0/i.test(safeErrMsg);

      if (res.ok) {
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
        probeResults.push({
          model,
          status: res.status,
          ok: true,
          hasQuotaLimitZero: false,
          sampleOutput: text.trim().slice(0, 100),
        });
        if (!workingModelFound) workingModelFound = model;
      } else {
        probeResults.push({
          model,
          status: res.status,
          ok: false,
          hasQuotaLimitZero: isLimitZero,
          errorSnippet: safeErrMsg.slice(0, 250),
        });
      }
    } catch (err: any) {
      probeResults.push({
        model,
        status: 0,
        ok: false,
        hasQuotaLimitZero: false,
        errorSnippet: redactSecretsAndPii(err?.message || 'Probe request failed'),
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // 3. Test integrated fallback execution
  let overallGenerationTest: { success: boolean; modelUsed?: string; errorSnippet?: string } = {
    success: false,
  };

  try {
    const genRes = await callGeminiWithFallback('Test heartbeat ping. Respond with: OK', env);
    overallGenerationTest = {
      success: true,
      modelUsed: genRes.modelUsed,
    };
  } catch (err: any) {
    overallGenerationTest = {
      success: false,
      errorSnippet: redactSecretsAndPii(err?.message || 'Integrated fallback failed'),
    };
  }

  // 4. Verify D1 AI usage ledger table existence
  let d1LedgerReady = false;
  if (env.DB) {
    try {
      const checkRes = await env.DB.prepare(
        "SELECT count(name) AS tbl_count FROM sqlite_master WHERE type='table' AND name='tenant_ai_usage'"
      ).first<any>();
      d1LedgerReady = Number(checkRes?.tbl_count || 0) > 0;
    } catch {
      d1LedgerReady = false;
    }
  }

  return jsonResponse({
    status: overallGenerationTest.success ? 'healthy' : 'degraded',
    provider: env.AI_PROVIDER || 'gemini',
    hasGeminiKey: true,
    hasClaudeKey: Boolean(env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY),
    googleApiHttpStatus: listHttpStatus,
    configuredCandidateModel: env.GEMINI_MODEL || 'gemini-1.5-flash',
    workingModelFound,
    overallGenerationTest,
    candidateProbeResults: probeResults,
    d1LedgerReady,
    supportedModelsSummary: {
      totalSupportedModelsCount: supportedModels.length,
      sampleSupportedModels: supportedModels.slice(0, 10),
    },
    timestamp: new Date().toISOString(),
  });
}
