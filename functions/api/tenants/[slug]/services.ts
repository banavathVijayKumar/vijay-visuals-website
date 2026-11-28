// ============================================================================
// GET & POST /api/tenants/:slug/services — Tenant-Owned Service Catalog
// Dedicated authoritative storage in D1 table tenant_services (migration 0027).
// Strict tenant ownership enforced; no cross-merchant reads or writes.
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
  isMissingTableError,
  mapServiceRowToUi,
  requireTenantOwnerAccess,
  validateSafeImageSource,
} from '../../_tenantAccess';

const MAX_SERVICES = 200;

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

async function authorize(context: PagesContext<{ slug: string }>) {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return { authFailed: true as const, response: auth.response };

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return { authFailed: true as const, response: access.response };
  return { authFailed: false as const, auth, access };
}

export async function onRequestGet(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const authorized = await authorize(context);
  if (authorized.authFailed) return authorized.response;
  const { access } = authorized;

  try {
    const result = await context.env.DB!.prepare(
      `SELECT id, name, description, category, price_inr, compare_at_price_inr,
              duration_minutes, sort_order, image_url, is_active
       FROM tenant_services
       WHERE website_id = ?
       ORDER BY sort_order ASC, id ASC
       LIMIT ?`
    )
      .bind(access.row.website_id, MAX_SERVICES)
      .all<Record<string, any>>();

    return jsonResponse({
      services: (result.results || []).map((row) =>
        mapServiceRowToUi(row, Number(access.row.rowid || 0))
      ),
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error:
            'Service catalog storage requires D1 migration 0027 (tenant_services). Apply migration 0027 before managing services.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to load services.' }, 500);
  }
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const authorized = await authorize(context);
  if (authorized.authFailed) return authorized.response;
  const { auth, access } = authorized;

  const body = await parseJsonBody<Record<string, any>>(context.request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const name = sanitizeText(body.name, 160);
  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Service name is required (minimum 2 characters).' }, 400);
  }

  const price = Math.round(Number(body.price ?? 0));
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) {
    return jsonResponse({ error: 'Service price must be a valid non-negative amount.' }, 400);
  }

  const compareAtPrice =
    body.compareAtPrice !== undefined && body.compareAtPrice !== '' && Number(body.compareAtPrice) > 0
      ? Math.max(0, Math.round(Number(body.compareAtPrice)))
      : null;

  const durationMinutes = Math.max(0, Math.min(100_000, Math.round(Number(body.durationMinutes ?? 0))));
  const sortOrder = Math.max(0, Math.min(100_000, Math.round(Number(body.sortOrder ?? 0))));
  const category = sanitizeText(body.category, 80) || 'General';
  const description = sanitizeText(body.description, 1000);
  const imageUrl = validateSafeImageSource(body.imageUrl) || '';
  const active = body.active === undefined ? true : Boolean(body.active);

  try {
    const count = await context.env.DB!.prepare(
      'SELECT COUNT(*) AS total FROM tenant_services WHERE website_id = ?'
    )
      .bind(access.row.website_id)
      .first<{ total: number }>();
    if (Number(count?.total || 0) >= MAX_SERVICES) {
      return jsonResponse({ error: 'Service catalog limit reached.' }, 409);
    }

    const result = await context.env.DB!.prepare(
      `INSERT INTO tenant_services
       (website_id, owner_id, name, description, category, price_inr, compare_at_price_inr,
        duration_minutes, sort_order, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        access.row.website_id,
        access.row.owner_id,
        name,
        description,
        category,
        price,
        compareAtPrice,
        durationMinutes,
        sortOrder,
        imageUrl,
        active ? 1 : 0
      )
      .run();

    const insertedId = Number(result?.meta?.last_row_id || 0);
    const created = insertedId
      ? await context.env.DB!.prepare('SELECT * FROM tenant_services WHERE id = ? AND website_id = ? LIMIT 1')
          .bind(insertedId, access.row.website_id)
          .first<Record<string, any>>()
      : null;

    await writeAuditLog(context.env, {
      actorId: auth.user.id,
      actorRole: access.effectiveRole,
      action: 'tenant_service_created',
      targetType: 'tenant_service',
      targetId: String(insertedId),
      details: { websiteId: access.row.website_id, name, price },
    });

    return jsonResponse(
      {
        service: created
          ? mapServiceRowToUi(created, Number(access.row.rowid || 0))
          : { id: insertedId, name, price },
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error:
            'Service catalog storage requires D1 migration 0027 (tenant_services). Apply migration 0027 before managing services.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to save service.' }, 500);
  }
}
