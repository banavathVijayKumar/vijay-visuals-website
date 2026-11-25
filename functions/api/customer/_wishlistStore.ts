// ============================================================================
// SHARED SUPABASE WISHLIST STORE FOR CLOUDFLARE PAGES FUNCTIONS
// - Uses the authenticated user's Supabase Bearer token only.
// - Never reads/returns SUPABASE_SERVICE_ROLE_KEY or any private backend key.
// - Relies on `public.wishlists` RLS (`wishlist_owner_only`) in addition to
//   explicit user_id filters, so cross-user reads/writes are denied.
// - No new database schema or migration is introduced.
// ============================================================================

import { getSupabaseConfig } from '../_auth';
import { CloudflareEnv } from '../_shared';

export interface WishlistRow {
  id: number;
  product_id: number;
  tenant_id: number;
  created_at?: string;
}

interface ProductRow {
  id: number;
  tenant_id: number;
  active?: boolean;
}

interface UserRow {
  id: number | string;
}

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= MAX_POSTGRES_INTEGER;
}

export function validateProductId(raw: unknown): number | null {
  if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) return null;
  const productId = Number(raw);
  return isPositiveInteger(productId) ? productId : null;
}

async function supabaseRequest<T>(
  env: CloudflareEnv,
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const config = getSupabaseConfig(env);
  if (!config) throw new Error('SUPABASE_CONFIG_MISSING');

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    method: init.method || 'GET',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SUPABASE_REQUEST_FAILED_${response.status}`);
  }
  if (!text) return [] as unknown as T;
  return JSON.parse(text) as T;
}

/** Resolves the authenticated Supabase subject to the legacy integer user id. */
export async function resolveWishlistUserId(
  env: CloudflareEnv,
  token: string,
  authSubject: string
): Promise<number | null> {
  const rows = await supabaseRequest<UserRow[]>(
    env,
    token,
    `/rest/v1/users?uid=eq.${encodeURIComponent(authSubject)}&select=id&limit=1`
  );
  const userId = Number(rows?.[0]?.id);
  return isPositiveInteger(userId) ? userId : null;
}

export async function listWishlistRows(
  env: CloudflareEnv,
  token: string,
  userId: number
): Promise<WishlistRow[]> {
  const rows = await supabaseRequest<WishlistRow[]>(
    env,
    token,
    `/rest/v1/wishlists?user_id=eq.${userId}&select=id,product_id,tenant_id,created_at&order=created_at.desc`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function findWishlistEntry(
  env: CloudflareEnv,
  token: string,
  userId: number,
  productId: number
): Promise<WishlistRow | null> {
  const rows = await supabaseRequest<WishlistRow[]>(
    env,
    token,
    `/rest/v1/wishlists?user_id=eq.${userId}&product_id=eq.${productId}&select=id,product_id,tenant_id&limit=1`
  );
  return rows?.[0] || null;
}

/** Validates that the product exists, is active, and yields its owning tenant. */
export async function findActiveProduct(
  env: CloudflareEnv,
  token: string,
  productId: number
): Promise<{ id: number; tenantId: number } | null> {
  const rows = await supabaseRequest<ProductRow[]>(
    env,
    token,
    `/rest/v1/products?id=eq.${productId}&select=id,tenant_id,active&limit=1`
  );
  const product = rows?.[0];
  if (!product || product.active === false) return null;
  const id = Number(product.id);
  const tenantId = Number(product.tenant_id);
  if (!isPositiveInteger(id) || !isPositiveInteger(tenantId)) return null;
  return { id, tenantId };
}

export async function addWishlistEntry(
  env: CloudflareEnv,
  token: string,
  userId: number,
  productId: number,
  tenantId: number
): Promise<void> {
  await supabaseRequest(
    env,
    token,
    '/rest/v1/wishlists',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, product_id: productId, tenant_id: tenantId }),
    }
  );
}

export async function removeWishlistEntry(
  env: CloudflareEnv,
  token: string,
  wishlistId: number
): Promise<void> {
  await supabaseRequest(env, token, `/rest/v1/wishlists?id=eq.${wishlistId}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}
