// ============================================================================
// GET /api/platform-owner/dashboard — OWNER-ONLY BUSINESS INTELLIGENCE
// Read-only, tenant-safe aggregates. No customer PII, provider secrets, webhook
// payloads, payment session IDs, raw JSON, or bank details are returned.
// ============================================================================

import { requireOwner } from '../_auth';
import {
  D1Database,
  PagesContext,
  handleOptions,
  jsonResponse,
} from '../_shared';
import {
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_FULL_NAME,
  PLATFORM_OWNER_TITLE,
} from '../_ownerRole';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown): number {
  return Math.round(num(value) * 100) / 100;
}

async function scalar(
  db: D1Database | undefined,
  sql: string,
  binds: unknown[] = []
): Promise<number> {
  if (!db) return 0;
  try {
    const row = await db.prepare(sql).bind(...binds).first<Row>();
    if (!row) return 0;
    const firstKey = Object.keys(row)[0];
    return num(firstKey ? row[firstKey] : 0);
  } catch {
    return 0;
  }
}

async function rows(
  db: D1Database | undefined,
  sql: string,
  binds: unknown[] = []
): Promise<Row[]> {
  if (!db) return [];
  try {
    const result = await db.prepare(sql).bind(...binds).all<Row>();
    return Array.isArray(result.results) ? result.results : [];
  } catch {
    return [];
  }
}

