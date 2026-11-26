// ============================================================================
// PATCH & DELETE /api/owner/tenants/:tenantId/locations/:locationId
// Tenant-isolated single-branch updates for Cloudflare Pages + D1.
// ============================================================================

import { requireUser } from '../../../../_auth';
import {
  CloudflareEnv,
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../../../_shared';
import {
  TenantAccessResult,
  isMissingTableError,
  requireTenantOwnerAccess,
} from '../../../../_tenantAccess';
import { mapLocationRow, syncPrimaryBranchToTenant } from './index';

type TenantAccess = Extract<TenantAccessResult, { ok: true }>;
type LocationSource = 'map_pin' | 'gps_consent' | 'geocoded' | 'manual';
const LOCATION_SOURCES: readonly LocationSource[] = ['map_pin', 'gps_consent', 'geocoded', 'manual'];
const OWNER_ROLES = ['business_owner', 'business_manager', 'business_staff'] as const;

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function has(body: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function migrationRequired(): Response {
  return jsonResponse(
    { error: 'Business location storage is not available on this deployment.', code: 'MIGRATION_REQUIRED' },
    503
  );
}

async function loadExisting(
  env: CloudflareEnv,
  websiteId: string,
  locationId: number
): Promise<Record<string, any> | Response> {
  try {
    const row = await env.DB!.prepare(
      `SELECT id, branch_name, is_primary, full_address, city, state, postal_code, country,
              latitude, longitude, place_id, phone, opening_hours, location_source,
              active, created_at, updated_at
       FROM business_locations
       WHERE id = ? AND website_id = ?
       LIMIT 1`
    )
      .bind(locationId, websiteId)
      .first<Record<string, any>>();
    return row || jsonResponse({ error: 'Branch location not found for this business.' }, 404);
  } catch (err) {
    if (isMissingTableError(err)) return migrationRequired();
    return jsonResponse({ error: 'Unable to read business location.' }, 500);
  }
}

export async function onRequestPatch(
  context: PagesContext<{ tenantId: string; locationId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [...OWNER_ROLES]);
  if (!access.ok) return access.response;

  const locationId = Number(params.locationId);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return jsonResponse({ error: 'Invalid branch location ID.' }, 400);
  }

  const existing = await loadExisting(env, access.row.website_id, locationId);
  if (existing instanceof Response) return existing;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const updates: Array<{ column: string; value: unknown }> = [];
  let nextLat = existing.latitude == null ? null : Number(existing.latitude);
  let nextLng = existing.longitude == null ? null : Number(existing.longitude);

  if (has(body, 'branchName')) {
    const value = sanitizeText(body.branchName, 120);
    if (value.length < 2) return jsonResponse({ error: 'Branch name must be at least 2 characters.' }, 400);
    updates.push({ column: 'branch_name', value });
  }
  if (has(body, 'fullAddress')) {
    const value = sanitizeText(body.fullAddress, 500);
    if (value.length < 5) return jsonResponse({ error: 'Please enter a complete street/area address.' }, 400);
    updates.push({ column: 'full_address', value });
  }
  for (const [key, column, max] of [
    ['city', 'city', 120],
    ['state', 'state', 120],
    ['postalCode', 'postal_code', 24],
    ['country', 'country', 80],
    ['placeId', 'place_id', 240],
    ['phone', 'phone', 40],
    ['openingHours', 'opening_hours', 200],
  ] as const) {
    if (has(body, key)) updates.push({ column, value: sanitizeText(body[key], max) });
  }
  if (has(body, 'latitude')) {
    const value = body.latitude == null ? null : Number(body.latitude);
    if (
      value !== null &&
      (typeof body.latitude !== 'number' || !Number.isFinite(value) || value < -90 || value > 90)
    ) {
      return jsonResponse({ error: 'Latitude must be between -90 and 90.' }, 400);
    }
    nextLat = value;
    updates.push({ column: 'latitude', value });
  }
  if (has(body, 'longitude')) {
    const value = body.longitude == null ? null : Number(body.longitude);
    if (
      value !== null &&
      (typeof body.longitude !== 'number' || !Number.isFinite(value) || value < -180 || value > 180)
    ) {
      return jsonResponse({ error: 'Longitude must be between -180 and 180.' }, 400);
    }
    nextLng = value;
    updates.push({ column: 'longitude', value });
  }
  if ((nextLat === null) !== (nextLng === null)) {
    return jsonResponse(
      { error: 'Provide both latitude and longitude together, or clear both for manual address entry.' },
      400
    );
  }
  if (has(body, 'locationSource')) {
    const raw = sanitizeText(body.locationSource, 30);
    if (!LOCATION_SOURCES.includes(raw as LocationSource)) {
      return jsonResponse({ error: 'Invalid location source.' }, 400);
    }
    updates.push({ column: 'location_source', value: raw });
  }
  if (has(body, 'isPrimary')) {
    if (typeof body.isPrimary !== 'boolean') {
      return jsonResponse({ error: 'isPrimary must be a boolean.' }, 400);
    }
    updates.push({ column: 'is_primary', value: body.isPrimary ? 1 : 0 });
  }
  if (has(body, 'active')) {
    if (typeof body.active !== 'boolean') {
      return jsonResponse({ error: 'active must be a boolean.' }, 400);
    }
    updates.push({ column: 'active', value: body.active ? 1 : 0 });
  }

  if (updates.length === 0) {
    return jsonResponse({ location: mapLocationRow(existing, Number(access.row.rowid || 0)) });
  }

  try {
    if (body.isPrimary === true) {
      await env.DB!.prepare(
        `UPDATE business_locations SET is_primary = 0, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(access.row.website_id)
        .run();
    }

    const setSql = updates.map((u) => `${u.column} = ?`).join(', ');
    await env.DB!.prepare(
      `UPDATE business_locations SET ${setSql}, updated_at = datetime('now')
       WHERE id = ? AND website_id = ?`
    )
      .bind(...updates.map((u) => u.value), locationId, access.row.website_id)
      .run();

    const updated = await env.DB!.prepare(
      `SELECT id, branch_name, is_primary, full_address, city, state, postal_code, country,
              latitude, longitude, place_id, phone, opening_hours, location_source,
              active, created_at, updated_at
       FROM business_locations
       WHERE id = ? AND website_id = ?
       LIMIT 1`
    )
      .bind(locationId, access.row.website_id)
      .first<Record<string, any>>();

    if (!updated) return jsonResponse({ error: 'Branch location not found for this business.' }, 404);

    if (updated.is_primary) {
      const nextAccess: TenantAccess = { ...access } as TenantAccess;
      await syncPrimaryBranchToTenant(env, nextAccess, {
        fullAddress: sanitizeText(updated.full_address, 500),
        latitude: updated.latitude == null ? null : Number(updated.latitude),
        longitude: updated.longitude == null ? null : Number(updated.longitude),
      });
    }

    return jsonResponse({ location: mapLocationRow(updated, Number(access.row.rowid || 0)) });
  } catch (err) {
    if (isMissingTableError(err)) return migrationRequired();
    return jsonResponse({ error: 'Unable to update business location.' }, 500);
  }
}

export async function onRequestDelete(
  context: PagesContext<{ tenantId: string; locationId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [...OWNER_ROLES]);
  if (!access.ok) return access.response;

  const locationId = Number(params.locationId);
  if (!Number.isInteger(locationId) || locationId <= 0) {
    return jsonResponse({ error: 'Invalid branch location ID.' }, 400);
  }

  const existing = await loadExisting(env, access.row.website_id, locationId);
  if (existing instanceof Response) return existing;

  try {
    await env.DB!.prepare('DELETE FROM business_locations WHERE id = ? AND website_id = ?')
      .bind(locationId, access.row.website_id)
      .run();

    if (existing.is_primary) {
      const replacement = await env.DB!.prepare(
        `SELECT id, branch_name, is_primary, full_address, city, state, postal_code, country,
                latitude, longitude, place_id, phone, opening_hours, location_source,
                active, created_at, updated_at
         FROM business_locations
         WHERE website_id = ? AND active = 1
         ORDER BY id ASC
         LIMIT 1`
      )
        .bind(access.row.website_id)
        .first<Record<string, any>>();

      if (replacement) {
        await env.DB!.prepare(
          `UPDATE business_locations SET is_primary = 1, updated_at = datetime('now') WHERE id = ?`
        )
          .bind(replacement.id)
          .run();

        await syncPrimaryBranchToTenant(env, access as TenantAccess, {
          fullAddress: sanitizeText(replacement.full_address, 500),
          latitude: replacement.latitude == null ? null : Number(replacement.latitude),
          longitude: replacement.longitude == null ? null : Number(replacement.longitude),
        });
      }
    }

    return jsonResponse({ deleted: true, id: locationId });
  } catch (err) {
    if (isMissingTableError(err)) return migrationRequired();
    return jsonResponse({ error: 'Unable to delete business location.' }, 500);
  }
}
