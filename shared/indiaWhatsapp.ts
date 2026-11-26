// ============================================================================
// SHARED — INDIAN WHATSAPP NUMBER VALIDATION (BROWSER + EDGE SAFE)
// - Accepts only India's +91 mobile format after safe, explicit normalization.
// - Never guesses or silently repairs an invalid number: invalid input fails.
// - Pure TypeScript: no Cloudflare, Node, or React dependencies.
// ============================================================================

export interface IndiaWhatsAppNumber {
  /** E.164-style value used for storage and display, e.g. +919876543210. */
  e164: string;
  /** Digits only, as expected by the Meta Cloud API, e.g. 919876543210. */
  digits: string;
  /** 10-digit Indian mobile number without country code. */
  local: string;
  /** Human-friendly grouping, e.g. +91 98765 43210. */
  display: string;
  /** Privacy-safe label used in logs, e.g. +91******3210. */
  masked: string;
}

export interface IndiaPhoneValidationResult {
  ok: boolean;
  value?: IndiaWhatsAppNumber;
  error?: string;
}

export const INVALID_INDIA_WHATSAPP_MESSAGE =
  'Enter a valid Indian WhatsApp number: +91 followed by 10 mobile digits (6-9 first digit).';

/** Indian mobile subscriber numbers start with 6-9 and have exactly 10 digits. */
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

/**
 * Validates and normalizes an Indian WhatsApp number.
 *
 * Accepted forms:
 *   +91 98765 43210 / +919876543210 / 919876543210
 *   09876543210 (one trunk `0`) / 9876543210
 *
 * Rejected (never silently coerced):
 *   +1..., +91 with the wrong length, 9-digit numbers, letters, mixed prefixes,
 *   numbers whose mobile part does not start with 6-9, and values over 32 chars.
 */
export function validateIndiaWhatsAppNumber(raw: unknown): IndiaPhoneValidationResult {
  const invalid = (): IndiaPhoneValidationResult => ({ ok: false, error: INVALID_INDIA_WHATSAPP_MESSAGE });

  if (typeof raw !== 'string') return invalid();
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 32) return invalid();

  const plusSigns = trimmed.match(/\+/g) || [];
  if (plusSigns.length > 1) return invalid();
  const hasLeadingPlus = trimmed.startsWith('+');

  // Only harmless visual separators are removed. Any other character fails.
  const body = trimmed
    .replace(/^\+/, '')
    .replace(/[\s()\-.\u00A0]/g, '');
  if (!/^\d+$/.test(body)) return invalid();

  let local = '';
  if (hasLeadingPlus) {
    // An explicit `+` must be followed by India's country code.
    if (body.length !== 12 || !body.startsWith('91')) return invalid();
    local = body.slice(2);
  } else if (body.length === 12 && body.startsWith('91')) {
    local = body.slice(2);
  } else if (body.length === 11 && body.startsWith('0')) {
    local = body.slice(1);
  } else if (body.length === 10) {
    local = body;
  } else {
    return invalid();
  }

  if (!INDIAN_MOBILE_PATTERN.test(local)) return invalid();

  const digits = `91${local}`;
  return {
    ok: true,
    value: {
      e164: `+${digits}`,
      digits,
      local,
      display: `+91 ${local.slice(0, 5)} ${local.slice(5)}`,
      masked: `+91******${local.slice(-4)}`,
    },
  };
}

/** Masks a normalized phone value for logs and admin visibility. */
export function maskIndiaWhatsAppNumber(raw: string | IndiaWhatsAppNumber): string {
  if (typeof raw !== 'string') return raw.masked;
  const result = validateIndiaWhatsAppNumber(raw);
  return result.ok ? result.value!.masked : '+91****';
}
