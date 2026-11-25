// ============================================================================
// Validated tenant public URL resolver.
// Uses only a D1-verified custom domain or an operator-configured app origin.
// Never fabricates DNS/TLS verification or hardcodes a platform hostname.
// ============================================================================

import { CloudflareEnv, isPlatformHostname } from './_shared';

export interface TenantUrlSourceRow {
  website_id?: string | null;
  public_slug?: string | null;
}

export interface ResolvedTenantPublicUrl {
  url: string;
  source: 'verified_custom_domain' | 'configured_app_host' | 'relative_storefront';
  domain: string | null;
  isVerifiedCustomDomain: boolean;
}

function normalizeDomain(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function isValidDomain(domain: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain);
}

function safeSlug(raw: unknown): string {
  const slug = String(raw || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) ? slug : '';
}

function configuredAppOrigin(env: CloudflareEnv): string {
  const raw = String((env as Record<string, unknown>).APP_URL || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    if (parsed.pathname !== '/' && parsed.pathname !== '') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * Resolves a customer-facing storefront URL without inventing a domain.
 * Verified D1 custom domains win; otherwise a configured app origin is used;
 * otherwise only a relative /site/{slug} path is returned.
 */
export async function resolveTenantPublicUrl(
  env: CloudflareEnv,
  row: TenantUrlSourceRow
): Promise<ResolvedTenantPublicUrl> {
  const websiteId = String(row.website_id || '').trim();
  const slug = safeSlug(row.public_slug);
  const sitePath = slug ? `/site/${encodeURIComponent(slug)}` : '/';

  if (websiteId && env.DB) {
    try {
      const domainRow = await env.DB.prepare(
        `SELECT domain_name, www_mode, www_status
         FROM tenant_domains
         WHERE website_id = ?
           AND dns_verification_status = 'verified'
           AND ssl_status = 'active'
           AND status IN ('live', 'expiring_soon')
         ORDER BY is_primary DESC, id ASC
         LIMIT 1`
      )
        .bind(websiteId)
        .first<{ domain_name: string; www_mode?: string; www_status?: string }>();
      const baseDomain = normalizeDomain(domainRow?.domain_name);
      // Only advertise the www form when Cloudflare reports it verified; a
      // configured redirect mode alone must not fabricate an unverified host.
      const domain =
        domainRow?.www_mode === 'redirect_to_www' &&
        domainRow?.www_status === 'verified' &&
        baseDomain
          ? `www.${baseDomain}`
          : baseDomain;
      if (domain && isValidDomain(domain) && !isPlatformHostname(domain, env)) {
        return {
          url: `https://${domain}${sitePath === '/' ? '/' : sitePath}`,
          source: 'verified_custom_domain',
          domain,
          isVerifiedCustomDomain: true,
        };
      }
    } catch {
      // Fall through to a configured-host or relative fallback.
    }
  }

  const origin = configuredAppOrigin(env);
  if (origin) {
    return {
      url: `${origin}${sitePath}`,
      source: 'configured_app_host',
      domain: null,
      isVerifiedCustomDomain: false,
    };
  }

  return {
    url: sitePath,
    source: 'relative_storefront',
    domain: null,
    isVerifiedCustomDomain: false,
  };
}
