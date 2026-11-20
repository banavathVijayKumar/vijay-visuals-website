// ============================================================================
// GET & POST /api/platform/reviews
// Complete Verified Customer Reviews & Ratings System (Zero Fake Reviews!)
// - 1-5 star product & overall shop ratings + customer review photos
// - Verified purchase check against store_orders (paid or delivered)
// - Duplicate prevention via UNIQUE index per (website, product, user, order)
// - Customer edit/delete own reviews, Shop Owner replies, Abuse reporting,
//   and Vijay Visuals Super Admin moderation with audit logging.
// ============================================================================

import { requireAdmin, requireUser, requireWebsiteAccess } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, sanitizeText, writeAuditLog } from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  const productIdParam = url.searchParams.get('productId');
  const includeModerated = url.searchParams.get('includeModerated') === 'true';

  if (!websiteId && !includeModerated) {
    return errorJson('websiteId query parameter is required.', 400);
  }

  let canSeeModerated = false;
  if (includeModerated && request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (auth.ok) {
      if (auth.user.isSuperAdmin) {
        canSeeModerated = true;
      } else if (websiteId) {
        const access = await requireWebsiteAccess(env, auth.user, websiteId, [
          'business_owner',
          'business_manager',
        ]);
        if (access.ok) canSeeModerated = true;
      }
    }
  }

  // Super Admin global moderation queue when websiteId omitted
  if (!websiteId && canSeeModerated) {
    const flagged = await env.DB.prepare(
      `SELECT r.*, p.business_name
       FROM product_reviews r
       LEFT JOIN customer_website_publications p ON p.website_id = r.website_id
       ORDER BY (CASE WHEN r.moderation_status = 'flagged' THEN 0 ELSE 1 END), r.created_at DESC
       LIMIT 100`
    ).all();
    return json({ reviews: flagged.results || [] });
  }

  const productId = productIdParam ? Number(productIdParam) : null;
  const statusClause = canSeeModerated
    ? `moderation_status != 'removed'`
    : `moderation_status = 'published'`;

  const reviewsRes =
    productId && Number.isInteger(productId)
      ? await env.DB.prepare(
          `SELECT * FROM product_reviews WHERE website_id = ? AND product_id = ? AND ${statusClause} ORDER BY created_at DESC LIMIT 100`
        )
          .bind(websiteId, productId)
          .all<Record<string, unknown>>()
      : await env.DB.prepare(
          `SELECT * FROM product_reviews WHERE website_id = ? AND ${statusClause} ORDER BY created_at DESC LIMIT 100`
        )
          .bind(websiteId)
          .all<Record<string, unknown>>();

  const photosRes = await env.DB.prepare(
    'SELECT id, review_id, photo_url, caption FROM review_photos WHERE website_id = ? ORDER BY id ASC'
  )
    .bind(websiteId)
    .all<{ id: number; review_id: number; photo_url: string; caption: string }>();

  const photoMap = new Map<number, Array<{ id: number; photoUrl: string; caption: string }>>();
  for (const ph of photosRes.results || []) {
    const list = photoMap.get(ph.review_id) || [];
    list.push({ id: ph.id, photoUrl: ph.photo_url, caption: ph.caption });
    photoMap.set(ph.review_id, list);
  }

  const reviews = (reviewsRes.results || []).map((r) => ({
    ...r,
    verified_purchase: Boolean(r.verified_purchase),
    photos: photoMap.get(Number(r.id)) || [],
  }));

  // Compute authentic overall shop & product ratings strictly from published reviews
  const shopAgg = await env.DB.prepare(
    `SELECT COUNT(*) AS total_count, COALESCE(AVG(rating), 0) AS avg_rating,
            SUM(CASE WHEN verified_purchase = 1 THEN 1 ELSE 0 END) AS verified_count
     FROM product_reviews
     WHERE website_id = ? AND moderation_status = 'published'`
  )
    .bind(websiteId)
    .first<{ total_count: number; avg_rating: number; verified_count: number }>();

  const productAgg =
    productId && Number.isInteger(productId)
      ? await env.DB.prepare(
          `SELECT COUNT(*) AS total_count, COALESCE(AVG(rating), 0) AS avg_rating
           FROM product_reviews
           WHERE website_id = ? AND product_id = ? AND moderation_status = 'published'`
        )
          .bind(websiteId, productId)
          .first<{ total_count: number; avg_rating: number }>()
      : null;

  return json({
    shopSummary: {
      totalReviews: Number(shopAgg?.total_count || 0),
      averageRating: Number(shopAgg?.total_count || 0) > 0 ? Number(Number(shopAgg?.avg_rating || 0).toFixed(2)) : 0,
      verifiedPurchaseCount: Number(shopAgg?.verified_count || 0),
    },
    ...(productAgg
      ? {
          productSummary: {
            productId,
            totalReviews: Number(productAgg.total_count || 0),
            averageRating: Number(productAgg.total_count || 0) > 0 ? Number(Number(productAgg.avg_rating || 0).toFixed(2)) : 0,
          },
        }
      : {}),
    reviews,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.action) return errorJson('action is required.', 400);
  const action = String(body.action);

  // -------------------------------------------------------------------------
  // 1. Submit Review (Strict Verified Purchase Check + Duplicate Prevention)
  // -------------------------------------------------------------------------
  if (action === 'submit') {
    const websiteId = sanitizeText(body.websiteId || '', 120);
    const productId = body.productId ? Number(body.productId) : null;
    const orderId = body.orderId ? Number(body.orderId) : null;
    const rating = Math.round(Number(body.rating || 0));
    const title = sanitizeText(body.title || '', 140);
    const comment = sanitizeText(body.comment || '', 1500);
    const requireVerifiedPurchase = body.requireVerifiedPurchase !== false;

    if (!websiteId) return errorJson('websiteId is required.', 400);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return errorJson('Rating must be an integer between 1 and 5 stars.', 400);
    }
    if (comment.length < 5) {
      return errorJson('Please write a review comment of at least 5 characters.', 400);
    }

    // Verify authentic purchase eligibility from store_orders (paid or delivered)
    let verifiedPurchase = 0;
    let matchedOrderId: number | null = null;

    const orderQuery = orderId
      ? env.DB.prepare(
          `SELECT id, items_json, payment_status, order_status
           FROM store_orders
           WHERE id = ? AND website_id = ? AND (customer_user_id = ? OR customer_user_id = ?)
             AND (payment_status = 'paid' OR order_status = 'delivered')
           LIMIT 1`
        ).bind(orderId, websiteId, auth.user.id, auth.user.authSubject)
      : env.DB.prepare(
          `SELECT id, items_json, payment_status, order_status
           FROM store_orders
           WHERE website_id = ? AND (customer_user_id = ? OR customer_user_id = ?)
             AND (payment_status = 'paid' OR order_status = 'delivered')
           ORDER BY created_at DESC LIMIT 20`
        ).bind(websiteId, auth.user.id, auth.user.authSubject);

    const eligibleOrders = (await orderQuery.all<{
      id: number;
      items_json: string;
      payment_status: string;
      order_status: string;
    }>()).results || [];

    for (const ord of eligibleOrders) {
      if (!productId) {
        verifiedPurchase = 1;
        matchedOrderId = ord.id;
        break;
      }
      try {
        const items = JSON.parse(ord.items_json || '[]') as Array<{ productId?: number }>;
        if (items.some((i) => Number(i.productId) === productId)) {
          verifiedPurchase = 1;
          matchedOrderId = ord.id;
          break;
        }
      } catch {
        // ignore malformed items_json
      }
    }

    if (requireVerifiedPurchase && verifiedPurchase !== 1) {
      return errorJson(
        'Only verified purchasers with a paid or delivered order from this store can submit a verified purchase review.',
        403
      );
    }

    try {
      const insertRes = await env.DB.prepare(
        `INSERT INTO product_reviews
          (website_id, product_id, order_id, reviewer_user_id, reviewer_name, rating, title, comment,
           verified_purchase, moderation_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'))`
      )
        .bind(
          websiteId,
          productId,
          matchedOrderId,
          auth.user.id,
          sanitizeText(body.reviewerName || auth.user.fullName, 100),
          rating,
          title,
          comment,
          verifiedPurchase
        )
        .run();

      const reviewId = Number(insertRes.meta?.last_row_id || 0);

      // Attach validated customer review photos (https:// URLs only, max 4)
      const photos = Array.isArray(body.photos)
        ? (body.photos as Array<string | { url?: string; photoUrl?: string; caption?: string }>)
        : [];
      for (const ph of photos.slice(0, 4)) {
        const rawUrl = typeof ph === 'string' ? ph : ph?.url || ph?.photoUrl || '';
        const rawCaption = typeof ph === 'string' ? '' : ph?.caption || '';
        const photoUrl = sanitizeText(rawUrl, 600);
        if (/^https:\/\//i.test(photoUrl)) {
          await env.DB.prepare(
            `INSERT INTO review_photos (review_id, website_id, photo_url, caption, created_at)
             VALUES (?, ?, ?, ?, datetime('now'))`
          )
            .bind(reviewId, websiteId, photoUrl, sanitizeText(rawCaption, 160))
            .run();
        }
      }

      const saved = await env.DB.prepare('SELECT * FROM product_reviews WHERE id = ? LIMIT 1')
        .bind(reviewId)
        .first();
      return json(
        {
          review: saved,
          verifiedPurchase: Boolean(verifiedPurchase),
        },
        201
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('unique')) {
        return errorJson('You have already submitted a review for this purchase.', 409);
      }
      return errorJson('Unable to save review.', 500);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Customer Edit Own Review
  // -------------------------------------------------------------------------
  if (action === 'edit') {
    const reviewId = Number(body.reviewId);
    const rating = Math.round(Number(body.rating || 0));
    const comment = sanitizeText(body.comment || '', 1500);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return errorJson('Valid reviewId is required.', 400);
    if (rating < 1 || rating > 5 || comment.length < 5) {
      return errorJson('Valid rating (1–5) and comment (5+ chars) are required.', 400);
    }

    const existing = await env.DB.prepare('SELECT id, reviewer_user_id FROM product_reviews WHERE id = ? LIMIT 1')
      .bind(reviewId)
      .first<{ id: number; reviewer_user_id: string }>();
    if (!existing) return errorJson('Review not found.', 404);
    if (existing.reviewer_user_id !== auth.user.id && existing.reviewer_user_id !== auth.user.authSubject) {
      return errorJson('Forbidden: you can only edit your own review.', 403);
    }

    await env.DB.prepare(
      `UPDATE product_reviews SET rating = ?, title = ?, comment = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(rating, sanitizeText(body.title || '', 140), comment, reviewId)
      .run();

    return json({ updated: true, reviewId });
  }

  // -------------------------------------------------------------------------
  // 3. Customer Delete Own Review
  // -------------------------------------------------------------------------
  if (action === 'delete') {
    const reviewId = Number(body.reviewId);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return errorJson('Valid reviewId is required.', 400);
    const existing = await env.DB.prepare('SELECT id, reviewer_user_id FROM product_reviews WHERE id = ? LIMIT 1')
      .bind(reviewId)
      .first<{ id: number; reviewer_user_id: string }>();
    if (!existing) return errorJson('Review not found.', 404);
    if (
      existing.reviewer_user_id !== auth.user.id &&
      existing.reviewer_user_id !== auth.user.authSubject &&
      !auth.user.isSuperAdmin
    ) {
      return errorJson('Forbidden: you can only delete your own review.', 403);
    }

    await env.DB.prepare('DELETE FROM product_reviews WHERE id = ?').bind(reviewId).run();
    return json({ deleted: true, reviewId });
  }

  // -------------------------------------------------------------------------
  // 4. Shop Owner Reply to Customer Review (Strict Tenant Ownership Check)
  // -------------------------------------------------------------------------
  if (action === 'owner_reply') {
    const reviewId = Number(body.reviewId);
    const reply = sanitizeText(body.reply || '', 1000);
    if (!Number.isInteger(reviewId) || reviewId <= 0 || reply.length < 2) {
      return errorJson('Valid reviewId and reply text are required.', 400);
    }
    const review = await env.DB.prepare('SELECT id, website_id FROM product_reviews WHERE id = ? LIMIT 1')
      .bind(reviewId)
      .first<{ id: number; website_id: string }>();
    if (!review) return errorJson('Review not found.', 404);

    const access = await requireWebsiteAccess(env, auth.user, review.website_id, [
      'business_owner',
      'business_manager',
    ]);
    if (!access.ok) return access.response;

    await env.DB.prepare(
      `UPDATE product_reviews SET owner_reply = ?, owner_replied_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
      .bind(reply, reviewId)
      .run();

    return json({ replied: true, reviewId });
  }

  // -------------------------------------------------------------------------
  // 5. Report Abusive or Fake Review
  // -------------------------------------------------------------------------
  if (action === 'report') {
    const reviewId = Number(body.reviewId);
    const reason = sanitizeText(body.reason || '', 300);
    if (!Number.isInteger(reviewId) || reviewId <= 0 || reason.length < 5) {
      return errorJson('Valid reviewId and report reason (5+ chars) are required.', 400);
    }
    const review = await env.DB.prepare('SELECT id FROM product_reviews WHERE id = ? LIMIT 1')
      .bind(reviewId)
      .first();
    if (!review) return errorJson('Review not found.', 404);

    await env.DB.prepare(
      `UPDATE product_reviews
       SET reported_count = reported_count + 1,
           last_report_reason = ?,
           moderation_status = 'flagged',
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(reason, reviewId)
      .run();

    return json({ reported: true, reviewId, moderationStatus: 'flagged' });
  }

  // -------------------------------------------------------------------------
  // 6. Vijay Visuals Super Admin Moderation (Publish / Hide / Remove)
  // -------------------------------------------------------------------------
  if (action === 'moderate') {
    const adminAuth = await requireAdmin(request, env);
    if (!adminAuth.ok) return adminAuth.response;

    const reviewId = Number(body.reviewId);
    const decision = String(body.decision || '');
    const reason = sanitizeText(body.reason || '', 300);
    if (!Number.isInteger(reviewId) || reviewId <= 0) return errorJson('Valid reviewId is required.', 400);
    if (!['published', 'hidden', 'removed'].includes(decision)) {
      return errorJson('decision must be "published", "hidden", or "removed".', 400);
    }
    if (reason.length < 5) {
      return errorJson('A moderation audit reason (5+ chars) is mandatory.', 400);
    }

    await env.DB.prepare(
      `UPDATE product_reviews
       SET moderation_status = ?, moderated_by = ?, moderation_reason = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(decision, adminAuth.user.id, reason, reviewId)
      .run();

    await writeAuditLog(env, {
      actorId: adminAuth.user.id,
      actorRole: 'super_admin',
      action: `review_moderated_${decision}`,
      targetType: 'product_reviews',
      targetId: String(reviewId),
      details: { decision, reason },
    });

    return json({ moderated: true, reviewId, moderationStatus: decision });
  }

  return errorJson('Unsupported reviews action.', 400);
}
