import { CloudflareEnv, jsonResponse } from '../_shared';

export interface VerifiedUser {
  id: string;
  email: string;
  full_name?: string;
  role: string;
}

export async function requireUser(request: Request, env: CloudflareEnv): Promise<VerifiedUser | Response> {
  if (!env.DB) return jsonResponse({ error: 'Marketplace database is not configured.', code: 'D1_NOT_CONFIGURED' }, 503);
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Authentication provider is not configured.', code: 'AUTH_NOT_CONFIGURED' }, 503);
  }
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse({ error: 'Sign in is required.', code: 'UNAUTHENTICATED' }, 401);

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return jsonResponse({ error: 'Your session is invalid or expired.', code: 'INVALID_SESSION' }, 401);
  const authUser: any = await response.json().catch(() => null);
  if (!authUser?.id || !authUser?.email) return jsonResponse({ error: 'Unable to verify your account.', code: 'INVALID_USER' }, 401);

  // Supabase profiles is the authorization source of truth; D1 stores account status and billing identity only.
  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,full_name,role`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!profileResponse.ok) return jsonResponse({ error: 'Unable to verify your account role.', code: 'ROLE_LOOKUP_FAILED' }, 503);
  const profileRows: any[] = await profileResponse.json().catch(() => []);
  const supabaseProfile = profileRows[0];
  const allowedRoles = ['admin', 'shop_owner', 'delivery_boy', 'customer'];
  if (!supabaseProfile?.id || !allowedRoles.includes(supabaseProfile.role)) {
    return jsonResponse({ error: 'Your account role is missing or invalid.', code: 'INVALID_ROLE' }, 403);
  }

  await env.DB.prepare(`INSERT OR IGNORE INTO vv_users (id, auth_provider, auth_subject, email, full_name, role)
    VALUES (?, 'supabase', ?, ?, ?, 'customer')`)
    .bind(authUser.id, authUser.id, authUser.email, authUser.user_metadata?.full_name || authUser.user_metadata?.name || null).run();

  const profile = await env.DB.prepare('SELECT id, email, full_name, role, status FROM vv_users WHERE auth_subject = ?')
    .bind(authUser.id).first<any>();
  if (!profile || profile.status !== 'active') return jsonResponse({ error: 'Your marketplace account is inactive.', code: 'ACCOUNT_INACTIVE' }, 403);
  return { id: profile.id, email: profile.email, full_name: supabaseProfile.full_name || profile.full_name || undefined, role: supabaseProfile.role };
}

export function isResponse(value: VerifiedUser | Response): value is Response {
  return value instanceof Response;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
