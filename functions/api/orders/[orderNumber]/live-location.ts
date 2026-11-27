// ============================================================================
// GET /api/orders/:orderNumber/live-location — Conditional live delivery polling
// Returns consent-based delivery location only while an order is in transit.
// A stale ping is exposed only as lastKnownPing, never as a live claim.
// ============================================================================

import { requireUser } from '../../_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  rateLimitResponse,
  sanitizeText,
} from '../../_shared';
import { isFreshLocation } from '../../delivery/_locationState';
import { estimateEtaForOrder } from '../../delivery/_etaEstimate';

// `packed` is the D1 representation of the ready_for_pickup milestone
// (store_orders.order_status CHECK), so both labels are accepted here.
const TRANSIT_STATUSES = ['ready_for_pickup', 'packed', 'out_for_delivery'];

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

function mapAssignmentPing(
  row: Record<string, any>,
  tenantId: number
): Record<string, unknown> {
  return {
    id: Number(row.id) || 0,
    orderId: Number(row.order_id) || 0,
    tenantId,
    deliveryPartnerId:
      row.delivery_partner_user_id == null ? null : Number(row.delivery_partner_user_id),
    latitude: Number(row.last_lat),
    longitude: Number(row.last_lng),
    accuracyMeters: 0,
    batterySaverMode: true,
    consentGranted: true,
    recordedAt: String(row.updated_at || ''),
  };
}

