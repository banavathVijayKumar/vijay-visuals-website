// ============================================================================
// VIJAY VISUALS — LOSSLESS CASHFREE IDENTITY & IDEMPOTENCY HELPERS
// - Preserves 16+ digit gateway IDs exactly as they appear in the JSON text.
// - JavaScript Number cannot represent these IDs safely; parsing them as a
//   number silently truncates (e.g. ...3056 becomes ...3000).
// - Pure helpers only: safe to import from Pages Functions and Node tests.
// ============================================================================

const LARGE_ID_JSON_PATTERN =
  /("(?:cf_payment_id|cf_refund_id|bank_reference|gateway_payment_id|payment_id|cf_order_id|gateway_order_id|auth_id)"\s*:\s*)(\d{15,})(?=\s*[,}\]])/g;

/**
 * Parse Cashfree JSON text while converting large numeric ID literals into
 * strings. The HMAC signature must still be verified against the ORIGINAL raw
 * body; this helper is only for building the business-logic object.
 */
export function parseCashfreeJsonPreservingLargeIds<T = any>(text: string): T {
  const source = typeof text === 'string' ? text : '';
  const preserved = source.replace(
    LARGE_ID_JSON_PATTERN,
    (_match: string, prefix: string, digits: string) => `${prefix}"${digits}"`
  );
  return JSON.parse(preserved) as T;
}

/**
 * Normalize a Cashfree payment ID without ever trusting an unsafe JS number.
 * A numeric value that is not a safe integer is rejected instead of being
 * written in its truncated form.
 */
export function normalizeCashfreePaymentId(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^[A-Za-z0-9_-]{1,120}$/.test(trimmed) ? trimmed : '';
  }
  return '';
}

/**
 * Canonical webhook event identity. Deliberately ignores x-request-id because
 * gateways may generate a fresh request ID for every retry; the payment ID is
 * the stable identity of the event.
 */
export function buildCashfreeWebhookEventId(
  eventType: string,
  orderId: string,
  cfPaymentId: string,
  timestamp: string
): string {
  const type = String(eventType || 'UNKNOWN').trim() || 'UNKNOWN';
  if (cfPaymentId) return `${type}:${cfPaymentId}`.slice(0, 140);
  return `${type}:${String(orderId || '').trim()}:${String(timestamp || '').trim()}`.slice(0, 140);
}

/** Stable key for one seller settlement per successful gateway payment. */
export function cashfreeSettlementIdempotencyKey(orderId: string, cfPaymentId: string): string {
  return `cf_settle:${String(orderId || '').trim()}:${String(cfPaymentId || '').trim()}`.slice(0, 240);
}

/** Stable key for one payment-confirmation notification per gateway payment. */
export function cashfreeNotificationIdempotencyKey(
  channel: 'em' | 'wa',
  orderId: string,
  cfPaymentId: string
): string {
  return `pay_${channel}_${String(orderId || '').trim()}_${String(cfPaymentId || '').trim()}`.slice(0, 240);
}

/** Normalize a Cashfree refund ID without ever trusting an unsafe JS number. */
export function normalizeCashfreeRefundId(value: unknown): string {
  return normalizeCashfreePaymentId(value);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic merchant refund identity. No clock, random value, or gateway
 * response is involved, so a retry after a timeout reuses the same Cashfree
 * refund_id and the same x-idempotency-key. `sequence` is caller-supplied so a
 * legitimate second partial refund can opt into a distinct stable identity.
 */
export async function buildCashfreeRefundIdentity(input: {
  paymentId: number | string;
  orderId: string;
  amountInr: number;
  sequence: number;
}): Promise<{ refundId: string; idempotencyKey: string }> {
  const canonical = [
    'cashfree',
    'refund',
    String(input.paymentId),
    String(input.orderId || '').trim(),
    String(input.amountInr),
    String(input.sequence),
  ].join('|');

  const digest = await sha256Hex(canonical);
  // Cashfree requires a 3-40 character alphanumeric merchant refund_id.
  const refundId = `VVREF${digest.slice(0, 24)}`.slice(0, 40);

  // UUIDv5-shaped, derived from the same canonical operation (not time/random).
  const idem = await sha256Hex(`idempotency|${canonical}`);
  const idempotencyKey = [
    idem.slice(0, 8),
    idem.slice(8, 12),
    `5${idem.slice(13, 16)}`,
    `a${idem.slice(17, 20)}`,
    idem.slice(20, 32),
  ].join('-');

  return { refundId, idempotencyKey };
}

/**
 * Refund webhooks carry a refund ID, not a payment ID. Keep their event ledger
 * identity stable across retries and distinct for multiple refunds on one order.
 */
export function buildCashfreeRefundWebhookEventId(
  eventType: string,
  merchantRefundId: string,
  cfRefundId: string,
  orderId: string
): string {
  const token =
    String(merchantRefundId || '').trim() ||
    String(cfRefundId || '').trim() ||
    String(orderId || '').trim() ||
    'UNKNOWN';
  return `${String(eventType || 'UNKNOWN').trim()}:${token}`.slice(0, 140);
}
