// ============================================================================
// PATCH /api/delivery/orders/:id/secure-pod
// Strict POD path: assignment-scoped + one-time customer OTP + inline photo.
//
// This handler NEVER forwards a synthetic client-controlled request to a legacy
// writer. After all server checks pass it calls the non-exported
// `recordVerifiedPodWrite()` helper below, which owns every authoritative
// order/assignment write. The OTP is spent only after those writes succeed.
// ============================================================================

import { requireUser } from '../../../_auth';
import type { AuthenticatedUser } from '../../../_auth';
import type { CloudflareEnv } from '../../../_shared';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../../../_shared';
import { validateSafeImageSource } from '../../../_tenantAccess';
import { dispatchLifecycleNotification } from '../../../_lifecycleNotifications';
import { maskContactForLog, maskPodReference, redactPiiText } from '../../../_pii';
import { checkAssignedDeliveryAccess } from '../../_assignmentAccess';
import { postRiderEarnings } from '../../_riderEarnings';
import {
  isBackwardAssignmentTransition,
  isBackwardDeliveryTransition,
  isSecurePodEligibleStatus,
} from '../../_deliveryStatus';
import {
  consumeDeliveryOtpById,
  verifyDeliveryOtp,
} from '../../_deliveryOtp';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

interface VerifiedPodWriteInput {
  env: CloudflareEnv;
  user: AuthenticatedUser;
  orderId: number;
  podReference: string;
  codCollected: boolean;
  photoDataUrl: string;
}

function conflict(message: string, code = 'DELIVERY_STATE_CHANGED'): Response {
  return jsonResponse({ error: message, code }, 409);
}

/**
 * Internal, non-exported authoritative writer. It is reachable only from this
 * verified request handler — there is no public/legacy route into it.
 */