export async function onRequestGet(
  context: PagesContext<{ orderNumber: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const orderNumber = sanitizeText(params.orderNumber, 40).toUpperCase();
  if (!orderNumber) {
    return jsonResponse({ error: 'Please enter a valid Order ID.' }, 400);
  }
  if (!env.DB) {
    return jsonResponse({ error: 'Order tracking storage is not configured.' }, 503);
  }

  const clientIp = getClientIp(request);
  const orderLimit = await checkRateLimit(
    env,
    `live_location:${clientIp}:${orderNumber}`,
    30,
    600
  );
  if (!orderLimit.allowed) return rateLimitResponse(orderLimit, 'Too many live-location checks for this order.');
  const ipLimit = await checkRateLimit(env, `live_location_ip:${clientIp}`, 120, 600);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit, 'Too many tracking requests. Please try again later.');

  let order: Record<string, any> | null = null;
  try {
    order = await env.DB.prepare('SELECT * FROM store_orders WHERE UPPER(order_number) = ? LIMIT 1')
      .bind(orderNumber)
      .first<Record<string, any>>();
  } catch {
    return jsonResponse({ error: 'Unable to fetch live delivery location.' }, 500);
  }
  if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

  // Live GPS coordinates are sensitive. Require the same order-number + full
  // phone/email verification used by /api/orders/track before returning them.
  const url = new URL(request.url);
  const verifyPhone = sanitizeText(url.searchParams.get('phone') || '', 30).replace(/\D/g, '');
  const verifyEmail = sanitizeText(url.searchParams.get('email') || '', 160).toLowerCase();
  let trackingAuthorized = false;

  if (request.headers.get('Authorization')) {
    try {
      const auth = await requireUser(request, env);
      if (auth.ok) {
        const customerUserId = String(order.customer_user_id || '');
        const customerEmail = String(order.customer_email || '').toLowerCase();
        trackingAuthorized =
          auth.user.isSuperAdmin ||
          (Boolean(customerUserId) &&
            (customerUserId === auth.user.id || customerUserId === auth.user.authSubject)) ||
          (Boolean(customerEmail) && customerEmail === (auth.user.email || '').toLowerCase());
      }
    } catch {
      trackingAuthorized = false;
    }
  }

  if (!trackingAuthorized) {
    const orderPhone = String(order.customer_phone || '').replace(/\D/g, '');
    const orderEmail = String(order.customer_email || '').toLowerCase();
    const phoneMatches =
      verifyPhone.length >= 10 &&
      orderPhone.length >= 10 &&
      (verifyPhone === orderPhone ||
        verifyPhone.endsWith(orderPhone.slice(-10)) ||
        orderPhone.endsWith(verifyPhone.slice(-10)));
    trackingAuthorized =
      phoneMatches || (Boolean(verifyEmail) && Boolean(orderEmail) && verifyEmail === orderEmail);
  }

  if (!trackingAuthorized) {
    return jsonResponse(
      {
        error:
          'Order verification required. Provide the full phone number or email used for this order, or sign in.',
        code: 'TRACKING_VERIFICATION_REQUIRED',
      },
      403
    );
  }

  const websiteId = String(order.website_id || '');
  const status = sanitizeText(order.order_status, 40);

  let tenantId = 0;
  try {
    const pub = await env.DB.prepare(
      'SELECT rowid, owner_id FROM customer_website_publications WHERE website_id = ? LIMIT 1'
    )
      .bind(websiteId)
      .first<{ rowid?: number; owner_id?: string }>();
    tenantId = Number(pub?.rowid || 0);
  } catch {
    tenantId = 0;
  }

  let storeBranch: Record<string, unknown> | null = null;
  try {
    const branch = await env.DB.prepare(
      `SELECT branch_name, full_address, latitude, longitude
       FROM business_locations
       WHERE website_id = ? AND active = 1
       ORDER BY is_primary DESC, id ASC
       LIMIT 1`
    )
      .bind(websiteId)
      .first<Record<string, any>>();

    if (branch) {
      const latitude = branch.latitude == null ? null : Number(branch.latitude);
      const longitude = branch.longitude == null ? null : Number(branch.longitude);
      const fullAddress = sanitizeText(branch.full_address, 500);
      storeBranch = {
        branchName: sanitizeText(branch.branch_name, 120),
        fullAddress,
        latitude,
        longitude,
        directionsUrl: buildDirectionsUrl(latitude, longitude, fullAddress),
      };
    }
  } catch {
    // business_locations is optional; no branch preview is invented.
    storeBranch = null;
  }

  if (!TRANSIT_STATUSES.includes(status)) {
    return jsonResponse({
      orderNumber: String(order.order_number || orderNumber),
      status,
      pollingAllowed: false,
      recommendedPollIntervalMs: 0,
      latestPing: null,
      lastKnownPing: null,
      stale: false,
      storeBranch,
      message:
        status === 'delivered'
          ? 'Order delivered — live GPS polling stopped automatically.'
          : 'Live GPS polling activates only when order is Ready for Pickup or Out for Delivery.',
    });
  }

  let lastKnownPing: Record<string, unknown> | null = null;
  let latestPing: Record<string, unknown> | null = null;
  let stale = false;
  try {
    const assignment = await env.DB.prepare(
      `SELECT id, order_id, delivery_partner_user_id, last_lat, last_lng, updated_at
       FROM delivery_assignments
       WHERE order_id = ? AND website_id = ? AND last_lat IS NOT NULL AND last_lng IS NOT NULL
       LIMIT 1`
    )
      .bind(Number(order.id) || 0, websiteId)
      .first<Record<string, any>>();

    if (assignment) {
      lastKnownPing = mapAssignmentPing(assignment, tenantId);
      stale = !isFreshLocation(String(assignment.updated_at || ''));
      latestPing = stale ? null : lastKnownPing;
    }
  } catch {
    // Missing delivery_assignments means no location can be proven.
    lastKnownPing = null;
    latestPing = null;
    stale = false;
  }

  const mapsConfigured = Boolean(
    String(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
  );

  return jsonResponse({
    orderNumber: String(order.order_number || orderNumber),
    status,
    pollingAllowed: true,
    recommendedPollIntervalMs: 20000,
    mapsConfigured,
    eta: await estimateEtaForOrder(env, order),
    latestPing,
    lastKnownPing,
    stale,
    storeBranch,
    message: latestPing
      ? 'Live rider coordinates updated with rider consent.'
      : stale
        ? 'Last location update is stale — live location is unavailable. The rider must share a fresh update.'
        : 'Waiting for delivery partner to enable consent-based GPS sharing.',
  });
}
