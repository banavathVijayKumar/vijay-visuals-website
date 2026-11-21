// ============================================================================
// PATCH & DELETE /api/products/:id — Owner Updates or Deletes Their Product
// Strictly verifies ownership via the product's parent website_id (403 on cross-tenant).
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../_shared';
import {
  encodeProductMeta,
  isMissingTableError,
  mapProductRowToUi,
  parseProductMeta,
  requireTenantOwnerAccess,
  validateSafeHttpUrl,
  validateSafeImageSource,
} from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return jsonResponse({ error: 'Invalid product ID.' }, 400);
  }

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  let existing: Record<string, any> | null = null;
  try {
    existing = await env.DB.prepare('SELECT * FROM store_products WHERE id = ? LIMIT 1')
      .bind(productId)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Product storage requires D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load product.' }, 500);
  }

  if (!existing) {
    return jsonResponse({ error: 'Product not found.' }, 404);
  }

  const access = await requireTenantOwnerAccess(env, auth.user, String(existing.website_id), [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  // Support 1-Click Product Duplication
  if (body.action === 'duplicate') {
    const copyName = `${existing.name} (Copy)`.slice(0, 160);
    const copySku = existing.sku ? `${existing.sku}-COPY`.slice(0, 80) : '';
    const res = await env.DB.prepare(
      `INSERT INTO store_products
       (website_id, owner_id, sku, barcode, name, category, description, price_inr, compare_at_price_inr, stock_qty, low_stock_threshold, variants_json, images_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
      .bind(
        existing.website_id,
        existing.owner_id,
        copySku,
        existing.barcode || '',
        copyName,
        existing.category,
        existing.description || '',
        existing.price_inr,
        existing.compare_at_price_inr,
        existing.stock_qty,
        existing.low_stock_threshold || 5,
        existing.variants_json || '[]',
        existing.images_json || '[]'
      )
      .run();
    const newId = Number(res?.meta?.last_row_id || 0);
    const created = await env.DB.prepare('SELECT * FROM store_products WHERE id = ? LIMIT 1').bind(newId).first<Record<string, any>>();
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'product_duplicated',
      targetType: 'product',
      targetId: String(newId),
      details: { websiteId: existing.website_id, sourceId: productId, name: copyName },
    });
    return jsonResponse({ product: created ? mapProductRowToUi(created, Number(access.row.rowid || 0)) : null, duplicated: true }, 201);
  }

  const nextName =
    typeof body.name === 'string' && body.name.trim()
      ? sanitizeText(body.name, 160)
      : String(existing.name);
  const nextCategory =
    typeof body.category === 'string' && body.category.trim()
      ? sanitizeText(body.category, 80)
      : String(existing.category);
  const nextDescription =
    typeof body.description === 'string'
      ? sanitizeText(body.description, 1000)
      : String(existing.description || '');
  const nextSku =
    body.sku !== undefined ? sanitizeText(body.sku, 80) : String(existing.sku || '');
  const nextBarcode =
    body.barcode !== undefined ? sanitizeText(body.barcode, 80) : String(existing.barcode || '');
  const nextActive =
    body.active !== undefined
      ? (body.active ? 1 : 0)
      : body.action === 'restore'
      ? 1
      : Number(existing.is_active ?? 1);
  const nextLowStock =
    body.lowStockThreshold !== undefined
      ? Math.max(0, Math.min(10000, Math.round(Number(body.lowStockThreshold))))
      : Number(existing.low_stock_threshold ?? 5);

  let nextPrice = Number(existing.price_inr);
  if (body.price !== undefined) {
    const p = Math.round(Number(body.price));
    if (!Number.isFinite(p) || p < 0 || p > 100_000_000) {
      return jsonResponse({ error: 'Price must be a valid non-negative amount.' }, 400);
    }
    nextPrice = p;
  }

  let nextCompareAt =
    existing.compare_at_price_inr !== null && existing.compare_at_price_inr !== undefined
      ? Number(existing.compare_at_price_inr)
      : null;
  if (body.compareAtPrice !== undefined) {
    const cap = Math.round(Number(body.compareAtPrice || 0));
    nextCompareAt = Number.isFinite(cap) && cap > 0 ? cap : null;
  }

  let nextStock = Number(existing.stock_qty);
  if (body.stock !== undefined) {
    const s = Math.round(Number(body.stock));
    if (!Number.isFinite(s) || s < 0 || s > 1_000_000) {
      return jsonResponse({ error: 'Stock must be a valid non-negative integer.' }, 400);
    }
    nextStock = s;
  }

  let nextImagesJson = String(existing.images_json || '[]');
  if (Array.isArray(body.images)) {
    const validImgs: string[] = [];
    for (const img of body.images) {
      const valid = validateSafeImageSource(img);
      if (valid && !validImgs.includes(valid)) validImgs.push(valid);
      if (validImgs.length >= 6) break;
    }
    nextImagesJson = JSON.stringify(validImgs);
  } else if (typeof body.imageUrl === 'string') {
    const validImg = validateSafeImageSource(body.imageUrl);
    nextImagesJson = JSON.stringify(validImg ? [validImg] : []);
  }

  const prevMeta = parseProductMeta(existing.variants_json);
  let nextVariants = prevMeta.variants;
  if (typeof body.variantsJson === 'string') {
    try {
      const parsed = JSON.parse(body.variantsJson);
      if (Array.isArray(parsed)) {
        nextVariants = parsed.map((v) => sanitizeText(v, 60)).filter(Boolean).slice(0, 20);
      }
    } catch {}
  } else if (Array.isArray(body.variants)) {
    nextVariants = body.variants.map((v: unknown) => sanitizeText(v, 60)).filter(Boolean).slice(0, 20);
  }

  const nextVariantsJson = encodeProductMeta({
    variants: nextVariants,
    subcategory:
      typeof body.subcategory === 'string' ? sanitizeText(body.subcategory, 80) : prevMeta.subcategory,
    featured: typeof body.featured === 'boolean' ? body.featured : prevMeta.featured,
    bestseller: typeof body.bestseller === 'boolean' ? body.bestseller : prevMeta.bestseller,
    specs: typeof body.specs === 'string' ? sanitizeText(body.specs, 600) : prevMeta.specs,
    videoUrl:
      typeof body.videoUrl === 'string' ? validateSafeHttpUrl(body.videoUrl, 400) : prevMeta.videoUrl,
    wholesalePrice:
      body.wholesalePrice !== undefined
        ? Math.max(0, Math.round(Number(body.wholesalePrice || 0)))
        : prevMeta.wholesalePrice,
    minWholesaleQty:
      body.minWholesaleQty !== undefined
        ? Math.max(1, Math.round(Number(body.minWholesaleQty || 1)))
        : prevMeta.minWholesaleQty,
  });

  await env.DB.prepare(
    `UPDATE store_products
     SET sku = ?, barcode = ?, name = ?, category = ?, description = ?, price_inr = ?, compare_at_price_inr = ?, stock_qty = ?, low_stock_threshold = ?, images_json = ?, variants_json = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ? AND website_id = ?`
  )
    .bind(
      nextSku,
      nextBarcode,
      nextName,
      nextCategory,
      nextDescription,
      nextPrice,
      nextCompareAt,
      nextStock,
      nextLowStock,
      nextImagesJson,
      nextVariantsJson,
      nextActive,
      productId,
      existing.website_id
    )
    .run();

  const updated = await env.DB.prepare('SELECT * FROM store_products WHERE id = ? LIMIT 1')
    .bind(productId)
    .first<Record<string, any>>();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'product_updated',
    targetType: 'product',
    targetId: String(productId),
    details: { websiteId: existing.website_id, name: nextName, price: nextPrice, stock: nextStock },
  });

  return jsonResponse({
    product: updated ? mapProductRowToUi(updated, Number(access.row.rowid || 0)) : null,
  });
}

export async function onRequestDelete(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return jsonResponse({ error: 'Invalid product ID.' }, 400);
  }

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  let existing: { id: number; website_id: string; name: string } | null = null;
  try {
    existing = await env.DB.prepare('SELECT id, website_id, name FROM store_products WHERE id = ? LIMIT 1')
      .bind(productId)
      .first<{ id: number; website_id: string; name: string }>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Product storage requires D1 migration 0003.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load product.' }, 500);
  }

  if (!existing) {
    return jsonResponse({ error: 'Product not found.' }, 404);
  }

  const access = await requireTenantOwnerAccess(env, auth.user, existing.website_id, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const soft = url.searchParams.get('soft') === 'true';

  if (soft) {
    await env.DB.prepare(
      `UPDATE store_products SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND website_id = ?`
    )
      .bind(productId, existing.website_id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'product_disabled',
      targetType: 'product',
      targetId: String(productId),
      details: { websiteId: existing.website_id, name: existing.name, soft: true },
    });

    return jsonResponse({ deleted: true, soft: true, id: productId });
  }

  await env.DB.prepare('DELETE FROM store_products WHERE id = ? AND website_id = ?')
    .bind(productId, existing.website_id)
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'product_deleted',
    targetType: 'product',
    targetId: String(productId),
    details: { websiteId: existing.website_id, name: existing.name },
  });

  return jsonResponse({ deleted: true, id: productId });
}
