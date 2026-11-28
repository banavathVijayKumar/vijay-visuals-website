// ============================================================================
// PATCH & DELETE /api/services/:id — Tenant-Owned Service Catalog Mutations
// Load-row-first authorization: the row's website_id is authoritative, never
// a client-supplied tenant identifier. Migration 0027 required.
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
  isMissingTableError,
  mapServiceRowToUi,
  requireTenantOwnerAccess,
  validateSafeImageSource,
} from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

async function loadOwnedService(context: PagesContext<{ id: string }>) {
  const { request, env, params } = context;
  const id = Number(params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: jsonResponse({ error: 'Invalid service identifier.' }, 400) };
  }

  const auth = await requireUser(request, env);
  if (!auth.ok) return { error: auth.response };

  let row: Record<string, any> | null = null;
  try {
    row = await env.DB!.prepare('SELECT * FROM tenant_services WHERE id = ? LIMIT 1')
      .bind(id)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) {
      return {
        error: jsonResponse(
          {
            error:
              'Service catalog storage requires D1 migration 0027 (tenant_services). Apply migration 0027 before managing services.',
            code: 'MIGRATION_REQUIRED',
          },
          503
        ),
      };
    }
    return { error: jsonResponse({ error: 'Unable to load service.' }, 500) };
  }

  if (!row) return { error: jsonResponse({ error: 'Service not found.' }, 404) };

  const access = await requireTenantOwnerAccess(env, auth.user, String(row.website_id), [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return { error: access.response };

  return { auth, access, row, id };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const loaded = await loadOwnedService(context);
  if (loaded.error) return loaded.error;
  const { auth, access, row, id } = loaded;

  const body = await parseJsonBody<Record<string, any>>(context.request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const next = {
    name: body.name === undefined ? String(row.name || '') : sanitizeText(body.name, 160),
    description:
      body.description === undefined ? String(row.description || '') : sanitizeText(body.description, 1000),
    category:
      body.category === undefined ? String(row.category || 'General') : sanitizeText(body.category, 80) || 'General',
    price:
      body.price === undefined
        ? Math.round(Number(row.price_inr) || 0)
        : Math.round(Number(body.price)),
    compareAtPrice:
      body.compareAtPrice === undefined
        ? row.compare_at_price_inr === null
          ? null
          : Math.round(Number(row.compare_at_price_inr) || 0)
        : body.compareAtPrice === '' || Number(body.compareAtPrice) <= 0
          ? null
          : Math.max(0, Math.round(Number(body.compareAtPrice))),
    durationMinutes:
      body.durationMinutes === undefined
        ? Math.round(Number(row.duration_minutes) || 0)
        : Math.max(0, Math.min(100_000, Math.round(Number(body.durationMinutes)))),
    sortOrder:
      body.sortOrder === undefined
        ? Math.round(Number(row.sort_order) || 0)
        : Math.max(0, Math.min(100_000, Math.round(Number(body.sortOrder)))),
    imageUrl:
      body.imageUrl === undefined ? String(row.image_url || '') : validateSafeImageSource(body.imageUrl) || '',
    active: body.active === undefined ? Boolean(row.is_active) : Boolean(body.active),
  };

  if (!next.name || next.name.length < 2) {
    return jsonResponse({ error: 'Service name is required (minimum 2 characters).' }, 400);
  }
  if (!Number.isFinite(next.price) || next.price < 0 || next.price > 100_000_000) {
    return jsonResponse({ error: 'Service price must be a valid non-negative amount.' }, 400);
  }

  try {
    await context.env.DB!.prepare(
      `UPDATE tenant_services
       SET name = ?, description = ?, category = ?, price_inr = ?, compare_at_price_inr = ?,
           duration_minutes = ?, sort_order = ?, image_url = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(
        next.name,
        next.description,
        next.category,
        next.price,
        next.compareAtPrice,
        next.durationMinutes,
        next.sortOrder,
        next.imageUrl,
        next.active ? 1 : 0,
        id,
        access.row.website_id
      )
      .run();

    const updated = await context.env.DB!.prepare(
      'SELECT * FROM tenant_services WHERE id = ? AND website_id = ? LIMIT 1'
    )
      .bind(id, access.row.website_id)
      .first<Record<string, any>>();

    await writeAuditLog(context.env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'tenant_service_updated',
      targetType: 'tenant_service',
      targetId: String(id),
      details: { websiteId: access.row.website_id, name: next.name, price: next.price },
    });

    return jsonResponse({
      service: updated ? mapServiceRowToUi(updated, Number(access.row.rowid || 0)) : { id, ...next },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Service catalog migration 0027 is required.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to update service.' }, 500);
  }
}

export async function onRequestDelete(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const loaded = await loadOwnedService(context);
  if (loaded.error) return loaded.error;
  const { auth, access, id } = loaded;
  const soft = new URL(context.request.url).searchParams.get('soft') === 'true';

  try {
    const sql = soft
      ? `UPDATE tenant_services SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND website_id = ?`
      : `DELETE FROM tenant_services WHERE id = ? AND website_id = ?`;
    const result = await context.env.DB!.prepare(sql)
      .bind(id, access.row.website_id)
      .run();
    if (!Number(result?.meta?.changes || 0)) {
      return jsonResponse({ error: 'Service not found for this tenant.' }, 404);
    }

    await writeAuditLog(context.env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: soft ? 'tenant_service_deactivated' : 'tenant_service_deleted',
      targetType: 'tenant_service',
      targetId: String(id),
      details: { websiteId: access.row.website_id, soft },
    });

    return jsonResponse({ ok: true, soft });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Service catalog migration 0027 is required.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to delete service.' }, 500);
  }
}
