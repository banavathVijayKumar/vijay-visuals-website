// ============================================================================
// Central PII masking helpers for server-side logs and notifications.
//
// This module is dependency-free and safe to import from both shared audit code
// and lifecycle notification code. It never sends data anywhere: it only
// replaces customer identifiers with non-reversible display-safe placeholders.
// ============================================================================

const MAX_REDACTION_LENGTH = 1500;

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_EXACT_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_PATTERN = /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){9,14}\d(?!\d)/g;
const COORDINATE_PATTERN =
  /(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*-?\d{1,3}\.\d{4,8}\s*,?\s*(?:lat(?:itude)?|lng|long(?:itude)?)\s*[:=]\s*-?\d{1,3}\.\d{4,8}|-?\d{1,2}\.\d{4,8}\s*,\s*-?\d{1,3}\.\d{4,8}/gi;
const POD_REFERENCE_PATTERN = /\b(?:SECURE-?POD|POD)[-_ ]?[A-Z0-9][A-Z0-9-]{2,}\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isLikelyEmail(raw: unknown): boolean {
  const value = String(raw || '').trim();
  return EMAIL_EXACT_PATTERN.test(value);
}

export function isLikelyPhone(raw: unknown): boolean {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/** Email display form: never returns the full local part. */
export function maskEmailAddress(raw: unknown): string {
  const value = String(raw || '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at >= value.length - 1) return '[email withheld]';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const first = local.slice(0, 1);
  const last = local.length > 1 ? local.slice(-1) : '';
  return `${first}***${last}@${domain}`;
}

/** Phone display form: only the caller-known last four digits survive. */
export function maskPhoneNumber(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 4) return '[phone withheld]';
  return `••••••${digits.slice(-4)}`;
}

/** Names are reduced to initials; no full or partial surname is retained. */
export function maskPersonName(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '[name withheld]';
  return value
    .split(/\s+/)
    .slice(0, 4)
    .map((part) => (/^[A-Za-z]/.test(part) ? `${part[0]}***` : '***'))
    .join(' ');
}

/** Addresses retain only the broadest location component (typically city). */
export function maskAddress(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '[address withheld]';
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return '[address withheld]';
  return `Protected Address, ${parts[parts.length - 1].slice(0, 60)}`;
}

/** POD references are operational identifiers, never public proof details. */
export function maskPodReference(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '[pod withheld]';
  const safeTail = value.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return `POD-••••${safeTail || 'redacted'}`;
}

export function maskCoordinates(raw: unknown): string {
  return raw == null || String(raw).trim() === '' ? '[coordinates withheld]' : '[coordinates withheld]';
}

/** Picks the right mask for a known sensitive value supplied by a caller. */
export function maskKnownPiiValue(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '[redacted]';
  if (isLikelyEmail(value)) return maskEmailAddress(value);
  if (isLikelyPhone(value)) return maskPhoneNumber(value);
  if (value.includes(',') && value.length > 20) return maskAddress(value);
  if (/^(?:SECURE-?POD|POD)[-_ ]?/i.test(value)) return maskPodReference(value);
  if (/^-?\d{1,3}\.\d{4,8}$/.test(value)) return '[coordinates withheld]';
  return maskPersonName(value);
}

/** Stable, non-reversible correlation token when a short ID is useful. */
export function tokenizePii(raw: unknown): string {
  const value = String(raw || '').trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `pii_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export interface PiiRedactionOptions {
  /** Exact sensitive values known to the caller (recipient name, POD ref, etc.). */
  values?: Array<string | null | undefined>;
}

/**
 * Redacts free-form server text before it reaches notification_logs or audit JSON.
 * Raw values known to the caller are replaced first so names/POD codes in
 * interpolated messages cannot survive simply because they lack a regex shape.
 */
export function redactPiiText(raw: unknown, options: PiiRedactionOptions = {}): string {
  let text = String(raw ?? '').slice(0, MAX_REDACTION_LENGTH);

  const knownValues = (options.values || [])
    .map((value) => String(value || '').trim())
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const value of knownValues) {
    text = text.replace(new RegExp(escapeRegExp(value), 'gi'), maskKnownPiiValue(value));
  }

  text = text
    .replace(EMAIL_PATTERN, (match) => maskEmailAddress(match))
    .replace(COORDINATE_PATTERN, '[coordinates withheld]')
    .replace(POD_REFERENCE_PATTERN, (match) => maskPodReference(match))
    .replace(PHONE_PATTERN, (match) => maskPhoneNumber(match));

  return text;
}

/** Logs must never persist a contact address; store only its masked form. */
export function maskContactForLog(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  return maskKnownPiiValue(value);
}
