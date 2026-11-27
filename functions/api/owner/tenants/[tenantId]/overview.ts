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
import { getTenantAiQuota } from '../../../_aiCredits';
import {
  hasExplicitOwnerApproval,
  isDeliveryPartnerApprovalUnverifiable,
} from '../../../delivery/_autoAssignment';
import {
  hasDurableOwnerApproval,
  readRiderState,
} from '../../../delivery/_riderState';
import {
  getDeliveryCommissionPct,
  getRiderDeliveryCountsByPartner,
  getRiderEarningsByPartner,
} from '../../../delivery/_riderEarnings';

function parsePermission(raw: unknown, prefix: string): string {
  const text = String(raw || '');
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const hit = parsed.find((item) => typeof item === 'string' && item.startsWith(prefix));
      if (hit) return String(hit).slice(prefix.length);
    }
  } catch {
    // Fall back to plain text below.
  }
  return text || '';
}

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
  const aiQuota = await getTenantAiQuota(
    env,
    row.website_id,
    row.rowid ? Number(row.rowid) : undefined,
    parsed.planTier
  );
  const tenant = mapPublicationToTenant(row, parsed, {
    aiCredits: { limit: aiQuota.allowance, used: aiQuota.used },
  });
  const tenantRowId = tenant.id;

  const products: Array<Record<string, unknown>> = [];
  const orders: Array<Record<string, unknown>> = [];
  const coupons: Array<Record<string, unknown>> = [];
  const deliveryPartners: Array<Record<string, unknown>> = [];
  const staff: Array<Record<string, unknown>> = [];

  // 1. Products (including sku, barcode, active and inactive)
  try {
    const prodRes = await env.DB!.prepare(
      `SELECT id, sku, barcode, category, name, description, price_inr, compare_at_price_inr, stock_qty, low_stock_threshold, variants_json, images_json, is_active
       FROM store_products
       WHERE website_id = ?
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

  // 2. Orders & Financial Aggregates
  let totalRevenue = 0;
  let todayRevenue = 0;
  let weeklyRevenue = 0;
  let monthlyRevenue = 0;
  let pendingOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  const customerSet = new Set<string>();

  const nowMs = Date.now();
  const todayStartMs = new Date().setHours(0, 0, 0, 0);
  const oneWeekAgoMs = nowMs - 7 * 86400 * 1000;
  const oneMonthAgoMs = nowMs - 30 * 86400 * 1000;

  // Build daily trend map for past 7 days
  const dailyTrendMap: Record<string, { revenue: number; orders: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400 * 1000).toISOString().slice(0, 10);
    dailyTrendMap[d] = { revenue: 0, orders: 0 };
  }

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

      const orderTotal = Number(o.total_inr || 0);
      const isCancelledOrReturned = ['cancelled', 'returned'].includes(String(o.order_status || ''));
      const isDelivered = String(o.order_status || '') === 'delivered';

      const custKey = String(o.customer_phone || o.customer_email || o.customer_name || '').trim();
      if (custKey) customerSet.add(custKey);

      if (!isCancelledOrReturned) {
        totalRevenue += orderTotal;
      }

      if (isDelivered) {
        completedOrders += 1;
      } else if (isCancelledOrReturned) {
        cancelledOrders += 1;
      } else {
        pendingOrders += 1;
      }

      const orderTimeMs = Date.parse(String(o.created_at || '')) || 0;
      if (orderTimeMs >= todayStartMs && !isCancelledOrReturned) {
        todayRevenue += orderTotal;
      }
      if (orderTimeMs >= oneWeekAgoMs && !isCancelledOrReturned) {
        weeklyRevenue += orderTotal;
      }
      if (orderTimeMs >= oneMonthAgoMs && !isCancelledOrReturned) {
        monthlyRevenue += orderTotal;
      }

      const dateKey = String(o.created_at || '').slice(0, 10);
      if (dailyTrendMap[dateKey]) {
        dailyTrendMap[dateKey].orders += 1;
        if (!isCancelledOrReturned) {
          dailyTrendMap[dateKey].revenue += orderTotal;
        }
      }
    }
  } catch {
    // Optional migration 0003 table not yet applied
  }

  const salesTrend = Object.entries(dailyTrendMap).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    orders: data.orders,
  }));

  // Recent Activities
  const recentActivities: Array<{ id: string; action: string; description: string; timestamp: string }> = [];
  try {
    const audits = await env.DB!.prepare(
      `SELECT id, action, metadata_json, created_at FROM vv_audit_log
       WHERE entity_id = ? OR metadata_json LIKE ?
       ORDER BY created_at DESC LIMIT 10`
    )
      .bind(row.website_id, `%${row.website_id}%`)
      .all<Record<string, any>>();
    for (const a of audits.results || []) {
      recentActivities.push({
        id: String(a.id),
        action: String(a.action || 'activity'),
        description: `Action: ${String(a.action || '').replace(/_/g, ' ')}`,
        timestamp: String(a.created_at || new Date().toISOString()),
      });
    }
  } catch {}

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
  const earningsByPartner = await getRiderEarningsByPartner(env);
  const deliveryCountsByPartner = await getRiderDeliveryCountsByPartner(env);
  const riderCommissionPct = await getDeliveryCommissionPct(env, String(row.website_id || ''));
  let deliveryExpenseInr = 0;
  try {
    const memRes = await env.DB!.prepare(
      `SELECT id, full_name, email, role, status, permissions_json, invited_by
       FROM tenant_memberships
       WHERE website_id = ?
       ORDER BY id DESC LIMIT 100`
    )
      .bind(row.website_id)
      .all<Record<string, any>>();
    for (const m of memRes.results || []) {
      if (m.role === 'delivery_partner') {
        const partnerId = Number(m.id);
        const partnerKey = `${String(row.website_id || '')}|${partnerId}`;
        const pendingPayoutInr = earningsByPartner.get(partnerKey) || 0;
        deliveryExpenseInr += pendingPayoutInr;
        const riderState = readRiderState(m.permissions_json);
        const approvalUnverifiable =
          !hasDurableOwnerApproval(m) &&
          isDeliveryPartnerApprovalUnverifiable(m) &&
          !(await hasExplicitOwnerApproval(env, partnerId));

        deliveryPartners.push({
          id: partnerId,
          tenantId: tenantRowId,
          userId: null,
          name: String(m.full_name || m.email || 'Delivery Partner'),
          phone: parsePermission(m.permissions_json, 'phone:'),
          vehicleType: parsePermission(m.permissions_json, 'vehicleType:') || 'Standard',
          status: String(m.status || ''),
          deliveryApproval: riderState.deliveryApproval,
          availability: riderState.availability,
          available: riderState.availability === 'online',
          totalDeliveries: deliveryCountsByPartner.get(partnerKey) || 0,
          totalEarnings: pendingPayoutInr,
          pendingPayoutInr,
          commissionPct: riderCommissionPct,
          approvalUnverifiable,
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

  // Automation Workflows & Logs for AI Automation Center
  const defaultWorkflows = [
    {
      id: 1,
      tenantId: tenantRowId,
      name: 'Abandoned Cart WhatsApp Recovery',
      triggerType: 'abandoned_cart',
      conditionText: 'Cart value > ₹1,000 and customer consented',
      actionType: 'whatsapp_template',
      requiresApproval: false,
      scheduleCron: '0 */2 * * *',
      enabled: true,
      lastRunAt: null,
    },
    {
      id: 2,
      tenantId: tenantRowId,
      name: 'Low Stock Auto-Alert & Vendor PO Draft',
      triggerType: 'low_stock',
      conditionText: 'stock_qty <= low_stock_threshold',
      actionType: 'draft_purchase_order',
      requiresApproval: true,
      scheduleCron: '0 9 * * *',
      enabled: true,
      lastRunAt: null,
    },
    {
      id: 3,
      tenantId: tenantRowId,
      name: 'New Order Welcome & Invoice PDF Delivery',
      triggerType: 'order_placed',
      conditionText: 'payment_status = paid',
      actionType: 'send_whatsapp_invoice',
      requiresApproval: false,
      scheduleCron: 'realtime',
      enabled: true,
      lastRunAt: null,
    },
  ];

  const workflows =
    Array.isArray(parsed.automationWorkflows) && parsed.automationWorkflows.length > 0
      ? parsed.automationWorkflows
      : defaultWorkflows;

  const logs = Array.isArray(parsed.automationLogs) ? parsed.automationLogs : [];

  return jsonResponse({
    tenant,
    stats: {
      totalRevenue,
      todayRevenue,
      weeklyRevenue,
      monthlyRevenue,
      orderCount: orders.length,
      totalOrders: orders.length,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalCustomers: customerSet.size,
      productCount: products.length,
      activeProductsCount: products.filter((p) => p.active).length,
      inactiveProductsCount: products.filter((p) => !p.active).length,
      lowStockCount,
      activeDeliveries,
      // Abstract delivery expense recorded after verified deliveries. No
      // payout is deducted until a real Cashfree Payouts integration exists.
      deliveryExpenseInr,
      deliveryPayoutDueInr: deliveryExpenseInr,
      deliveryRateCardPct: riderCommissionPct,
      salesTrend,
      recentActivities,
    },
    products,
    orders,
    coupons,
    deliveryPartners,
    staff,
    workflows,
    logs,
    aiCredits: {
      limit: aiQuota.allowance,
      used: aiQuota.used,
      remaining: aiQuota.remaining,
      billingPeriod: aiQuota.billingPeriod,
    },
  });
}