async function recordVerifiedPodWrite(input: VerifiedPodWriteInput): Promise<Response> {
  const { env, user, orderId } = input;
  if (!env.DB) return jsonResponse({ error: 'Database binding is not configured.' }, 503);

  const safePhoto = validateSafeImageSource(input.photoDataUrl);
  if (!safePhoto.startsWith('data:')) {
    return jsonResponse({ error: 'A PNG, JPG, or WebP delivery photo is required.' }, 400);
  }

  try {
    const order = await env.DB.prepare(
      `SELECT id, website_id, order_status, payment_method, payment_status,
              customer_user_id, customer_email, customer_phone
       FROM store_orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<Record<string, any>>();
    if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

    const websiteId = String(order.website_id || '');
    const currentOrderStatus = String(order.order_status || '');
    if (
      ['delivered', 'returned', 'cancelled'].includes(currentOrderStatus) ||
      !isSecurePodEligibleStatus(currentOrderStatus) ||
      isBackwardDeliveryTransition(currentOrderStatus, 'delivered')
    ) {
      return jsonResponse(
        {
          error: 'Delivery is already completed or no longer in a deliverable state.',
          code: 'DELIVERY_ALREADY_CLOSED',
        },
        410
      );
    }

    if (
      String(order.payment_method) === 'cashfree_online' &&
      String(order.payment_status) !== 'paid'
    ) {
      return jsonResponse(
        {
          error: 'Cannot complete delivery for an unpaid online order. Payment must be verified first.',
          code: 'PAYMENT_REQUIRED',
        },
        409
      );
    }

    const access = await checkAssignedDeliveryAccess(env, user, websiteId, orderId);
    if (!access.authorized || !access.assignmentId || !access.partnerId) {
      return jsonResponse(
        {
          error: 'Only the assigned delivery partner can complete secure proof of delivery.',
          code: 'ASSIGNMENT_REQUIRED',
        },
        403
      );
    }

    const assignment = access.assignment as Record<string, any>;
    const currentAssignmentStatus = String(assignment.status || '');
    if (isBackwardAssignmentTransition(currentAssignmentStatus, 'delivered')) {
      return conflict('The delivery assignment is in a terminal or backwards state.');
    }

    const maskedReference = maskPodReference(input.podReference);
    // Keep the phrase "customer OTP" for durable audit compatibility while the
    // code itself and all customer identifiers stay out of stored proof.
    const proofNote = `Verified customer OTP and photo proof; reference ${maskedReference}`;

    const orderWrite = await env.DB.prepare(
      `UPDATE store_orders
       SET order_status = 'delivered',
           payment_status = CASE WHEN payment_method = 'cod' AND ? = 1 THEN 'paid' ELSE payment_status END,
           updated_at = datetime('now')
       WHERE id = ? AND website_id = ? AND order_status = ?
         AND order_status NOT IN ('delivered', 'returned', 'cancelled')`
    )
      .bind(input.codCollected ? 1 : 0, orderId, websiteId, currentOrderStatus)
      .run();
    if (!orderWrite.meta?.changes) {
      return conflict('Order state changed concurrently. Refresh and retry secure POD.');
    }

    const assignmentWrite = await env.DB.prepare(
      `UPDATE delivery_assignments
       SET status = 'delivered',
           proof_of_delivery_note = ?,
           proof_of_delivery_url = ?,
           cod_collected = ?,
           last_lat = NULL,
           last_lng = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND order_id = ? AND website_id = ? AND status = ?
         AND status NOT IN ('delivered', 'returned', 'cancelled')`
    )
      .bind(
        proofNote,
        safePhoto,
        input.codCollected ? 1 : 0,
        access.assignmentId,
        orderId,
        websiteId,
        currentAssignmentStatus
      )
      .run();

    if (!assignmentWrite.meta?.changes) {
      // Restore the exact observed state so the order and assignment never
      // disagree after a concurrent or failed assignment write.
      await env.DB.prepare(
        `UPDATE store_orders
         SET order_status = ?, payment_status = ?, updated_at = datetime('now')
         WHERE id = ? AND website_id = ? AND order_status = 'delivered'`
      )
        .bind(currentOrderStatus, String(order.payment_status || ''), orderId, websiteId)
        .run();
      return conflict('Delivery assignment changed concurrently. Refresh and retry secure POD.');
    }

    // Earnings are derived from the assignment row by _riderEarnings; the
    // partner id from access is only a correlation hint and is never trusted.
    await postRiderEarnings(env, {
      websiteId,
      orderId,
      partnerId: Number(access.partnerId),
    });

    await writeAuditLog(env, {
      actorId: user.id,
      actorRole: user.platformRole,
      action: 'secure_pod_recorded',
      targetType: 'order',
      targetId: String(orderId),
      details: {
        websiteId,
        codCollected: input.codCollected,
        photoProof: true,
        otpVerified: true,
        podReference: maskedReference,
        assignmentId: access.assignmentId,
        partnerId: access.partnerId,
      },
    });

    const recipientContact = String(order.customer_email || order.customer_phone || '');
    await dispatchLifecycleNotification(env, {
      websiteId,
      eventType: 'proof_of_delivery_recorded',
      subject: `Proof of delivery for order #${orderId}`,
      message: `Order #${orderId} was completed with a verified delivery code, photo proof, and POD reference ${maskedReference}${input.codCollected ? '; COD collected.' : '.'}`,
      recipientUserId: String(order.customer_user_id || '') || null,
      recipientContact: maskContactForLog(recipientContact),
    });
    await dispatchLifecycleNotification(env, {
      websiteId,
      eventType: 'order_delivered',
      subject: `Order #${orderId} delivered`,
      message: redactPiiText(`Order #${orderId} was marked delivered with verified proof of delivery.`),
      recipientUserId: String(order.customer_user_id || '') || null,
      recipientContact: maskContactForLog(recipientContact),
    });

    return jsonResponse({
      success: true,
      status: 'delivered',
      otpVerified: true,
      photoProof: true,
      podReference: maskedReference,
    });
  } catch {
    return jsonResponse({ error: 'Unable to record secure proof of delivery.' }, 500);
  }
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
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

  const body = await parseJsonBody<{
    recipientName?: string;
    podCode?: string;
    codCollected?: boolean;
    customerOtp?: string;
    photoDataUrl?: string;
  }>(request);

  const recipientName = sanitizeText(body?.recipientName, 120);
  const podReference = sanitizeText(body?.podCode, 60);
  const customerOtp = String(body?.customerOtp || '').trim();
  const safePhoto = validateSafeImageSource(body?.photoDataUrl);
  const codCollected = body?.codCollected === true;

  // Recipient name / POD reference are descriptive metadata, never proof. The
  // only accepted proof is the server-verified OTP plus assignment and photo.
  if (!recipientName || !podReference) {
    return jsonResponse(
      { error: 'Recipient name and proof-of-delivery reference are required.' },
      400
    );
  }
  if (!/^\d{6}$/.test(customerOtp)) {
    return jsonResponse({ error: 'A valid 6-digit customer delivery code is required.' }, 400);
  }
  if (!safePhoto.startsWith('data:')) {
    return jsonResponse(
      { error: 'A PNG, JPG, or WebP delivery photo is required.' },
      400
    );
  }

  try {
    const order = await env.DB.prepare(
      'SELECT id, website_id FROM store_orders WHERE id = ? LIMIT 1'
    )
      .bind(orderId)
      .first<{ id: number; website_id: string }>();
    if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

    const websiteId = String(order.website_id || '');
    const otp = await verifyDeliveryOtp(env, {
      orderId,
      websiteId,
      otp: customerOtp,
      consume: false,
    });
    if (!otp.ok) {
      return jsonResponse(
        {
          error:
            otp.code === 'incorrect'
              ? `Incorrect delivery code. ${otp.remainingAttempts || 0} attempts remaining.`
              : 'Delivery code is invalid, expired, or already used. Ask the customer for a new code.',
          code: otp.code,
        },
        otp.code === 'max_attempts' ? 429 : 400
      );
    }

    const response = await recordVerifiedPodWrite({
      env,
      user: auth.user,
      orderId,
      podReference,
      codCollected,
      photoDataUrl: safePhoto,
    });
    if (!response.ok) return response;

    // Only record the durable "verified" event when the verified code actually
    // resulted in a completed POD. A rejected write (for example a wrong rider
    // or unsafe photo) must not leave a misleading successful-verification audit.
    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'delivery_otp_verified',
      targetType: 'order',
      targetId: String(orderId),
      details: { websiteId, otpId: otp.otpId },
    });

    const consumed = await consumeDeliveryOtpById(env, otp.otpId);
    if (!consumed) {
      // The delivery is already complete; fail loudly in the audit trail so an
      // operator can reconcile the one-time code manually if consumption races.
      await writeAuditLog(env, {
        actorId: auth.user.id,
        actorRole: auth.user.platformRole,
        action: 'delivery_otp_consume_failed',
        targetType: 'order',
        targetId: String(orderId),
        details: { websiteId, otpId: otp.otpId },
      });
    }

    const payload = (await response.clone().json().catch(() => ({}))) as Record<string, any>;
    return jsonResponse({ ...payload, otpVerified: true, photoProof: true });
  } catch {
    return jsonResponse({ error: 'Unable to record secure proof of delivery.' }, 500);
  }
}
