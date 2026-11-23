import { getSupabaseClient } from './supabase';

/**
 * Returns the active Supabase Auth JWT access token (if signed in).
 * Preserves the existing GitHub Supabase authentication system — zero Firebase Auth.
 */
export async function getAuthAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
  timeoutMs?: number;
  maxRetries?: number;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.maxRetries ?? (method === 'GET' ? 1 : 0);

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // Merge external signal if supplied
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const headers = new Headers(options.headers || {});
      let body = options.body;

      if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
        body = JSON.stringify(body);
        if (!headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
      } else if (!headers.has('Content-Type') && body && typeof body === 'string') {
        headers.set('Content-Type', 'application/json');
      }

      const token = await getAuthAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
        body,
      });

      clearTimeout(timeoutTimer);

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const text = await res.text();
      let data: unknown = {};
      let parsedAsJson = false;

      if (text) {
        try {
          data = JSON.parse(text);
          parsedAsJson = true;
        } catch {
          data = { error: text || 'Unexpected server response.' };
        }
      }

      if (!res.ok) {
        const errObj = data as { error?: string; message?: string };
        throw new Error(errObj.error || errObj.message || `Request failed with status ${res.status}`);
      }

      if (text && !parsedAsJson) {
        throw new Error(
          contentType.includes('text/html')
            ? 'API endpoint is unavailable or returned HTML instead of JSON.'
            : 'Unexpected non-JSON response from server.'
        );
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutTimer);

      const isAbort = err?.name === 'AbortError' || controller.signal.aborted;
      const isNetworkError = err instanceof TypeError && err.message.toLowerCase().includes('fetch');

      if (attempt < maxRetries && (isNetworkError || isAbort)) {
        attempt++;
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }

      if (isAbort) {
        throw new Error('Request timed out. Please check your internet connection and try again.');
      }

      throw err;
    }
  }
}
