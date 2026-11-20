export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MIN_SLUG_LENGTH = 2;
export const MAX_SLUG_LENGTH = 80;

export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'site',
  'sites',
  'login',
  'logout',
  'signup',
  'register',
  'dashboard',
  'dashboards',
  'builder',
  'marketplace',
  'pricing',
  'contact',
  'about',
  'static',
  'assets',
  'public',
  'robots',
  'sitemap',
  'manifest',
  'webhook',
  'webhooks',
  'health',
  'auth',
  'app',
  'www',
]);

/**
 * Converts any business name or raw text into a clean, valid lowercase URL slug:
 * 1. Lowercases and normalizes accents
 * 2. Replaces spaces with hyphens
 * 3. Removes invalid special characters and underscores
 * 4. Keeps only lowercase letters (a-z), numbers (0-9), and hyphens (-)
 * 5. Prevents leading, trailing, or consecutive hyphens
 *
 * Example: "Sri Lakshmi Fashion" -> "sri-lakshmi-fashion"
 */
export function generateSlugFromName(input: string): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

export interface SlugValidationResult {
  valid: boolean;
  error: string | null;
  normalized: string;
}

/**
 * Strictly validates a website URL slug on both frontend and backend
 * with clear, human-readable validation messages.
 */
export function validateSlug(rawSlug: string): SlugValidationResult {
  const value = String(rawSlug ?? '');
  const normalized = generateSlugFromName(value);

  if (!value.trim()) {
    return {
      valid: false,
      error: 'Website URL slug is required. Example: sri-lakshmi-fashion',
      normalized,
    };
  }

  if (/[A-Z]/.test(value)) {
    return {
      valid: false,
      error: 'Use lowercase letters (a-z) only. Uppercase letters are not allowed.',
      normalized,
    };
  }

  if (/\s/.test(value)) {
    return {
      valid: false,
      error: 'Spaces are not allowed in the URL slug. Use hyphens (-) between words.',
      normalized,
    };
  }

  if (value.includes('_')) {
    return {
      valid: false,
      error: 'Underscores (_) are not allowed. Use only lowercase letters (a-z), numbers (0-9), and hyphens (-).',
      normalized,
    };
  }

  if (/[^a-z0-9-]/.test(value)) {
    return {
      valid: false,
      error: 'Remove invalid special characters. Allow only lowercase letters (a-z), numbers (0-9), and hyphens (-).',
      normalized,
    };
  }

  if (value.startsWith('-') || value.endsWith('-')) {
    return {
      valid: false,
      error: 'Slug cannot start or end with a hyphen (-).',
      normalized,
    };
  }

  if (value.includes('--')) {
    return {
      valid: false,
      error: 'Consecutive hyphens (--) are not allowed in the URL slug.',
      normalized,
    };
  }

  if (value.length < MIN_SLUG_LENGTH) {
    return {
      valid: false,
      error: `URL slug must be at least ${MIN_SLUG_LENGTH} characters long.`,
      normalized,
    };
  }

  if (value.length > MAX_SLUG_LENGTH) {
    return {
      valid: false,
      error: `URL slug must be ${MAX_SLUG_LENGTH} characters or fewer.`,
      normalized,
    };
  }

  if (!SLUG_REGEX.test(value)) {
    return {
      valid: false,
      error: 'Use only lowercase letters (a-z), numbers (0-9), and single hyphens between words.',
      normalized,
    };
  }

  if (RESERVED_SLUGS.has(value)) {
    return {
      valid: false,
      error: `"${value}" is a reserved platform path. Please choose a different business URL slug.`,
      normalized: normalized ? `${normalized}-store` : '',
    };
  }

  return {
    valid: true,
    error: null,
    normalized: value,
  };
}
