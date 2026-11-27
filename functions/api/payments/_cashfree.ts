// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE CASHFREE CLIENT (SERVER-SIDE ONLY)
// - Reads CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_ENV,
//   CASHFREE_API_VERSION, and CASHFREE_WEBHOOK_SECRET ONLY from env.
// - NEVER hardcodes keys or secrets.
// - NEVER exposes CASHFREE_CLIENT_SECRET or CASHFREE_WEBHOOK_SECRET to client.
// - CASHFREE_WEBHOOK_SECRET is mandatory for webhooks; CASHFREE_CLIENT_SECRET
//   is never accepted as a webhook signing-secret fallback.
// - Supports Cashfree PG Sandbox (https://sandbox.cashfree.com/pg) and
//   Production (https://api.cashfree.com/pg) via official 2023-08-01 API.
// ============================================================================

import { CloudflareEnv, hmacSha256Base64, hmacSha256Hex, safeEqual } from '../_shared';
import { parseCashfreeJsonPreservingLargeIds } from './_cashfreeIdentity';

/**
 * Resilient environment variable reader:
 * Handles exact key match, trimmed key match (e.g. accidental trailing spaces in Cloudflare Pages dashboard secrets),
 * and automatically trims leading/trailing whitespace from returned values.
 */
export function getTrimmedEnvVar(env: Record<string, any> | undefined | null, keyName: string): string {
  if (!env || typeof env !== 'object') return '';
  const direct = env[keyName];
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }
  // Check keys that match when trimmed (e.g. "CASHFREE_CLIENT_SECRET ")
  const keys = Object.keys(env);
  for (const k of keys) {
    if (k.trim() === keyName) {
      const val = env[k];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
  }
  return '';
}

export interface EdgeCashfreeStatus {
  configured: boolean;
  mode: 'unconfigured' | 'sandbox' | 'production';
  webhookConfigured: boolean;
  apiVersion: string;
  message: string;
}

export function getEdgeCashfreeStatus(env: CloudflareEnv): EdgeCashfreeStatus {
  const clientId = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_ID');
  const clientSecret = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_SECRET');
  const webhookSecret = getTrimmedEnvVar(env, 'CASHFREE_WEBHOOK_SECRET');
  const envMode = (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase();
  const apiVersion = getTrimmedEnvVar(env, 'CASHFREE_API_VERSION') || '2023-08-01';

  if (!clientId || !clientSecret) {
    return {
      configured: false,
      mode: 'unconfigured',
      webhookConfigured: Boolean(webhookSecret),
      apiVersion,
      message:
        'Cashfree is not configured in Cloudflare Pages environment variables (CASHFREE_CLIENT_ID & CASHFREE_CLIENT_SECRET). No fake payments are simulated.',
    };
  }

  const isProduction = envMode === 'production';

  return {
    configured: true,
    mode: isProduction ? 'production' : 'sandbox',
    // Only a dedicated webhook secret counts as configured. The API client
    // secret is never accepted as a webhook signing secret.
    webhookConfigured: Boolean(webhookSecret),
    apiVersion,
    message: isProduction
      ? 'Cashfree Production Mode active on Cloudflare Pages Functions.'
      : 'Cashfree Sandbox Mode active on Cloudflare Pages Functions.',
  };
}

export function getCashfreeBaseUrl(env: CloudflareEnv): string {
  const envMode = (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase();
  return envMode === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

export function getCashfreeHeaders(env: CloudflareEnv): HeadersInit {
  const clientId = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_ID');
  const clientSecret = getTrimmedEnvVar(env, 'CASHFREE_CLIENT_SECRET');
  const apiVersion = getTrimmedEnvVar(env, 'CASHFREE_API_VERSION') || '2023-08-01';

  return {
    'x-client-id': clientId,
    'x-client-secret': clientSecret,
    'x-api-version': apiVersion,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
}

export function isApprovedDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (isLocalHost(h)) return true;
  if (h === 'vijay-visuals-site.pages.dev' || h.endsWith('.vijay-visuals-site.pages.dev')) return true;
  if (h === 'vijayvisuals.com' || h.endsWith('.vijayvisuals.com')) return true;
  return false;
}

export function getSafeRequestOrigin(request?: Request | null, env?: CloudflareEnv | null): string {
  // 1. Explicit admin override if configured in Cloudflare Pages
  const configuredOrigin = getTrimmedEnvVar(env, 'APP_BASE_URL') || getTrimmedEnvVar(env, 'PUBLIC_ORIGIN');
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalHost(parsed.hostname))) {
        return parsed.origin;
      }
    } catch {}
  }

  // 2. Derive dynamically from incoming Request URL
  if (request && request.url) {
    try {
      const reqUrl = new URL(request.url);
      const proto = reqUrl.protocol;
      const host = reqUrl.hostname;

      if (proto === 'https:' || (proto === 'http:' && isLocalHost(host))) {
        return reqUrl.origin;
      }
    } catch {}
  }

  // 3. Fallback based on CASHFREE_ENV mode
  const envMode = (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase();
  if (envMode === 'production') {
    return 'https://vijay-visuals-site.pages.dev';
  }
  return 'https://master.vijay-visuals-site.pages.dev';
}

