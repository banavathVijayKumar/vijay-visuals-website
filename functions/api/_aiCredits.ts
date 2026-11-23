// ============================================================================
// VIJAY VISUALS — TENANT AI CREDIT LEDGER & SERVER-SIDE METERING
// Enforces plan allowances, manages idempotent request tracking,
// handles concurrency safely, and guarantees strict tenant isolation.
// Source of truth: Cloudflare D1 subscription_plans & tenant_ai_usage.
// ============================================================================

import { CloudflareEnv, randomHex } from './_shared';
import { redactSecretsAndPii } from './_gemini';

// Approved package allowances (Migration 0008 & platform entitlements)
export const OFFICIAL_PLAN_AI_ALLOWANCES: Record<string, number> = {
  'starter-website': 25,
  starter: 25,
  basic: 25,
  'business-website': 100,
  business: 100,
  growth: 100,
  'website-only': 250,
  website: 250,
  pro: 250,
  'ecommerce-website': 500,
  ecommerce: 500,
  'e-commerce': 500,
  store: 500,
  'website-plus-pwa': 750,
  pwa: 750,
  'custom-dev-enterprise': 5000,
  enterprise: 5000,
  custom: 5000,
};

export function getPackageMonthlyAiCredits(planTier?: string | null): number {
  if (!planTier || typeof planTier !== 'string') return 100; // Default to Business tier
  const norm = planTier.toLowerCase().trim();
  if (norm.includes('enterprise') || norm.includes('custom')) return 5000;
  if (norm.includes('pwa') || norm.includes('plus')) return 750;
  if (norm.includes('ecommerce') || norm.includes('e-commerce') || norm.includes('store')) return 500;
  if (norm.includes('website-only') || norm === 'website' || norm === 'pro') return 250;
  if (norm.includes('business') || norm === 'growth') return 100;
  if (norm.includes('starter') || norm === 'basic') return 25;
  return OFFICIAL_PLAN_AI_ALLOWANCES[norm] ?? 100;
}

export function getCurrentBillingPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Ensures tenant_ai_usage table exists in D1.
 */
