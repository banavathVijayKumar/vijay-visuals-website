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

/** Strict, length-bounded email validation shared by OTP and reset endpoints. */
export function isValidEmailAddress(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (value.length === 0 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export interface CloudflareEnv {
  DB?: D1Database;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  /** Server-only Preview provisioning credential. Never expose to browser code. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AI_PROVIDER?: 'gemini' | 'claude';
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  CLAUDE_API_KEY?: string;
  CLAUDE_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  APP_URL?: string;
  /** Comma-separated exact browser origins allowed for cross-origin API calls. */
  ALLOWED_CORS_ORIGINS?: string;
  /** Comma-separated exact application origins allowed for password reset callbacks. */
  PASSWORD_RESET_ALLOWED_ORIGINS?: string;
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
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  SENDGRID_API_KEY?: string;
  /** Comma-separated provider-verified domains eligible for tenant sender identities. */
  RESEND_VERIFIED_SENDER_DOMAINS?: string;
  /** Resend/Svix webhook signing secret (whsec_...) used to verify raw-body signatures. */
  RESEND_WEBHOOK_SECRET?: string;
  WHATSAPP_CLOUD_API_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** Explicitly configured, Meta-approved template used for enquiry notifications. */
  WHATSAPP_ENQUIRY_TEMPLATE_NAME?: string;
  /** Explicitly configured language code for the approved enquiry template. */
  WHATSAPP_ENQUIRY_TEMPLATE_LANGUAGE?: string;
  /** Required platform desk publication for anonymous StudioLanding enquiries. */
  PLATFORM_ENQUIRY_TENANT_SLUG?: string;
  /** Approved Meta template for business-initiated Cashfree payment receipts. */
  WHATSAPP_PAYMENT_TEMPLATE_NAME?: string;
  WHATSAPP_PAYMENT_TEMPLATE_LANGUAGE?: string;
  /** Meta app secret used to verify X-Hub-Signature-256 on WhatsApp webhook POSTs. */
  WHATSAPP_APP_SECRET?: string;
  /** Verify token configured in the Meta App Dashboard for WhatsApp webhook GET challenges. */
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;
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

/**
 * Exact browser origins allowed to make cross-origin API calls.
 * Pages-to-Pages requests are same-origin and do not require CORS headers.
 * Never derive this from an arbitrary request Origin.
 */
export const DEFAULT_ALLOWED_CORS_ORIGINS: readonly string[] = [
  'https://vijay-visuals-site.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Returns the exact CORS allowlist. Pages-to-Pages calls are same-origin and do
 * not need CORS; only explicitly configured browser origins are reflected.
 */
export function getAllowedCorsOrigins(env?: CloudflareEnv): string[] {
  const configured = [
    ...DEFAULT_ALLOWED_CORS_ORIGINS,
    ...(env?.ALLOWED_CORS_ORIGINS || '').split(','),
    env?.APP_URL || '',
  ];
  const origins = new Set<string>();
  for (const value of configured) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed || trimmed === 'null') continue;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed configuration instead of broadening the allowlist.
    }
  }
  return [...origins];
}

export function isAllowedCorsOrigin(origin: string | null | undefined, env?: CloudflareEnv): boolean {
  if (!origin || origin === 'null') return false;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return getAllowedCorsOrigins(env).includes(normalized);
}

/**
 * Normalizes every /api/* response: only an exact allowlisted Origin is
 * reflected, and any upstream/platform wildcard is removed first. This also
 * covers Pages-generated responses such as 404/405, which otherwise emit
 * `Access-Control-Allow-Origin: *`.
 */
export function applyCorsHeaders(request: Request, response: Response, env?: CloudflareEnv): Response {
  const origin = request.headers.get('Origin');
  const headers = new Headers(response.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');

  const vary = headers
    .get('Vary')
    ?.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean) || [];
  if (!vary.includes('origin')) vary.push('origin');
  headers.set('Vary', vary.join(', '));

  if (isAllowedCorsOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', String(origin));
    headers.set('Access-Control-Allow-Methods', CORS_HEADERS['Access-Control-Allow-Methods']);
    headers.set('Access-Control-Allow-Headers', CORS_HEADERS['Access-Control-Allow-Headers']);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Restrictive but application-compatible CSP. Allows only the external origins
 * actually used by the platform (fonts, Cashfree SDK/API, Supabase and Maps)
 * while keeping tenant-owned images on arbitrary HTTPS hosts.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://sdk.cashfree.com https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://sdk.cashfree.com https://api.cashfree.com https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://sdk.cashfree.com https://maps.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Cache-Control': 'no-store',
};

/** Matches the Express JSON limit so edge and legacy runtimes stay compatible. */
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

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

/** Reads a request body with both declared and actual byte limits. */
export async function readBoundedText(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<string | null> {
  try {
    const declaredLength = Number(request.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return null;
    return text;
  } catch {
    return null;
  }
}

export async function parseJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES
): Promise<T | null> {
  const text = await readBoundedText(request, maxBytes);
  if (text === null) return null;
  try {
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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  /** True when the durable limiter could not be evaluated. Callers must fail closed. */
  unavailable?: boolean;
}

function rateLimitUnavailable(): RateLimitResult {
  return { allowed: false, remaining: 0, retryAfterSeconds: 0, unavailable: true };
}

export async function checkRateLimit(
  env: CloudflareEnv,
  scopeKey: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!env.DB) {
    return rateLimitUnavailable();
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / windowSeconds) * windowSeconds;
  const retryAfterSeconds = Math.max(1, windowStart + windowSeconds - nowSec);

  try {
    // Atomic increment: only an active window that has allowance is advanced.
    // Concurrent callers cannot both read the same stale count and over-issue.
    const bumped = await env.DB.prepare(
      `UPDATE api_rate_limits
       SET hit_count = hit_count + 1, updated_at = datetime('now')
       WHERE rate_key = ? AND window_start = ? AND hit_count < ?`
    )
      .bind(scopeKey, windowStart, limit)
      .run();

    if ((bumped.meta?.changes || 0) > 0) {
      const current = await env.DB.prepare(
        'SELECT hit_count FROM api_rate_limits WHERE rate_key = ? AND window_start = ?'
      )
        .bind(scopeKey, windowStart)
        .first<{ hit_count: number }>();
      const used = Math.max(1, Number(current?.hit_count || 1));
      return { allowed: true, remaining: Math.max(0, limit - used), retryAfterSeconds };
    }

    // First request in this window: INSERT OR IGNORE is an atomic claim.
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO api_rate_limits (rate_key, window_start, hit_count, updated_at)
       VALUES (?, ?, 1, datetime('now'))`
    )
      .bind(scopeKey, windowStart)
      .run();

    if ((inserted.meta?.changes || 0) > 0) {
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds };
    }

    // Another concurrent caller created the row between our first bump and the
    // INSERT. Retry the atomic increment so both legitimate first hits count.
    const bumpedAfterInsert = await env.DB.prepare(
      `UPDATE api_rate_limits
       SET hit_count = hit_count + 1, updated_at = datetime('now')
       WHERE rate_key = ? AND window_start = ? AND hit_count < ?`
    )
      .bind(scopeKey, windowStart, limit)
      .run();

    if ((bumpedAfterInsert.meta?.changes || 0) > 0) {
      const current = await env.DB.prepare(
        'SELECT hit_count FROM api_rate_limits WHERE rate_key = ? AND window_start = ?'
      )
        .bind(scopeKey, windowStart)
        .first<{ hit_count: number }>();
      const used = Math.max(1, Number(current?.hit_count || 1));
      return { allowed: true, remaining: Math.max(0, limit - used), retryAfterSeconds };
    }

    // A stale window can be reset atomically. An active window at its limit
    // matches none of these writes and is therefore blocked.
    const reset = await env.DB.prepare(
      `UPDATE api_rate_limits
       SET window_start = ?, hit_count = 1, updated_at = datetime('now')
       WHERE rate_key = ? AND window_start < ?`
    )
      .bind(windowStart, scopeKey, windowStart)
      .run();

    if ((reset.meta?.changes || 0) > 0) {
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds };
    }

    return { allowed: false, remaining: 0, retryAfterSeconds };
  } catch {
    return rateLimitUnavailable();
  }
}

/** Standard fail-closed response for callers of checkRateLimit(). */
export function rateLimitResponse(rl: RateLimitResult, message: string): Response {
  if (rl.unavailable) {
    return jsonResponse(
      {
        error: 'Rate limiting is temporarily unavailable. Please try again later.',
        code: 'RATE_LIMIT_UNAVAILABLE',
      },
      503
    );
  }
  const headers: Record<string, string> = {};
  if (rl.retryAfterSeconds > 0) headers['Retry-After'] = String(rl.retryAfterSeconds);
  return jsonResponse({ error: message, code: 'RATE_LIMIT_EXCEEDED' }, 429, headers);
}

const AUDIT_REDACTED_KEYS = /(_|-)?(authorization|cookie|password|passphrase|secret|token|otp|apikey|api_key|private_key|client_secret|webhook_signature|session)/i;

function redactAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactAuditValue(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = AUDIT_REDACTED_KEYS.test(key) ? '[redacted]' : redactAuditValue(item, depth + 1);
    }
    return out;
  }
  return '[unserializable]';
}

/**
 * Audit writes stay non-fatal, but failures are now observable in edge logs.
 * Only safe metadata is logged; detail values and error messages are never
 * forwarded to the console because they may contain provider responses.
 */
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
): Promise<boolean> {
  if (!env.DB) {
    console.warn('Audit log write skipped', {
      action: sanitizeText(entry.action, 80),
      targetType: sanitizeText(entry.targetType, 80),
      reason: 'db_unavailable',
    });
    return false;
  }
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
        JSON.stringify({
          ...(redactAuditValue(entry.details || {}) as Record<string, unknown>),
          actorRole: entry.actorRole,
        })
      )
      .run();
    return true;
  } catch (err) {
    console.warn('Audit log write failed', {
      action: sanitizeText(entry.action, 80),
      targetType: sanitizeText(entry.targetType, 80),
      errorType: err instanceof Error ? err.name : 'unknown',
    });
    return false;
  }
}

export function getNotificationChannelStatus(env: CloudflareEnv): {
  in_app: 'delivered';
  email: 'configured' | 'setup_required_email';
  whatsapp: 'configured' | 'setup_required_whatsapp';
  sms: 'configured' | 'setup_required_sms';
} {
  const emailConfigured = Boolean(
    (env.RESEND_API_KEY && env.RESEND_API_KEY.trim()) ||
    (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
  );

  return {
    in_app: 'delivered',
    email: emailConfigured ? 'configured' : 'setup_required_email',
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

export function jsonResponse(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
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
