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
  let authUser: { id: string; authSubject: string; email: string; fullName: string } | null = null;
  if (request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (auth.ok) {
      reviewerUserId = auth.user.id;
      authUser = auth.user;
    }
  }

  const body = await parseJsonBody<{
    customerName?: string;
    rating?: number;
    title?: string;
    comment?: string;
    orderId?: number;
    photos?: Array<string | { url?: string; photoUrl?: string; caption?: string }>;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const customerName = sanitizeText(body.customerName || authUser?.fullName || 'Verified Customer', 100);
  const title = sanitizeText(body.title || '', 140);
  const comment = sanitizeText(body.comment, 1500);
  const rating = Math.round(Number(body.rating));

  if (!customerName || customerName.length < 2) {
    return jsonResponse({ error: 'Your name is required.' }, 400);
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: 'Rating must be between 1 and 5 stars.' }, 400);
  }
  if (!comment || comment.length < 5) {
    return jsonResponse({ error: 'Please write a review comment of at least 5 characters.' }, 400);
  }

  try {
    const prod = await env.DB.prepare(
      'SELECT id, website_id, name FROM store_products WHERE id = ? LIMIT 1'
    )
      .bind(productId)
      .first<{ id: number; website_id: string; name: string }>();
    if (!prod) {
      return jsonResponse({ error: 'Product not found.' }, 404);
    }

    const pub = await env.DB.prepare(
      'SELECT rowid, owner_id FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(prod.website_id)
      .first<{ rowid?: number; owner_id?: string }>();

    // Check for verified purchase against store_orders
    let verifiedPurchase = 0;
    let matchedOrderId: number | null = body.orderId ? Number(body.orderId) : null;

    if (authUser) {
      const userEmail = (authUser.email || '').trim().toLowerCase();
      const orderQuery = matchedOrderId
        ? env.DB.prepare(
            `SELECT id, items_json, payment_status, order_status
             FROM store_orders
             WHERE id = ? AND website_id = ?
               AND (customer_user_id = ? OR customer_user_id = ? OR (LOWER(customer_email) = ? AND customer_email != ''))
               AND (payment_status = 'paid' OR order_status = 'delivered')
             LIMIT 1`
          ).bind(matchedOrderId, prod.website_id, authUser.id, authUser.authSubject, userEmail)
        : env.DB.prepare(
            `SELECT id, items_json, payment_status, order_status
             FROM store_orders
             WHERE website_id = ?
               AND (customer_user_id = ? OR customer_user_id = ? OR (LOWER(customer_email) = ? AND customer_email != ''))
               AND (payment_status = 'paid' OR order_status = 'delivered')
             ORDER BY created_at DESC LIMIT 20`
          ).bind(prod.website_id, authUser.id, authUser.authSubject, userEmail);

      const eligibleOrders = (await orderQuery.all<{
        id: number;
        items_json: string;
        payment_status: string;
        order_status: string;
      }>()).results || [];

      for (const ord of eligibleOrders) {
        try {
          const items = JSON.parse(ord.items_json || '[]') as Array<{ productId?: number; id?: number }>;
          if (items.some((i) => Number(i.productId || i.id) === productId)) {
            verifiedPurchase = 1;
            matchedOrderId = ord.id;
            break;
          }
        } catch {
          // ignore malformed items_json
        }
      }
    }

    const insertRes = await env.DB.prepare(
      `INSERT INTO product_reviews
       (website_id, product_id, order_id, reviewer_user_id, reviewer_name, rating, title, comment, verified_purchase, moderation_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'))`
    )
      .bind(prod.website_id, productId, matchedOrderId, reviewerUserId, customerName, rating, title, comment, verifiedPurchase)
      .run();

    const reviewId = Number(insertRes?.meta?.last_row_id || 0);

    // Save photos if provided
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
    const savedPhotos: Array<{ id: number; photoUrl: string; caption: string }> = [];
    for (const ph of photos) {
      const rawUrl = typeof ph === 'string' ? ph : ph?.url || ph?.photoUrl || '';
      const rawCaption = typeof ph === 'string' ? '' : ph?.caption || '';
      const photoUrl = sanitizeText(rawUrl, 600);
      if (/^https:\/\//i.test(photoUrl)) {
        const phRes = await env.DB.prepare(
          `INSERT INTO review_photos (review_id, website_id, photo_url, caption, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`
        )
          .bind(reviewId, prod.website_id, photoUrl, sanitizeText(rawCaption, 160))
          .run();
        savedPhotos.push({
          id: Number(phRes?.meta?.last_row_id || 0),
          photoUrl,
          caption: sanitizeText(rawCaption, 160),
        });
      }
    }

    // In-app notification for owner
    if (pub?.owner_id) {
      await env.DB.prepare(
        `INSERT INTO notification_logs
         (website_id, recipient_user_id, recipient_contact, channel, event_type, subject, message_preview, consent_verified, delivery_status, created_at)
         VALUES (?, ?, '', 'in_app', 'new_customer_review', ?, ?, 1, 'delivered', datetime('now'))`
      )
        .bind(
          prod.website_id,
          pub.owner_id,
          `New ${rating}★ Review for ${prod.name} from ${customerName}`,
          sanitizeText(comment, 150)
        )
        .run()
        .catch(() => null);
    }

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
          id: reviewId,
          tenantId: Number(pub?.rowid || 0),
          websiteId: prod.website_id,
          productId,
          productName: prod.name,
          customerName,
          rating,
          title,
          comment,
          verifiedPurchase: Boolean(verifiedPurchase),
          photos: savedPhotos,
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
      return jsonResponse({ error: 'You have already reviewed this product or order.' }, 409);
    }
    return jsonResponse({ error: 'Unable to submit review.' }, 500);
  }
}