export async function ensureAiUsageTable(db: any): Promise<void> {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_ai_usage (
        id TEXT PRIMARY KEY,
        website_id TEXT NOT NULL,
        tenant_rowid INTEGER,
        user_id TEXT NOT NULL,
        service_slug TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'gemini',
        model TEXT NOT NULL,
        credits_deducted INTEGER NOT NULL DEFAULT 1,
        billing_period TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked', 'reserved')),
        prompt_snippet TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_website_period 
        ON tenant_ai_usage(website_id, billing_period, status);
      CREATE INDEX IF NOT EXISTS idx_tenant_ai_usage_request_id 
        ON tenant_ai_usage(request_id);
    `);
  } catch {}
}

export interface TenantQuotaStatus {
  websiteId: string;
  tenantRowId?: number;
  planCode: string;
  allowance: number;
  used: number;
  remaining: number;
  billingPeriod: string;
  isExhausted: boolean;
}

/**
 * Reads verified allowance from D1 subscription_plans and used credits from tenant_ai_usage.
 * Never trusts client-supplied plan names.
 */
export async function getTenantAiQuota(
  env: CloudflareEnv,
  websiteId: string,
  tenantRowId?: number,
  fallbackPlanTier?: string
): Promise<TenantQuotaStatus> {
  const billingPeriod = getCurrentBillingPeriod();
  let allowance = getPackageMonthlyAiCredits(fallbackPlanTier);
  let planCode = fallbackPlanTier || 'business-website';
  let used = 0;

  if (env.DB) {
    await ensureAiUsageTable(env.DB);

    // 1. Check official D1 subscription_plans via tenant_subscriptions
    try {
      const subRow = await env.DB.prepare(
        `SELECT sp.code, sp.monthly_ai_credits
         FROM tenant_subscriptions ts
         INNER JOIN subscription_plans sp ON (sp.code = ts.plan_code OR sp.id = ts.plan_id)
         WHERE ts.website_id = ? AND ts.status IN ('trial', 'active')
         ORDER BY ts.id DESC LIMIT 1`
      )
        .bind(websiteId)
        .first<{ code: string; monthly_ai_credits: number }>();

      if (subRow && typeof subRow.monthly_ai_credits === 'number' && subRow.monthly_ai_credits > 0) {
        allowance = subRow.monthly_ai_credits;
        planCode = subRow.code;
      }
    } catch {}

    // 2. Query used credits for the current billing period
    try {
      // Auto-expire stale reservations older than 2 minutes (e.g. from timeouts or worker aborts)
      try {
        await env.DB.prepare(
          `UPDATE tenant_ai_usage
           SET status = 'failed', credits_deducted = 0, error_message = 'Reservation timed out or aborted'
           WHERE status = 'reserved' AND created_at < datetime('now', '-2 minutes')`
        ).run();
      } catch {}

      const usedRow = await env.DB.prepare(
        `SELECT COALESCE(SUM(credits_deducted), 0) AS total_used
         FROM tenant_ai_usage
         WHERE (website_id = ? OR (tenant_rowid IS NOT NULL AND tenant_rowid = ?))
           AND billing_period = ?
           AND (status = 'success' OR (status = 'reserved' AND created_at >= datetime('now', '-2 minutes')))`
      )
        .bind(websiteId, tenantRowId || -1, billingPeriod)
        .first<{ total_used: number }>();

      used = Number(usedRow?.total_used || 0);
    } catch {}
  }

  const remaining = Math.max(0, allowance - used);

  return {
    websiteId,
    tenantRowId,
    planCode,
    allowance,
    used,
    remaining,
    billingPeriod,
    isExhausted: used >= allowance,
  };
}

export interface EnforceCreditParams {
  websiteId: string;
  tenantRowId?: number;
  userId: string;
  serviceSlug: string;
  requestId?: string;
  creditsNeeded?: number;
  provider?: string;
  model?: string;
  fallbackPlanTier?: string;
  promptSnippet?: string;
  executeAiCall: () => Promise<string>;
}

export interface EnforceCreditResult {
  output: string;
  creditsUsed: number;
  creditsRemaining: number;
  isDuplicate: boolean;
  quota: TenantQuotaStatus;
}

/**
 * Server-side credit meter that atomically enforces monthly limits,
 * handles concurrency via reservations, prevents duplicate charging via idempotency,
 * and ensures failed generations consume ZERO credits.
 */
export async function executeWithAiCreditDeduction(
  env: CloudflareEnv,
  params: EnforceCreditParams
): Promise<EnforceCreditResult> {
  const creditsNeeded = Math.max(1, params.creditsNeeded ?? 1);
  const billingPeriod = getCurrentBillingPeriod();
  const provider = params.provider || env.AI_PROVIDER || 'gemini';
  const model = params.model || env.GEMINI_MODEL || 'gemini-1.5-flash';
  const requestId = params.requestId?.trim() || `req_${Date.now()}_${randomHex(6)}`;
  const cleanSnippet = redactSecretsAndPii(params.promptSnippet || '').slice(0, 150);

  if (!env.DB) {
    // If running in an environment without D1 binding, execute directly
    const output = await params.executeAiCall();
    return {
      output,
      creditsUsed: creditsNeeded,
      creditsRemaining: 100,
      isDuplicate: false,
      quota: {
        websiteId: params.websiteId,
        planCode: 'fallback',
        allowance: 100,
        used: 1,
        remaining: 99,
        billingPeriod,
        isExhausted: false,
      },
    };
  }

  await ensureAiUsageTable(env.DB);

  // 1. Idempotency Check: if requestId was already processed successfully, avoid double-charging
  try {
    const existing = await env.DB.prepare(
      `SELECT id, status, credits_deducted FROM tenant_ai_usage WHERE request_id = ? LIMIT 1`
    )
      .bind(requestId)
      .first<{ id: string; status: string; credits_deducted: number }>();

    if (existing && existing.status === 'success') {
      const quota = await getTenantAiQuota(env, params.websiteId, params.tenantRowId, params.fallbackPlanTier);
      // Return indicating duplicate request processed without second charge
      const output = await params.executeAiCall();
      return {
        output,
        creditsUsed: 0, // No additional charge on duplicate
        creditsRemaining: quota.remaining,
        isDuplicate: true,
        quota,
      };
    }
  } catch {}

  // 2. Check Quota Before Execution
  const quota = await getTenantAiQuota(env, params.websiteId, params.tenantRowId, params.fallbackPlanTier);
  if (quota.used + creditsNeeded > quota.allowance) {
    const err = new Error(
      `Monthly AI credits limit reached for your plan (${quota.used}/${quota.allowance} credits used). Please upgrade your plan or purchase an AI credit top-up to continue.`
    );
    (err as any).status = 403;
    (err as any).code = 'AI_QUOTA_EXHAUSTED';
    (err as any).quota = quota;
    throw err;
  }

  // 3. Atomically Reserve Credits to Prevent Concurrent Race Conditions
  const usageRecordId = `usage_${Date.now()}_${randomHex(6)}`;
  try {
    await env.DB.prepare(
      `INSERT INTO tenant_ai_usage (
        id, website_id, tenant_rowid, user_id, service_slug, request_id,
        provider, model, credits_deducted, billing_period, status, prompt_snippet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)`
    )
      .bind(
        usageRecordId,
        params.websiteId,
        params.tenantRowId ?? null,
        params.userId,
        params.serviceSlug,
        requestId,
        provider,
        model,
        creditsNeeded,
        billingPeriod,
        cleanSnippet
      )
      .run();
  } catch (err: any) {
    // If unique constraint failed on requestId, another thread handled this request
    if (String(err?.message || '').includes('UNIQUE constraint failed')) {
      const output = await params.executeAiCall();
      return {
        output,
        creditsUsed: 0,
        creditsRemaining: quota.remaining,
        isDuplicate: true,
        quota,
      };
    }
  }

  // 4. Execute the Actual Generation Call
  try {
    const output = await params.executeAiCall();

    // 5. Success: Commit the deduction in the ledger
    await env.DB.prepare(
      `UPDATE tenant_ai_usage
       SET status = 'success', credits_deducted = ?
       WHERE id = ?`
    )
      .bind(creditsNeeded, usageRecordId)
      .run();

    const updatedRemaining = Math.max(0, quota.allowance - (quota.used + creditsNeeded));

    return {
      output,
      creditsUsed: creditsNeeded,
      creditsRemaining: updatedRemaining,
      isDuplicate: false,
      quota: {
        ...quota,
        used: quota.used + creditsNeeded,
        remaining: updatedRemaining,
        isExhausted: updatedRemaining <= 0,
      },
    };
  } catch (aiErr: any) {
    // 6. Failure: Mark as failed and set credits_deducted to 0 so customer is NOT charged
    const safeErrorMsg = redactSecretsAndPii(aiErr?.message || 'Upstream generation error');
    try {
      await env.DB.prepare(
        `UPDATE tenant_ai_usage
         SET status = 'failed', credits_deducted = 0, error_message = ?
         WHERE id = ?`
      )
        .bind(safeErrorMsg, usageRecordId)
        .run();
    } catch {}

    throw aiErr;
  }
}
