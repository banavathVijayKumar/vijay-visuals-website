// ============================================================================
// Shared tenant-delivery hostname rules used by Pages Functions and the SPA.
// These helpers are pure so both sides can apply the same host classification.
// ============================================================================

export const DEFAULT_DELIVERY_PARENT_HOSTS = [
  'vijayvisuals.in',
  'vijay-visuals-site.pages.dev',
] as const;

const RESERVED_TENANT_PREFIXES = new Set([
  'www',
  'api',
  'app',
  'admin',
  'preview',
  'master',
  'builder',
  'dashboards',
  'dashboard',
  'marketplace',
  'ai',
  'site',
  'sites',
  'proposal',
  'proposals',
  'demo',
  'assets',
]);

const VALID_TENANT_PREFIX = /^[a-z0-9](?:[a-z0-9-]{0,68}[a-z0-9])?$/;
const DEPLOY_HASH = /^[0-9a-f]{7,40}$/;
const BRANCH_PREVIEW_PREFIX = /^(?:feat|fix|feature|hotfix|preview|pr|pull)[-_]/;

export interface TenantDeliveryHost {
  slug: string;
  parentHost: string;
  /** True for Pages preview-parent delivery hosts. Still requires a published tenant. */
  isPreviewParent: boolean;
}

function normalizeHostname(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function isReservedTenantPrefix(prefix: string): boolean {
  const value = String(prefix || '').toLowerCase();
  return (
    RESERVED_TENANT_PREFIXES.has(value) ||
    DEPLOY_HASH.test(value) ||
    BRANCH_PREVIEW_PREFIX.test(value)
  );
}

/**
 * Parses a platform-owned delivery host such as `business.vijayvisuals.in` or
 * `business.vijay-visuals-site.pages.dev`. A match does not itself prove that a
 * tenant exists: callers must still resolve the slug against published data.
 */
export function parseTenantDeliveryHostname(rawHostname: unknown): TenantDeliveryHost | null {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return null;

  for (const parent of DEFAULT_DELIVERY_PARENT_HOSTS) {
    const suffix = `.${parent}`;
    if (!hostname.endsWith(suffix)) continue;

    const prefix = hostname.slice(0, -suffix.length);
    if (!prefix || prefix.includes('.') || !VALID_TENANT_PREFIX.test(prefix)) continue;
    if (isReservedTenantPrefix(prefix)) continue;

    return {
      slug: prefix,
      parentHost: parent,
      isPreviewParent: parent.endsWith('.pages.dev'),
    };
  }

  return null;
}

export function isDefaultTenantDeliveryHostname(rawHostname: unknown): boolean {
  return parseTenantDeliveryHostname(rawHostname) !== null;
}
