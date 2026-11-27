// ============================================================================
// POST /api/delivery/orders/:id/location — Consent-gated delivery GPS state
// Only the assigned delivery partner, the business owner, or a super admin may
// update location. Coordinates live on delivery_assignments; stopping sharing
// clears them immediately so customer views cannot keep showing live movement.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  checkRateLimit,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { checkAssignedDeliveryAccess } from '../../_assignmentAccess';
import { parseRecordedAt } from '../../_locationState';

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

function migrationRequired(): Response {
  return jsonResponse(
    { error: 'Delivery location storage is not available on this deployment.', code: 'MIGRATION_REQUIRED' },
    503
  );
}

function mapAssignmentPing(
  assignment: Record<string, any>,
  tenantId: number,
  accuracyMeters = 0
): Record<string, unknown> {
  return {
    id: Number(assignment.id) || 0,
    orderId: Number(assignment.order_id) || 0,
    tenantId,
    deliveryPartnerId:
      assignment.delivery_partner_user_id == null
        ? null
        : Number(assignment.delivery_partner_user_id),
    latitude: Number(assignment.last_lat),
    longitude: Number(assignment.last_lng),
    accuracyMeters,
    batterySaverMode: true,
    consentGranted: true,
    recordedAt: String(assignment.updated_at || ''),
  };
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

  const pingLimit = await checkRateLimit(
    env,
    `delivery_ping:${auth.user.id}:${orderId}`,
    60,
    600
  );
  if (!pingLimit.allowed) return rateLimitResponse(pingLimit, 'Too many location updates for this order.');

  let order: Record<string, any> | null = null;
  try {
    order = await env.DB.prepare('SELECT * FROM store_orders WHERE id = ? LIMIT 1')
      .bind(orderId)
      .first<Record<string, any>>();
  } catch {
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

  const access = await checkAssignedDeliveryAccess(
    env,
    auth.user,
    String(order.website_id || ''),
    orderId
  );
  if (!access.authorized) {
    return jsonResponse(
      { error: 'Only the assigned delivery partner or business owner can update delivery location.' },
      403
    );
  }
  if (!access.assignment || !access.assignmentId) {
    return jsonResponse(
      { error: 'This order has no active delivery assignment.', code: 'NO_DELIVERY_ASSIGNMENT' },
      409
    );
  }

  const body = await parseJsonBody<{
    sharingEnabled?: boolean;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    batterySaverMode?: boolean;
    consentGranted?: boolean;
  }>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  // Explicit stop: clear stored coordinates immediately. The customer endpoint
  // reads this same row, so live movement stops at the source.
  if (body.sharingEnabled === false) {
    try {
      await env.DB.prepare(
        `UPDATE delivery_assignments
         SET last_lat = NULL, last_lng = NULL, updated_at = datetime('now')
         WHERE id = ? AND order_id = ?`
      )
        .bind(access.assignmentId, orderId)
        .run();
      await writeAuditLog(env, {
        actorId: auth.user.id,
        actorRole: auth.user.platformRole,
        action: 'delivery_location_sharing_stopped',
        targetType: 'order',
        targetId: String(orderId),
        details: { assignmentId: access.assignmentId, partnerId: access.partnerId },
      });
      return jsonResponse({ sharingEnabled: false, latestPing: null });
    } catch {
      return migrationRequired();
    }
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
  const accuracyMeters = Math.round(accuracyRaw);

  try {
    // Battery/network guard: skip redundant writes within 8s if movement < 25m.
    const lastLat = access.assignment.last_lat == null ? null : Number(access.assignment.last_lat);
    const lastLng = access.assignment.last_lng == null ? null : Number(access.assignment.last_lng);
    const lastRecordedAt = parseRecordedAt(String(access.assignment.updated_at || ''));
    if (lastLat != null && lastLng != null && lastRecordedAt != null) {
      const ageMs = Date.now() - lastRecordedAt;
      const distMeters = haversineMeters(lastLat, lastLng, latitude, longitude);
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 8000 && distMeters < 25) {
        return jsonResponse({
          ping: mapAssignmentPing(access.assignment, tenantId, accuracyMeters),
          deduplicated: true,
          reason: 'Skipped redundant update (< 25m movement within 8s for battery efficiency).',
        });
      }
    }

    await env.DB.prepare(
      `UPDATE delivery_assignments
       SET last_lat = ?, last_lng = ?, updated_at = datetime('now')
       WHERE id = ? AND order_id = ?`
    )
      .bind(latitude, longitude, access.assignmentId, orderId)
      .run();

    const ping = {
      id: access.assignmentId,
      orderId,
      tenantId,
      deliveryPartnerId:
        access.partnerId ?? (Number(access.assignment.delivery_partner_user_id) || null),
      latitude,
      longitude,
      accuracyMeters,
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
      details: {
        latitude,
        longitude,
        accuracyMeters,
        assignmentId: access.assignmentId,
        partnerId: access.partnerId,
      },
    });

    return jsonResponse({ ping, deduplicated: false }, 201);
  } catch {
    return migrationRequired();
  }
}
