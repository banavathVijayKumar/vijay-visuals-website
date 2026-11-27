// ============================================================================
// GET/POST /api/customer/delivery-otp — In-app delivery code for secure POD.
//
// No email, SMS, or provider call is made. The code is returned for display in
// the app only. Authenticated customers may use orderId; guests must prove the
// order with a full phone/email match or present a short-lived signed order
// challenge. Order ID and website ID are always derived from the database row.
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  rateLimitResponse,
  sanitizeText,
} from '../_shared';
import {
  createDeliveryChallenge,
  verifyDeliveryChallenge,
} from '../delivery/_guestDeliveryChallenge';
import { issueDeliveryOtp } from '../delivery/_deliveryOtp';
import { isSecurePodEligibleStatus } from '../delivery/_deliveryStatus';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

interface GuestLookupInput {
  orderNumber?: unknown;
  phone?: unknown;
  email?: unknown;
}

interface ResolvedOrder {
  id: number;
  website_id: string;
  order_status: string;
  payment_method: string;
  payment_status: string;
  customer_user_id: string;
  customer_email: string;
  customer_phone: string;
}

function normalizePhone(raw: unknown): string {
  return sanitizeText(String(raw || ''), 30).replace(/\D/g, '');
}

function normalizeEmail(raw: unknown): string {
  return sanitizeText(String(raw || ''), 160).trim().toLowerCase();
}

function normalizeOrderNumber(raw: unknown): string {
  return sanitizeText(String(raw || ''), 40).trim().toUpperCase();
}

/**
 * Guest proof requires the complete contact value. Partial/suffix-only matches
 * are deliberately rejected because they are guessable from a tracking page.
 */
function guestContactMatches(order: ResolvedOrder, input: GuestLookupInput): boolean {
  const orderPhone = normalizePhone(order.customer_phone);
  const suppliedPhone = normalizePhone(input.phone);
  const orderEmail = normalizeEmail(order.customer_email);
  const suppliedEmail = normalizeEmail(input.email);

  const phoneMatches =
    suppliedPhone.length >= 10 &&
    orderPhone.length >= 10 &&
    suppliedPhone === orderPhone;
  const emailMatches = Boolean(suppliedEmail) && suppliedEmail === orderEmail;
  return phoneMatches || emailMatches;
}

async function lookupByOrderNumber(
  env: PagesContext['env'],
  orderNumber: string
): Promise<ResolvedOrder | null> {
  if (!orderNumber) return null;
  return (await env.DB!.prepare(
    `SELECT id, website_id, order_status, payment_method, payment_status,
            customer_user_id, customer_email, customer_phone
     FROM store_orders WHERE UPPER(order_number) = ? LIMIT 1`
  )
    .bind(orderNumber)
    .first<ResolvedOrder>());
}

function deliveryStageAllowed(order: ResolvedOrder): boolean {
  if (!isSecurePodEligibleStatus(order.order_status)) return false;
  return String(order.payment_method) === 'cod' || String(order.payment_status) === 'paid';
}

async function guestRateLimit(
  context: PagesContext,
  scope: string,
  explicitOrderNumber = ''
): Promise<Response | null> {
  const clientIp = getClientIp(context.request);
  const orderNumber = normalizeOrderNumber(
    explicitOrderNumber || new URL(context.request.url).searchParams.get('orderNumber') || ''
  );
  const scoped = await checkRateLimit(
    context.env,
    `delivery_code:${scope}:${clientIp}:${orderNumber}`,
    5,
    600
  );
  if (!scoped.allowed) return rateLimitResponse(scoped, 'Too many delivery-code requests for this order.');
  const ipLimit = await checkRateLimit(
    context.env,
    `delivery_code_ip:${scope}:${clientIp}`,
    30,
    600
  );
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit, 'Too many delivery-code requests. Please try again later.');
  return null;
}

async function issueCodeResponse(
  env: PagesContext['env'],
  order: ResolvedOrder
): Promise<Response> {
  if (!deliveryStageAllowed(order)) {
    return jsonResponse(
      { error: 'A delivery code is only available while this order is eligible for delivery.' },
      409
    );
  }

  // Ledger identity is server-derived from the order row. No client flag can
  // turn this into verified delivery proof; only secure-pod consumes the code.
  const identity = String(order.customer_email || order.customer_phone || '');
  const result = await issueDeliveryOtp(env, {
    orderId: Number(order.id),
    websiteId: String(order.website_id || ''),
    email: identity,
  });

  if (!result.ok) {
    if (result.code === 'cooldown') {
      return jsonResponse(
        {
          error: `Please wait ${result.retryAfterSeconds || 60} seconds before requesting a new code.`,
          code: result.code,
          retryAfterSeconds: result.retryAfterSeconds || 60,
        },
        429
      );
    }
    return jsonResponse({ error: 'Unable to issue a delivery code. Please try again.' }, 503);
  }

  return jsonResponse({
    success: true,
    otp: result.otp,
    channel: 'in_app_display_only',
    deliveryCodeLabel: 'In-app code — no SMS or email was sent.',
    message: 'Share this code only with your assigned rider. No SMS or email delivery was made.',
    expiresInMinutes: 10,
  });
}

