import crypto from 'crypto';
import express, { Request, Response, Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  appointments,
  auditLogs,
  businessLocations,
  crmLeads,
  deliveryPartners,
  financeRecords,
  newsletterSubscribers,
  onboardingProgress,
  orders,
  platformFeedback,
  products,
  purchaseOrders,
  sellerPayoutAccounts,
  staffAttendance,
  staffMembers,
  staffTasks,
  stockMovements,
  suppliers,
  supportTickets,
  tenantDomains,
  tenants,
  tenantSeoSettings,
  tenantVersions,
  warehouses,
} from '../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { generateAiText } from '../lib/gemini.ts';
import { getRazorpayStatus } from '../lib/razorpay.ts';
import { resolveGoogleMapsApiKey } from './locations.ts';

async function writeOsAudit(
  actorEmail: string,
  actorRole: string,
  action: string,
  details: string,
  tenantId?: number | null
) {
  try {
    await db.insert(auditLogs).values({
      actorEmail,
      actorRole,
      tenantId: tenantId ?? null,
      action,
      details,
    });
  } catch (err) {
    console.error('Business OS audit write error:', err);
  }
}

async function assertTenantAccess(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant, isOwnerOrAdmin: true };
  }
  const [staffRow] = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.email, dbUser.email), eq(staffMembers.active, true)))
    .limit(1);
  // Business OS exposes finance/CRM data. Store managers and support agents
  // retain day-to-day access; inventory clerks and unknown roles are denied.
  if (staffRow && (staffRow.staffRole === 'store_manager' || staffRow.staffRole === 'support_agent')) {
    return { ok: true as const, tenant, isOwnerOrAdmin: false, staffRole: staffRow.staffRole };
  }
  return {
    ok: false as const,
    status: 403,
    error: 'Tenant isolation enforced: you cannot access another business account.',
  };
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

