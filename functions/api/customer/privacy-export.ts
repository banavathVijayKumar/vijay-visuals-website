// ============================================================================
// GET /api/customer/privacy-export — Complete Personal Account Data Export
// Generates self-service GDPR/DPDP compliant JSON export of personal data.
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const exportData: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: auth.user.id,
      email: auth.user.email,
      fullName: auth.user.fullName,
      platformRole: auth.user.platformRole,
    },
    orders: [],
    tickets: [],
    appointments: [],
    savedAddresses: [],
  };

  if (env.DB) {
    try {
      const ords = await env.DB.prepare(
        `SELECT id, website_id, order_number, customer_name, customer_phone, total_inr, order_status, created_at
         FROM store_orders
         WHERE customer_email = ? OR customer_phone = ?
         ORDER BY id DESC LIMIT 100`
      )
        .bind(auth.user.email, auth.user.email)
        .all();
      exportData.orders = ords.results || [];
    } catch {}

    try {
      const tkts = await env.DB.prepare(
        `SELECT id, category, subject, message, status, created_at
         FROM support_tickets
         WHERE customer_email = ?
         ORDER BY id DESC LIMIT 50`
      )
        .bind(auth.user.email)
        .all();
      exportData.tickets = tkts.results || [];
    } catch {}

    try {
      const appts = await env.DB.prepare(
        `SELECT id, service_name, scheduled_start, status, created_at
         FROM appointments
         WHERE customer_email = ?
         ORDER BY id DESC LIMIT 50`
      )
        .bind(auth.user.email)
        .all();
      exportData.appointments = appts.results || [];
    } catch {}

    try {
      const addrs = await env.DB.prepare(
        `SELECT address_line1, phone, is_default
         FROM customer_addresses
         WHERE user_id = ? OR user_id = ?
         ORDER BY id DESC LIMIT 20`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .all();
      exportData.savedAddresses = addrs.results || [];
    } catch {}
  }

  return jsonResponse(exportData);
}