export function resolveSafeReturnUrl(
  inputUrl: string | undefined | null,
  fallbackPath: string,
  request?: Request | null,
  env?: CloudflareEnv | null
): string {
  const safeOrigin = getSafeRequestOrigin(request, env);
  const cleanFallbackPath = fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`;

  if (!inputUrl || typeof inputUrl !== 'string' || inputUrl.trim() === '') {
    return `${safeOrigin}${cleanFallbackPath}`;
  }

  const trimmed = inputUrl.trim();

  // If input is a relative path (e.g. "/site/store?order_id=123")
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return `${safeOrigin}${trimmed}`;
  }

  // If input is an absolute URL
  try {
    const parsed = new URL(trimmed);
    // Reject non-http(s) protocols such as javascript:, data:, file:, etc.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${safeOrigin}${cleanFallbackPath}`;
    }

    const parsedOrigin = parsed.origin;

    // Check if origin matches current safe request origin
    if (parsedOrigin === safeOrigin) {
      return parsed.toString();
    }

    // Check if both are allowed approved Vijay Visuals domains
    if (
      isApprovedDomain(parsed.hostname) &&
      (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalHost(parsed.hostname)))
    ) {
      return parsed.toString();
    }

    // Defend against Open Redirect: re-anchor to safeOrigin with path & query
    const safePath = parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`;
    return `${safeOrigin}${safePath}${parsed.search}${parsed.hash}`;
  } catch {
    return `${safeOrigin}${cleanFallbackPath}`;
  }
}

export function getSafeCashfreeNotifyUrl(request?: Request | null, env?: CloudflareEnv | null): string {
  // 1. Explicit admin override if configured in Cloudflare Pages
  const explicitWebhookUrl = getTrimmedEnvVar(env, 'CASHFREE_WEBHOOK_URL');
  if (explicitWebhookUrl) {
    try {
      const parsed = new URL(explicitWebhookUrl);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {}
  }

  // 2. Safe request origin
  const safeOrigin = getSafeRequestOrigin(request, env);
  try {
    const parsed = new URL(safeOrigin);
    // Public HTTPS domains reachable by Cashfree PG servers
    if (parsed.protocol === 'https:' && !isLocalHost(parsed.hostname)) {
      return `${safeOrigin}/api/webhooks/cashfree`;
    }
  } catch {}

  // 3. Fallback for localhost / local testing to public preview/production endpoint
  const envMode = (getTrimmedEnvVar(env, 'CASHFREE_ENV') || 'sandbox').toLowerCase();
  if (envMode === 'production') {
    return 'https://vijay-visuals-site.pages.dev/api/webhooks/cashfree';
  }
  return 'https://master.vijay-visuals-site.pages.dev/api/webhooks/cashfree';
}

export interface CreateCashfreeOrderInput {
  orderId: string;
  amountInr: number;
  currency?: string;
  customerDetails: {
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
  };
  orderMeta?: {
    returnUrl?: string;
    notifyUrl?: string;
    paymentMethods?: string;
  };
  orderNote?: string;
  orderTags?: Record<string, string>;
  request?: Request;
}

export interface EdgeCashfreeOrderResponse {
  cf_order_id?: number | string;
  order_id: string;
  order_status: string;
  payment_session_id?: string;
  order_amount: number;
  order_currency: string;
}

export interface EdgeCashfreePaymentEntity {
  cf_payment_id: number | string;
  payment_status: 'SUCCESS' | 'FAILED' | 'USER_DROPPED' | 'PENDING' | 'CANCELLED';
  payment_amount: number;
  payment_currency: string;
  payment_time?: string;
  payment_method?: any;
  bank_reference?: string;
  payment_group?: string;
  payment_message?: string;
}

export async function createEdgeCashfreeOrder(
  env: CloudflareEnv,
  input: CreateCashfreeOrderInput
): Promise<{
  mode: 'sandbox' | 'production';
  order: EdgeCashfreeOrderResponse;
  paymentSessionId: string;
}> {
  const status = getEdgeCashfreeStatus(env);
  if (!status.configured) {
    throw new Error(status.message);
  }

  const baseUrl = getCashfreeBaseUrl(env);
  const roundedAmount = Number(input.amountInr.toFixed(2));
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new Error('Order amount must be a positive INR value.');
  }

  // Cashfree phone validation: must be 10 digits without leading 0 or +91 for Indian numbers
  let phone = (input.customerDetails.customerPhone || '9381362201').replace(/\D/g, '');
  if (phone.length > 10) {
    phone = phone.slice(-10);
  }
  if (phone.length < 10) {
    phone = '9381362201';
  }

  // Cashfree email fallback
  const email = (input.customerDetails.customerEmail || '').trim() || 'customer@vijayvisuals.com';

  // Cashfree customer_id: alphanumeric, min 3 chars
  let customerId = (input.customerDetails.customerId || 'cust_guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (customerId.length < 3) customerId = `cust_${customerId}`;
  customerId = customerId.slice(0, 50);

  const payload: Record<string, unknown> = {
    order_id: input.orderId,
    order_amount: roundedAmount,
    order_currency: (input.currency || 'INR').toUpperCase(),
    customer_details: {
      customer_id: customerId,
      customer_name: (input.customerDetails.customerName || 'Customer').slice(0, 100),
      customer_email: email,
      customer_phone: phone,
    },
    order_meta: {
      return_url: resolveSafeReturnUrl(
        input.orderMeta?.returnUrl,
        `/payments/cashfree/return?order_id=${encodeURIComponent(input.orderId)}`,
        input.request,
        env
      ),
      notify_url:
        input.orderMeta?.notifyUrl ||
        getSafeCashfreeNotifyUrl(input.request, env),
      payment_methods: input.orderMeta?.paymentMethods || 'cc,dc,upi,nb,app',
    },
    order_note: (input.orderNote || 'Vijay Visuals Website Service').slice(0, 200),
  };

  if (input.orderTags && Object.keys(input.orderTags).length > 0) {
    payload.order_tags = input.orderTags;
  }

  const res = await fetch(`${baseUrl}/orders`, {
    method: 'POST',
    headers: getCashfreeHeaders(env),
    body: JSON.stringify(payload),
  });

  let data: {
    cf_order_id?: number | string;
    order_id?: string;
    order_status?: string;
    payment_session_id?: string;
    order_amount?: number;
    order_currency?: string;
    message?: string;
    type?: string;
    code?: string;
  } = {};
  try {
    data = parseCashfreeJsonPreservingLargeIds(await res.text());
  } catch {
    data = {};
  }

  if (!res.ok || !data.order_id || !data.payment_session_id) {
    const errMsg =
      data?.message ||
      data?.code ||
      `Cashfree Orders API returned HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return {
    mode: status.mode === 'production' ? 'production' : 'sandbox',
    order: {
      cf_order_id: data.cf_order_id,
      order_id: data.order_id,
      order_status: data.order_status || 'ACTIVE',
      payment_session_id: data.payment_session_id,
      order_amount: Number(data.order_amount ?? roundedAmount),
      order_currency: String(data.order_currency ?? 'INR'),
    },
    paymentSessionId: data.payment_session_id,
  };
}

