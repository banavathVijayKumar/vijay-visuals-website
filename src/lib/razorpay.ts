import crypto from 'crypto';

export interface RazorpayConfigStatus {
  configured: boolean;
  mode: 'unconfigured' | 'test' | 'live' | 'live_locked';
  keyIdPublic: string;
  webhookConfigured: boolean;
  liveApproved: boolean;
  message: string;
}

export function getRazorpayStatus(): RazorpayConfigStatus {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const liveApproved = (process.env.RAZORPAY_LIVE_APPROVED || '').toLowerCase() === 'true';

  if (!keyId || !keySecret) {
    return {
      configured: false,
      mode: 'unconfigured',
      keyIdPublic: '',
      webhookConfigured: Boolean(webhookSecret),
      liveApproved,
      message:
        'Razorpay Test Mode keys (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are not configured in server secrets yet. No fake payments are simulated.',
    };
  }

  const isLiveKey = keyId.startsWith('rzp_live_');
  if (isLiveKey && !liveApproved) {
    return {
      configured: false,
      mode: 'live_locked',
      keyIdPublic: '',
      webhookConfigured: Boolean(webhookSecret),
      liveApproved: false,
      message:
        'Live Razorpay key detected, but RAZORPAY_LIVE_APPROVED is not true. Start with rzp_test_ keys and approve Live Mode only after testing.',
    };
  }

  return {
    configured: true,
    mode: isLiveKey ? 'live' : 'test',
    keyIdPublic: keyId,
    webhookConfigured: Boolean(webhookSecret),
    liveApproved,
    message: isLiveKey
      ? 'Razorpay Live Mode active (owner-approved).'
      : 'Razorpay Test Mode active. Safe for end-to-end verification.',
  };
}

function getAuthHeader(): string {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export interface CreateRazorpayOrderInput {
  amountInr: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
  routeTransfer?: {
    linkedAccountId: string;
    sellerNetAmountInr: number;
    onHold?: boolean;
    onHoldUntilUnix?: number;
  };
}

export async function createRazorpayOrder(input: CreateRazorpayOrderInput): Promise<{
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}> {
  const status = getRazorpayStatus();
  if (!status.configured) {
    throw new Error(status.message);
  }

  const amountSubunits = Math.round(input.amountInr * 100);
  const body: Record<string, unknown> = {
    amount: amountSubunits,
    currency: (input.currency || 'INR').toUpperCase(),
    receipt: input.receipt.slice(0, 40),
    notes: input.notes || {},
  };

  // System B (Razorpay Route): Route net seller proceeds directly to seller Linked Account
  if (input.routeTransfer) {
    body.transfers = [
      {
        account: input.routeTransfer.linkedAccountId,
        amount: Math.round(input.routeTransfer.sellerNetAmountInr * 100),
        currency: (input.currency || 'INR').toUpperCase(),
        notes: {
          purpose: 'Marketplace seller settlement via Razorpay Route',
          ...(input.notes || {}),
        },
        on_hold: input.routeTransfer.onHold ? 1 : 0,
        ...(input.routeTransfer.onHold && input.routeTransfer.onHoldUntilUnix
          ? { on_hold_until: input.routeTransfer.onHoldUntilUnix }
          : {}),
      },
    ];
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error?.description || data?.error?.reason || `Razorpay API returned HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
}

export function verifyRazorpayPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keySecret || !params.razorpaySignature) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(params.razorpaySignature.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer | string, signatureHeader: string): boolean {
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret || !signatureHeader) return false;

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function createRazorpayRefund(params: {
  paymentId: string;
  amountInr?: number;
  reverseAllTransfers?: boolean;
}): Promise<{ id: string; status: string; amount: number }> {
  const status = getRazorpayStatus();
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

  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(params.paymentId)}/refund`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.description || `Razorpay Refund failed with HTTP ${res.status}`);
  }
  return data;
}
