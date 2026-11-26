// ============================================================================
// POST /api/delivery/orders/:id/location — Consent-gated delivery GPS ping
// Only the assigned delivery partner, the business owner, or a super admin may
// upload coordinates, and only while the order is ready for pickup / in transit.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { isMissingTableError } from '../../../_tenantAccess';

// `packed` is the D1 representation of the ready_for_pickup milestone
// (store_orders.order_status CHECK), so both labels are accepted here.
const TRANSIT_STATUSES = ['ready_for_pickup', 'packed', 'out_for_delivery'];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapPingRow(row: Record<string, any>, tenantId: number): Record<string, unknown> {
  return {
    id: Number(row.id) || 0,
    orderId: Number(row.order_id) || 0,
    tenantId,
    deliveryPartnerId: row.delivery_partner_id == null ? null : Number(row.delivery_partner_id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: Number(row.accuracy_meters) || 0,
    batterySaverMode: Boolean(row.battery_saver_mode),
    consentGranted: row.consent_granted == null ? true : Boolean(row.consent_granted),
    recordedAt: String(row.recorded_at || ''),
  };
}

function migrationRequired(): Response {
  return jsonResponse(
    { error: 'Delivery location storage is not available on this deployment.', code: 'MIGRATION_REQUIRED' },
    503
  );
}

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return jsonResponse({ error: 'Invalid order ID.' }, 400);
  }

  let order: Record<string, any> | null = null;
  try {
    order = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<Record<string, any>>();
  } catch (err) {
    if (isMissingTableError(err)) return migrationRequired();
    return jsonResponse({ error: 'Unable to read order.' }, 500);
  }
  if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

  let pub: { rowid?: number; owner_id?: string } | null = null;
  try {
    pub = await env.DB.prepare(
      'SELECT rowid, owner_id FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(String(order.website_id || ''))
      .first<{ rowid?: number; owner_id?: string }>();
  } catch {
    pub = null;
  }
  const tenantId = Number(pub?.rowid || 0);

  let authorized = auth.user.isSuperAdmin;
  if (
    !authorized &&
    pub &&
    (pub.owner_id === auth.user.id || pub.owner_id === auth.user.authSubject)
  ) {
    authorized = true;
  }

  let partnerId: number | null = null;
  if (!authorized) {
    // D1 has no delivery_partners table; active tenant_memberships rows are the
    // existing source of truth for assigned delivery partners (see /api/delivery/portal).
    try {
      const partner = await env.DB.prepare(
        `SELECT id, user_id, email FROM tenant_memberships
         WHERE website_id = ? AND role = 'delivery_partner' AND status = 'active'
           AND (user_id = ? OR user_id = ? OR email = ?)
         LIMIT 1`
      )
        .bind(String(order.website_id || ''), auth.user.id, auth.user.authSubject, auth.user.email)
        .first<{ id?: number; user_id?: string; email?: string }>();
      if (partner) {
        authorized = true;
        partnerId = Number(partner.id) || null;
      }
    } catch {
      // Optional membership table may not be migrated; stay unauthorized.
    }
  }

  if (!authorized) {
    return jsonResponse(
      { error: 'Only the assigned delivery partner or business owner can update delivery location.' },
      403
    );
  }

  const status = sanitizeText(order.order_status, 40);
  if (!TRANSIT_STATUSES.includes(status)) {
    return jsonResponse(
      {
        error: `Location sharing is only active during pickup/transit. Current order status is "${status}".`,
      },
      409
    );
  }

  const body = await parseJsonBody<{
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    batterySaverMode?: boolean;
    consentGranted?: boolean;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const latitude = body.latitude;
  const longitude = body.longitude;
  const accuracyRaw = body.accuracyMeters == null ? 0 : Number(body.accuracyMeters);
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return jsonResponse({ error: 'Valid latitude and longitude are required.' }, 400);
  }
  if (!Number.isFinite(accuracyRaw) || accuracyRaw < 0 || accuracyRaw > 25000) {
    return jsonResponse({ error: 'accuracyMeters must be between 0 and 25000.' }, 400);
  }
  if (body.batterySaverMode !== undefined && typeof body.batterySaverMode !== 'boolean') {
    return jsonResponse({ error: 'batterySaverMode must be a boolean.' }, 400);
  }
  if (body.consentGranted !== true) {
    return jsonResponse({ error: 'Explicit GPS location sharing consent is required.' }, 400);
  }
  const batterySaverMode = body.batterySaverMode === undefined ? true : body.batterySaverMode;

  try {
    // Battery/network guard: skip redundant writes within 8s if movement < 25m.
    const lastPing = await env.DB.prepare(
      `SELECT id, latitude, longitude, accuracy_meters, battery_saver_mode, consent_granted, recorded_at
       FROM delivery_location_pings
       WHERE order_id = ?
       ORDER BY recorded_at DESC, id DESC
       LIMIT 1`
    )
      .bind(orderId)
      .first<Record<string, any>>();

    if (lastPing) {
      const ageMs = Date.now() - new Date(String(lastPing.recorded_at)).getTime();
      const distMeters = haversineMeters(
        Number(lastPing.latitude),
        Number(lastPing.longitude),
        latitude,
        longitude
      );
      if (Number.isFinite(ageMs) && ageMs < 8000 && distMeters < 25) {
        return jsonResponse({
          ping: mapPingRow(lastPing, tenantId),
          deduplicated: true,
          reason: 'Skipped redundant update (< 25m movement within 8s for battery efficiency).',
        });
      }
    }

    const res = await env.DB.prepare(
      `INSERT INTO delivery_location_pings
         (order_id, website_id, delivery_partner_id, latitude, longitude,
          accuracy_meters, battery_saver_mode, consent_granted, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
    )
      .bind(
        orderId,
        String(order.website_id || ''),
        partnerId,
        latitude,
        longitude,
        Math.round(accuracyRaw),
        batterySaverMode ? 1 : 0
      )
      .run();

    const pingId = Number(res?.meta?.last_row_id || 0);
    const ping = {
      id: pingId,
      orderId,
      tenantId,
      deliveryPartnerId: partnerId,
      latitude,
      longitude,
      accuracyMeters: Math.round(accuracyRaw),
      batterySaverMode,
      consentGranted: true,
      recordedAt: new Date().toISOString(),
    };

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'delivery_location_ping',
      targetType: 'order',
      targetId: String(orderId),
      details: { latitude, longitude, accuracyMeters: ping.accuracyMeters },
    });

    return jsonResponse({ ping, deduplicated: false }, 201);
  } catch (err) {
    if (isMissingTableError(err)) return migrationRequired();
    return jsonResponse({ error: 'Unable to record delivery location ping.' }, 500);
  }
}
