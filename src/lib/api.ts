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
}

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
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
    headers,
    body,
  });

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
    const errObj = data as { error?: string };
    throw new Error(errObj.error || `Request failed with status ${res.status}`);
  }

  if (text && !parsedAsJson) {
    throw new Error(
      contentType.includes('text/html')
        ? 'API endpoint is unavailable or returned HTML instead of JSON.'
        : 'Unexpected non-JSON response from server.'
    );
  }

  return data as T;
}
