// ============================================================================
// VIJAY VISUALS — UNIFIED CLOUDFLARE PAGES FUNCTIONS SHARED EDGE UTILITIES
// Preserves 100% of existing GitHub AI/Marketplace/Sites helpers AND all new
// Multi-Tenant Domain, Payment, Commerce, Global FX & SEO platform utilities.
// 100% Web-Standard Edge Runtime (NO Node.js Express, NO Node fs/dns/tls).
// ============================================================================

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: D1Meta;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = any>(colName?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[]; success: boolean; meta?: D1Meta }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export type D1PreparedStatement = D1Statement;

export interface D1Database {
  prepare(query: string): D1Statement;
  batch?(statements: D1Statement[]): Promise<any[]>;
  exec?(query: string): Promise<unknown>;
}

export interface CloudflareEnv {
  DB?: D1Database;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  AI_PROVIDER?: 'gemini' | 'claude';
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  APP_URL?: string;
  CUSTOM_DOMAIN_CNAME_TARGET?: string;
  PLATFORM_HOSTNAMES?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RAZORPAY_LIVE_APPROVED?: string;
  RAZORPAY_ROUTE_ENABLED?: string;
  CASHFREE_ENV?: string;
  CASHFREE_CLIENT_ID?: string;
  CASHFREE_CLIENT_SECRET?: string;
  CASHFREE_API_VERSION?: string;
  CASHFREE_WEBHOOK_SECRET?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_PAGES_PROJECT?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_SAAS_FALLBACK_ORIGIN?: string;
  CRON_SECRET?: string;
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  WHATSAPP_CLOUD_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  SMS_PROVIDER_API_KEY?: string;
  DOMAIN_REGISTRAR_PROVIDER?: string;
  DOMAIN_REGISTRAR_API_KEY?: string;
  GSC_OAUTH_CLIENT_ID?: string;
  GOOGLE_MAPS_API_KEY?: string;
  VITE_GOOGLE_MAPS_API_KEY?: string;
  SHIPROCKET_TOKEN?: string;
  SHIPROCKET_EMAIL?: string;
  SHIPROCKET_PASSWORD?: string;
  [key: string]: any;
}

export interface PagesContext<P extends Record<string, string> = Record<string, string>> {
  request: Request;
  env: CloudflareEnv;
  params: P;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const DEFAULT_CNAME_TARGET = 'vijay-visuals-site.pages.dev';

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
      ...(extraHeaders || {}),
    },
  });
}

export function errorJson(error: string, status = 400, extra?: Record<string, unknown>): Response {
  return json({ error, ...(extra || {}) }, status);
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      ...SECURITY_HEADERS,
    },
  });
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function parseJsonBody<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return {} as T;
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed as T;
    return null;
  } catch {
    return null;
  }
}

export function requireDb(env: CloudflareEnv): D1Database {
  if (!env.DB) {
    throw new Error('Cloudflare D1 database binding (DB) is not configured.');
  }
  return env.DB;
}

export function getCnameTarget(env: CloudflareEnv): string {
  return (env.CUSTOM_DOMAIN_CNAME_TARGET || DEFAULT_CNAME_TARGET).trim().toLowerCase();
}

