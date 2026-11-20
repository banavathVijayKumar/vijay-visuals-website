// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE RAZORPAY CLIENT (SERVER-SIDE ONLY)
// - Reads RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET ONLY
//   from Cloudflare Pages environment variables (`env`).
// - NEVER hardcodes keys or secrets.
// - NEVER exposes RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET in responses.
// - Exposes public RAZORPAY_KEY_ID ONLY when initializing Razorpay Checkout.
// - Enforces strict separation between Flow 1 (Vijay Visuals Platform Account)
//   and Flow 2 (Shop Owner Seller Linked Account via Razorpay Route).
// ============================================================================

import { CloudflareEnv, hmacSha256Hex, safeEqual } from '../_shared';

export interface EdgeRazorpayStatus {
  configured: boolean;
  mode: 'unconfigured' | 'test' | 'live' | 'live_locked';
  webhookConfigured: boolean;
  liveApproved: boolean;
  routeEnabled: boolean;
  message: string;
}

export function getEdgeRazorpayStatus(env: CloudflareEnv): EdgeRazorpayStatus {
  const keyId = (env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const liveApproved = (env.RAZORPAY_LIVE_APPROVED || '').trim().toLowerCase() === 'true';
  const routeEnabled = (env.RAZORPAY_ROUTE_ENABLED || '').trim().toLowerCase() === 'true';

  if (!keyId || !keySecret) {
    return {
      configured: false,
      mode: 'unconfigured',
      webhookConfigured: Boolean(webhookSecret),
      liveApproved,
      routeEnabled,
      message:
        'Razorpay is not configured in Cloudflare Pages environment variables (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET). No fake payments are simulated.',
    };
  }

  const isLiveKey = keyId.startsWith('rzp_live_');
  if (isLiveKey && !liveApproved) {
    return {
      configured: false,
      mode: 'live_locked',
      webhookConfigured: Boolean(webhookSecret),
      liveApproved: false,
      routeEnabled,
      message:
        'Live Razorpay key detected, but RAZORPAY_LIVE_APPROVED is not "true". Test with rzp_test_* keys first and enable live mode only after explicit approval.',
    };
  }

  return {
    configured: true,
    mode: isLiveKey ? 'live' : 'test',
    webhookConfigured: Boolean(webhookSecret),
    liveApproved,
    routeEnabled,
    message: isLiveKey
      ? 'Razorpay Live Mode active on Cloudflare Pages Functions (owner-approved).'
      : 'Razorpay Test Mode active on Cloudflare Pages Functions.',
  };
}

function getRazorpayBasicAuth(env: CloudflareEnv): string {
  const keyId = (env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

export interface CreateEdgeOrderInput {
  amountInr: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  routeTransfer?: {
    linkedAccountId: string;
    sellerNetAmountInr: number;
    onHold?: boolean;
  };
}

export interface EdgeRazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createEdgeRazorpayOrder(
  env: CloudflareEnv,
  input: CreateEdgeOrderInput
): Promise<{
  keyId: string;
  mode: 'test' | 'live';
  order: EdgeRazorpayOrderResponse;
}> {
  const status = getEdgeRazorpayStatus(env);
  if (!status.configured || (status.mode !== 'test' && status.mode !== 'live')) {
    throw new Error(status.message);
  }

  const amountPaise = Math.round(input.amountInr * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Order amount must be a positive INR value.');
  }

  const currency = (input.currency || 'INR').toUpperCase();
  const payload: Record<string, unknown> = {
    amount: amountPaise,
    currency,
    receipt: input.receipt.slice(0, 40),
    notes: input.notes || {},
  };

  if (input.routeTransfer) {
    const linkedAcc = input.routeTransfer.linkedAccountId.trim();
    if (!/^acc_[A-Za-z0-9]+$/.test(linkedAcc)) {
      throw new Error('Invalid seller Razorpay Route Linked Account ID.');
    }
    const netPaise = Math.round(input.routeTransfer.sellerNetAmountInr * 100);
    if (!Number.isFinite(netPaise) || netPaise <= 0 || netPaise > amountPaise) {
      throw new Error('Invalid seller transfer net amount.');
    }
    payload.transfers = [
      {
        account: linkedAcc,
        amount: netPaise,
        currency,
        notes: {
          purpose: 'Shop owner customer store settlement via Razorpay Route',
          ...(input.notes || {}),
        },
        on_hold: input.routeTransfer.onHold ? 1 : 0,
      },
    ];
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: getRazorpayBasicAuth(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    amount?: number;
    currency?: string;
    receipt?: string;
    status?: string;
    error?: { description?: string; reason?: string };
  };

  if (!res.ok || !data.id) {
    const errMsg =
      data?.error?.description ||
      data?.error?.reason ||
      `Razorpay Orders API returned HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return {
    keyId: (env.RAZORPAY_KEY_ID || '').trim(),
    mode: status.mode,
    order: {
      id: data.id,
      amount: Number(data.amount ?? amountPaise),
      currency: String(data.currency ?? currency),
      receipt: String(data.receipt ?? input.receipt),
      status: String(data.status ?? 'created'),
    },
  };
}

export async function verifyEdgeRazorpayPaymentSignature(
  env: CloudflareEnv,
  params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }
): Promise<boolean> {
  const keySecret = (env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keySecret || !params.razorpayOrderId || !params.razorpayPaymentId || !params.razorpaySignature) {
    return false;
  }
  const expected = await hmacSha256Hex(
    keySecret,
    `${params.razorpayOrderId.trim()}|${params.razorpayPaymentId.trim()}`
  );
  return safeEqual(params.razorpaySignature.trim(), expected);
}

export async function verifyEdgeRazorpayWebhookSignature(
  env: CloudflareEnv,
  rawBody: string,
  signatureHeader: string
): Promise<boolean> {
  const webhookSecret = (env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret || !signatureHeader) {
    return false;
  }
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return safeEqual(signatureHeader.trim(), expected);
}

export async function createEdgeRazorpayRefund(
  env: CloudflareEnv,
  params: {
    paymentId: string;
    amountInr?: number;
    reverseAllTransfers?: boolean;
  }
): Promise<{ id: string; status: string; amount: number }> {
  const status = getEdgeRazorpayStatus(env);
  if (!status.configured) {
    throw new Error(status.message);
  }

  const payload: Record<string, unknown> = {};
  if (params.amountInr && params.amountInr > 0) {
    payload.amount = Math.round(params.amountInr * 100);
  }
  if (params.reverseAllTransfers) {
    payload.reverse_all = 1;
  }

  const res = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.paymentId)}/refund`,
    {
      method: 'POST',
      headers: {
        Authorization: getRazorpayBasicAuth(env),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    amount?: number;
    error?: { description?: string };
  };

  if (!res.ok || !data.id) {
    throw new Error(data?.error?.description || `Razorpay Refund API returned HTTP ${res.status}`);
  }

  return {
    id: data.id,
    status: String(data.status || 'processed'),
    amount: Number(data.amount || 0),
  };
}
