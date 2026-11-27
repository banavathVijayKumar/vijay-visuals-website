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

    // 2. Load only orders with a real delivery_assignments row for this rider.
    // D1 store_orders has no delivery_partner_id column; unassigned orders must
    // never be presented as "Assigned Deliveries".
    const partnerIds = partners.map((p) => String(p.id));
    let ordersRes: Array<Record<string, any>> = [];

    if (auth.user.isSuperAdmin) {
      const ords = await env.DB.prepare(
        `SELECT o.*, da.delivery_partner_user_id AS assignment_partner_id
         FROM store_orders o
         JOIN delivery_assignments da ON da.order_id = o.id AND da.website_id = o.website_id
         ORDER BY o.id DESC LIMIT 50`
      ).all<Record<string, any>>();
      ordersRes = ords.results || [];
    } else if (partnerIds.length > 0) {
      // Tenant isolation: only websites where this caller holds an active
      // delivery_partner membership may be listed, and only rows assigned to
      // that specific rider.
      const websiteIds = Array.from(
        new Set(partnerRows.map((p) => String(p.website_id || '')).filter(Boolean))
      );
      if (websiteIds.length > 0) {
        const websitePlaceholders = websiteIds.map(() => '?').join(',');
        const partnerPlaceholders = partnerIds.map(() => '?').join(',');
        const ords = await env.DB.prepare(
          `SELECT o.*, da.delivery_partner_user_id AS assignment_partner_id
           FROM store_orders o
           JOIN delivery_assignments da ON da.order_id = o.id AND da.website_id = o.website_id
           WHERE o.website_id IN (${websitePlaceholders})
             AND da.delivery_partner_user_id IN (${partnerPlaceholders})
          ORDER BY o.id DESC LIMIT 50`
        )
          .bind(...websiteIds, ...partnerIds)
          .all<Record<string, any>>();
        ordersRes = ords.results || [];
      }
    }

    for (const o of ordersRes) {
      const mapped = mapOrderRowToUi(o, 1) as Record<string, any>;
      mapped.deliveryPartnerId = Number(o.assignment_partner_id) || null;
      assignedOrders.push(mapped);
    }

    return jsonResponse({ partners, assignedOrders });
  } catch (err) {
    return jsonResponse({ partners: [], assignedOrders: [] });
  }
}
