// ============================================================================
// VIJAY VISUALS — UNIFIED SERVER-SIDE GEMINI AI CLIENT
// Provides verified model discovery, safe secrets redaction, upstream error
// transparency, and automatic dynamic fallback across Gemini model families.
// NEVER exposes API keys, tokens, customer PII, or prompt contents.
// ============================================================================

import { CloudflareEnv } from './_shared';

// Edge-scoped memory cache for discovered working model
let cachedWorkingModel: string | null = null;
let lastModelCheckTime = 0;
const MODEL_CACHE_TTL_MS = 300_000; // 5 minutes

// In-memory set of models confirmed to have quota limit 0 (avoid repeated retries)
const zeroQuotaModels = new Set<string>();

export function redactSecretsAndPii(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    // API keys & tokens
    .replace(/AIza[0-9A-Za-z-_]{30,45}/g, '[REDACTED_GEMINI_KEY]')
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/(?:key|token|secret|password|auth|authorization)=([^\s&"'`]+)/gi, '$1=[REDACTED]')
    .replace(/x-goog-api-key:\s*[^\s]+/gi, 'x-goog-api-key: [REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    // Email addresses
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
    // Phone numbers (10 digits Indian or international)
    .replace(/(?:\+91|0)?[6-9]\d{9}/g, '[REDACTED_PHONE]');
}

export function normalizeGeminiContents(prompt: string | any[]): {
  contents: any[];
  systemText: string;
} {
  if (typeof prompt === 'string') {
    return { contents: [{ role: 'user', parts: [{ text: prompt }] }], systemText: '' };
  }
  const contents: any[] = [];
  const systemParts: string[] = [];
  for (const item of Array.isArray(prompt) ? prompt : []) {
    const rawRole = item?.role;
    const role = rawRole === 'assistant' ? 'model' : rawRole;
    const parts = Array.isArray(item?.parts)
      ? item.parts
          .filter((p: any) => typeof p?.text === 'string' && p.text.trim())
          .map((p: any) => ({ text: p.text }))
      : typeof item?.content === 'string' && item.content.trim()
      ? [{ text: item.content }]
      : [];
    if (!parts.length) continue;
    if (role === 'system') systemParts.push(parts.map((p: any) => p.text).join('\n'));
    else if (role === 'user' || role === 'model') contents.push({ role, parts });
  }
  return { contents, systemText: systemParts.join('\n\n') };
}

export async function inspectGeminiModelAvailability(env: CloudflareEnv): Promise<{
  hasKey: boolean;
  httpStatus: number;
  supportedModels: string[];
  testedCandidate: string;
  testGeneration: { success: boolean; modelUsed?: string; errorSnippet?: string };
}> {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    return {
      hasKey: false,
      httpStatus: 0,
      supportedModels: [],
      testedCandidate: env.GEMINI_MODEL || 'gemini-2.5-flash',
      testGeneration: { success: false, errorSnippet: 'GEMINI_API_KEY is not configured.' },
    };
  }

  let httpStatus = 0;
  const supportedModels: string[] = [];
  try {
    const listRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
    });
    httpStatus = listRes.status;
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

  const candidate = env.GEMINI_MODEL || (supportedModels[0] ? supportedModels[0].replace(/^models\//, '') : 'gemini-2.5-flash');
  let testSuccess = false;
  let modelUsed: string | undefined;
  let errorSnippet: string | undefined;

  try {
    const genRes = await callGeminiWithFallback('Test heartbeat ping. Respond with: OK', env);
    testSuccess = true;
    modelUsed = genRes.modelUsed;
  } catch (err: any) {
    testSuccess = false;
    errorSnippet = redactSecretsAndPii(err?.message || 'Generation test failed');
  }

  return {
    hasKey: true,
    httpStatus,
    supportedModels,
    testedCandidate: candidate,
    testGeneration: {
      success: testSuccess,
      modelUsed,
      errorSnippet,
    },
  };
}

/**
 * Robust server-side Gemini execution with actual Google API response inspection,
 * dynamic model discovery, safe logging, and resilient fallback.
 * Skips zero-quota models and never retries known exhausted models.
 */
export async function callGeminiWithFallback(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<{ text: string; modelUsed: string; isFallback: boolean }> {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Integration Required: GEMINI_API_KEY (or GOOGLE_API_KEY) secret is not configured in Cloudflare Pages.');
  }

  const normalized = normalizeGeminiContents(prompt);
  if (!normalized.contents.length) {
    throw new Error('No valid prompt content provided to Gemini.');
  }

  const systemText = [config?.systemInstruction, normalized.systemText].filter(Boolean).join('\n\n');
  const payload: any = { contents: normalized.contents };
  if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
  if (config?.responseMimeType) payload.generationConfig = { responseMimeType: config.responseMimeType };

  const requestedModel = env.GEMINI_MODEL?.trim();
  const now = Date.now();
  const modelsToTry: string[] = [];

  // 1. Edge cached verified working model (if not marked zero quota)
  if (cachedWorkingModel && !zeroQuotaModels.has(cachedWorkingModel) && now - lastModelCheckTime < MODEL_CACHE_TTL_MS) {
    modelsToTry.push(cachedWorkingModel);
  }

  // 2. Explicitly configured model (if not marked zero quota)
  if (requestedModel && !zeroQuotaModels.has(requestedModel) && !modelsToTry.includes(requestedModel)) {
    modelsToTry.push(requestedModel);
  }

  // 3. Known stable Flash models (highest free-tier RPM & RPD)
  const flashCandidates = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-pro-latest',
    'gemini-2.5-pro',
  ];

  for (const m of flashCandidates) {
    if (!zeroQuotaModels.has(m) && !modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  // 4. Dynamic discovery from Google Developer API if cache is cold
  if (!cachedWorkingModel || now - lastModelCheckTime >= MODEL_CACHE_TTL_MS) {
    try {
      const listRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': apiKey },
      });
      if (listRes.ok) {
        const data: any = await listRes.json().catch(() => ({}));
        const models = Array.isArray(data?.models) ? data.models : [];
        for (const m of models) {
          if (
            Array.isArray(m?.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
          ) {
            const raw = String(m.name || '').replace(/^models\//, '');
            // Only add generation-capable flash/pro models, excluding TTS and specialized models
            if (raw && !raw.includes('tts') && !raw.includes('embedding') && !zeroQuotaModels.has(raw) && !modelsToTry.includes(raw)) {
              modelsToTry.push(raw);
            }
          }
        }
      }
    } catch {}
  }

  let lastError: Error | null = null;
  let attemptsCount = 0;

  for (const model of modelsToTry) {
    // Skip if dynamically added to zeroQuotaModels during this loop
    if (zeroQuotaModels.has(model)) continue;

    attemptsCount++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      const result: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const rawErrMsg = result?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        const safeErrMsg = redactSecretsAndPii(rawErrMsg);
        console.warn(`[Gemini Client] Model "${model}" failed (HTTP ${response.status}): ${safeErrMsg}`);

        // If 404 (Model not found) or 400 (Invalid model argument), proceed to next candidate
        if (response.status === 404 || response.status === 400) {
          lastError = new Error(`Google Gemini Model "${model}" is unavailable on v1beta API (HTTP ${response.status}: ${safeErrMsg})`);
          continue;
        }

        // If 429 with "limit: 0" (Model not permitted on Free Tier):
        // Record in zeroQuotaModels to prevent retrying, and continue to next candidate
        if (response.status === 429 && /limit:\s*0/i.test(safeErrMsg)) {
          zeroQuotaModels.add(model);
          lastError = new Error(`Google Gemini Model "${model}" has Free Tier quota limit 0. (HTTP 429: ${safeErrMsg})`);
          continue;
        }

        // For non-model errors (e.g. 401 invalid key, 403 permission), throw informative error
        if (response.status === 401 || response.status === 403) {
          throw new Error(`AI Provider Authentication Failed: Invalid or unauthorized GEMINI_API_KEY. (Google API ${response.status}: ${safeErrMsg})`);
        }

        // If general rate limit (RPM exceeded), try another candidate before failing completely
        if (response.status === 429) {
          lastError = new Error(`Google Gemini API rate/quota limit reached on model "${model}". (HTTP 429: ${safeErrMsg})`);
          continue;
        }

        if (response.status >= 500) {
          lastError = new Error(`Google Gemini API service temporarily unavailable on model "${model}". (HTTP ${response.status}: ${safeErrMsg})`);
          continue;
        }

        throw new Error(`Google Gemini API error ${response.status}: ${safeErrMsg}`);
      }

      // Successful response
      const parts = result?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((part: any) => part?.text || '').join('\n').trim();
      if (!text) {
        lastError = new Error(`Gemini model "${model}" returned an empty candidates payload.`);
        continue;
      }

      // Update edge cache with verified working model
      cachedWorkingModel = model;
      lastModelCheckTime = Date.now();

      return {
        text,
        modelUsed: model,
        isFallback: attemptsCount > 1,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = new Error(`Gemini request timed out after 25s for model "${model}".`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (/Authentication Failed/i.test(lastError.message)) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('All configured Google Gemini candidate models failed to generate content.');
}
