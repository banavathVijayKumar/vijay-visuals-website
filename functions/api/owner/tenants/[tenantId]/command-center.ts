// ============================================================================
// VIJAY VISUALS — CLOUDFLARE PAGES EDGE BUSINESS COMMAND CENTER
// GET /api/owner/tenants/:tenantId/command-center
//
// Daily Business Command Center:
// - Aggregates real-time sales, order fulfillment, expenses, inventory,
//   customer leads, appointments, and staff attendance.
// - Strictly tenant-isolated: reads authorized tenant's database rows only.
// - Returns strictly valid JSON with standard HTTP status codes.
// - Never exposes other tenants' data or returns SPA HTML fallback.
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../../../_shared';
import { requireTenantOwnerAccess } from '../../../_tenantAccess';
import { cleanString, mapPublicationToTenant } from '../../../_tenantMapper';

export interface CommandCenterMetrics {
  todaySalesInr: number;
  periodSalesInr: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingPaymentsInr: number;
  pendingPaymentsCount: number;
  recordedExpensesInr: number;
  purchaseCostsInr: number;
  estimatedProfitInr: number;
  hasCostOrExpenseData: boolean;
  profitDisclaimer: string;
  lowStockCount: number;
  newCustomersCount: number;
  newEnquiriesCount: number;
  pendingDeliveriesCount: number;
  upcomingAppointmentsCount: number;
  supplierOutstandingInr: number;
  staffAttendanceToday: {
    totalActiveStaff: number;
    present: number;
    halfDay: number;
    leave: number;
    absent: number;
  };
}

export interface CommandCenterResponse {
  range: string;
  generatedAt: string;
  metrics: CommandCenterMetrics;
  lowStockProducts: Array<{
    id: number;
    name: string;
    stock: number;
    lowStockThreshold: number;
    price: number;
  }>;
  topProducts: Array<{
    name: string;
    unitsSold: number;
    revenueInr: number;
  }>;
  upcomingAppointments: Array<{
    id: number;
    customerName: string;
    serviceName: string;
    bookingDate: string;
    timeSlot: string;
    status: string;
  }>;
  alerts: Array<{
    severity: 'high' | 'medium' | 'info';
    title: string;
    detail: string;
    actionTab: string;
  }>;
}

function getDateWindow(range: string, fromParam?: string, toParam?: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (range === 'today') {
    return { start: startOfToday, end: endOfToday, label: 'Today' };
  }
  if (range === '7d') {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 6);
    return { start, end: endOfToday, label: 'Last 7 Days' };
  }
  if (range === '30d') {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 29);
    return { start, end: endOfToday, label: 'Last 30 Days' };
  }
  if (range === 'custom' && fromParam && toParam) {
    const parsedFrom = new Date(`${fromParam}T00:00:00`);
    const parsedTo = new Date(`${toParam}T23:59:59`);
    if (!Number.isNaN(parsedFrom.getTime()) && !Number.isNaN(parsedTo.getTime())) {
      return { start: parsedFrom, end: parsedTo, label: `${fromParam} to ${toParam}` };
    }
  }
  return { start: new Date(0), end: endOfToday, label: 'All Time' };
}

