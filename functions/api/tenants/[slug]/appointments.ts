// ============================================================================
// POST /api/tenants/:slug/appointments — Storefront Service Booking Request
// Prevents double-booking the same date + time slot for a business.
// ============================================================================

import {
  PagesContext,
  checkRateLimit,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from '../../_shared';
import { findPublicationByIdentifier, isMissingTableError } from '../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestPost(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  if (!env.DB) {
    return jsonResponse({ error: 'Booking storage is not configured.' }, 503);
  }

  const rl = await checkRateLimit(env, `appt:${getClientIp(request)}:${params.slug}`, 10, 600);
  if (!rl.allowed) {
    return jsonResponse({ error: 'Too many booking requests. Please wait a few minutes.' }, 429);
  }

  const pub = await findPublicationByIdentifier(env, params.slug);
  if (!pub || pub.status !== 'published') {
    return jsonResponse({ error: 'Storefront not found.' }, 404);
  }

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);

  const customerName = sanitizeText(body.customerName, 120);
  const customerPhone = sanitizeText(body.customerPhone, 30);
  const customerEmail = sanitizeText(body.customerEmail, 160).toLowerCase();
  const serviceName = sanitizeText(body.serviceName, 140) || 'Consultation / Service';
  const bookingDate = sanitizeText(body.bookingDate, 20);
  const timeSlot = sanitizeText(body.timeSlot, 30);
  const notes = sanitizeText(body.notes, 500);

  if (!customerName || customerName.length < 2) {
    return jsonResponse({ error: 'Your name is required.' }, 400);
  }
  if (!customerPhone || customerPhone.replace(/\D/g, '').length < 8) {
    return jsonResponse({ error: 'A valid phone number is required.' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !timeSlot) {
    return jsonResponse({ error: 'Valid booking date (YYYY-MM-DD) and time slot are required.' }, 400);
  }

  const scheduledStart = `${bookingDate} ${timeSlot}`;

  try {
    // Double-booking prevention for active slots
    const conflict = await env.DB.prepare(
      `SELECT id FROM appointments
       WHERE website_id = ? AND scheduled_start = ? AND status IN ('pending', 'confirmed')
       LIMIT 1`
    )
      .bind(pub.website_id, scheduledStart)
      .first<{ id: number }>();

    if (conflict) {
      return jsonResponse(
        { error: `The slot "${scheduledStart}" is already booked. Please choose another time.` },
        409
      );
    }

    const res = await env.DB.prepare(
      `INSERT INTO appointments
       (website_id, owner_id, customer_name, customer_phone, customer_email, service_name, scheduled_start, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
      .bind(
        pub.website_id,
        pub.owner_id,
        customerName,
        customerPhone,
        customerEmail,
        serviceName,
        scheduledStart,
        notes
      )
      .run();

    return jsonResponse(
      {
        appointment: {
          id: Number(res?.meta?.last_row_id || 0),
          tenantId: Number(pub.rowid || 0),
          customerName,
          customerPhone,
          customerEmail,
          serviceName,
          bookingDate,
          timeSlot,
          status: 'pending',
          notes,
          createdAt: new Date().toISOString(),
        },
      },
      201
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      return jsonResponse(
        {
          error: 'Appointment booking requires D1 migration 0003 (appointments). Please contact the business on WhatsApp.',
          code: 'MIGRATION_REQUIRED',
        },
        503
      );
    }
    return jsonResponse({ error: 'Unable to submit booking request.' }, 500);
  }
}
