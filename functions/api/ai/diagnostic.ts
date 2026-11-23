// ============================================================================
// GET /api/ai/diagnostic — Safe Live Gemini Model & Connectivity Inspection
// Verifies model availability against Google Generative Language Developer API
// with preview credentials. ZERO secrets, keys, or customer PII are revealed.
// ============================================================================

import {
  PagesContext,
  handleOptions,
  jsonResponse,
} from '../_shared';
import { inspectGeminiModelAvailability } from '../_gemini';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  const inspection = await inspectGeminiModelAvailability(env);

  return jsonResponse({
    status: inspection.testGeneration.success ? 'healthy' : 'degraded',
    provider: env.AI_PROVIDER || 'gemini',
    hasGeminiKey: inspection.hasKey,
    hasClaudeKey: Boolean(env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY),
    googleApiHttpStatus: inspection.httpStatus,
    configuredCandidateModel: inspection.testedCandidate,
    testGenerationResult: inspection.testGeneration,
    supportedModelsSummary: {
      totalSupportedModelsCount: inspection.supportedModels.length,
      sampleSupportedModels: inspection.supportedModels.slice(0, 10),
    },
    timestamp: new Date().toISOString(),
  });
}
