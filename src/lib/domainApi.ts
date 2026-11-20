// ============================================================================
// VIJAY VISUALS — PRODUCTION-COMPATIBLE EDGE & SUPABASE API CLIENT
// Automatically attaches Supabase Bearer tokens when deployed on Cloudflare Pages,
// while preserving compatibility with local AI Studio workspace preview.
// ============================================================================

export interface EdgeApiOptions extends RequestInit {
  accessToken?: string | null;
}

/**
 * Resolves the active Supabase session access_token from localStorage (standard
 * `@supabase/supabase-js` v2 storage key format `sb-<ref>-auth-token`) when
 * running in Cloudflare Pages production, without introducing a hard dependency
 * on `@supabase/supabase-js` inside the AI Studio local preview workspace.
 */
export function getStoredSupabaseAccessToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && /^sb-[a-z0-9-]+-auth-token$/i.test(key)) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { access_token?: string; currentSession?: { access_token?: string } };
        const token = parsed?.access_token || parsed?.currentSession?.access_token;
        if (typeof token === 'string' && token.length > 20) {
          return token;
        }
      }
    }
  } catch {
    // Ignore storage read errors in restricted iframes
  }
  return null;
}

export async function edgeApiFetch<T = unknown>(
  path: string,
  options: EdgeApiOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = options.accessToken ?? getStoredSupabaseAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('Content-Type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errMsg =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with HTTP ${response.status}`;
    throw new Error(errMsg);
  }

  return payload as T;
}

export const domainEdgeApi = {
  resolveCurrentHost: () =>
    edgeApiFetch<{
      matched: boolean;
      tenantSlug?: string;
      businessName?: string;
      redirectUrl?: string | null;
      status?: string;
    }>('/api/domains/resolve'),

  getPricing: () => edgeApiFetch('/api/domains/pricing'),

  searchSuggestions: (query: string, category?: string) =>
    edgeApiFetch('/api/domains/search', {
      method: 'POST',
      body: JSON.stringify({ query, category }),
    }),

  getMyDomains: () => edgeApiFetch('/api/domains/my'),

  connectDomain: (
    websiteId: string,
    payload: {
      domainName: string;
      registrarName?: string;
      wwwMode?: 'redirect_to_root' | 'redirect_to_www' | 'both';
      expiryDate?: string;
    }
  ) =>
    edgeApiFetch(`/api/domains/websites/${encodeURIComponent(websiteId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyDomain: (websiteId: string, domainId: number) =>
    edgeApiFetch(
      `/api/domains/websites/${encodeURIComponent(websiteId)}/${domainId}/verify`,
      { method: 'POST' }
    ),

  healthCheckDomain: (websiteId: string, domainId: number) =>
    edgeApiFetch(
      `/api/domains/websites/${encodeURIComponent(websiteId)}/${domainId}/health-check`,
      { method: 'POST' }
    ),
};