function groupCounts(source: Row[], key: string): Record<string, number> {
  const output: Record<string, number> = {};
  for (const row of source) {
    const label = String(row[key] ?? 'unknown');
    output[label] = num(row.cnt ?? row.count ?? 0);
  }
  return output;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireOwner(request, env);
  if (!auth.ok) return auth.response;

  const db = env.DB;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const previousDate = new Date();
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = previousDate.toISOString().slice(0, 7);

  const [currentUsers, previousUsers] = await Promise.all([
    scalar(
      db,
      `SELECT COUNT(*) AS cnt FROM vv_users WHERE substr(created_at, 1, 7) = ?`,
      [currentMonth]
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS cnt FROM vv_users WHERE substr(created_at, 1, 7) = ?`,
      [previousMonth]
    ),
  ]);

  const [
    totalCustomers,
    totalWebsites,
    publishedWebsites,
    allStores,
    activeSubscriptions,
    paidRevenue,
    pendingPayments,
    cashfreeSuccess,
    cashfreeFailed,
    cashfreeRefunded,
    settledAmount,
    pendingSettlementAmount,
    refundCount,
    refundAmount,
    expenseCount,
    expenseAmount,
    openTickets,
    changeRequests,
    totalOrders,
    paidOrders,
  ] = await Promise.all([
    scalar(db, `SELECT COUNT(*) AS cnt FROM vv_users WHERE role = 'customer'`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM customer_website_publications`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM customer_website_publications WHERE status = 'published'`),
    scalar(db, `SELECT COUNT(DISTINCT website_id) AS cnt FROM store_products`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM tenant_subscriptions WHERE status = 'active'`),
    scalar(db, `SELECT COALESCE(SUM(amount_inr), 0) AS cnt FROM cashfree_payments WHERE status = 'PAID'`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM cashfree_payments WHERE status IN ('CREATED', 'PENDING')`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM cashfree_payments WHERE status = 'PAID'`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM cashfree_payments WHERE status = 'FAILED'`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM cashfree_payments WHERE status = 'REFUNDED'`),
    scalar(db, `SELECT COALESCE(SUM(seller_payable_inr), 0) AS cnt FROM cashfree_seller_settlements WHERE settlement_status = 'settled'`),
    scalar(db, `SELECT COALESCE(SUM(seller_payable_inr), 0) AS cnt FROM cashfree_seller_settlements WHERE settlement_status IN ('pending_activation', 'on_hold')`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM refunds`),
    scalar(db, `SELECT COALESCE(SUM(amount_inr), 0) AS cnt FROM refunds`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM finance_ledger WHERE entry_type = 'expense'`),
    scalar(db, `SELECT COALESCE(SUM(amount_inr), 0) AS cnt FROM finance_ledger WHERE entry_type = 'expense'`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM support_tickets WHERE status IN ('open', 'in_progress')`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM website_change_requests`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM store_orders`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM store_orders WHERE payment_status = 'paid'`),
  ]);

  const [
    websiteCustomers,
    ecommerceCustomers,
    customerStatusRows,
    websiteStatusRows,
    proposalStatusRows,
    staffRoleRows,
    monthlyRevenue,
    recentPayments,
    recentActivity,
    backupStatusRows,
    auditLogTotal,
  ] = await Promise.all([
    scalar(db, `SELECT COUNT(DISTINCT owner_id) AS cnt FROM customer_website_publications`),
    scalar(db, `SELECT COUNT(DISTINCT owner_id) AS cnt FROM store_orders`),
    rows(db, `SELECT status, COUNT(*) AS cnt FROM vv_users GROUP BY status`),
    rows(db, `SELECT status, COUNT(*) AS cnt FROM customer_website_publications GROUP BY status`),
    rows(db, `SELECT status, COUNT(*) AS cnt FROM platform_proposals GROUP BY status`),
    rows(db, `SELECT staff_role, COUNT(*) AS cnt FROM platform_staff WHERE is_active = 1 GROUP BY staff_role`),
    rows(
      db,
      `SELECT substr(created_at, 1, 7) AS month, COALESCE(SUM(amount_inr), 0) AS amount
       FROM cashfree_payments
       WHERE status = 'PAID' AND created_at >= date('now', '-5 months')
       GROUP BY month ORDER BY month`
    ),
    rows(
      db,
      `SELECT id, entity_type, amount_inr, currency, status, created_at
       FROM cashfree_payments ORDER BY created_at DESC LIMIT 12`
    ),
    rows(
      db,
      `SELECT id, action, entity_type, created_at
       FROM vv_audit_log ORDER BY created_at DESC LIMIT 12`
    ),
    rows(db, `SELECT status, COUNT(*) AS cnt FROM backup_audit_records GROUP BY status`),
    scalar(db, `SELECT COUNT(*) AS cnt FROM vv_audit_log`),
  ]);

  const [superAdmins, platformStaff, activePlans, totalPlans, lifetimeEntitlements] =
    await Promise.all([
      scalar(db, `SELECT COUNT(*) AS cnt FROM vv_users WHERE role = 'admin'`),
      scalar(db, `SELECT COUNT(*) AS cnt FROM platform_staff WHERE is_active = 1`),
      scalar(db, `SELECT COUNT(*) AS cnt FROM subscription_plans WHERE is_active = 1`),
      scalar(db, `SELECT COUNT(*) AS cnt FROM subscription_plans`),
      scalar(db, `SELECT COUNT(*) AS cnt FROM tenant_lifetime_entitlements WHERE status = 'active'`),
    ]);

  const growthPercent =
    previousUsers > 0 ? Math.round(((currentUsers - previousUsers) / previousUsers) * 1000) / 10 : 0;
  const expenses = money(expenseAmount) + money(refundAmount);
  const netProfit = money(paidRevenue) - expenses;

  return jsonResponse(
    {
      ok: true,
      owner: {
        fullName: PLATFORM_OWNER_FULL_NAME,
        email: PLATFORM_OWNER_EMAIL,
        title: PLATFORM_OWNER_TITLE,
      },
      overview: {
        totalCustomers,
        websiteCustomers,
        ecommerceCustomers,
        totalWebsites,
        publishedWebsites,
        unpublishedWebsites: Math.max(totalWebsites - publishedWebsites, 0),
        allStores,
        activeSubscriptions,
        lifetimeEntitlements,
        totalRevenue: money(paidRevenue),
        pendingPayments,
        monthlyGrowthPercent: growthPercent,
        currentMonthUsers: currentUsers,
        previousMonthUsers: previousUsers,
      },
      finance: {
        cashfree: {
          successful: cashfreeSuccess,
          failed: cashfreeFailed,
          refunded: cashfreeRefunded,
          pending: pendingPayments,
          totalRevenue: money(paidRevenue),
        },
        settlements: {
          settledAmount: money(settledAmount),
          pendingAmount: money(pendingSettlementAmount),
        },
        refunds: { count: refundCount, amount: money(refundAmount) },
        expenses: { count: expenseCount, amount: money(expenseAmount) },
        profitAndLoss: {
          revenue: money(paidRevenue),
          expenses,
          netProfit,
        },
        monthlyRevenue: monthlyRevenue.map((r) => ({
          month: String(r.month ?? ''),
          amount: money(r.amount),
        })),
        recentPayments: recentPayments.map((r) => ({
          id: num(r.id),
          entityType: String(r.entity_type ?? ''),
          amount: money(r.amount_inr),
          currency: String(r.currency ?? 'INR'),
          status: String(r.status ?? ''),
          createdAt: String(r.created_at ?? ''),
        })),
      },
      customers: {
        total: totalCustomers,
        websiteCustomers,
        ecommerceCustomers,
        statusCounts: groupCounts(customerStatusRows, 'status'),
        openSupportTickets: openTickets,
      },
      websites: {
        total: totalWebsites,
        statusCounts: groupCounts(websiteStatusRows, 'status'),
        websiteRequests: changeRequests,
      },
      ecommerce: {
        stores: allStores,
        totalOrders,
        paidOrders,
      },
      team: {
        superAdmins,
        platformStaff,
        rolePermissions: groupCounts(staffRoleRows, 'staff_role'),
        activityLogs: recentActivity.map((r) => ({
          id: String(r.id ?? ''),
          action: String(r.action ?? ''),
          entityType: String(r.entity_type ?? ''),
          createdAt: String(r.created_at ?? ''),
        })),
      },
      settings: {
        plans: { total: totalPlans, active: activePlans },
        offers: proposalStatusRows.reduce((sum, r) => sum + num(r.cnt ?? r.count), 0),
        requestsByStatus: groupCounts(proposalStatusRows, 'status'),
      },
      security: {
        ownerProfile: {
          fullName: PLATFORM_OWNER_FULL_NAME,
          email: PLATFORM_OWNER_EMAIL,
          title: PLATFORM_OWNER_TITLE,
          emailVerified: auth.user.emailVerified === true,
        },
        loginSecurity: { mfaStatus: 'managed_by_supabase_auth', passwordHandling: 'owner_controlled' },
        auditLogSample: recentActivity.length,
        auditLogTotal,
        backupStatus: groupCounts(backupStatusRows, 'status'),
        criticalSettings: {
          database: Boolean(env.DB),
          supabase: Boolean(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
          cashfree: Boolean(env.CASHFREE_CLIENT_ID && env.CASHFREE_CLIENT_SECRET),
        },
      },
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}
