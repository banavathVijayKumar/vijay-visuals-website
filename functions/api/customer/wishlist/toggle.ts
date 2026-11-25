// ============================================================================
// POST /api/customer/wishlist/toggle — Add/remove the caller's own wishlist item
// ============================================================================

import { requireUser } from '../../_auth';
import { PagesContext, handleOptions, jsonResponse, parseJsonBody } from '../../_shared';
import { isMissingTableError } from '../../_tenantAccess';
import {
  addWishlistEntry,
  findActiveProduct,
  findWishlistEntry,
  listWishlistRows,
  removeWishlistEntry,
  resolveWishlistUserId,
  validateProductId,
  WishlistStorageUnavailableError,
} from '../_wishlistStore';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<{ productId?: unknown }>(request).catch(() => null);
  const productId = validateProductId(body?.productId);
  if (!productId) {
    return jsonResponse({ error: 'Valid numeric Product ID required.' }, 400);
  }

  try {
    const userId = await resolveWishlistUserId(env, auth.user.authSubject, auth.user.id);
    if (!userId) {
      return jsonResponse({ error: 'Customer profile not found for this account.' }, 404);
    }

    const product = await findActiveProduct(env, productId);
    if (!product) {
      return jsonResponse({ error: 'Product not found.' }, 404);
    }

    // Repeated identical toggles never create duplicate rows. The authenticated
    // user id is the only ownership key; request body fields are ignored.
    const existing = await findWishlistEntry(env, userId, productId);
    if (existing) {
      await removeWishlistEntry(env, userId, productId);
    } else {
      await addWishlistEntry(env, userId, productId, product.websiteId);
    }

    const rows = await listWishlistRows(env, userId);
    return jsonResponse({
      productIds: rows.map((row) => Number(row.product_id)).filter(Number.isInteger),
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
    return jsonResponse({ error: 'Unable to update wishlist.' }, 500);
  }
}
