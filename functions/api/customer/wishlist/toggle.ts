// ============================================================================
// POST /api/customer/wishlist/toggle — Add/remove the caller's own wishlist item
// ============================================================================

import { getBearerToken, requireUser } from '../../_auth';
import { PagesContext, handleOptions, jsonResponse, parseJsonBody } from '../../_shared';
import {
  addWishlistEntry,
  findActiveProduct,
  findWishlistEntry,
  listWishlistRows,
  removeWishlistEntry,
  resolveWishlistUserId,
  validateProductId,
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

  const token = getBearerToken(request);
  try {
    const userId = await resolveWishlistUserId(env, token, auth.user.authSubject);
    if (!userId) {
      return jsonResponse({ error: 'Customer profile not found for this account.' }, 404);
    }

    const product = await findActiveProduct(env, token, productId);
    if (!product) {
      return jsonResponse({ error: 'Product not found.' }, 404);
    }

    // Repeated requests never create duplicate rows: the second identical
    // toggle simply removes the existing row for this same authenticated user.
    const existing = await findWishlistEntry(env, token, userId, productId);
    if (existing) {
      await removeWishlistEntry(env, token, Number(existing.id));
    } else {
      await addWishlistEntry(env, token, userId, product.id, product.tenantId);
    }

    const rows = await listWishlistRows(env, token, userId);
    return jsonResponse({
      productIds: rows.map((row) => Number(row.product_id)).filter(Number.isInteger),
    });
  } catch {
    return jsonResponse({ error: 'Unable to update wishlist.' }, 502);
  }
}
