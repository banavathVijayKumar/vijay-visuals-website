// ============================================================================
// SHARED D1 WISHLIST STORE FOR CLOUDFLARE PAGES FUNCTIONS
// - Supabase Auth is the identity provider; Cloudflare D1 is authoritative.
// - User identity is derived only from the verified auth context. Client supplied
//   userId/ownerId/tenant fields are never read.
// - Products are validated against D1 `store_products` and must be active.
// - Missing binding/table returns an explicit migration-required error.
// ============================================================================

import { isMissingTableError } from '../_tenantAccess';
import { CloudflareEnv, D1Database } from '../_shared';

export interface WishlistRow {
  id: number;
  product_id: number;
  website_id: string;
  created_at?: string;
}

export interface ActiveProduct {
  id: number;
  websiteId: string;
}

const WISHLIST_TABLE = 'customer_wishlists';
export const WISHLIST_MIGRATION_REQUIRED =
  'Wishlist storage is unavailable. Apply D1 migration 0017_customer_wishlists.sql.';

export class WishlistStorageUnavailableError extends Error {
  constructor(message: string = WISHLIST_MIGRATION_REQUIRED) {
    super(message);
    this.name = 'WishlistStorageUnavailableError';
  }
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647;
}

export function validateProductId(raw: unknown): number | null {
  if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) return null;
  const productId = Number(raw);
  return isPositiveInteger(productId) ? productId : null;
}

function requireDb(env: CloudflareEnv): D1Database {
  if (!env.DB) {
    throw new WishlistStorageUnavailableError(
      `Cloudflare D1 binding is not configured. ${WISHLIST_MIGRATION_REQUIRED}`
    );
  }
  return env.DB;
}

function storageUnavailable(err: unknown): WishlistStorageUnavailableError {
  return err instanceof WishlistStorageUnavailableError
    ? err
    : new WishlistStorageUnavailableError(WISHLIST_MIGRATION_REQUIRED);
}

async function ensureWishlistTable(db: D1Database): Promise<void> {
  try {
    await db.prepare(`SELECT id FROM ${WISHLIST_TABLE} LIMIT 1`).all();
  } catch (err) {
    if (err instanceof WishlistStorageUnavailableError) throw err;
    if (isMissingTableError(err)) throw storageUnavailable(err);
    throw err;
  }
}

/**
 * Maps the authenticated Supabase subject to the existing D1 `vv_users` row
 * when present. Falls back to the verified auth id without ever trusting the
 * request body.
 */
export async function resolveWishlistUserId(
  env: CloudflareEnv,
  authSubject: string,
  authenticatedUserId: string
): Promise<string | null> {
  const db = requireDb(env);
  await ensureWishlistTable(db);

  const subject = String(authSubject || '').trim();
  const fallbackId = String(authenticatedUserId || '').trim();
  if (!subject && !fallbackId) return null;

  try {
    const row = await db
      .prepare('SELECT id FROM vv_users WHERE id = ? OR auth_subject = ? LIMIT 1')
      .bind(fallbackId || subject, subject || fallbackId)
      .first<{ id: string | number }>();
    if (row?.id !== undefined && row?.id !== null && String(row.id).trim()) {
      return String(row.id).trim();
    }
  } catch {
    // vv_users is managed outside these migrations; the verified auth id is
    // already a stable Supabase subject when no D1 identity row exists.
  }

  return fallbackId || subject || null;
}

export async function listWishlistRows(
  env: CloudflareEnv,
  userId: string
): Promise<WishlistRow[]> {
  const db = requireDb(env);
  await ensureWishlistTable(db);
  try {
    const result = await db
      .prepare(
        `SELECT id, product_id, website_id, created_at
         FROM ${WISHLIST_TABLE}
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .bind(userId)
      .all<WishlistRow>();
    return Array.isArray(result.results) ? result.results : [];
  } catch (err) {
    if (isMissingTableError(err)) throw storageUnavailable(err);
    throw err;
  }
}

export async function findWishlistEntry(
  env: CloudflareEnv,
  userId: string,
  productId: number
): Promise<WishlistRow | null> {
  const db = requireDb(env);
  await ensureWishlistTable(db);
  try {
    return await db
      .prepare(
        `SELECT id, product_id, website_id, created_at
         FROM ${WISHLIST_TABLE}
         WHERE user_id = ? AND product_id = ? LIMIT 1`
      )
      .bind(userId, productId)
      .first<WishlistRow>();
  } catch (err) {
    if (isMissingTableError(err)) throw storageUnavailable(err);
    throw err;
  }
}

/** Validates that the product exists in D1 and is active. */
export async function findActiveProduct(
  env: CloudflareEnv,
  productId: number
): Promise<ActiveProduct | null> {
  const db = requireDb(env);
  try {
    const row = await db
      .prepare(
        `SELECT id, website_id
         FROM store_products
         WHERE id = ? AND is_active = 1 LIMIT 1`
      )
      .bind(productId)
      .first<{ id: number; website_id: string }>();
    const id = Number(row?.id);
    if (!isPositiveInteger(id)) return null;
    return { id, websiteId: String(row?.website_id || '') };
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new WishlistStorageUnavailableError(
        'Product catalogue storage requires D1 migration 0003_complete_platform_saas.sql.'
      );
    }
    throw err;
  }
}

export async function addWishlistEntry(
  env: CloudflareEnv,
  userId: string,
  productId: number,
  websiteId: string
): Promise<void> {
  const db = requireDb(env);
  await ensureWishlistTable(db);
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ${WISHLIST_TABLE} (user_id, product_id, website_id, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .bind(userId, productId, websiteId || '')
      .run();
  } catch (err) {
    if (isMissingTableError(err)) throw storageUnavailable(err);
    throw err;
  }
}

/** Removes only the caller's own wishlist entry. */
export async function removeWishlistEntry(
  env: CloudflareEnv,
  userId: string,
  productId: number
): Promise<void> {
  const db = requireDb(env);
  await ensureWishlistTable(db);
  try {
    await db
      .prepare(`DELETE FROM ${WISHLIST_TABLE} WHERE user_id = ? AND product_id = ?`)
      .bind(userId, productId)
      .run();
  } catch (err) {
    if (isMissingTableError(err)) throw storageUnavailable(err);
    throw err;
  }
}
