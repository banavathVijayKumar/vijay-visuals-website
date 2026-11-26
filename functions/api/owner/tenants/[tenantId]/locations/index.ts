// ============================================================================
// GET & POST /api/owner/tenants/:tenantId/locations
// Tenant-isolated multi-branch business locations for Cloudflare Pages + D1.
// Optional D1 table: reads degrade to an empty collection; writes fail closed.
// ============================================================================

import { requireUser } from '../../../../_auth';
import {
  CloudflareEnv,
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../../_shared';
import {
  TenantAccessResult,
  isMissingTableError,
  requireTenantOwnerAccess,
} from '../../../../_tenantAccess';

type TenantAccess = Extract<TenantAccessResult, { ok: true }>;
type LocationSource = 'map_pin' | 'gps_consent' | 'geocoded' | 'manual';
const LOCATION_SOURCES: readonly LocationSource[] = ['map_pin', 'gps_consent', 'geocoded', 'manual'];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function buildDirectionsUrl(lat?: number | null, lng?: number | null, address?: string): string {
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
  }
  if (address && address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.trim())}`;
  }
  return 'https://www.google.com/maps';
}

export function mapLocationRow(row: Record<string, any>, tenantId: number): Record<string, unknown> {
  const latitude = row.latitude == null ? null : Number(row.latitude);
  const longitude = row.longitude == null ? null : Number(row.longitude);
  const fullAddress = sanitizeText(row.full_address, 500);
  return {
    id: Number(row.id) || 0,
    tenantId,
    branchName: sanitizeText(row.branch_name, 120),
    isPrimary: Boolean(row.is_primary),
    fullAddress,
    city: sanitizeText(row.city, 120),
    state: sanitizeText(row.state, 120),
    postalCode: sanitizeText(row.postal_code, 24),
    country: sanitizeText(row.country, 80) || 'India',
    latitude,
    longitude,
    placeId: sanitizeText(row.place_id, 240),
    phone: sanitizeText(row.phone, 40),
    openingHours: sanitizeText(row.opening_hours, 200),
    locationSource: sanitizeText(row.location_source, 30) || 'manual',
    active: Boolean(row.active),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
    directionsUrl: buildDirectionsUrl(latitude, longitude, fullAddress),
  };
}

/** Mirrors the Express primary-branch sync using the existing D1 website_json fields. */
export async function syncPrimaryBranchToTenant(
  env: CloudflareEnv,
  access: TenantAccess,
  branch: { fullAddress: string; latitude: number | null; longitude: number | null }
): Promise<void> {
  const mapsUrl =
    typeof branch.latitude === 'number' && typeof branch.longitude === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${branch.latitude.toFixed(6)},${branch.longitude.toFixed(6)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.fullAddress)}`;

  const nextParsed = {
    ...access.parsed,
    address: branch.fullAddress,
    googleMapsUrl: mapsUrl,
  };

  await env.DB!.prepare(
    `UPDATE customer_website_publications SET website_json = ?, updated_at = datetime('now') WHERE website_id = ?`
  )
    .bind(JSON.stringify(nextParsed), access.row.website_id)
    .run();
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

  const tenantId = Number(access.row.rowid || 0);
  const tenantAddress = sanitizeText(access.parsed.address, 500);

  try {
    const res = await env.DB!.prepare(
      `SELECT id, branch_name, is_primary, full_address, city, state, postal_code, country,
              latitude, longitude, place_id, phone, opening_hours, location_source,
              active, created_at, updated_at
       FROM business_locations
       WHERE website_id = ?
       ORDER BY is_primary DESC, id ASC`
    )
      .bind(access.row.website_id)
      .all<Record<string, any>>();

    return jsonResponse({
      locations: (res.results || []).map((row) => mapLocationRow(row, tenantId)),
      tenantAddress,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse({ locations: [], tenantAddress });
    }
    return jsonResponse({ error: 'Unable to load business locations.' }, 500);
  }
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
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const branchName = sanitizeText(body.branchName, 120);
  const fullAddress = sanitizeText(body.fullAddress, 500);
  if (branchName.length < 2) {
    return jsonResponse({ error: 'Branch name must be at least 2 characters.' }, 400);
  }
  if (fullAddress.length < 5) {
    return jsonResponse({ error: 'Please enter a complete street/area address.' }, 400);
  }

  const lat = body.latitude == null ? null : Number(body.latitude);
  const lng = body.longitude == null ? null : Number(body.longitude);
  if ((lat === null) !== (lng === null)) {
    return jsonResponse(
      { error: 'Provide both latitude and longitude together, or leave both empty for manual address entry.' },
      400
    );
  }
  if (
    lat !== null &&
    (typeof body.latitude !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90)
  ) {
    return jsonResponse({ error: 'Latitude must be between -90 and 90.' }, 400);
  }
  if (
    lng !== null &&
    (typeof body.longitude !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180)
  ) {
    return jsonResponse({ error: 'Longitude must be between -180 and 180.' }, 400);
  }

  const rawSource = sanitizeText(body.locationSource, 30);
  const locationSource: LocationSource = LOCATION_SOURCES.includes(rawSource as LocationSource)
    ? (rawSource as LocationSource)
    : 'manual';
  const isPrimary = typeof body.isPrimary === 'boolean' ? body.isPrimary : false;
  const active = typeof body.active === 'boolean' ? body.active : true;
  const phone = sanitizeText(body.phone, 40) || sanitizeText(access.parsed.phone, 40);
  const openingHours = sanitizeText(body.openingHours, 200) || 'Mon–Sat: 9:30 AM – 8:30 PM';

  const websiteId = access.row.website_id;
  const tenantId = Number(access.row.rowid || 0);

  try {
    const existing = await env.DB!.prepare(
      'SELECT id FROM business_locations WHERE website_id = ?'
    )
      .bind(websiteId)
      .all<{ id: number }>();

    const shouldBePrimary = isPrimary || (existing.results || []).length === 0;
    if (shouldBePrimary && (existing.results || []).length > 0) {
      await env.DB!.prepare(
        `UPDATE business_locations SET is_primary = 0, updated_at = datetime('now') WHERE website_id = ?`
      )
        .bind(websiteId)
        .run();
    }

    const res = await env.DB!.prepare(
      `INSERT INTO business_locations
         (website_id, branch_name, is_primary, full_address, city, state, postal_code, country,
          latitude, longitude, place_id, phone, opening_hours, location_source, active,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        branchName,
        shouldBePrimary ? 1 : 0,
        fullAddress,
        sanitizeText(body.city, 120),
        sanitizeText(body.state, 120),
        sanitizeText(body.postalCode, 24),
        sanitizeText(body.country, 80) || 'India',
        lat,
        lng,
        sanitizeText(body.placeId, 240),
        phone,
        openingHours,
        locationSource,
        active ? 1 : 0
      )
      .run();

    const createdId = Number(res?.meta?.last_row_id || 0);
    if (shouldBePrimary) {
      await syncPrimaryBranchToTenant(env, access, { fullAddress, latitude: lat, longitude: lng });
    }

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'BUSINESS_LOCATION_CREATED',
      targetType: 'business_location',
      targetId: String(createdId),
      details: { websiteId, branchName, locationSource },
    });

    return jsonResponse(
      {
        location: {
          id: createdId,
          tenantId,
          branchName,
          isPrimary: shouldBePrimary,
          fullAddress,
          city: sanitizeText(body.city, 120),
          state: sanitizeText(body.state, 120),
          postalCode: sanitizeText(body.postalCode, 24),
          country: sanitizeText(body.country, 80) || 'India',
          latitude: lat,
          longitude: lng,
          placeId: sanitizeText(body.placeId, 240),
          phone,
          openingHours,
          locationSource,
          active,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          directionsUrl: buildDirectionsUrl(lat, lng, fullAddress),
        },
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        { error: 'Business location storage is not available on this deployment.', code: 'MIGRATION_REQUIRED' },
        503
      );
    }
    return jsonResponse({ error: 'Unable to save business branch location.' }, 500);
  }
}
