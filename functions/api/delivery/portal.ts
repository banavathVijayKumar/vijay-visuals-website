// ============================================================================
// GET /api/delivery/portal — Delivery Fleet Management Portal
// Returns active delivery partner profiles and assigned order deliveries.
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { mapOrderRowToUi } from '../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database binding is not configured.' }, 503);
  }

  const partners: Array<Record<string, any>> = [];
  const assignedOrders: Array<Record<string, any>> = [];

  try {
    // 1. Load delivery partner profiles
    let partnerRows: Array<Record<string, any>> = [];
    if (auth.user.isSuperAdmin) {
      const res = await env.DB.prepare(
        `SELECT id, website_id, user_id, full_name, email, role, status FROM tenant_memberships WHERE role = 'delivery_partner' LIMIT 50`
      ).all<Record<string, any>>();
      partnerRows = res.results || [];
    } else {
      const res = await env.DB.prepare(
        `SELECT id, website_id, user_id, full_name, email, role, status FROM tenant_memberships
         WHERE role = 'delivery_partner' AND (user_id = ? OR user_id = ? OR email = ?) LIMIT 10`
      )
        .bind(auth.user.id, auth.user.authSubject, auth.user.email)
        .all<Record<string, any>>();
      partnerRows = res.results || [];
    }

    for (const p of partnerRows) {
      partners.push({
        id: Number(p.id),
        tenantId: 1,
        userId: p.user_id,
        name: String(p.full_name || p.email || 'Delivery Partner'),
        phone: '',
        vehicleType: 'Standard Vehicle',
        available: p.status === 'active',
        totalDeliveries: 0,
        totalEarnings: 0,
      });
    }

    // 2. Load assigned or active delivery orders
    const partnerIds = partners.map((p) => p.id);
    let ordersRes: Array<Record<string, any>> = [];

    if (auth.user.isSuperAdmin) {
      const ords = await env.DB.prepare(
        `SELECT * FROM store_orders
         WHERE order_status IN ('packed', 'ready_for_pickup', 'out_for_delivery')
         ORDER BY id DESC LIMIT 50`
      ).all<Record<string, any>>();
      ordersRes = ords.results || [];
    } else if (partnerIds.length > 0) {
      // Load orders assigned to this delivery partner or ready for pickup
      const ords = await env.DB.prepare(
        `SELECT * FROM store_orders
         WHERE (delivery_partner_id IN (${partnerIds.join(',')}) OR order_status IN ('ready_for_pickup', 'out_for_delivery'))
         ORDER BY id DESC LIMIT 50`
      ).all<Record<string, any>>();
      ordersRes = ords.results || [];
    }

    for (const o of ordersRes) {
      assignedOrders.push(mapOrderRowToUi(o, 1));
    }

    return jsonResponse({ partners, assignedOrders });
  } catch (err) {
    return jsonResponse({ partners: [], assignedOrders: [] });
  }
}