function parseOrderItems(itemsJson: unknown): Array<{ name?: string; quantity?: number; price?: number }> {
  try {
    const arr = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
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

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  const { row, parsed } = access;
  const tenant = mapPublicationToTenant(row, parsed);
  const websiteId = row.website_id;

  const url = new URL(request.url);
  const rangeParam = cleanString(url.searchParams.get('range') || '30d', 20);
  const fromParam = url.searchParams.get('from') || undefined;
  const toParam = url.searchParams.get('to') || undefined;
  const windowRange = getDateWindow(rangeParam, fromParam, toParam);

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Queries (safe fallbacks if optional tables do not exist yet)
  let orders: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, order_number, customer_name, customer_phone, customer_email, items_json, total_inr, payment_method, payment_status, order_status, created_at
       FROM store_orders
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    orders = res.results || [];
  } catch {}

  let products: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, name, price_inr, stock_qty, low_stock_threshold, is_active
       FROM store_products
       WHERE website_id = ?
       ORDER BY id ASC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    products = res.results || [];
  } catch {}

  let financeRecords: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT entry_type, amount_inr, gst_inr, entry_date, created_at
       FROM finance_ledger
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    financeRecords = res.results || [];
  } catch {}

  let purchaseOrders: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, total_cost_inr, status, payment_status, created_at
       FROM purchase_orders
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    purchaseOrders = res.results || [];
  } catch {}

  let crmLeads: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, customer_name, customer_phone, stage, next_followup_date, created_at
       FROM crm_contacts_leads
       WHERE website_id = ?
       ORDER BY created_at DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    crmLeads = res.results || [];
  } catch {}

  let appointments: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, customer_name, service_name, scheduled_start, status
       FROM appointments
       WHERE website_id = ?
       ORDER BY scheduled_start ASC LIMIT 100`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    appointments = res.results || [];
  } catch {}

  let staffAttendance: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT staff_id, attendance_date, status
       FROM staff_attendance_payroll
       WHERE website_id = ?`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    staffAttendance = res.results || [];
  } catch {}

  let activeStaffCount = 0;
  try {
    const res = await env.DB.prepare(
      `SELECT COUNT(*) AS active_count
       FROM tenant_memberships
       WHERE website_id = ? AND status = 'active'
         AND role IN ('business_manager', 'business_staff')`
    )
      .bind(websiteId)
      .first<{ active_count: number }>();
    activeStaffCount = Number(res?.active_count || 0);
  } catch {}

  let payoutAccount: Record<string, any> | null = null;
  try {
    payoutAccount = await env.DB.prepare(
      `SELECT kyc_status, linked_account_id
       FROM seller_payout_accounts
       WHERE website_id = ? LIMIT 1`
    )
      .bind(websiteId)
      .first<Record<string, any>>();
  } catch {}

  let domainsList: Array<Record<string, any>> = [];
  try {
    const res = await env.DB.prepare(
      `SELECT domain_name, dns_verification_status, status
       FROM tenant_domains
       WHERE website_id = ?`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    domainsList = res.results || [];
  } catch {}

  // Filter helpers
  const inWindow = (dt: Date | string | null | undefined): boolean => {
    if (!dt) return false;
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return false;
    return d >= windowRange.start && d <= windowRange.end;
  };

  const ordersInRange = orders.filter((o) => inWindow(o.created_at));
  const todayOrders = orders.filter((o) => {
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    return !Number.isNaN(d.getTime()) && d >= startOfToday;
  });

  const todaySalesInr = todayOrders
    .filter((o) => String(o.order_status || '') !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_inr || 0), 0);

  const periodSalesInr = ordersInRange
    .filter((o) => String(o.order_status || '') !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total_inr || 0), 0);

  const pendingStatuses = new Set(['placed', 'confirmed', 'packed', 'out_for_delivery']);
  const pendingOrders = ordersInRange.filter((o) => pendingStatuses.has(String(o.order_status || ''))).length;
  const completedOrders = ordersInRange.filter((o) => String(o.order_status || '') === 'delivered').length;
  const cancelledOrders = ordersInRange.filter((o) =>
    ['cancelled', 'return_requested', 'returned'].includes(String(o.order_status || ''))
  ).length;

  const pendingPaymentOrders = ordersInRange.filter(
    (o) => String(o.order_status || '') !== 'cancelled' && String(o.payment_status || '') !== 'paid'
  );
  const pendingPaymentsInr = pendingPaymentOrders.reduce((sum, o) => sum + Number(o.total_inr || 0), 0);

  const financeInRange = financeRecords.filter((f) => inWindow(f.created_at || f.entry_date));
  const recordedExpensesInr = financeInRange
    .filter((f) => String(f.entry_type || '') === 'expense')
    .reduce((sum, f) => sum + Number(f.amount_inr || 0), 0);
  const recordedOtherIncomeInr = financeInRange
    .filter((f) => String(f.entry_type || '') === 'income')
    .reduce((sum, f) => sum + Number(f.amount_inr || 0), 0);
  const creditNotesInr = financeInRange
    .filter((f) => ['credit_note', 'refund'].includes(String(f.entry_type || '')))
    .reduce((sum, f) => sum + Number(f.amount_inr || 0), 0);

  const posInRange = purchaseOrders.filter((p) => inWindow(p.created_at) && String(p.status || '') !== 'cancelled');
  const purchaseCostsInr = posInRange.reduce((sum, p) => sum + Number(p.total_cost_inr || 0), 0);

  const supplierOutstandingInr = purchaseOrders
    .filter((p) => String(p.status || '') !== 'cancelled' && String(p.payment_status || '') !== 'paid')
    .reduce((sum, p) => sum + Number(p.total_cost_inr || 0), 0);

  const hasCostOrExpenseData = recordedExpensesInr > 0 || purchaseCostsInr > 0;
  const estimatedProfitInr =
    periodSalesInr + recordedOtherIncomeInr - recordedExpensesInr - purchaseCostsInr - creditNotesInr;

  const lowStockProducts = products
    .filter((p) => (p.is_active === 1 || p.is_active === true) && Number(p.stock_qty || 0) <= Number(p.low_stock_threshold || 0))
    .map((p) => ({
      id: Number(p.id || 0),
      name: cleanString(p.name || 'Product', 120),
      stock: Number(p.stock_qty || 0),
      lowStockThreshold: Number(p.low_stock_threshold || 0),
      price: Number(p.price_inr || 0),
    }));

  const uniqueCustomerKeys = new Set(
    ordersInRange.map((o) =>
      cleanString(o.customer_email || o.customer_phone || o.customer_name || '', 100).toLowerCase()
    ).filter(Boolean)
  );

  const newEnquiries = crmLeads.filter((l) => inWindow(l.created_at));

  const pendingDeliveries = orders.filter((o) =>
    pendingStatuses.has(String(o.order_status || ''))
  );

  const upcomingAppointmentsList = appointments
    .filter((a) => {
      const isCancelledOrDone = ['cancelled', 'completed'].includes(String(a.status || ''));
      if (isCancelledOrDone) return false;
      const start = String(a.scheduled_start || '');
      return !start || start >= todayIso;
    })
    .sort((a, b) => String(a.scheduled_start || '').localeCompare(String(b.scheduled_start || '')));

  const todayAttRows = staffAttendance.filter((a) => String(a.attendance_date || '') === todayIso);
  const staffAttendanceToday = {
    totalActiveStaff: Math.max(activeStaffCount, todayAttRows.length),
    present: todayAttRows.filter((a) => String(a.status || '') === 'present').length,
    halfDay: todayAttRows.filter((a) => String(a.status || '') === 'half_day').length,
    leave: todayAttRows.filter((a) => String(a.status || '') === 'leave').length,
    absent: todayAttRows.filter((a) => String(a.status || '') === 'absent').length,
  };

  // Top products calculation from real order snapshots
  const productSalesMap = new Map<string, { name: string; unitsSold: number; revenueInr: number }>();
  for (const ord of ordersInRange) {
    if (String(ord.order_status || '') === 'cancelled') continue;
    const items = parseOrderItems(ord.items_json);
    for (const item of items) {
      const key = cleanString(item?.name || 'Item', 120);
      const prev = productSalesMap.get(key) || { name: key, unitsSold: 0, revenueInr: 0 };
      const qty = Math.max(1, Number(item?.quantity || 1));
      const price = Number(item?.price || 0);
      prev.unitsSold += qty;
      prev.revenueInr += price * qty;
      productSalesMap.set(key, prev);
    }
  }

  const topProducts = Array.from(productSalesMap.values())
    .sort((a, b) => b.revenueInr - a.revenueInr)
    .slice(0, 6);

  // Actionable alerts
  const alerts: Array<{ severity: 'high' | 'medium' | 'info'; title: string; detail: string; actionTab: string }> = [];
  if (lowStockProducts.length > 0) {
    alerts.push({
      severity: 'high',
      title: `${lowStockProducts.length} product(s) running low on stock`,
      detail: lowStockProducts
        .slice(0, 3)
        .map((p) => `${p.name} (${p.stock} left)`)
        .join(', '),
      actionTab: 'inventory_po',
    });
  }

  const unverifiedPaymentCount = orders.filter(
    (o) =>
      String(o.order_status || '') !== 'cancelled' &&
      (String(o.payment_status || '') === 'pending' || String(o.payment_status || '') === 'pending_verification')
  ).length;
  if (unverifiedPaymentCount > 0) {
    alerts.push({
      severity: 'high',
      title: `${unverifiedPaymentCount} order(s) waiting for payment verification`,
      detail: 'Confirm payment receipt or COD status before dispatching orders.',
      actionTab: 'overview',
    });
  }

  const delayedOrders = pendingDeliveries.filter((o) => {
    if (!o.created_at) return false;
    const t = new Date(o.created_at).getTime();
    return !Number.isNaN(t) && now.getTime() - t > 48 * 3600 * 1000;
  });
  if (delayedOrders.length > 0) {
    alerts.push({
      severity: 'medium',
      title: `${delayedOrders.length} open order(s) older than 48 hours`,
      detail: delayedOrders
        .slice(0, 3)
        .map((o) => String(o.order_number || o.id))
        .join(', '),
      actionTab: 'overview',
    });
  }

  const dueFollowups = crmLeads.filter((l) => {
    const due = String(l.next_followup_date || '');
    const stage = String(l.stage || '');
    return due && due <= todayIso && stage !== 'won' && stage !== 'lost';
  });
  if (dueFollowups.length > 0) {
    alerts.push({
      severity: 'medium',
      title: `${dueFollowups.length} customer enquiry follow-up(s) due`,
      detail: dueFollowups
        .slice(0, 3)
        .map((l) => `${l.customer_name || 'Lead'} (${l.customer_phone || ''})`)
        .join(', '),
      actionTab: 'crm_bookings',
    });
  }

  const kycStatus = String(payoutAccount?.kyc_status || '');
  if (!payoutAccount || kycStatus !== 'verified') {
    alerts.push({
      severity: 'info',
      title: 'Online Cashfree payout verification pending',
      detail: 'Cash on Delivery & Direct UPI work now. Complete Cashfree seller verification for automated online collections.',
      actionTab: 'payments',
    });
  }

  for (const dom of domainsList) {
    if (dom.dns_verification_status === 'failed' || dom.status === 'dns_error') {
      alerts.push({
        severity: 'medium',
        title: `DNS error on ${dom.domain_name}`,
        detail: 'Verify your CNAME or TXT DNS record.',
        actionTab: 'domains_dns',
      });
    }
  }

  const responsePayload: CommandCenterResponse = {
    range: windowRange.label,
    generatedAt: now.toISOString(),
    metrics: {
      todaySalesInr,
      periodSalesInr,
      totalOrders: ordersInRange.length,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      pendingPaymentsInr,
      pendingPaymentsCount: pendingPaymentOrders.length,
      recordedExpensesInr,
      purchaseCostsInr,
      estimatedProfitInr,
      hasCostOrExpenseData,
      profitDisclaimer: hasCostOrExpenseData
        ? 'Operational Estimate Only: Calculated from recorded sales minus recorded expenses, purchase orders, and credit notes. Not an accountant-verified financial statement.'
        : 'Incomplete Cost Data: No business expenses or supplier purchase costs are recorded for this period yet. Add expenses or purchase orders before relying on estimated profit.',
      lowStockCount: lowStockProducts.length,
      newCustomersCount: uniqueCustomerKeys.size,
      newEnquiriesCount: newEnquiries.length,
      pendingDeliveriesCount: pendingDeliveries.length,
      upcomingAppointmentsCount: upcomingAppointmentsList.length,
      supplierOutstandingInr,
      staffAttendanceToday,
    },
    lowStockProducts,
    topProducts,
    upcomingAppointments: upcomingAppointmentsList.slice(0, 6).map((a) => {
      const start = String(a.scheduled_start || '');
      return {
        id: Number(a.id || 0),
        customerName: cleanString(a.customer_name || 'Customer', 100),
        serviceName: cleanString(a.service_name || 'Service Appointment', 120),
        bookingDate: start.slice(0, 10) || todayIso,
        timeSlot: start.slice(11, 16) || 'General',
        status: cleanString(a.status || 'scheduled', 30),
      };
    }),
    alerts,
  };

  return jsonResponse(responsePayload);
}
