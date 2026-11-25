// ============================================================================
// GET /api/customer/wishlist — Authenticated customer's own wishlist only
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { listWishlistRows, resolveWishlistUserId, WishlistStorageUnavailableError } from './_wishlistStore';
import { isMissingTableError } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  try {
    const userId = await resolveWishlistUserId(env, auth.user.authSubject, auth.user.id);
    if (!userId) {
      return jsonResponse({ error: 'Customer profile not found for this account.' }, 404);
    }

    const rows = await listWishlistRows(env, userId);
    return jsonResponse({
      productIds: rows.map((row) => Number(row.product_id)).filter(Number.isInteger),
      items: rows,
    });
  } catch (err) {
    if (err instanceof WishlistStorageUnavailableError || isMissingTableError(err)) {
      return jsonResponse(
        {
          error: err instanceof Error ? err.message : 'Wishlist storage is unavailable.',
          code: 'WISHLIST_STORAGE_UNAVAILABLE',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load wishlist.' }, 500);
  }
}
