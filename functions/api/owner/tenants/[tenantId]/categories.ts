// ============================================================================
// GET, POST, PATCH, DELETE /api/owner/tenants/:tenantId/categories
// Robust category lifecycle management with dependency checks & product reassignment
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse, parseJsonBody, sanitizeText, writeAuditLog } from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';

export interface TenantCategoryItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  order: number;
  enabled: boolean;
  productCount?: number;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const websiteId = access.row.website_id;
  const parsedWebsite = access.parsed || {};

  // Fetch product counts grouped by category
  const countsMap = new Map<string, number>();
  try {
    const prodCounts = await env.DB!.prepare(
      `SELECT category, COUNT(*) as cnt FROM store_products WHERE website_id = ? GROUP BY category`
    )
      .bind(websiteId)
      .all<{ category: string; cnt: number }>();
    for (const r of prodCounts.results || []) {
      countsMap.set(r.category, Number(r.cnt || 0));
    }
  } catch {}

  const storedCategories: TenantCategoryItem[] = Array.isArray(parsedWebsite.categories)
    ? parsedWebsite.categories
    : [];

  // Merge stored categories with any unlisted categories existing on products
  const categoryNames = new Set(storedCategories.map((c) => c.name.toLowerCase()));
  const merged: TenantCategoryItem[] = storedCategories.map((c, idx) => ({
    ...c,
    order: typeof c.order === 'number' ? c.order : idx,
    enabled: c.enabled !== false,
    productCount: countsMap.get(c.name) || 0,
  }));

  for (const [catName, cnt] of countsMap.entries()) {
    if (!categoryNames.has(catName.toLowerCase())) {
      merged.push({
        id: `cat_${catName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: catName,
        order: merged.length,
        enabled: true,
        productCount: cnt,
      });
    }
  }

  merged.sort((a, b) => a.order - b.order);

  return jsonResponse({ categories: merged });
}

export async function onRequestPost(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body || !body.name) {
    return jsonResponse({ error: 'Category name is required.' }, 400);
  }

  const name = sanitizeText(body.name, 80);
  const description = sanitizeText(body.description || '', 200);
  const imageUrl = sanitizeText(body.imageUrl || '', 500);

  const websiteId = access.row.website_id;
  const parsedWebsite = access.parsed || {};
  const currentCategories: TenantCategoryItem[] = Array.isArray(parsedWebsite.categories)
    ? [...parsedWebsite.categories]
    : [];

  if (currentCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return jsonResponse({ error: `Category "${name}" already exists.` }, 400);
  }

  const newCat: TenantCategoryItem = {
    id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description,
    imageUrl,
    order: currentCategories.length,
    enabled: true,
  };

  currentCategories.push(newCat);
  parsedWebsite.categories = currentCategories;

  await env.DB!.prepare(
    `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
  )
    .bind(JSON.stringify(parsedWebsite), websiteId)
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'category_created',
    targetType: 'category',
    targetId: newCat.id,
    details: { websiteId, name },
  });

  return jsonResponse({ category: newCat }, 201);
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const websiteId = access.row.website_id;
  const parsedWebsite = access.parsed || {};
  let categories: TenantCategoryItem[] = Array.isArray(parsedWebsite.categories)
    ? [...parsedWebsite.categories]
    : [];

  if (body.action === 'rename') {
    const oldName = sanitizeText(body.oldName, 80);
    const newName = sanitizeText(body.newName, 80);
    if (!oldName || !newName) {
      return jsonResponse({ error: 'oldName and newName are required to rename.' }, 400);
    }

    let found = false;
    categories = categories.map((c) => {
      if (c.name.toLowerCase() === oldName.toLowerCase()) {
        found = true;
        return { ...c, name: newName };
      }
      return c;
    });

    if (!found) {
      categories.push({
        id: `cat_${Date.now()}`,
        name: newName,
        order: categories.length,
        enabled: true,
      });
    }

    // Reassign all existing products to the new category name
    await env.DB!.prepare(
      `UPDATE store_products SET category = ?, updated_at = datetime('now') WHERE website_id = ? AND category = ?`
    )
      .bind(newName, websiteId, oldName)
      .run();

    parsedWebsite.categories = categories;
    await env.DB!.prepare(
      `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsedWebsite), websiteId)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'category_renamed',
      targetType: 'category',
      targetId: oldName,
      details: { websiteId, oldName, newName },
    });

    return jsonResponse({ ok: true, oldName, newName });
  }

  if (body.action === 'reorder' && Array.isArray(body.categories)) {
    categories = body.categories.map((c: any, idx: number) => ({
      id: String(c.id || `cat_${idx}`),
      name: sanitizeText(c.name, 80),
      description: sanitizeText(c.description || '', 200),
      imageUrl: sanitizeText(c.imageUrl || '', 500),
      order: idx,
      enabled: c.enabled !== false,
    }));

    parsedWebsite.categories = categories;
    await env.DB!.prepare(
      `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsedWebsite), websiteId)
      .run();

    return jsonResponse({ ok: true, categories });
  }

  if (body.action === 'toggle') {
    const targetName = sanitizeText(body.name, 80);
    categories = categories.map((c) => {
      if (c.name.toLowerCase() === targetName.toLowerCase()) {
        return { ...c, enabled: Boolean(body.enabled) };
      }
      return c;
    });

    parsedWebsite.categories = categories;
    await env.DB!.prepare(
      `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsedWebsite), websiteId)
      .run();

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400);
}

export async function onRequestDelete(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const categoryName = sanitizeText(url.searchParams.get('name') || '', 80);
  const reassignTo = sanitizeText(url.searchParams.get('reassignTo') || '', 80);

  if (!categoryName) {
    return jsonResponse({ error: 'Category name is required in query parameter (?name=...).' }, 400);
  }

  const websiteId = access.row.website_id;

  // Check product dependencies
  const prodCheck = await env.DB!.prepare(
    `SELECT COUNT(*) as cnt FROM store_products WHERE website_id = ? AND category = ?`
  )
    .bind(websiteId, categoryName)
    .first<{ cnt: number }>();

  const assignedCount = Number(prodCheck?.cnt || 0);

  if (assignedCount > 0 && !reassignTo) {
    return jsonResponse(
      {
        error: `Cannot delete category "${categoryName}" because ${assignedCount} active product(s) are assigned to it. Please reassign products first.`,
        assignedCount,
        requiresReassignment: true,
      },
      409
    );
  }

  if (assignedCount > 0 && reassignTo) {
    await env.DB!.prepare(
      `UPDATE store_products SET category = ?, updated_at = datetime('now') WHERE website_id = ? AND category = ?`
    )
      .bind(reassignTo, websiteId, categoryName)
      .run();
  }

  const parsedWebsite = access.parsed || {};
  let categories: TenantCategoryItem[] = Array.isArray(parsedWebsite.categories)
    ? [...parsedWebsite.categories]
    : [];

  categories = categories.filter((c) => c.name.toLowerCase() !== categoryName.toLowerCase());
  parsedWebsite.categories = categories;

  await env.DB!.prepare(
    `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
  )
    .bind(JSON.stringify(parsedWebsite), websiteId)
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'category_deleted',
    targetType: 'category',
    targetId: categoryName,
    details: { websiteId, categoryName, reassignedTo: reassignTo || null },
  });

  return jsonResponse({ ok: true, deleted: categoryName, reassignedTo: reassignTo || null });
}