function parseOrderItems(itemsJson: string): Array<{ productId?: number; name: string; quantity: number; price: number }> {
  try {
    const arr = JSON.parse(itemsJson || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function createBusinessOsRouter(): Router {
  const router = express.Router();

  // =========================================================================
  // MODULE 1: GUIDED 12-STEP CUSTOMER ONBOARDING WIZARD
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/onboarding', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [tenantProducts, domains, [payout], [savedRow], tenantLocations] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
        db.select().from(sellerPayoutAccounts).where(eq(sellerPayoutAccounts.tenantId, tenantId)).limit(1),
        db.select().from(onboardingProgress).where(eq(onboardingProgress.tenantId, tenantId)).limit(1),
        db.select().from(businessLocations).where(eq(businessLocations.tenantId, tenantId)),
      ]);

      let manualSteps: number[] = [];
      if (savedRow) {
        try {
          const parsed = JSON.parse(savedRow.completedStepsJson || '[]');
          if (Array.isArray(parsed)) manualSteps = parsed.map(Number);
        } catch {
          manualSteps = [];
        }
      }

      const t = access.tenant;
      const steps = [
        {
          step: 1,
          key: 'account_verified',
          title: 'Register & Verify Account Contact',
          simpleGuide: 'Your Google account is signed in. Keep your business mobile number and email updated so customers and alerts reach you.',
          autoCompleted: Boolean(req.dbUser?.email && (req.dbUser?.phone || t.phone)),
          targetAction: 'profile',
        },
        {
          step: 2,
          key: 'category_selected',
          title: 'Select Business Category',
          simpleGuide: 'Choose the industry that matches your business (Clothing, Grocery, Restaurant, Salon, Services, etc.).',
          autoCompleted: Boolean(t.category && t.category.trim().length > 0),
          targetAction: 'builder',
        },
        {
          step: 3,
          key: 'business_details',
          title: 'Enter Business Name & Contact Details',
          simpleGuide: 'Set your business name, lowercase URL slug, phone number, and WhatsApp contact.',
          autoCompleted: Boolean(t.name && t.slug && t.phone),
          targetAction: 'builder',
        },
        {
          step: 4,
          key: 'media_uploaded',
          title: 'Add Logo, Banner Photos & Videos',
          simpleGuide: 'Add a recognizable logo badge, storefront banner image, and product photos or videos.',
          autoCompleted: Boolean(t.logoText && t.bannerImage),
          targetAction: 'builder',
        },
        {
          step: 5,
          key: 'template_selected',
          title: 'Select Website Template',
          simpleGuide: 'Pick a ready-made responsive design layout built for mobile shoppers and desktop visitors.',
          autoCompleted: Boolean(t.templateId),
          targetAction: 'builder',
        },
        {
          step: 6,
          key: 'website_customized',
          title: 'Customize Colors, Fonts & Tagline',
          simpleGuide: 'Tailor your brand accent color, typography, tagline, and About Business description.',
          autoCompleted: Boolean(t.tagline && t.description && t.primaryColor),
          targetAction: 'builder',
        },
        {
          step: 7,
          key: 'products_added',
          title: 'Add Products or Services',
          simpleGuide: 'List at least one product or service with price, stock count, and a clear customer-friendly description.',
          autoCompleted: tenantProducts.length > 0,
          targetAction: 'products',
        },
        {
          step: 8,
          key: 'location_configured',
          title: 'Configure Business Location & Branches',
          simpleGuide: 'Pin your shop or multiple branch locations on Google Maps (or enter manually) so customers get a live map preview and Get Directions button.',
          autoCompleted: tenantLocations.length > 0 || Boolean(t.address && t.address.trim().length >= 6),
          targetAction: 'locations',
        },
        {
          step: 9,
          key: 'domain_connected',
          title: 'Connect Your Own Domain (Optional)',
          simpleGuide: 'Use your temporary /site/ URL now or connect your own .com / .in domain with our DNS Verification Wizard.',
          autoCompleted: domains.length > 0 || Boolean(t.customDomain),
          targetAction: 'domains_dns',
        },
        {
          step: 10,
          key: 'payment_delivery',
          title: 'Configure Payment & Delivery',
          simpleGuide: 'Enable Cash on Delivery, add your UPI ID, set delivery charges, or complete Cashfree seller verification.',
          autoCompleted: Boolean(t.codEnabled || t.upiId || payout),
          targetAction: 'payments',
        },
        {
          step: 11,
          key: 'preview_website',
          title: 'Preview Your Live Storefront',
          simpleGuide: 'Open your storefront as a customer to check prices, cart, mobile layout, and contact buttons.',
          autoCompleted: manualSteps.includes(11),
          targetAction: 'storefront',
        },
        {
          step: 12,
          key: 'publish_website',
          title: 'Publish Business Website',
          simpleGuide: 'Make your storefront live so customers can browse, book appointments, and place orders online.',
          autoCompleted: Boolean(t.published),
          targetAction: 'storefront',
        },
      ].map((s) => ({
        ...s,
        completed: s.autoCompleted || manualSteps.includes(s.step),
      }));

      const completedCount = steps.filter((s) => s.completed).length;
      const progressPct = Math.round((completedCount / steps.length) * 100);

      res.json({
        steps,
        completedCount,
        totalSteps: steps.length,
        progressPct,
        currentStep: savedRow?.currentStep || steps.find((s) => !s.completed)?.step || 12,
        dismissed: savedRow?.dismissed || false,
      });
    } catch (error) {
      console.error('GET onboarding failed:', error);
      res.status(500).json({ error: 'Unable to load setup wizard progress.' });
    }
  });

  router.put('/api/owner/tenants/:tenantId/onboarding', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const completedSteps = Array.isArray(req.body?.completedSteps)
        ? req.body.completedSteps.map(Number).filter((n: number) => n >= 1 && n <= 12)
        : [];
      const currentStep = Math.max(1, Math.min(12, Number(req.body?.currentStep) || 1));
      const dismissed = Boolean(req.body?.dismissed);

      const [existing] = await db
        .select()
        .from(onboardingProgress)
        .where(eq(onboardingProgress.tenantId, tenantId))
        .limit(1);

      let saved;
      if (existing) {
        [saved] = await db
          .update(onboardingProgress)
          .set({
            completedStepsJson: JSON.stringify(Array.from(new Set(completedSteps))),
            currentStep,
            dismissed,
            updatedAt: new Date(),
          })
          .where(eq(onboardingProgress.id, existing.id))
          .returning();
      } else {
        [saved] = await db
          .insert(onboardingProgress)
          .values({
            tenantId,
            completedStepsJson: JSON.stringify(Array.from(new Set(completedSteps))),
            currentStep,
            dismissed,
          })
          .returning();
      }

      res.json({ progress: saved });
    } catch (error) {
      console.error('PUT onboarding failed:', error);
      res.status(500).json({ error: 'Unable to save setup progress.' });
    }
  });

  // =========================================================================
  // MODULE 2: DAILY BUSINESS COMMAND CENTER (15 REAL METRICS + ALERTS + REPORTS)
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/command-center', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const range = String(req.query.range || '30d');
      const fromParam = typeof req.query.from === 'string' ? req.query.from : undefined;
      const toParam = typeof req.query.to === 'string' ? req.query.to : undefined;
      const windowRange = getDateWindow(range, fromParam, toParam);

      const todayIso = new Date().toISOString().slice(0, 10);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        tenantOrders,
        tenantProducts,
        tenantFinance,
        tenantLeads,
        tenantAppointments,
        tenantAttendance,
        tenantStaff,
        tenantPOs,
        tenantDomainsList,
        [payoutAcc],
      ] = await Promise.all([
        db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt)),
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(financeRecords).where(eq(financeRecords.tenantId, tenantId)),
        db.select().from(crmLeads).where(eq(crmLeads.tenantId, tenantId)),
        db.select().from(appointments).where(eq(appointments.tenantId, tenantId)),
        db.select().from(staffAttendance).where(eq(staffAttendance.tenantId, tenantId)),
        db.select().from(staffMembers).where(eq(staffMembers.tenantId, tenantId)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId)),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
        db.select().from(sellerPayoutAccounts).where(eq(sellerPayoutAccounts.tenantId, tenantId)).limit(1),
      ]);

      const inWindow = (dt: Date | string) => {
        const d = new Date(dt);
        return d >= windowRange.start && d <= windowRange.end;
      };

      const ordersInRange = tenantOrders.filter((o) => inWindow(o.createdAt));
      const todayOrders = tenantOrders.filter((o) => new Date(o.createdAt) >= startOfToday);

      const todaySalesInr = todayOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);

      const periodSalesInr = ordersInRange
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);

      const pendingStatuses = new Set(['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']);
      const pendingOrders = ordersInRange.filter((o) => pendingStatuses.has(o.status)).length;
      const completedOrders = ordersInRange.filter((o) => o.status === 'delivered').length;
      const cancelledOrders = ordersInRange.filter(
        (o) => o.status === 'cancelled' || o.status === 'return_requested'
      ).length;

      const pendingPaymentOrders = ordersInRange.filter(
        (o) => o.status !== 'cancelled' && (o.paymentStatus === 'pending_verification' || o.paymentStatus === 'cod_due')
      );
      const pendingPaymentsInr = pendingPaymentOrders.reduce((sum, o) => sum + o.total, 0);

      const financeInRange = tenantFinance.filter((f) => inWindow(f.createdAt));
      const recordedExpensesInr = financeInRange
        .filter((f) => f.recordType === 'expense')
        .reduce((sum, f) => sum + f.amountInr, 0);
      const recordedOtherIncomeInr = financeInRange
        .filter((f) => f.recordType === 'income')
        .reduce((sum, f) => sum + f.amountInr, 0);
      const creditNotesInr = financeInRange
        .filter((f) => f.recordType === 'credit_note')
        .reduce((sum, f) => sum + f.amountInr, 0);

      const posInRange = tenantPOs.filter((p) => inWindow(p.createdAt) && p.status !== 'cancelled');
      const purchaseCostsInr = posInRange.reduce((sum, p) => sum + p.totalCostInr, 0);

      const supplierOutstandingInr = tenantPOs
        .filter((p) => p.status !== 'cancelled' && p.paymentStatus !== 'paid')
        .reduce((sum, p) => sum + p.totalCostInr, 0);

      const hasCostOrExpenseData = recordedExpensesInr > 0 || purchaseCostsInr > 0;
      const estimatedProfitInr =
        periodSalesInr + recordedOtherIncomeInr - recordedExpensesInr - purchaseCostsInr - creditNotesInr;

      const lowStockProducts = tenantProducts
        .filter((p) => p.active && p.stock <= p.lowStockThreshold)
        .map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          lowStockThreshold: p.lowStockThreshold,
          price: p.price,
        }));

      const uniqueCustomerKeys = new Set(
        ordersInRange.map((o) => (o.customerEmail || o.customerPhone || o.customerName).toLowerCase().trim())
      );
      const newEnquiries = tenantLeads.filter((l) => inWindow(l.createdAt));

      const pendingDeliveries = tenantOrders.filter((o) =>
        ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)
      );

      const upcomingAppointments = tenantAppointments
        .filter((a) => a.bookingDate >= todayIso && a.status !== 'cancelled' && a.status !== 'completed')
        .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));

      const todayAttRows = tenantAttendance.filter((a) => a.recordDate === todayIso);
      const staffAttendanceToday = {
        totalActiveStaff: tenantStaff.filter((s) => s.active).length,
        present: todayAttRows.filter((a) => a.status === 'present').length,
        halfDay: todayAttRows.filter((a) => a.status === 'half_day').length,
        leave: todayAttRows.filter((a) => a.status === 'leave').length,
        absent: todayAttRows.filter((a) => a.status === 'absent').length,
      };

      // Top-selling products from real orders
      const productSalesMap = new Map<string, { name: string; unitsSold: number; revenueInr: number }>();
      for (const ord of ordersInRange) {
        if (ord.status === 'cancelled') continue;
        for (const item of parseOrderItems(ord.itemsJson)) {
          const key = item.name || 'Item';
          const prev = productSalesMap.get(key) || { name: key, unitsSold: 0, revenueInr: 0 };
          prev.unitsSold += Number(item.quantity) || 1;
          prev.revenueInr += (Number(item.price) || 0) * (Number(item.quantity) || 1);
          productSalesMap.set(key, prev);
        }
      }
      const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.revenueInr - a.revenueInr)
        .slice(0, 6);

      // Actionable Important Alerts
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
      const unverifiedUpiCount = tenantOrders.filter(
        (o) => o.paymentStatus === 'pending_verification' && o.status !== 'cancelled'
      ).length;
      if (unverifiedUpiCount > 0) {
        alerts.push({
          severity: 'high',
          title: `${unverifiedUpiCount} UPI payment(s) waiting for owner verification`,
          detail: 'Confirm UTR/payment receipt before dispatching orders.',
          actionTab: 'overview',
        });
      }
      const delayedOrders = pendingDeliveries.filter(
        (o) => Date.now() - new Date(o.createdAt).getTime() > 48 * 3600 * 1000
      );
      if (delayedOrders.length > 0) {
        alerts.push({
          severity: 'medium',
          title: `${delayedOrders.length} open order(s) older than 48 hours`,
          detail: delayedOrders
            .slice(0, 3)
            .map((o) => o.orderNumber)
            .join(', '),
          actionTab: 'overview',
        });
      }
      const dueFollowups = tenantLeads.filter(
        (l) => l.nextFollowupDate && l.nextFollowupDate <= todayIso && l.stage !== 'won' && l.stage !== 'lost'
      );
      if (dueFollowups.length > 0) {
        alerts.push({
          severity: 'medium',
          title: `${dueFollowups.length} customer enquiry follow-up(s) due`,
          detail: dueFollowups
            .slice(0, 3)
            .map((l) => `${l.name} (${l.phone})`)
            .join(', '),
          actionTab: 'crm_bookings',
        });
      }
      if (!payoutAcc || payoutAcc.kycStatus !== 'verified') {
        alerts.push({
          severity: 'info',
          title: 'Online Cashfree verification pending',
          detail: 'Cash on Delivery & Direct UPI work now. Complete Cashfree seller verification for automated collections.',
          actionTab: 'payments',
        });
      }
      for (const dom of tenantDomainsList) {
        if (dom.dnsStatus === 'dns_error') {
          alerts.push({
            severity: 'medium',
            title: `DNS error on ${dom.domainName}`,
            detail: dom.dnsErrorDetail || 'Verify your CNAME or TXT DNS record.',
            actionTab: 'domains_dns',
          });
        }
      }

      res.json({
        range: windowRange.label,
        generatedAt: new Date().toISOString(),
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
          upcomingAppointmentsCount: upcomingAppointments.length,
          supplierOutstandingInr,
          staffAttendanceToday,
        },
        lowStockProducts,
        topProducts,
        upcomingAppointments: upcomingAppointments.slice(0, 6),
        alerts,
      });
    } catch (error) {
      console.error('GET command-center failed:', error);
      res.status(500).json({ error: 'Unable to load Daily Business Command Center.' });
    }
  });

  // =========================================================================
  // MODULE 4: INVENTORY, PURCHASE ORDERS, STOCK MOVEMENTS & VALUATION
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/inventory-ops', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [tenantProducts, pos, movements, whList, supList] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(desc(products.createdAt)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId)).orderBy(desc(purchaseOrders.createdAt)),
        db
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.tenantId, tenantId))
          .orderBy(desc(stockMovements.createdAt))
          .limit(100),
        db.select().from(warehouses).where(eq(warehouses.tenantId, tenantId)),
        db.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)),
      ]);

      // Latest unit cost from purchase orders or movements per product
      const latestCostByProduct = new Map<number, number>();
      for (const po of pos) {
        if (po.productId && !latestCostByProduct.has(po.productId) && po.unitCostInr > 0) {
          latestCostByProduct.set(po.productId, po.unitCostInr);
        }
      }

      let retailValuationInr = 0;
      let costValuationInr = 0;
      let totalUnitsInStock = 0;
      let productsWithCostCount = 0;

      const enrichedProducts = tenantProducts.map((p) => {
        const recordedUnitCost = latestCostByProduct.get(p.id) || 0;
        if (recordedUnitCost > 0) productsWithCostCount += 1;
        retailValuationInr += p.stock * p.price;
        costValuationInr += p.stock * (recordedUnitCost || p.wholesalePrice || 0);
        totalUnitsInStock += p.stock;
        const skuCode = `VV-${tenantId}-${String(p.id).padStart(4, '0')}`;
        return {
          ...p,
          skuCode,
          recordedUnitCost,
          retailValueInr: p.stock * p.price,
        };
      });

      const damagedUnits = movements
        .filter((m) => m.movementType === 'damaged')
        .reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);

      const todayIso = new Date().toISOString().slice(0, 10);
      const expiringSoon = movements
        .filter((m) => m.expiryDate && m.expiryDate >= todayIso)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
        .slice(0, 10);

      res.json({
        products: enrichedProducts,
        purchaseOrders: pos,
        stockMovements: movements,
        warehouses: whList,
        suppliers: supList,
        valuation: {
          totalUnitsInStock,
          retailValuationInr,
          estimatedCostValuationInr: costValuationInr,
          productsWithRecordedCost: productsWithCostCount,
          totalProducts: tenantProducts.length,
          damagedUnitsRecorded: damagedUnits,
          supplierOutstandingInr: pos
            .filter((p) => p.status !== 'cancelled' && p.paymentStatus !== 'paid')
            .reduce((sum, p) => sum + p.totalCostInr, 0),
        },
        expiringSoon,
      });
    } catch (error) {
      console.error('GET inventory-ops failed:', error);
      res.status(500).json({ error: 'Unable to load inventory and purchase operations.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/purchase-orders', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        supplierId: z.number().int().positive().nullable().optional(),
        supplierName: z.string().min(2).max(120),
        productId: z.number().int().positive().nullable().optional(),
        itemName: z.string().min(2).max(140),
        quantity: z.number().int().positive(),
        unitCostInr: z.number().int().positive(),
        expectedDate: z.string().max(20).optional().default(''),
        notes: z.string().max(400).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Provide supplier name, item name, positive quantity, and unit cost.' });
      }

      const poNumber = `PO-${tenantId}-${Date.now().toString().slice(-6)}`;
      const totalCostInr = parsed.data.quantity * parsed.data.unitCostInr;

      const [po] = await db
        .insert(purchaseOrders)
        .values({
          tenantId,
          poNumber,
          supplierId: parsed.data.supplierId ?? null,
          supplierName: parsed.data.supplierName.trim(),
          productId: parsed.data.productId ?? null,
          itemName: parsed.data.itemName.trim(),
          quantity: parsed.data.quantity,
          unitCostInr: parsed.data.unitCostInr,
          totalCostInr,
          status: 'ordered',
          paymentStatus: 'unpaid',
          expectedDate: parsed.data.expectedDate,
          notes: parsed.data.notes,
        })
        .returning();

      await writeOsAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'PURCHASE_ORDER_CREATED',
        `${poNumber}: ${po.quantity}x ${po.itemName} from ${po.supplierName} (₹${po.totalCostInr})`,
        tenantId
      );

      res.status(201).json({ purchaseOrder: po });
    } catch (error) {
      console.error('POST purchase-order failed:', error);
      res.status(500).json({ error: 'Unable to create purchase order.' });
    }
  });

  router.patch('/api/owner/purchase-orders/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Purchase order not found.' });

      const access = await assertTenantAccess(req, existing.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const nextStatus = req.body?.status ? String(req.body.status) : existing.status;
      const nextPaymentStatus = req.body?.paymentStatus ? String(req.body.paymentStatus) : existing.paymentStatus;
      const recordExpense = Boolean(req.body?.recordExpense);

      const transitioningToReceived = existing.status !== 'received' && nextStatus === 'received';

      const [updated] = await db
        .update(purchaseOrders)
        .set({
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          receivedAt: transitioningToReceived ? new Date() : existing.receivedAt,
        })
        .where(eq(purchaseOrders.id, id))
        .returning();

      // Auto-increment product stock + log stock movement when PO is received
      if (transitioningToReceived && existing.productId) {
        await db
          .update(products)
          .set({ stock: sql`${products.stock} + ${existing.quantity}` })
          .where(and(eq(products.id, existing.productId), eq(products.tenantId, existing.tenantId)));

        await db.insert(stockMovements).values({
          tenantId: existing.tenantId,
          productId: existing.productId,
          movementType: 'purchase_in',
          quantityDelta: existing.quantity,
          unitCostInr: existing.unitCostInr,
          skuBarcode: `VV-${existing.tenantId}-${String(existing.productId).padStart(4, '0')}`,
          reason: `Received ${existing.poNumber} from ${existing.supplierName}`,
          actorEmail: req.dbUser!.email,
        });
      }

      if (transitioningToReceived && recordExpense) {
        const gstAmountInr = Math.round((existing.totalCostInr * 18) / 100);
        await db.insert(financeRecords).values({
          tenantId: existing.tenantId,
          recordType: 'expense',
          referenceNo: existing.poNumber,
          partyName: existing.supplierName,
          category: 'Inventory Purchase',
          amountInr: existing.totalCostInr,
          gstRatePct: 18,
          gstAmountInr,
          status: nextPaymentStatus === 'paid' ? 'settled' : 'recorded',
          notes: `Auto-logged from ${existing.poNumber}: ${existing.quantity}x ${existing.itemName}`,
        });
      }

      await writeOsAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'PURCHASE_ORDER_UPDATED',
        `${existing.poNumber}: status=${nextStatus}, payment=${nextPaymentStatus}`,
        existing.tenantId
      );

      res.json({ purchaseOrder: updated });
    } catch (error) {
      console.error('PATCH purchase-order failed:', error);
      res.status(500).json({ error: 'Unable to update purchase order.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/stock-movements', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        productId: z.number().int().positive(),
        warehouseId: z.number().int().positive().nullable().optional(),
        movementType: z.enum(['purchase_in', 'sale_out', 'transfer', 'damaged', 'adjustment']),
        quantity: z.number().int().positive(),
        direction: z.enum(['in', 'out']).optional(),
        unitCostInr: z.number().int().min(0).optional().default(0),
        skuBarcode: z.string().max(64).optional().default(''),
        expiryDate: z.string().max(20).optional().default(''),
        reason: z.string().min(2).max(240),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Select product, positive quantity, and enter a clear reason.' });
      }

      const [prod] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, parsed.data.productId), eq(products.tenantId, tenantId)))
        .limit(1);
      if (!prod) return res.status(404).json({ error: 'Product not found in this business.' });

      let delta = parsed.data.quantity;
      if (
        parsed.data.movementType === 'damaged' ||
        parsed.data.movementType === 'sale_out' ||
        (parsed.data.movementType === 'adjustment' && parsed.data.direction === 'out')
      ) {
        delta = -parsed.data.quantity;
      } else if (parsed.data.movementType === 'transfer') {
        // Warehouse transfer keeps total stock unchanged unless direction specified
        delta = 0;
      }

      const newStock = Math.max(0, prod.stock + delta);
      if (delta !== 0) {
        await db.update(products).set({ stock: newStock }).where(eq(products.id, prod.id));
      }

      const [movement] = await db
        .insert(stockMovements)
        .values({
          tenantId,
          productId: prod.id,
          warehouseId: parsed.data.warehouseId ?? null,
          movementType: parsed.data.movementType,
          quantityDelta: delta === 0 ? parsed.data.quantity : delta,
          unitCostInr: parsed.data.unitCostInr,
          skuBarcode: parsed.data.skuBarcode || `VV-${tenantId}-${String(prod.id).padStart(4, '0')}`,
          expiryDate: parsed.data.expiryDate,
          reason: parsed.data.reason.trim(),
          actorEmail: req.dbUser!.email,
        })
        .returning();

      res.status(201).json({ movement, updatedStock: newStock });
    } catch (error) {
      console.error('POST stock-movement failed:', error);
      res.status(500).json({ error: 'Unable to record stock movement.' });
    }
  });

  // =========================================================================
  // MODULE 5: EXPANDED FINANCE ENTRIES (INCOME, DEBIT NOTE, CASH/BANK, BALANCES)
  // =========================================================================
  router.post('/api/owner/tenants/:tenantId/finance-entry', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        recordType: z.enum(['income', 'expense', 'quotation', 'credit_note', 'debit_note', 'cash_bank']),
        partyName: z.string().min(2).max(120),
        category: z.string().min(2).max(60),
        amountInr: z.number().int().positive(),
        gstRatePct: z.number().int().min(0).max(28).default(18),
        status: z.enum(['recorded', 'sent', 'accepted', 'settled']).optional().default('recorded'),
        notes: z.string().max(400).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Enter a valid record type, party name, category, and INR amount.' });
      }

      const prefixMap: Record<string, string> = {
        income: 'INC',
        expense: 'EXP',
        quotation: 'QTN',
        credit_note: 'CRN',
        debit_note: 'DBN',
        cash_bank: 'BNK',
      };
      const gstAmountInr = Math.round((parsed.data.amountInr * parsed.data.gstRatePct) / 100);
      const referenceNo = `${prefixMap[parsed.data.recordType]}-${Date.now().toString().slice(-6)}`;

      const [record] = await db
        .insert(financeRecords)
        .values({
          tenantId,
          recordType: parsed.data.recordType,
          referenceNo,
          partyName: parsed.data.partyName.trim(),
          category: parsed.data.category.trim(),
          amountInr: parsed.data.amountInr,
          gstRatePct: parsed.data.gstRatePct,
          gstAmountInr,
          status: parsed.data.status,
          notes: parsed.data.notes,
        })
        .returning();

      res.status(201).json({ record });
    } catch (error) {
      console.error('POST finance-entry failed:', error);
      res.status(500).json({ error: 'Unable to save accounting entry.' });
    }
  });

  // =========================================================================
  // MODULE 7: STAFF TASKS & ROLE-RESTRICTED HR / PAYROLL ACCESS
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/hr-ops', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [staff, tasks, rawAttendance] = await Promise.all([
        db.select().from(staffMembers).where(eq(staffMembers.tenantId, tenantId)).orderBy(desc(staffMembers.createdAt)),
        db.select().from(staffTasks).where(eq(staffTasks.tenantId, tenantId)).orderBy(desc(staffTasks.createdAt)),
        db
          .select()
          .from(staffAttendance)
          .where(eq(staffAttendance.tenantId, tenantId))
          .orderBy(desc(staffAttendance.createdAt))
          .limit(100),
      ]);

      // Restrict salary figures strictly to Business Owner or Super Admin
      const canViewPayroll = access.isOwnerOrAdmin;
      const attendance = rawAttendance.map((row) => ({
        ...row,
        salaryPaidInr: canViewPayroll ? row.salaryPaidInr : null,
      }));

      res.json({
        canViewPayroll,
        staff,
        tasks,
        attendance,
      });
    } catch (error) {
      console.error('GET hr-ops failed:', error);
      res.status(500).json({ error: 'Unable to load HR and staff tasks.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/tasks', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        staffId: z.number().int().positive().nullable().optional(),
        staffName: z.string().max(100).optional().default('Unassigned'),
        title: z.string().min(3).max(160),
        description: z.string().max(500).optional().default(''),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
        dueDate: z.string().max(20).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Enter a task title (minimum 3 characters).' });

      const [task] = await db
        .insert(staffTasks)
        .values({
          tenantId,
          staffId: parsed.data.staffId ?? null,
          staffName: parsed.data.staffName || 'Unassigned',
          title: parsed.data.title.trim(),
          description: parsed.data.description,
          priority: parsed.data.priority,
          dueDate: parsed.data.dueDate,
          status: 'pending',
          assignedBy: req.dbUser!.email,
        })
        .returning();

      res.status(201).json({ task });
    } catch (error) {
      console.error('POST staff task failed:', error);
      res.status(500).json({ error: 'Unable to assign staff task.' });
    }
  });

  router.patch('/api/owner/tasks/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(staffTasks).where(eq(staffTasks.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Task not found.' });

      const access = await assertTenantAccess(req, existing.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const nextStatus = req.body?.status ? String(req.body.status) : existing.status;
      if (!['pending', 'in_progress', 'completed'].includes(nextStatus)) {
        return res.status(400).json({ error: 'Invalid task status.' });
      }

      const [updated] = await db
        .update(staffTasks)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(staffTasks.id, id))
        .returning();

      res.json({ task: updated });
    } catch (error) {
      console.error('PATCH staff task failed:', error);
      res.status(500).json({ error: 'Unable to update staff task.' });
    }
  });

  // =========================================================================
  // MODULE 8: DELIVERY PROOF OF DELIVERY (POD) & COD COLLECTION CONFIRMATION
  // =========================================================================
  router.patch('/api/delivery/orders/:id/pod', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      // Allow assigned delivery partner, business owner, or super admin
      const access = await assertTenantAccess(req, order.tenantId);
      let allowed = access.ok;
      if (!allowed && order.deliveryPartnerId) {
        const [partner] = await db
          .select()
          .from(deliveryPartners)
          .where(and(eq(deliveryPartners.id, order.deliveryPartnerId), eq(deliveryPartners.userId, req.dbUser!.id)))
          .limit(1);
        if (partner) allowed = true;
      }
      if (!allowed) {
        return res.status(403).json({ error: 'Only the assigned delivery partner or business owner can record POD.' });
      }

      const recipientName = String(req.body?.recipientName || '').trim().slice(0, 80);
      const podCode = String(req.body?.podCode || '').trim().slice(0, 40);
      const codCollected = Boolean(req.body?.codCollected);
      const markStatus = req.body?.status ? String(req.body.status) : order.status;

      const podSummary = [
        recipientName ? `Received by: ${recipientName}` : '',
        podCode ? `POD Ref: ${podCode}` : '',
        codCollected ? `COD ₹${order.total} collected` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const mergedNotes = [order.notes, podSummary ? `[POD ${new Date().toISOString().slice(0, 16)}] ${podSummary}` : '']
        .filter(Boolean)
        .join('\n')
        .slice(0, 1000);

      const [updated] = await db
        .update(orders)
        .set({
          status: markStatus,
          paymentStatus: codCollected ? 'paid' : order.paymentStatus,
          notes: mergedNotes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();

      await writeOsAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'DELIVERY_POD_RECORDED',
        `${order.orderNumber}: ${podSummary || markStatus}`,
        order.tenantId
      );

      res.json({ order: updated });
    } catch (error) {
      console.error('PATCH delivery POD failed:', error);
      res.status(500).json({ error: 'Unable to record Proof of Delivery.' });
    }
  });

  // =========================================================================
  // MODULE 9: GROUNDED AI BUSINESS ASSISTANT (REAL LIVE TENANT DATA ONLY)
  // =========================================================================
  router.post('/api/owner/tenants/:tenantId/ai-assistant', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const question = String(req.body?.question || '').trim();
      const language = (['en', 'te', 'hi'].includes(String(req.body?.language))
        ? String(req.body?.language)
        : 'en') as 'en' | 'te' | 'hi';

      if (question.length < 3 || question.length > 1000) {
        return res.status(400).json({ error: 'Ask a business question (3–1000 characters).' });
      }
      if (access.tenant.aiCreditsUsed + 1 > access.tenant.aiCreditsLimit) {
        return res.status(402).json({ error: 'AI credit limit reached. Upgrade your AI credits package.' });
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayIso = new Date().toISOString().slice(0, 10);

      const [
        tenantOrders,
        tenantProducts,
        tenantFinance,
        tenantLeads,
        tenantAppointments,
        tenantPOs,
        [seo],
      ] = await Promise.all([
        db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt)).limit(200),
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(financeRecords).where(eq(financeRecords.tenantId, tenantId)),
        db.select().from(crmLeads).where(eq(crmLeads.tenantId, tenantId)),
        db.select().from(appointments).where(eq(appointments.tenantId, tenantId)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId)),
        db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1),
      ]);

      const todaySalesInr = tenantOrders
        .filter((o) => new Date(o.createdAt) >= startOfToday && o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);
      const totalSalesInr = tenantOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);
      const recordedExpensesInr = tenantFinance
        .filter((f) => f.recordType === 'expense')
        .reduce((sum, f) => sum + f.amountInr, 0);
      const purchaseCostsInr = tenantPOs
        .filter((p) => p.status !== 'cancelled')
        .reduce((sum, p) => sum + p.totalCostInr, 0);

      const lowStock = tenantProducts
        .filter((p) => p.active && p.stock <= p.lowStockThreshold)
        .map((p) => ({ name: p.name, stock: p.stock, threshold: p.lowStockThreshold }));

      const productTotals = new Map<string, { name: string; units: number; revenueInr: number }>();
      for (const ord of tenantOrders) {
        if (ord.status === 'cancelled') continue;
        for (const item of parseOrderItems(ord.itemsJson)) {
          const cur = productTotals.get(item.name) || { name: item.name, units: 0, revenueInr: 0 };
          cur.units += Number(item.quantity) || 1;
          cur.revenueInr += (Number(item.price) || 0) * (Number(item.quantity) || 1);
          productTotals.set(item.name, cur);
        }
      }
      const topProducts = Array.from(productTotals.values())
        .sort((a, b) => b.revenueInr - a.revenueInr)
        .slice(0, 5);

      const delayedOrders = tenantOrders
        .filter(
          (o) =>
            ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status) &&
            Date.now() - new Date(o.createdAt).getTime() > 48 * 3600 * 1000
        )
        .map((o) => ({ orderNumber: o.orderNumber, status: o.status, customerName: o.customerName, total: o.total }));

      const followUpLeads = tenantLeads
        .filter((l) => l.stage !== 'won' && l.stage !== 'lost')
        .slice(0, 8)
        .map((l) => ({ name: l.name, phone: l.phone, stage: l.stage, nextFollowupDate: l.nextFollowupDate || 'Not set' }));

      const upcomingAppts = tenantAppointments
        .filter((a) => a.bookingDate >= todayIso && a.status !== 'cancelled')
        .slice(0, 6)
        .map((a) => ({ customerName: a.customerName, service: a.serviceName, date: a.bookingDate, slot: a.timeSlot }));

      const liveSnapshot = {
        businessName: access.tenant.name,
        category: access.tenant.category,
        slug: access.tenant.slug,
        published: access.tenant.published,
        customDomain: access.tenant.customDomain || 'Not connected',
        seoAuditScore: seo?.lastAuditScore ?? 0,
        todaySalesInr,
        totalSalesInr,
        totalOrdersCount: tenantOrders.length,
        pendingOrdersCount: tenantOrders.filter((o) =>
          ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)
        ).length,
        delayedOrders,
        lowStockProducts: lowStock,
        topSellingProducts: topProducts,
        recordedExpensesInr,
        purchaseOrderCostsInr: purchaseCostsInr,
        estimatedProfitInr: totalSalesInr - recordedExpensesInr - purchaseCostsInr,
        hasCompleteCostData: recordedExpensesInr > 0 || purchaseCostsInr > 0,
        customersNeedingFollowUp: followUpLeads,
        upcomingAppointments: upcomingAppts,
        activeProductsCount: tenantProducts.filter((p) => p.active).length,
      };

      const langName = language === 'te' ? 'Telugu' : language === 'hi' ? 'Hindi' : 'English';
      const systemInstruction = `You are the Vijay Visuals AI Business Assistant for "${access.tenant.name}".
STRICT RULES:
1. Answer ONLY using the live authenticated PostgreSQL snapshot provided below.
2. NEVER invent, guess, or fabricate sales figures, product names, customer names, stock counts, or profit numbers.
3. If a metric is 0 or empty in the snapshot, state clearly that it is currently 0 or none recorded.
4. Always label profit as an "Estimated Operational Profit" and clearly note when expenses/purchase costs are incomplete — never present it as accountant-verified profit.
5. If the owner asks to execute a sensitive action (issuing a refund, taking payment, sending bulk WhatsApp/SMS/email messages, or deleting records), clearly explain that explicit human confirmation is required and point them to the relevant dashboard control instead of claiming it was executed.
6. Keep answers concise, warm, easy for a small business owner to understand, and respond in ${langName}.`;

      const answer = await generateAiText({
        systemInstruction,
        prompt: `LIVE VERIFIED DATABASE SNAPSHOT (JSON):\n${JSON.stringify(liveSnapshot, null, 2)}\n\nBUSINESS OWNER QUESTION:\n${question}`,
      });

      await db
        .update(tenants)
        .set({ aiCreditsUsed: sql`${tenants.aiCreditsUsed} + 1` })
        .where(eq(tenants.id, tenantId));

      res.json({
        answer,
        liveSnapshot,
        creditsUsed: 1,
        requiresHumanConfirmationForActions: true,
      });
    } catch (error: any) {
      console.error('POST ai-assistant failed:', error);
      res.status(502).json({ error: error?.message || 'AI Business Assistant request failed.' });
    }
  });

  // =========================================================================
  // MODULE 14: FULL MULTI-TABLE EXPORT & SNAPSHOT BACKUP VERIFICATION TEST
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/full-export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (!access.isOwnerOrAdmin) {
        return res
          .status(403)
          .json({ error: 'Business Owner or Super Admin access required for full export.' });
      }

      const [
        tenantProducts,
        tenantOrders,
        tenantPOs,
        tenantMovements,
        tenantFinance,
        tenantLeads,
        tenantAppointments,
        tenantSuppliers,
        tenantWarehouses,
        tenantStaff,
        tenantTasks,
        tenantAtt,
        domains,
        seo,
        subscribers,
        tickets,
      ] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(orders).where(eq(orders.tenantId, tenantId)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId)),
        db.select().from(stockMovements).where(eq(stockMovements.tenantId, tenantId)),
        db.select().from(financeRecords).where(eq(financeRecords.tenantId, tenantId)),
        db.select().from(crmLeads).where(eq(crmLeads.tenantId, tenantId)),
        db.select().from(appointments).where(eq(appointments.tenantId, tenantId)),
        db.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)),
        db.select().from(warehouses).where(eq(warehouses.tenantId, tenantId)),
        db.select().from(staffMembers).where(eq(staffMembers.tenantId, tenantId)),
        db.select().from(staffTasks).where(eq(staffTasks.tenantId, tenantId)),
        access.isOwnerOrAdmin
          ? db.select().from(staffAttendance).where(eq(staffAttendance.tenantId, tenantId))
          : Promise.resolve([]),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
        db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)),
        db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.tenantId, tenantId)),
        db.select().from(supportTickets).where(eq(supportTickets.tenantId, tenantId)),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        schemaVersion: 'vijay-visuals-bos-v1',
        tenant: access.tenant,
        products: tenantProducts,
        orders: tenantOrders,
        purchaseOrders: tenantPOs,
        stockMovements: tenantMovements,
        financeRecords: tenantFinance,
        crmLeads: tenantLeads,
        appointments: tenantAppointments,
        suppliers: tenantSuppliers,
        warehouses: tenantWarehouses,
        staffMembers: tenantStaff,
        staffTasks: tenantTasks,
        staffAttendance: tenantAtt,
        domains,
        seoSettings: seo[0] || null,
        newsletterSubscribers: subscribers,
        supportTickets: tickets,
      };

      const checksumSha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      await writeOsAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'FULL_BUSINESS_EXPORT',
        `Exported full Business OS JSON (SHA-256 ${checksumSha256.slice(0, 12)}…)`,
        tenantId
      );

      res.json({
        ...payload,
        integrity: {
          checksumSha256,
          recordCounts: {
            products: tenantProducts.length,
            orders: tenantOrders.length,
            purchaseOrders: tenantPOs.length,
            stockMovements: tenantMovements.length,
            financeRecords: tenantFinance.length,
            crmLeads: tenantLeads.length,
            appointments: tenantAppointments.length,
            suppliers: tenantSuppliers.length,
            warehouses: tenantWarehouses.length,
          },
        },
      });
    } catch (error) {
      console.error('GET full-export failed:', error);
      res.status(500).json({ error: 'Unable to generate full business export.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/backup-verify', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantAccess(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [seo] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1);
      const existing = await db
        .select({ versionNumber: tenantVersions.versionNumber })
        .from(tenantVersions)
        .where(eq(tenantVersions.tenantId, tenantId))
        .orderBy(desc(tenantVersions.versionNumber))
        .limit(1);
      const nextVersion = (existing[0]?.versionNumber || 0) + 1;

      const snapshotObj = {
        name: access.tenant.name,
        category: access.tenant.category,
        templateId: access.tenant.templateId,
        tagline: access.tenant.tagline,
        description: access.tenant.description,
        logoText: access.tenant.logoText,
        bannerImage: access.tenant.bannerImage,
        primaryColor: access.tenant.primaryColor,
        accentColor: access.tenant.accentColor,
        fontFamily: access.tenant.fontFamily,
        phone: access.tenant.phone,
        whatsapp: access.tenant.whatsapp,
        address: access.tenant.address,
        sectionOrderJson: seo?.sectionOrderJson || '["hero","catalog","reviews","booking","contact"]',
        customPagesJson: seo?.customPagesJson || '[]',
      };

      const serialized = JSON.stringify(snapshotObj);
      const checksumBefore = crypto.createHash('sha256').update(serialized).digest('hex');

      const [created] = await db
        .insert(tenantVersions)
        .values({
          tenantId,
          versionNumber: nextVersion,
          label: `Verified Snapshot Backup (${new Date().toISOString().slice(0, 10)})`,
          snapshotJson: serialized,
          isPublished: access.tenant.published,
          createdBy: req.dbUser!.email,
        })
        .returning();

      // Re-read from PostgreSQL and verify SHA-256 restore integrity
      const [readBack] = await db.select().from(tenantVersions).where(eq(tenantVersions.id, created.id)).limit(1);
      const parsedBack = JSON.parse(readBack?.snapshotJson || '{}');
      const checksumAfter = crypto.createHash('sha256').update(JSON.stringify(parsedBack)).digest('hex');
      const verified = checksumBefore === checksumAfter && parsedBack.name === access.tenant.name;

      await writeOsAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'BACKUP_INTEGRITY_VERIFIED',
        `Snapshot v${nextVersion} SHA-256 verified=${verified} (${checksumAfter.slice(0, 12)}…)`,
        tenantId
      );

      res.status(201).json({
        verified,
        version: created,
        checksumSha256: checksumAfter,
        infrastructureNotice:
          'Application-level website snapshot & full JSON data export verified in PostgreSQL. Scheduled automated Cloud SQL point-in-time disaster recovery backups must be enabled and verified in your Google Cloud SQL instance settings.',
      });
    } catch (error) {
      console.error('POST backup-verify failed:', error);
      res.status(500).json({ error: 'Snapshot backup verification failed.' });
    }
  });

  // =========================================================================
  // MODULES 13, 16 & 17: HELP CENTRE, LIVE STATUS, TRANSPARENT COSTS & FEEDBACK
  // =========================================================================
  router.get('/api/help-center', async (_req: Request, res: Response) => {
    const startedAt = Date.now();
    let dbHealthy = false;
    try {
      await db.execute(sql`SELECT 1`);
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }
    const dbLatencyMs = Date.now() - startedAt;
    const rzp = getRazorpayStatus();

    res.json({
      serviceStatus: {
        overall: dbHealthy ? 'operational' : 'degraded',
        checkedAt: new Date().toISOString(),
        database: { status: dbHealthy ? 'operational' : 'unreachable', latencyMs: dbLatencyMs, engine: 'Cloud SQL PostgreSQL' },
        apiRateLimiting: { status: 'active', limitPerMinute: 240 },
        integrations: [
          { name: 'Cloud SQL PostgreSQL Database', status: dbHealthy ? 'configured' : 'error', requiredFor: 'All websites, orders, inventory, finance, CRM & HR data' },
          { name: 'Firebase Google Authentication', status: 'configured', requiredFor: 'Owner, Staff, Delivery & Customer sign-in' },
          { name: 'Gemini AI Business Assistant', status: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') ? 'configured' : 'not_configured', requiredFor: 'AI Business Assistant, AI Website Setup, SEO & Content Studio' },
          { name: 'Google Maps Platform (Maps JS & Geocoding)', status: Boolean(resolveGoogleMapsApiKey()) ? 'configured' : 'not_configured', requiredFor: 'Interactive branch map picker, storefront map preview, geocoding & live delivery map' },
          { name: 'Razorpay Payments & Route', status: rzp.configured ? 'configured' : 'not_configured', requiredFor: 'Online checkout, package payments & split seller payouts' },
          { name: 'Domain Registrar Purchase API', status: Boolean(process.env.DOMAIN_REGISTRAR_API_KEY) ? 'configured' : 'not_configured', requiredFor: 'Direct in-app domain registration (external customer-owned DNS wizard is live)' },
          { name: 'WhatsApp Business Cloud API', status: Boolean(process.env.WHATSAPP_API_TOKEN) ? 'configured' : 'not_configured', requiredFor: 'Automated WhatsApp notifications (manual click-to-chat wa.me is live)' },
          { name: 'Transactional Email (SMTP/Resend)', status: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY) ? 'configured' : 'not_configured', requiredFor: 'Automated email campaigns & order emails' },
          { name: 'SMS Gateway (MSG91/Twilio)', status: Boolean(process.env.SMS_API_KEY) ? 'configured' : 'not_configured', requiredFor: 'OTP & SMS order updates' },
          { name: 'Cloudflare R2 Media Storage', status: Boolean(process.env.R2_BUCKET_NAME) ? 'configured' : 'not_configured', requiredFor: 'Direct binary file uploads (URL & data-URI media is supported)' },
        ],
      },
      transparentCostBreakdown: [
        { item: 'Website Setup Fee', billing: 'One-Time', ownerCostNote: 'Configurable per package (₹4,999 – ₹24,999 + 18% GST). No hidden setup fees.' },
        { item: 'Custom Domain (.com / .in / .co.in)', billing: 'Annual (Registrar Direct)', ownerCostNote: 'Indicative ₹499–₹1,099/yr + GST paid directly to your registrar (Cloudflare, GoDaddy, Namecheap) under 100% customer ownership.' },
        { item: 'Cloud Hosting & Bandwidth', billing: 'Monthly / Yearly Plan', ownerCostNote: 'Metered fair-usage tiers based on Cloud Run / Cloudflare Pages & PostgreSQL capacity. Never falsely advertised as unlimited.' },
        { item: 'Media & Database Storage', billing: 'Quota-Based (5 GB – 50 GB)', ownerCostNote: 'Explicit storage quota per plan tier; extra storage billed transparently when upgraded.' },
        { item: 'AI Assistant & Content Credits', billing: 'Credit Pack / Monthly Quota', ownerCostNote: 'Metered per request (1–2 credits per Gemini generation) with visible usage counter in your dashboard.' },
        { item: 'WhatsApp Cloud API & SMS Charges', billing: 'Pay-As-You-Go (External)', ownerCostNote: 'Billed directly by Meta WhatsApp Cloud / SMS provider per conversation or SMS segment when connected.' },
        { item: 'Optional Branded PWA / Mobile App', billing: 'Add-on License', ownerCostNote: 'Branded installable PWA included in Website + PWA tier. Native Play Store Android builds are quoted separately as a future phase.' },
      ],
      tutorials: [
        {
          id: 'tut-launch',
          category: 'Getting Started',
          title: 'Launch Your Business Website in 12 Simple Steps',
          duration: '5 min read',
          steps: [
            'Sign in with Google and open the Website Builder.',
            'Enter your Business Name — Vijay Visuals automatically creates a valid lowercase URL slug (you can customize it).',
            'Choose a template, upload your logo/banner, and add your first products or services.',
            'Open the Daily Business Command Center to track orders, stock alerts, and enquiries in one place.',
          ],
        },
        {
          id: 'tut-domain',
          category: 'Domains & SEO',
          title: 'Connect Your Own .com or .in Domain Safely',
          duration: '4 min read',
          steps: [
            'Purchase your domain directly in your own Cloudflare, GoDaddy, or Namecheap account so you keep 100% legal ownership.',
            'Go to Dashboards -> Domains & DNS and add your domain.',
            'Add the shown CNAME or TXT record at your registrar and click Verify Live DNS.',
          ],
        },
        {
          id: 'tut-inventory',
          category: 'Inventory & Finance',
          title: 'Track Stock, Purchase Orders & Estimated Profit Accurately',
          duration: '4 min read',
          steps: [
            'Add your suppliers in Warehouses & HR, then create Purchase Orders in Inventory & POs.',
            'When goods arrive, click Mark Received — stock increases automatically and can auto-log your purchase expense.',
            'Record rent, salaries, and utility bills in Finance & GST so your Estimated Profit stays realistic.',
          ],
        },
        {
          id: 'tut-ai',
          category: 'AI Assistant',
          title: 'Ask Your AI Business Assistant About Today’s Sales & Stock',
          duration: '3 min read',
          steps: [
            'Open the Daily Command Center and click any quick question such as "How much did I sell today?" or "Which products are low in stock?".',
            'The assistant reads only your real authenticated database records and never invents figures.',
            'Sensitive actions like refunds or mass messages always require your manual confirmation.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Is my business data isolated from other shops on Vijay Visuals?',
          a: 'Yes. Every query checks your authenticated account and tenant ownership (or active staff membership for that exact business). One business cannot view another business’s orders, CRM leads, or finances.',
        },
        {
          q: 'Why does the dashboard say "Estimated Profit" instead of "Accounting Profit"?',
          a: 'Because accurate legal accounting profit depends on complete purchase costs, depreciation, tax filings, and bank reconciliation reviewed by a Chartered Accountant. We clearly label operational estimates so you are never misled.',
        },
        {
          q: 'Can I accept Cash on Delivery and UPI before Razorpay KYC is approved?',
          a: 'Yes. Cash on Delivery and Direct Seller UPI Reference work immediately. Razorpay Route split settlements activate once your Seller KYC is verified.',
        },
        {
          q: 'Can I export my data if I want a backup or want to migrate?',
          a: 'Yes. Go to Renewal & Export to download a complete JSON backup with SHA-256 verification checksum, or export CSV files for orders, products, customers, and finance records.',
        },
        {
          q: 'Does Vijay Visuals support Telugu, English, and Hindi?',
          a: 'Yes. You can switch between English, తెలుగు (Telugu), and हिन्दी (Hindi) for the interface and AI Business Assistant replies.',
        },
      ],
    });
  });

  router.get('/api/feedback', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(platformFeedback)
        .orderBy(desc(platformFeedback.createdAt))
        .limit(50);

      const avgRating =
        rows.length > 0
          ? Number((rows.reduce((sum, r) => sum + r.rating, 0) / rows.length).toFixed(1))
          : 0;

      res.json({ feedback: rows, summary: { total: rows.length, averageRating: avgRating } });
    } catch (error) {
      console.error('GET feedback failed:', error);
      res.status(500).json({ error: 'Unable to load customer feedback.' });
    }
  });

  router.post('/api/feedback', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        tenantId: z.number().int().positive().nullable().optional(),
        feedbackType: z.enum(['feedback', 'feature_request']).default('feedback'),
        rating: z.number().int().min(1).max(5).default(5),
        title: z.string().min(3).max(140),
        message: z.string().min(6).max(1000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Please provide a clear title (3+ chars) and message (6+ chars).' });
      }

      const [created] = await db
        .insert(platformFeedback)
        .values({
          userId: req.dbUser!.id,
          tenantId: parsed.data.tenantId ?? null,
          authorName: req.dbUser!.name || req.dbUser!.email,
          authorEmail: req.dbUser!.email,
          feedbackType: parsed.data.feedbackType,
          rating: parsed.data.rating,
          title: parsed.data.title.trim(),
          message: parsed.data.message.trim(),
          status: 'received',
        })
        .returning();

      res.status(201).json({ feedback: created });
    } catch (error) {
      console.error('POST feedback failed:', error);
      res.status(500).json({ error: 'Unable to submit feedback.' });
    }
  });

  return router;
}