export async function fetchEdgeCashfreeOrder(
  env: CloudflareEnv,
  orderId: string
): Promise<EdgeCashfreeOrderResponse> {
  const status = getEdgeCashfreeStatus(env);
  if (!status.configured) {
    throw new Error(status.message);
  }

  const baseUrl = getCashfreeBaseUrl(env);
  const res = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: getCashfreeHeaders(env),
  });

  let data: {
    cf_order_id?: number | string;
    order_id?: string;
    order_status?: string;
    payment_session_id?: string;
    order_amount?: number;
    order_currency?: string;
    message?: string;
  } = {};
  try {
    data = parseCashfreeJsonPreservingLargeIds(await res.text());
  } catch {
    data = {};
  }

  if (!res.ok || !data.order_id) {
    throw new Error(data?.message || `Cashfree Fetch Order returned HTTP ${res.status}`);
  }

  return {
    cf_order_id: data.cf_order_id,
    order_id: data.order_id,
    order_status: data.order_status || 'UNKNOWN',
    payment_session_id: data.payment_session_id,
    order_amount: Number(data.order_amount || 0),
    order_currency: String(data.order_currency || 'INR'),
  };
}

export async function fetchEdgeCashfreeOrderPayments(
  env: CloudflareEnv,
  orderId: string
): Promise<EdgeCashfreePaymentEntity[]> {
  const status = getEdgeCashfreeStatus(env);
  if (!status.configured) {
    throw new Error(status.message);
  }

  const baseUrl = getCashfreeBaseUrl(env);
  const res = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
    method: 'GET',
    headers: getCashfreeHeaders(env),
  });

  if (!res.ok) {
    let data: { message?: string } = {};
    try {
      data = parseCashfreeJsonPreservingLargeIds(await res.text());
    } catch {
      data = {};
    }
    throw new Error(data?.message || `Cashfree Fetch Order Payments returned HTTP ${res.status}`);
  }

  try {
    const list = parseCashfreeJsonPreservingLargeIds<EdgeCashfreePaymentEntity[]>(await res.text());
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export interface EdgeCashfreeRefundResult {
  /** Cashfree-generated refund ID (cf_refund_id), with merchant ID fallback. */
  id: string;
  /** Deterministic merchant refund_id sent on every retry of this operation. */
  merchantRefundId: string;
  status: string;
  amount: number;
  raw: Record<string, any>;
}

export async function createEdgeCashfreeRefund(
  env: CloudflareEnv,
  input: {
    orderId: string;
    amountInr: number;
    refundId: string;
    idempotencyKey: string;
    reason?: string;
  }
): Promise<EdgeCashfreeRefundResult> {
  const status = getEdgeCashfreeStatus(env);
  if (!status.configured) {
    throw new Error(status.message);
  }

  // Cashfree requires a 3-40 character alphanumeric merchant refund_id.
  const refundId = String(input.refundId || '').trim();
  if (!/^[A-Za-z0-9]{3,40}$/.test(refundId)) {
    throw new Error('Unsafe Cashfree merchant refund ID; refusing to start a refund.');
  }
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new Error('Unsafe Cashfree refund idempotency key; refusing to start a refund.');
  }
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) {
    throw new Error('Invalid Cashfree refund amount.');
  }

  const baseUrl = getCashfreeBaseUrl(env);
  const orderId = String(input.orderId || '').trim();
  const payload: Record<string, any> = {
    refund_id: refundId,
    refund_amount: input.amountInr,
    refund_note: String(input.reason || 'Admin initiated refund').slice(0, 100),
  };

  // Same deterministic key on every retry: Cashfree replays the original
  // response instead of creating a second refund after a timeout/failure.
  const headers: Record<string, string> = {
    ...(getCashfreeHeaders(env) as Record<string, string>),
    'x-idempotency-key': idempotencyKey,
  };

  const res = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}/refunds`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  let data: Record<string, any> = {};
  try {
    data = parseCashfreeJsonPreservingLargeIds(await res.text());
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data?.message || `Cashfree Refund returned HTTP ${res.status}`);
  }

  return {
    id: String(data.cf_refund_id || data.refund_id || refundId),
    merchantRefundId: String(data.refund_id || refundId),
    status: String(data.refund_status || 'PENDING'),
    amount: Number(data.refund_amount || input.amountInr),
    raw: data,
  };
}

/**
 * Cashfree documents the webhook timestamp header as epoch milliseconds and
 * uses the exact header value in the signed payload (`timestamp + rawBody`).
 * It documents at-least-once delivery, retries, and dashboard resends, but it
 * does not publish a fixed freshness tolerance. These limits are therefore a
 * conservative local replay guard, not a claimed Cashfree requirement:
 * accept the documented 24-hour resend range plus 5 minutes clock skew, and
 * reject anything older or too far in the future.
 */
export const CASHFREE_WEBHOOK_TIMESTAMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type CashfreeWebhookTimestampCheck =
  | { ok: true; timestampMs: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'future' };

export function checkCashfreeWebhookTimestampFreshness(
  timestamp: string,
  nowMs: number = Date.now()
): CashfreeWebhookTimestampCheck {
  const cleanTs = String(timestamp || '').trim();
  if (!cleanTs) return { ok: false, reason: 'missing' };

  // Official examples use a 13-digit epoch-millisecond value. Do not normalise
  // the header because the exact string is part of the HMAC message.
  if (!/^\d{13}$/.test(cleanTs)) return { ok: false, reason: 'malformed' };

  const timestampMs = Number(cleanTs);
  if (!Number.isSafeInteger(timestampMs)) return { ok: false, reason: 'malformed' };

  if (timestampMs > nowMs + CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS) {
    return { ok: false, reason: 'future' };
  }
  if (nowMs - timestampMs > CASHFREE_WEBHOOK_TIMESTAMP_MAX_AGE_MS + CASHFREE_WEBHOOK_TIMESTAMP_FUTURE_SKEW_MS) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true, timestampMs };
}

export async function verifyEdgeCashfreeWebhookSignature(
  env: CloudflareEnv,
  rawBody: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  // A dedicated webhook secret is mandatory. CASHFREE_CLIENT_SECRET is an API
  // credential, never a webhook signing secret, and must not be used as a
  // fallback even if it happens to verify an incoming signature.
  const webhookSecret = getTrimmedEnvVar(env, 'CASHFREE_WEBHOOK_SECRET');

  const cleanSig = (signature || '').trim();
  const cleanTs = (timestamp || '').trim();
  if (!cleanSig || !cleanTs || !webhookSecret) {
    return false;
  }

  // Cashfree PG HMAC-SHA256 signature formula: timestamp + rawBody
  const message = `${cleanTs}${rawBody}`;

  // 1. Base64 encoding (standard for Cashfree 2023-08-01 API)
  const expectedBase64 = await hmacSha256Base64(webhookSecret, message);
  if (safeEqual(cleanSig, expectedBase64)) {
    return true;
  }

  // 2. Hex encoding (supported for compatibility)
  const expectedHex = await hmacSha256Hex(webhookSecret, message);
  return safeEqual(cleanSig.toLowerCase(), expectedHex.toLowerCase());
}