export function isPlatformHostname(hostname: string, env?: CloudflareEnv): boolean {
  const host = (hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host === 'vijay-visuals-site.pages.dev' || host.endsWith('.vijay-visuals-site.pages.dev')) {
    return true;
  }
  if (host.endsWith('.run.app')) return true;

  const extra = (env?.PLATFORM_HOSTNAMES || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(host);
}

export function sanitizeText(value: unknown, maxLength = 500): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function toSlug(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(slug) && !slug.includes('--');
}

export function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function safeEqual(a: string, b: string): boolean {
  const strA = String(a || '');
  const strB = String(b || '');
  const len = Math.max(strA.length, strB.length);
  let diff = strA.length ^ strB.length;
  for (let i = 0; i < len; i++) {
    diff |= (strA.charCodeAt(i) || 0) ^ (strB.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function checkRateLimit(
  env: CloudflareEnv,
  scopeKey: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  if (!env.DB) {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSeconds) * windowSeconds;
  const retryAfterSeconds = Math.max(1, windowStart + windowSeconds - nowSec);

  try {
    const existing = await env.DB.prepare(
      'SELECT window_start, hit_count FROM api_rate_limits WHERE rate_key = ?'
    )
      .bind(scopeKey)
      .first<{ window_start: number; hit_count: number }>();

    if (!existing || existing.window_start !== windowStart) {
      await env.DB.prepare(
        `INSERT INTO api_rate_limits (rate_key, window_start, hit_count, updated_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(rate_key) DO UPDATE SET window_start = excluded.window_start, hit_count = 1, updated_at = datetime('now')`
      )
        .bind(scopeKey, windowStart)
        .run();
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds };
    }

    if (existing.hit_count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    const nextCount = existing.hit_count + 1;
    await env.DB.prepare(
      `UPDATE api_rate_limits SET hit_count = ?, updated_at = datetime('now') WHERE rate_key = ?`
    )
      .bind(nextCount, scopeKey)
      .run();

    return { allowed: true, remaining: Math.max(0, limit - nextCount), retryAfterSeconds };
  } catch {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export async function writeAuditLog(
  env: CloudflareEnv,
  entry: {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO vv_audit_log (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        `aud_${randomHex(10)}`,
        entry.actorId,
        entry.action,
        entry.targetType,
        entry.targetId,
        JSON.stringify({ ...(entry.details || {}), actorRole: entry.actorRole })
      )
      .run();
  } catch {
    // Non-fatal if legacy vv_audit_log schema columns differ
  }
}

export function getNotificationChannelStatus(env: CloudflareEnv): {
  in_app: 'delivered';
  email: 'configured' | 'setup_required_smtp';
  whatsapp: 'configured' | 'setup_required_whatsapp';
  sms: 'configured' | 'setup_required_sms';
} {
  return {
    in_app: 'delivered',
    email: env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS ? 'configured' : 'setup_required_smtp',
    whatsapp:
      env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
        ? 'configured'
        : 'setup_required_whatsapp',
    sms: env.SMS_PROVIDER_API_KEY ? 'configured' : 'setup_required_sms',
  };
}

// ============================================================================
// PRESERVED EXISTING GITHUB AI / MARKETPLACE / SITES EDGE HELPERS
// ============================================================================

export interface TenantUsage {
  requestsCount: number;
  dailyLimit: number;
  lastReset: string;
}

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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    return {};
  }
}

import {
  callGeminiWithFallback,
  redactSecretsAndPii,
  inspectGeminiModelAvailability,
} from './_gemini';

export { redactSecretsAndPii, inspectGeminiModelAvailability };

export function formatAiError(error: any): string {
  const rawMsg = typeof error === 'string' ? error : error?.message || '';
  const msg = redactSecretsAndPii(rawMsg);
  if (!msg) return 'AI service temporarily unavailable. Please try again.';
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return `AI service is temporarily busy. (Upstream: ${msg})`;
  }
  if (/429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg)) {
    return `AI generation quota/rate limit reached. (Upstream: ${msg})`;
  }
  if (/API key.*not configured/i.test(msg)) {
    return 'Integration Required: GEMINI_API_KEY secret is not configured in Cloudflare Pages.';
  }
  if (/API key|authentication|unauthorized|401|403/i.test(msg)) {
    return `AI provider authentication failed. (Upstream: ${msg})`;
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
  const result = await callGeminiWithFallback(prompt, env, config);
  return result.text;
}

export async function callClaudeEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  const apiKey = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY;
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
    const text = (result?.content || [])
      .filter((part: any) => part?.type === 'text')
      .map((part: any) => part.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('Claude returned an empty response.');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callAIProviderEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  if (env.AI_PROVIDER === 'claude') return callClaudeEdge(prompt, env, config);
  return callGeminiDirect(prompt, env, config);
}

export async function callGeminiEdge(
  prompt: string | any[],
  env: CloudflareEnv,
  config?: { responseMimeType?: string; systemInstruction?: string }
): Promise<string> {
  return callAIProviderEdge(prompt, env, config);
}
