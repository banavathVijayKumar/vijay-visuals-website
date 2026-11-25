// ============================================================================
// Payment display helpers — keeps payment evidence separate from plan entitlement.
// A "verified payment" label requires BOTH an authoritative verification flag
// and a settled/paid status from the server.
// ============================================================================

export interface PaymentDisplayState {
  amountInr: number | null | undefined;
  paymentStatus: string | null | undefined;
  signatureVerified: boolean | null | undefined;
}

const VERIFIED_PAYMENT_STATUSES = new Set(['paid', 'success', 'succeeded', 'captured']);

export function isVerifiedPayment(state: PaymentDisplayState): boolean {
  const status = String(state.paymentStatus || '').trim().toLowerCase();
  return Boolean(state.signatureVerified) && VERIFIED_PAYMENT_STATUSES.has(status);
}

/** Gateway references are sensitive; customer-facing surfaces show only the suffix. */
export function maskPaymentReference(raw: unknown): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '••••';
  return `••••••${clean.slice(-4)}`;
}

export function formatVerifiedPaymentLabel(state: PaymentDisplayState): string {
  if (!state.amountInr || !isVerifiedPayment(state)) {
    return 'No verified payment recorded';
  }
  const amount = Number(state.amountInr);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'No verified payment recorded';
  }
  return `₹${amount.toLocaleString('en-IN')} verified payment`;
}
