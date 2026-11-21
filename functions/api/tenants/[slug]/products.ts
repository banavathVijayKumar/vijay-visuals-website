// ============================================================================
// POST /api/tenants/:slug/products — Owner Creates a Real Product in D1
// Supports numeric rowid, website_id, or public_slug in :slug parameter.
// Strictly enforces tenant ownership (cross-tenant requests receive 403).
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../_shared';
import {
  encodeProductMeta,
  isMissingTableError,
  mapProductRowToUi,
  requireTenantOwnerAccess,
  validateSafeHttpUrl,
  validateSafeImageSource,
} from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);
  }

  const name = sanitizeText(body.name, 160);
  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Product name is required (minimum 2 characters).' }, 400);
  }

  const price = Math.round(Number(body.price));
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
    return jsonResponse({ error: 'Product price must be a valid non-negative amount.' }, 400);
  }

  const compareAtPrice =
    body.compareAtPrice !== undefined && body.compareAtPrice !== '' && Number(body.compareAtPrice) > 0
      ? Math.max(0, Math.round(Number(body.compareAtPrice)))
      : null;
  if (body.stock !== undefined && (!Number.isFinite(Number(body.stock)) || Number(body.stock) < 0)) {
    return jsonResponse({ error: 'Initial stock must be a non-negative integer.' }, 400);
  }
  const stock = Math.max(0, Math.min(1_000_000, Math.round(Number(body.stock ?? 0))));
  const lowStockThreshold = Math.max(
    0,
    Math.min(10_000, Math.round(Number(body.lowStockThreshold ?? 5)))
  );
  const category = sanitizeText(body.category, 80) || 'General';
  const subcategory = sanitizeText(body.subcategory, 80);
  const sku = sanitizeText(body.sku, 80);
  const barcode = sanitizeText(body.barcode, 80);
  const description = sanitizeText(body.description, 1000);
  const specs = sanitizeText(body.specs, 600);
  const videoUrl = validateSafeHttpUrl(body.videoUrl, 400);
  const featured = Boolean(body.featured);
  const bestseller = Boolean(body.bestseller);
  const wholesalePrice = Math.max(0, Math.round(Number(body.wholesalePrice || 0)));
  const minWholesaleQty = Math.max(1, Math.round(Number(body.minWholesaleQty || 1)));

  const validatedImages: string[] = [];
  if (Array.isArray(body.images)) {
    for (const img of body.images) {
      const valid = validateSafeImageSource(img);
      if (valid && !validatedImages.includes(valid)) validatedImages.push(valid);
      if (validatedImages.length >= 6) break;
    }
  }
  const singleImg = validateSafeImageSource(body.imageUrl);
  if (singleImg && !validatedImages.includes(singleImg)) {
    validatedImages.unshift(singleImg);
  }
  const imagesJson = JSON.stringify(validatedImages.slice(0, 6));

  let variants: string[] = [];
  if (typeof body.variantsJson === 'string') {
    try {
      const parsed = JSON.parse(body.variantsJson);
      if (Array.isArray(parsed)) {
        variants = parsed.map((v) => sanitizeText(v, 60)).filter(Boolean).slice(0, 20);
      }
    } catch {}
  } else if (Array.isArray(body.variants)) {
    variants = body.variants.map((v: unknown) => sanitizeText(v, 60)).filter(Boolean).slice(0, 20);
  }

  const encodedVariants = encodeProductMeta({
    variants,
    subcategory,
    featured,
    bestseller,
    specs,
    videoUrl,
    wholesalePrice,
    minWholesaleQty,
  });

  try {
    const result = await env.DB!.prepare(
      `INSERT INTO store_products
       (website_id, owner_id, sku, barcode, name, category, description, price_inr, compare_at_price_inr, stock_qty, low_stock_threshold, variants_json, images_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
      .bind(
        access.row.website_id,
        access.row.owner_id,
        sku,
        barcode,
        name,
        category,
        description,
        price,
        compareAtPrice,
        stock,
        lowStockThreshold,
        encodedVariants,
        imagesJson
      )
      .run();

    const insertedId = Number(result?.meta?.last_row_id || 0);
    const created = insertedId
      ? await env.DB!.prepare('SELECT * FROM store_products WHERE id = ? LIMIT 1')
          .bind(insertedId)
          .first<Record<string, any>>()
      : await env.DB!.prepare(
          'SELECT * FROM store_products WHERE website_id = ? ORDER BY id DESC LIMIT 1'
        )
          .bind(access.row.website_id)
          .first<Record<string, any>>();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'product_created',
      targetType: 'product',
      targetId: String(created?.id || insertedId),
      details: { websiteId: access.row.website_id, name, price, stock },
    });

    const tenantRowId = Number(access.row.rowid || 0);
    return jsonResponse(
      { product: created ? mapProductRowToUi(created, tenantRowId) : null },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error:
            'Product catalog storage requires D1 migration 0003 (store_products). Apply migration 0003 before adding products.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to save product.' }, 500);
  }
}
