// ============================================================================
// POST /api/products/:id/reviews — Submit a Verified/Rate-Limited Product Review
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  randomHex,
  sanitizeText,
} from '../../_shared';
import { isMissingTableError } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  if (!env.DB) {
    return jsonResponse({ error: 'Review storage is not configured.' }, 503);
  }

  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return jsonResponse({ error: 'Invalid product ID.' }, 400);
  }

  const rl = await checkRateLimit(env, `review:${getClientIp(request)}:${productId}`, 5, 3600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many reviews submitted recently. Please wait.' }, 429);
  }

  let reviewerUserId = `guest_${randomHex(6)}`;
  if (request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (auth.ok) reviewerUserId = auth.user.id;
  }

  const body = await parseJsonBody<{
    customerName?: string;
    rating?: number;
    comment?: string;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const customerName = sanitizeText(body.customerName, 100);
  const comment = sanitizeText(body.comment, 1000);
  const rating = Math.round(Number(body.rating));

  if (!customerName || customerName.length < 2) {
    return jsonResponse({ error: 'Your name is required.' }, 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: 'Rating must be between 1 and 5 stars.' }, 400);
  }
  if (!comment || comment.length < 3) {
    return jsonResponse({ error: 'Please write a short review comment.' }, 400);
  }

  try {
    const prod = await env.DB.prepare(
      'SELECT id, website_id FROM store_products WHERE id = ? LIMIT 1'
    )
      .bind(productId)
      .first<{ id: number; website_id: string }>();
    if (!prod) {
      return jsonResponse({ error: 'Product not found.' }, 404);
    }

    const pub = await env.DB.prepare(
      'SELECT rowid FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(prod.website_id)
      .first<{ rowid?: number }>();

    const insertRes = await env.DB.prepare(
      `INSERT INTO product_reviews
       (website_id, product_id, reviewer_user_id, reviewer_name, rating, comment, verified_purchase, moderation_status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'published')`
    )
      .bind(prod.website_id, productId, reviewerUserId, customerName, rating, comment)
      .run();

    const stats = await env.DB.prepare(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt
       FROM product_reviews
       WHERE product_id = ? AND moderation_status = 'published'`
    )
      .bind(productId)
      .first<{ avg_rating?: number; cnt?: number }>();

    return jsonResponse(
      {
        review: {
          id: Number(insertRes?.meta?.last_row_id || Date.now()),
          tenantId: Number(pub?.rowid || 0),
          productId,
          customerName,
          rating,
          comment,
          createdAt: new Date().toISOString(),
        },
        averageRating: Number(stats?.avg_rating || rating).toFixed(1),
        reviewCount: Number(stats?.cnt || 1),
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Reviews require D1 migration 0005 (product_reviews).', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    const msg = err instanceof Error ? err.message : '';
    if (/unique/i.test(msg)) {
      return jsonResponse({ error: 'You have already reviewed this product.' }, 409);
    }
    return jsonResponse({ error: 'Unable to submit review.' }, 500);
  }
}