/** Creates a PII-free signed challenge for a verified guest order. */
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const body = await parseJsonBody<GuestLookupInput>(request);
  const orderNumber = normalizeOrderNumber(body?.orderNumber);
  if (!orderNumber) {
    return jsonResponse({ error: 'A valid order number is required.' }, 400);
  }

  const rateLimited = await guestRateLimit(context, 'challenge', orderNumber);
  if (rateLimited) return rateLimited;

  try {
    const order = await lookupByOrderNumber(env, orderNumber);
    if (!order || !guestContactMatches(order, body || {})) {
      return jsonResponse(
        { error: 'Order number and the full phone number or email used for this order are required.' },
        403
      );
    }

    const challenge = await createDeliveryChallenge(env, orderNumber);
    if (!challenge) {
      return jsonResponse({ error: 'Signed delivery-code challenges are unavailable.' }, 503);
    }
    return jsonResponse({ challenge, deliveryCodeLabel: 'In-app code — no SMS or email was sent.' });
  } catch {
    return jsonResponse({ error: 'Unable to issue an order challenge.' }, 500);
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const url = new URL(request.url);
  const authenticatedOrderId = Number(url.searchParams.get('orderId') || 0);
  const orderNumber = normalizeOrderNumber(url.searchParams.get('orderNumber'));
  const wantsChallengeProof = Boolean(url.searchParams.get('signature'));

  // Challenge/guest requests must never be blocked by an irrelevant or expired
  // auth token. Authenticated orderId requests still require a valid session.
  if (!orderNumber && (!Number.isInteger(authenticatedOrderId) || authenticatedOrderId <= 0)) {
    return jsonResponse(
      { error: 'Provide orderId (signed in) or orderNumber with full contact verification.' },
      400
    );
  }

  let authenticatedOrder: ResolvedOrder | null = null;
  if (!orderNumber && authenticatedOrderId > 0) {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;
    try {
      authenticatedOrder = await env.DB.prepare(
        `SELECT id, website_id, order_status, payment_method, payment_status,
                customer_user_id, customer_email, customer_phone
         FROM store_orders WHERE id = ? LIMIT 1`
      )
        .bind(authenticatedOrderId)
        .first<ResolvedOrder>();
    } catch {
      return jsonResponse({ error: 'Unable to issue a delivery code.' }, 500);
    }
    if (!authenticatedOrder) return jsonResponse({ error: 'Order not found.' }, 404);

    const user = auth.user;
    const orderUserId = String(authenticatedOrder.customer_user_id || '');
    const orderEmail = normalizeEmail(authenticatedOrder.customer_email);
    const ownsOrder =
      user.isSuperAdmin ||
      (Boolean(orderUserId) &&
        (orderUserId === user.id || orderUserId === user.authSubject)) ||
      (Boolean(orderEmail) && orderEmail === normalizeEmail(user.email));

    if (!ownsOrder) {
      return jsonResponse(
        { error: 'This delivery code is only available to the order customer.' },
        403
      );
    }
  }

  const rateLimited = await guestRateLimit(context, wantsChallengeProof ? 'challenge' : 'code');
  if (rateLimited) return rateLimited;

  try {
    let order: ResolvedOrder | null = authenticatedOrder;
    if (!order) {
      order = await lookupByOrderNumber(env, orderNumber);
      if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

      if (wantsChallengeProof) {
        const validChallenge = await verifyDeliveryChallenge(env, {
          orderNumber,
          expiresAt: url.searchParams.get('expiresAt'),
          signature: url.searchParams.get('signature'),
        });
        if (!validChallenge) {
          return jsonResponse(
            { error: 'The delivery-code challenge is invalid or expired.' },
            403
          );
        }
      } else if (!guestContactMatches(order, {
        phone: url.searchParams.get('phone'),
        email: url.searchParams.get('email'),
      })) {
        return jsonResponse(
          {
            error:
              'Provide the full phone number or email used for this order, or request a signed order challenge.',
            code: 'TRACKING_VERIFICATION_REQUIRED',
          },
          403
        );
      }
    }

    // order.id and order.website_id are read from the verified row only. No
    // client-supplied verification flag is accepted anywhere in this handler.
    return await issueCodeResponse(env, order);
  } catch {
    return jsonResponse({ error: 'Unable to issue a delivery code.' }, 500);
  }
}
