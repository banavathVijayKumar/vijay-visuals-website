// ============================================================================
// GET /api/customer/wishlist — Authenticated customer's own wishlist only
// ============================================================================

import { getBearerToken, requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { listWishlistRows, resolveWishlistUserId } from './_wishlistStore';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const token = getBearerToken(request);
  try {
    const userId = await resolveWishlistUserId(env, token, auth.user.authSubject);
    if (!userId) {
      return jsonResponse({ error: 'Customer profile not found for this account.' }, 404);
    }

    const rows = await listWishlistRows(env, token, userId);
    return jsonResponse({
      productIds: rows.map((row) => Number(row.product_id)).filter(Number.isInteger),
      items: rows,
    });
  } catch {
    return jsonResponse({ error: 'Unable to load wishlist.' }, 502);
  }
}
