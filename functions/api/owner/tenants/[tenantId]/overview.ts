// ============================================================================
// GET /api/owner/tenants/:tenantId/overview
// Strict owner-isolated business dashboard overview from Cloudflare D1.
// Safely returns empty arrays for optional commerce tables not yet migrated.
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';
import {
  mapOrderRowToUi,
  mapProductRowToUi,
  requireTenantOwnerAccess,
} from '../../../_tenantAccess';
import { mapPublicationToTenant } from '../../../_tenantMapper';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
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

  const { row, parsed } = access;
  const tenant = mapPublicationToTenant(row, parsed);
  const tenantRowId = tenant.id;

  const products: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const coupons: Array<Record<string, unknown>> = [];
  const deliveryPartners: Array<Record<string, unknown>> = [];
  const staff: Array<Record<string, unknown>> = [];

  // 1. Products
  try {
    const prodRes = await env.DB!.prepare(
      `SELECT id, category, name, description, price_inr, compare_at_price_inr, stock_qty, low_stock_threshold, variants_json, images_json, is_active
       FROM store_products
       WHERE website_id = ? AND is_active = 1
       ORDER BY id DESC LIMIT 200`
    )
      .bind(row.website_id)
      .all<Record<string, any>>();
    for (const p of prodRes.results || []) {
      products.push(mapProductRowToUi(p, tenantRowId));
    }
  } catch {
    // Optional migration 0003 table not yet applied
  }

  // 2. Orders
  let totalRevenue = 0;
  let pendingOrders = 0;
  try {
    const ordRes = await env.DB!.prepare(
      `SELECT * FROM store_orders
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 200`
    )
      .bind(row.website_id)
      .all<Record<string, any>>();
    for (const o of ordRes.results || []) {
      const mapped = mapOrderRowToUi(o, tenantRowId);
      orders.push(mapped);
      if (o.order_status !== 'cancelled' && o.order_status !== 'returned') {
        totalRevenue += Number(o.total_inr || 0);
      }
      if (!['delivered', 'cancelled', 'returned'].includes(String(o.order_status || ''))) {
        pendingOrders += 1;
      }
    }
  } catch {
    // Optional migration 0003 table not yet applied
  }

  // 3. Coupons
  try {
    const coupRes = await env.DB!.prepare(
      `SELECT id, code, discount_type, discount_value, min_order_inr, is_active
       FROM store_coupons
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 50`
    )
      .bind(row.website_id)
      .all<Record<string, any>>();
    for (const c of coupRes.results || []) {
      coupons.push({
        id: Number(c.id),
        tenantId: tenantRowId,
        code: String(c.code || ''),
        discountType: c.discount_type === 'flat' ? 'flat' : 'percent',
        discountValue: Number(c.discount_value || 0),
        minOrder: Number(c.min_order_inr || 0),
        active: Boolean(c.is_active),
      });
    }
  } catch {
    // Optional migration 0005 table not yet applied
  }

  // 4. Staff & Delivery Partners from tenant_memberships
  try {
    const memRes = await env.DB!.prepare(
      `SELECT id, full_name, email, role, status
       FROM tenant_memberships
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 100`
    )
      .bind(row.website_id)
      .all<Record<string, any>>();
    for (const m of memRes.results || []) {
      if (m.role === 'delivery_partner') {
        deliveryPartners.push({
          id: Number(m.id),
          tenantId: tenantRowId,
          userId: null,
          name: String(m.full_name || m.email || 'Delivery Partner'),
          phone: '',
          vehicleType: 'Standard',
          available: m.status === 'active',
          totalDeliveries: 0,
          totalEarnings: 0,
        });
      } else {
        staff.push({
          id: Number(m.id),
          tenantId: tenantRowId,
          name: String(m.full_name || m.email || 'Staff'),
          email: String(m.email || ''),
          staffRole: String(m.role || 'business_staff'),
          active: m.status === 'active',
        });
      }
    }
  } catch {
    // Optional migration 0003 table not yet applied
  }

  const lowStockCount = products.filter(
    (p) => Number(p.stock || 0) <= Number(p.lowStockThreshold || 5)
  ).length;

  const activeDeliveries = orders.filter((o) =>
    ['ready_for_pickup', 'out_for_delivery'].includes(String(o.status || ''))
  ).length;

  return jsonResponse({
    tenant,
    stats: {
      totalRevenue,
      orderCount: orders.length,
      totalOrders: orders.length,
      productCount: products.length,
      pendingOrders,
      lowStockCount,
      activeDeliveries,
    },
    products,
    orders,
    coupons,
    deliveryPartners,
    staff,
  });
}
