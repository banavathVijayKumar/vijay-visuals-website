// ============================================================================
// POST /api/tenants/:slug/coupons — Owner Creates a Promotional Coupon in D1
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON payload.' }, 400);

  const code = sanitizeText(body.code, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code || code.length < 3) {
    return jsonResponse({ error: 'Coupon code must be at least 3 alphanumeric characters.' }, 400);
  }

  const discountType = body.discountType === 'flat' ? 'flat' : 'percent';
  const discountValue = Math.round(Number(body.discountValue));
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return jsonResponse({ error: 'Discount value must be greater than zero.' }, 400);
  }
  if (discountType === 'percent' && discountValue > 95) {
    return jsonResponse({ error: 'Percentage discount cannot exceed 95%.' }, 400);
  }
  const minOrder = Math.max(0, Math.round(Number(body.minOrder || 0)));

  try {
    const insertRes = await env.DB!.prepare(
      `INSERT INTO store_coupons (website_id, owner_id, code, discount_type, discount_value, min_order_inr, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
      .bind(
        access.row.website_id,
        access.row.owner_id,
        code,
        discountType,
        discountValue,
        minOrder
      )
      .run();

    const id = Number(insertRes?.meta?.last_row_id || 0);
    return jsonResponse({ ok: true, id, code, discountType, discountValue, minOrder }, 201);
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Coupons require D1 migration 0005 (store_coupons).', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    const msg = err instanceof Error ? err.message : '';
    if (/unique/i.test(msg)) {
      return jsonResponse({ error: `Coupon code "${code}" already exists for this store.` }, 409);
    }
    return jsonResponse({ error: 'Unable to create coupon.' }, 500);
  }
}

export async function onRequestDelete(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  let couponId = Number(url.searchParams.get('id') || 0);
  if (!couponId) {
    const body = await parseJsonBody<{ id?: number }>(request);
    couponId = Number(body?.id || 0);
  }
  if (!Number.isInteger(couponId) || couponId <= 0) {
    return jsonResponse({ error: 'Valid coupon ID is required.' }, 400);
  }

  try {
    await env.DB!.prepare(
      'DELETE FROM store_coupons WHERE id = ? AND website_id = ?'
    )
      .bind(couponId, access.row.website_id)
      .run();
    return jsonResponse({ deleted: true, id: couponId });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Coupons require D1 migration 0005 (store_coupons).', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to delete coupon.' }, 500);
  }
}
