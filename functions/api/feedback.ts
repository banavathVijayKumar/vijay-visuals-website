// ============================================================================
// GET & POST /api/feedback — Customer Feedback & Feature Requests (Module 17)
// Ported from Express/PostgreSQL to Cloudflare Pages Functions + D1.
// GET is public; POST requires an authenticated Supabase session.
// ============================================================================

import { requireUser, requireWebsiteAccess } from './_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from './_shared';
import { isMissingTableError } from './_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function mapFeedbackRow(row: Record<string, any>): Record<string, unknown> {
  return {
    id: Number(row.id) || 0,
    userId: row.user_id ?? null,
    tenantId: row.tenant_id ?? null,
    authorName: sanitizeText(row.author_name, 160),
    authorEmail: sanitizeText(row.author_email, 200),
    feedbackType: sanitizeText(row.feedback_type, 40) || 'feedback',
    rating: Number(row.rating) || 0,
    title: sanitizeText(row.title, 140),
    message: sanitizeText(row.message, 1000),
    status: sanitizeText(row.status, 40) || 'received',
    createdAt: String(row.created_at || ''),
  };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;

  // No D1 binding means no truthful feedback can be served: fail closed.
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  try {
    const res = await env.DB.prepare(
      `SELECT id, user_id, tenant_id, author_name, author_email, feedback_type,
              rating, title, message, status, created_at
       FROM platform_feedback
       ORDER BY created_at DESC, id DESC
       LIMIT 50`
    ).all<Record<string, any>>();

    const feedback = (res.results || []).map(mapFeedbackRow);
    const avgRating =
      feedback.length > 0
        ? Number((feedback.reduce((sum, f) => sum + Number(f.rating || 0), 0) / feedback.length).toFixed(1))
        : 0;

    return jsonResponse({
      feedback,
      summary: { total: feedback.length, averageRating: avgRating },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      // platform_feedback is not part of the current D1 migrations (0010 uses
      // support_tickets). Report an honest empty collection, never invented data.
      return jsonResponse({ feedback: [], summary: { total: 0, averageRating: 0 } });
    }
    return jsonResponse({ error: 'Unable to load customer feedback.' }, 500);
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const rl = await checkRateLimit(env, `feedback:${auth.user.id}:${getClientIp(request)}`, 10, 600);
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many feedback submissions. Please try again later.');

  const body = await parseJsonBody<{
    tenantId?: string | number | null;
    feedbackType?: string;
    rating?: number;
    title?: string;
    message?: string;
  }>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);
  }

  const feedbackType = sanitizeText(body.feedbackType, 40) === 'feature_request' ? 'feature_request' : 'feedback';
  const rating = body.rating == null ? 5 : Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: 'Rating must be between 1 and 5.' }, 400);
  }

  const title = sanitizeText(body.title, 140);
  const message = sanitizeText(body.message, 1000);
  if (title.length < 3 || message.length < 6) {
    return jsonResponse({ error: 'Please provide a clear title (3+ chars) and message (6+ chars).' }, 400);
  }

  // Never trust a client-supplied tenant id. Resolve and authorize it first.
  let tenantWebsiteId: string | null = null;
  const rawTenantId = body.tenantId == null ? '' : String(body.tenantId).trim();
  if (rawTenantId && rawTenantId !== '0') {
    const access = await requireWebsiteAccess(env, auth.user, rawTenantId);
    if (!access.ok) return access.response;
    tenantWebsiteId = access.website.website_id;
  }

  const authorName = sanitizeText(auth.user.fullName || auth.user.email, 160) || auth.user.email;
  const authorEmail = sanitizeText(auth.user.email, 200);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO platform_feedback
         (user_id, tenant_id, author_name, author_email, feedback_type, rating, title, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', datetime('now'))`
    )
      .bind(
        auth.user.id,
        tenantWebsiteId,
        authorName,
        authorEmail,
        feedbackType,
        rating,
        title,
        message
      )
      .run();

    const created = {
      id: Number(res?.meta?.last_row_id || 0),
      userId: auth.user.id,
      tenantId: tenantWebsiteId,
      authorName,
      authorEmail,
      feedbackType,
      rating,
      title,
      message,
      status: 'received',
      createdAt: new Date().toISOString(),
    };

    return jsonResponse({ feedback: created }, 201);
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Feedback storage is not available on this deployment.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit feedback.' }, 500);
  }
}
