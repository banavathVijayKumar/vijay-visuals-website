import express, { Request, Response, Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  appointments,
  auditLogs,
  crmLeads,
  financeRecords,
  orders,
  platformAnnouncements,
  platformPayments,
  platformPlans,
  products,
  sellerPayoutAccounts,
  sellerTransfers,
  staffAttendance,
  staffMembers,
  suppliers,
  tenantPlugins,
  tenants,
  users,
  warehouses,
  webhookEvents,
  wishlists,
} from '../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import {
  createRazorpayOrder,
  createRazorpayRefund,
  getRazorpayStatus,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../lib/razorpay.ts';
import { generateAiText, generateBusinessSetupDraft } from '../lib/gemini.ts';
import { PLUGIN_CATALOG } from '../data/content.ts';

async function writeAudit(
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
    console.error('Ecosystem audit log failed:', err);
  }
}

async function assertTenantOwnership(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant };
  }
  const staff = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.email, dbUser.email), eq(staffMembers.active, true)))
    .limit(1);
  if (staff.length > 0) return { ok: true as const, tenant };
  return {
    ok: false as const,
    status: 403,
    error: 'Tenant isolation enforced: you cannot access another business’s private data.',
  };
}

// =========================================================================
// MODULE 3D: RAW-BODY RAZORPAY WEBHOOK HANDLER (MOUNT BEFORE express.json)
// =========================================================================
export async function handleRazorpayRawWebhook(req: Request, res: Response) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const eventIdHeader = String(req.headers['x-razorpay-event-id'] || '');

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      return res.status(503).json({
        error: 'RAZORPAY_WEBHOOK_SECRET is not configured in server secrets.',
      });
    }

    const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Razorpay webhook signature.' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const eventType = String(event?.event || 'unknown');
    const entityId =
      event?.payload?.payment?.entity?.id ||
      event?.payload?.refund?.entity?.id ||
      event?.payload?.transfer?.entity?.id ||
      String(Date.now());
    const eventId = eventIdHeader || `${eventType}:${entityId}`;

    // Idempotency check — prevent duplicate webhook event processing
    const existing = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId)).limit(1);
    if (existing.length > 0) {
      return res.json({ received: true, duplicate: true });
    }

    await db.insert(webhookEvents).values({
      provider: 'razorpay',
      eventId,
      eventType,
      signatureVerified: true,
      payloadSummary: JSON.stringify({ entityId, eventType }).slice(0, 500),
    });

    if (eventType === 'payment.captured') {
      const payment = event?.payload?.payment?.entity;
      const rzpOrderId = String(payment?.order_id || '');
      const rzpPaymentId = String(payment?.id || '');
      if (rzpOrderId) {
        const [pp] = await db
          .select()
          .from(platformPayments)
          .where(eq(platformPayments.razorpayOrderId, rzpOrderId))
          .limit(1);
        if (pp && !pp.licenseActivated) {
          await db
            .update(platformPayments)
            .set({
              razorpayPaymentId: rzpPaymentId,
              signatureVerified: true,
              status: 'captured',
              licenseActivated: true,
              updatedAt: new Date(),
            })
            .where(eq(platformPayments.id, pp.id));
        }

        const [transfer] = await db
          .select()
          .from(sellerTransfers)
          .where(eq(sellerTransfers.razorpayOrderId, rzpOrderId))
          .limit(1);
        if (transfer) {
          await db
            .update(sellerTransfers)
            .set({ razorpayPaymentId: rzpPaymentId, status: 'routed' })
            .where(eq(sellerTransfers.id, transfer.id));
          if (transfer.orderId) {
            await db
              .update(orders)
              .set({ paymentStatus: 'paid', paymentReference: rzpPaymentId, updatedAt: new Date() })
              .where(eq(orders.id, transfer.orderId));
          }
        }
      }
    } else if (eventType === 'payment.failed') {
      const payment = event?.payload?.payment?.entity;
      const rzpOrderId = String(payment?.order_id || '');
      if (rzpOrderId) {
        await db
          .update(platformPayments)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(platformPayments.razorpayOrderId, rzpOrderId));
      }
    } else if (eventType === 'refund.processed') {
      const refund = event?.payload?.refund?.entity;
      const paymentId = String(refund?.payment_id || '');
      const refundId = String(refund?.id || '');
      if (paymentId) {
        await db
          .update(platformPayments)
          .set({ status: 'refunded', refundId, updatedAt: new Date() })
          .where(eq(platformPayments.razorpayPaymentId, paymentId));
        await db
          .update(sellerTransfers)
          .set({ status: 'reversed', reversalId: refundId })
          .where(eq(sellerTransfers.razorpayPaymentId, paymentId));
      }
    } else if (eventType === 'transfer.processed' || eventType === 'transfer.settled') {
      const tr = event?.payload?.transfer?.entity;
      const paymentId = String(tr?.source || '');
      if (paymentId) {
        await db
          .update(sellerTransfers)
          .set({
            razorpayTransferId: String(tr?.id || ''),
            status: eventType === 'transfer.settled' ? 'settled' : 'routed',
          })
          .where(eq(sellerTransfers.razorpayPaymentId, paymentId));
      }
    }

    return res.json({ received: true, eventId, eventType });
  } catch (error) {
    console.error('Razorpay webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}

export function createEcosystemRouter(): Router {
  const router = express.Router();

  // =========================================================================
  // PUBLIC ANNOUNCEMENTS & RAZORPAY STATUS
  // =========================================================================
  router.get('/api/announcements', async (_req, res) => {
    try {
      const items = await db
        .select()
        .from(platformAnnouncements)
        .where(eq(platformAnnouncements.active, true))
        .orderBy(desc(platformAnnouncements.createdAt))
        .limit(5);
      res.json({ announcements: items });
    } catch (error) {
      console.error('GET announcements failed:', error);
      res.status(500).json({ error: 'Unable to fetch announcements.' });
    }
  });

  router.get('/api/payments/config', (_req, res) => {
    res.json({ razorpay: getRazorpayStatus() });
  });

  // =========================================================================
  // MODULE 3A: VIJAY VISUALS PLATFORM PAYMENTS (OWN RAZORPAY MERCHANT ACCOUNT)
  // =========================================================================
  const platformOrderSchema = z.object({
    planCode: z.string().min(2).max(60),
    tenantId: z.number().int().positive().optional(),
  });

  router.post('/api/payments/platform/create-order', requireAuth, async (req: AuthRequest, res) => {
    try {
      const parsed = platformOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Select a valid Vijay Visuals package.' });
      }
      const rzpStatus = getRazorpayStatus();
      if (!rzpStatus.configured) {
        return res.status(503).json({
          error: rzpStatus.message,
          mode: rzpStatus.mode,
        });
      }

      const [plan] = await db
        .select()
        .from(platformPlans)
        .where(eq(platformPlans.code, parsed.data.planCode))
        .limit(1);
      if (!plan || !plan.active) {
        return res.status(404).json({ error: 'Selected package is not active.' });
      }

      if (parsed.data.tenantId) {
        const access = await assertTenantOwnership(req, parsed.data.tenantId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });
      }

      const receiptNumber = `VV-PLAT-${Date.now().toString().slice(-8)}`;
      const rzpOrder = await createRazorpayOrder({
        amountInr: plan.priceInr,
        currency: 'INR',
        receipt: receiptNumber,
        notes: {
          system: 'vijay_visuals_platform',
          planCode: plan.code,
          userId: String(req.dbUser!.id),
          tenantId: String(parsed.data.tenantId || ''),
        },
      });

      const [paymentRow] = await db
        .insert(platformPayments)
        .values({
          userId: req.dbUser!.id,
          tenantId: parsed.data.tenantId ?? null,
          planCode: plan.code,
          planName: plan.name,
          amountInr: plan.priceInr,
          currency: 'INR',
          mode: rzpStatus.mode === 'live' ? 'live' : 'test',
          razorpayOrderId: rzpOrder.id,
          status: 'created',
          receiptNumber,
        })
        .returning();

      res.status(201).json({
        keyId: rzpStatus.keyIdPublic,
        mode: rzpStatus.mode,
        razorpayOrder: rzpOrder,
        payment: paymentRow,
      });
    } catch (error: any) {
      console.error('Platform Razorpay create-order failed:', error);
      res.status(502).json({ error: error?.message || 'Unable to create Razorpay order.' });
    }
  });

  const verifyPlatformSchema = z.object({
    razorpay_order_id: z.string().min(4),
    razorpay_payment_id: z.string().min(4),
    razorpay_signature: z.string().min(10),
  });

  router.post('/api/payments/platform/verify', requireAuth, async (req: AuthRequest, res) => {
    try {
      const parsed = verifyPlatformSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Missing Razorpay verification parameters.' });
      }

      const valid = verifyRazorpayPaymentSignature({
        razorpayOrderId: parsed.data.razorpay_order_id,
        razorpayPaymentId: parsed.data.razorpay_payment_id,
        razorpaySignature: parsed.data.razorpay_signature,
      });

      if (!valid) {
        await writeAudit(
          req.dbUser!.email,
          req.dbUser!.role,
          'PLATFORM_PAYMENT_SIGNATURE_FAILED',
          `Invalid signature for ${parsed.data.razorpay_order_id}`
        );
        return res.status(400).json({ error: 'Payment signature verification failed. License was NOT activated.' });
      }

      const [existing] = await db
        .select()
        .from(platformPayments)
        .where(eq(platformPayments.razorpayOrderId, parsed.data.razorpay_order_id))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: 'Platform payment record not found.' });
      }

      const [updated] = await db
        .update(platformPayments)
        .set({
          razorpayPaymentId: parsed.data.razorpay_payment_id,
          signatureVerified: true,
          status: 'captured',
          licenseActivated: true,
          updatedAt: new Date(),
        })
        .where(eq(platformPayments.id, existing.id))
        .returning();

      // Activate purchased license / PWA / AI credits ONLY after verified signature
      if (existing.tenantId) {
        const [plan] = await db
          .select()
          .from(platformPlans)
          .where(eq(platformPlans.code, existing.planCode))
          .limit(1);
        if (plan) {
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.id, existing.tenantId))
            .limit(1);
          if (tenant) {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (plan.includesPwa) {
              updates.pwaEnabled = true;
              updates.planTier = 'website_pwa';
              updates.pwaLicenseKey =
                tenant.pwaLicenseKey || `VV-PWA-${tenant.slug.toUpperCase().slice(0, 8)}-${Date.now().toString().slice(-4)}`;
            }
            if (plan.aiCreditsIncluded > 0) {
              updates.aiCreditsLimit = tenant.aiCreditsLimit + plan.aiCreditsIncluded;
            }
            await db.update(tenants).set(updates).where(eq(tenants.id, tenant.id));
          }
        }
      }

      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'PLATFORM_PAYMENT_VERIFIED',
        `Verified ${existing.planName} (₹${existing.amountInr}) · ${parsed.data.razorpay_payment_id}`,
        existing.tenantId
      );

      res.json({ verified: true, payment: updated });
    } catch (error) {
      console.error('Platform payment verify failed:', error);
      res.status(500).json({ error: 'Failed to verify payment.' });
    }
  });

  router.get('/api/payments/platform/history', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows =
        req.dbUser!.role === 'super_admin'
          ? await db.select().from(platformPayments).orderBy(desc(platformPayments.createdAt)).limit(100)
          : await db
              .select()
              .from(platformPayments)
              .where(eq(platformPayments.userId, req.dbUser!.id))
              .orderBy(desc(platformPayments.createdAt))
              .limit(50);
      res.json({ payments: rows });
    } catch (error) {
      console.error('GET platform payments failed:', error);
      res.status(500).json({ error: 'Unable to load payment history.' });
    }
  });

  router.post('/api/payments/platform/:id/refund', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can issue platform refunds.' });
      }
      const id = Number(req.params.id);
      const [row] = await db.select().from(platformPayments).where(eq(platformPayments.id, id)).limit(1);
      if (!row || !row.razorpayPaymentId || !row.signatureVerified) {
        return res.status(400).json({ error: 'Only verified captured Razorpay payments can be refunded.' });
      }

      const refund = await createRazorpayRefund({
        paymentId: row.razorpayPaymentId,
        amountInr: row.amountInr,
      });

      const [updated] = await db
        .update(platformPayments)
        .set({ status: 'refunded', refundId: refund.id, updatedAt: new Date() })
        .where(eq(platformPayments.id, id))
        .returning();

      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'PLATFORM_PAYMENT_REFUNDED',
        `Refunded ${row.receiptNumber} (${refund.id})`,
        row.tenantId
      );

      res.json({ payment: updated, refund });
    } catch (error: any) {
      console.error('Platform refund failed:', error);
      res.status(502).json({ error: error?.message || 'Refund failed.' });
    }
  });

  // =========================================================================
  // MODULE 3B: SELLER RAZORPAY ROUTE ONBOARDING, TRANSFERS & RECONCILIATION
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/payout-account', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [account] = await db
        .select()
        .from(sellerPayoutAccounts)
        .where(eq(sellerPayoutAccounts.tenantId, tenantId))
        .limit(1);

      const transfers = await db
        .select()
        .from(sellerTransfers)
        .where(eq(sellerTransfers.tenantId, tenantId))
        .orderBy(desc(sellerTransfers.createdAt))
        .limit(50);

      const tenantOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.tenantId, tenantId))
        .orderBy(desc(orders.createdAt));

      const codCollectedInr = tenantOrders
        .filter((o) => o.paymentMethod === 'cod' && o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + o.total, 0);
      const codPendingInr = tenantOrders
        .filter((o) => o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' && o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);

      res.json({
        account: account || null,
        transfers,
        codSummary: { codCollectedInr, codPendingInr },
        razorpay: getRazorpayStatus(),
      });
    } catch (error) {
      console.error('GET seller payout account failed:', error);
      res.status(500).json({ error: 'Failed to load seller payout settings.' });
    }
  });

  const sellerKycSchema = z.object({
    legalBusinessName: z.string().min(2).max(120),
    panNumber: z.string().max(16).optional(),
    gstin: z.string().max(20).optional(),
    bankAccountHolder: z.string().min(2).max(120),
    bankAccountLast4: z.string().regex(/^\d{4}$/, 'Enter only the last 4 digits of your bank account'),
    ifscCode: z.string().min(8).max(15),
  });

  router.put('/api/owner/tenants/:tenantId/payout-account', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const parsed = sellerKycSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid KYC details.' });
      }

      const [existing] = await db
        .select()
        .from(sellerPayoutAccounts)
        .where(eq(sellerPayoutAccounts.tenantId, tenantId))
        .limit(1);

      let saved;
      if (existing) {
        [saved] = await db
          .update(sellerPayoutAccounts)
          .set({
            legalBusinessName: parsed.data.legalBusinessName,
            panNumber: (parsed.data.panNumber || '').toUpperCase(),
            gstin: (parsed.data.gstin || '').toUpperCase(),
            bankAccountHolder: parsed.data.bankAccountHolder,
            bankAccountLast4: parsed.data.bankAccountLast4,
            ifscCode: parsed.data.ifscCode.toUpperCase(),
            kycStatus: existing.kycStatus === 'verified' ? 'verified' : 'pending_review',
            updatedAt: new Date(),
          })
          .where(eq(sellerPayoutAccounts.id, existing.id))
          .returning();
      } else {
        [saved] = await db
          .insert(sellerPayoutAccounts)
          .values({
            tenantId,
            legalBusinessName: parsed.data.legalBusinessName,
            panNumber: (parsed.data.panNumber || '').toUpperCase(),
            gstin: (parsed.data.gstin || '').toUpperCase(),
            bankAccountHolder: parsed.data.bankAccountHolder,
            bankAccountLast4: parsed.data.bankAccountLast4,
            ifscCode: parsed.data.ifscCode.toUpperCase(),
            kycStatus: 'pending_review',
            platformCommissionPct: 5,
            routeEnabled: false,
          })
          .returning();
      }

      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'SELLER_KYC_SUBMITTED',
        `Submitted Razorpay Route KYC for ${parsed.data.legalBusinessName} (IFSC ${parsed.data.ifscCode.toUpperCase()})`,
        tenantId
      );

      res.json({ account: saved });
    } catch (error) {
      console.error('PUT seller payout account failed:', error);
      res.status(500).json({ error: 'Unable to save seller payout KYC.' });
    }
  });

  // Marketplace Storefront Razorpay Route Checkout Order
  router.post('/api/payments/store/create-order', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const orderId = Number(req.body?.orderId);
      if (!orderId) return res.status(400).json({ error: 'Order ID is required.' });

      const rzpStatus = getRazorpayStatus();
      if (!rzpStatus.configured) {
        return res.status(503).json({ error: rzpStatus.message });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) return res.status(404).json({ error: 'Order not found.' });

      const [sellerAcc] = await db
        .select()
        .from(sellerPayoutAccounts)
        .where(eq(sellerPayoutAccounts.tenantId, order.tenantId))
        .limit(1);

      if (!sellerAcc || !sellerAcc.routeEnabled || sellerAcc.kycStatus !== 'verified' || !sellerAcc.razorpayAccountId) {
        return res.status(400).json({
          error:
            'Seller Razorpay Route Linked Account is not verified yet. To prevent routing seller sales into Vijay Visuals platform revenue, please use Cash on Delivery or Direct Seller UPI.',
        });
      }

      const commissionInr = Math.round((order.total * sellerAcc.platformCommissionPct) / 100);
      const sellerNetInr = Math.max(1, order.total - commissionInr);

      const rzpOrder = await createRazorpayOrder({
        amountInr: order.total,
        currency: 'INR',
        receipt: order.orderNumber,
        notes: {
          system: 'marketplace_route',
          tenantId: String(order.tenantId),
          orderNumber: order.orderNumber,
        },
        routeTransfer: {
          linkedAccountId: sellerAcc.razorpayAccountId,
          sellerNetAmountInr: sellerNetInr,
        },
      });

      const [transfer] = await db
        .insert(sellerTransfers)
        .values({
          tenantId: order.tenantId,
          orderId: order.id,
          razorpayOrderId: rzpOrder.id,
          grossAmountInr: order.total,
          platformCommissionInr: commissionInr,
          sellerNetAmountInr: sellerNetInr,
          status: 'pending',
        })
        .returning();

      res.status(201).json({
        keyId: rzpStatus.keyIdPublic,
        mode: rzpStatus.mode,
        razorpayOrder: rzpOrder,
        transfer,
      });
    } catch (error: any) {
      console.error('Store Razorpay Route create-order failed:', error);
      res.status(502).json({ error: error?.message || 'Unable to create seller route order.' });
    }
  });

  // =========================================================================
  // MODULE 9 & 10: AI BUSINESS SETUP ASSISTANT + AI CONTENT & SEO STUDIO
  // =========================================================================
  const setupAssistantSchema = z.object({
    businessBrief: z.string().min(12).max(1500),
    language: z.enum(['en', 'te', 'hi']).default('en'),
  });

  router.post('/api/ai/setup-assistant', requireAuth, async (req: AuthRequest, res) => {
    try {
      const parsed = setupAssistantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Describe your business in at least 12 characters.' });
      }
      const draft = await generateBusinessSetupDraft({
        businessBrief: parsed.data.businessBrief,
        language: parsed.data.language,
      });
      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'AI_SETUP_DRAFT_GENERATED',
        `Generated approval-gated website draft for brief (${parsed.data.language})`
      );
      res.json({ draft, requiresOwnerApproval: true });
    } catch (error: any) {
      console.error('AI setup assistant failed:', error);
      res.status(502).json({ error: error?.message || 'AI Business Setup Assistant failed.' });
    }
  });

  const contentStudioSchema = z.object({
    tenantId: z.number().int().positive(),
    mode: z.enum(['seo_metadata', 'blog_article', 'ad_campaign', 'poster_brief']),
    topic: z.string().min(4).max(1200),
    language: z.enum(['en', 'te', 'hi']).default('en'),
  });

  router.post('/api/ai/content-studio', requireAuth, async (req: AuthRequest, res) => {
    try {
      const parsed = contentStudioSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Provide a valid topic and studio mode.' });
      }
      const access = await assertTenantOwnership(req, parsed.data.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });
      if (access.tenant.aiCreditsUsed + 2 > access.tenant.aiCreditsLimit) {
        return res.status(402).json({ error: 'AI credit limit reached. Upgrade your AI credit pack.' });
      }

      const langLabel =
        parsed.data.language === 'te' ? 'Telugu' : parsed.data.language === 'hi' ? 'Hindi' : 'English';

      const prompts: Record<string, string> = {
        seo_metadata: `Generate SEO Title (<=60 chars), Meta Description (<=155 chars), 8 local + global keywords, and OpenGraph copy in ${langLabel} for "${access.tenant.name}" (${access.tenant.category}): ${parsed.data.topic}`,
        blog_article: `Write an engaging, SEO-structured 350-word blog post with H2 headings and CTA in ${langLabel} for "${access.tenant.name}": ${parsed.data.topic}`,
        ad_campaign: `Create 3 high-converting Meta/Google Ad variations (Headline, Primary Text, CTA, Audience Targeting) in ${langLabel} for "${access.tenant.name}": ${parsed.data.topic}`,
        poster_brief: `Design a complete Promotional Banner & Social Poster creative brief (Headline, Subheadline, Offer Badge, Color & Typography direction, WhatsApp caption, and Photography Art Direction) in ${langLabel} for "${access.tenant.name}": ${parsed.data.topic}`,
      };

      const output = await generateAiText({
        systemInstruction:
          'You are the Vijay Visuals AI Photo & Content Studio Director. Deliver crisp, actionable, luxury-grade marketing assets without hallucinating unavailable discounts.',
        prompt: prompts[parsed.data.mode],
      });

      await db
        .update(tenants)
        .set({ aiCreditsUsed: sql`${tenants.aiCreditsUsed} + 2` })
        .where(eq(tenants.id, access.tenant.id));

      res.json({ output, creditsUsed: 2 });
    } catch (error: any) {
      console.error('AI content studio failed:', error);
      res.status(502).json({ error: error?.message || 'AI Content Studio failed.' });
    }
  });

  // =========================================================================
  // MODULE 2, 5 & 23: CROSS-DEVICE WISHLIST, PRIVACY EXPORT & CONSENT
  // =========================================================================
  router.get('/api/customer/wishlist', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(wishlists)
        .where(eq(wishlists.userId, req.dbUser!.id))
        .orderBy(desc(wishlists.createdAt));
      res.json({ productIds: rows.map((r) => r.productId), items: rows });
    } catch (error) {
      console.error('GET wishlist failed:', error);
      res.status(500).json({ error: 'Unable to load wishlist.' });
    }
  });

  router.post('/api/customer/wishlist/toggle', requireAuth, async (req: AuthRequest, res) => {
    try {
      const productId = Number(req.body?.productId);
      if (!productId) return res.status(400).json({ error: 'Product ID required.' });

      const existing = await db
        .select()
        .from(wishlists)
        .where(and(eq(wishlists.userId, req.dbUser!.id), eq(wishlists.productId, productId)))
        .limit(1);

      if (existing.length > 0) {
        await db.delete(wishlists).where(eq(wishlists.id, existing[0].id));
      } else {
        const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
        if (!prod) return res.status(404).json({ error: 'Product not found.' });
        await db.insert(wishlists).values({
          userId: req.dbUser!.id,
          productId: prod.id,
          tenantId: prod.tenantId,
        });
      }

      const rows = await db.select().from(wishlists).where(eq(wishlists.userId, req.dbUser!.id));
      res.json({ productIds: rows.map((r) => r.productId) });
    } catch (error) {
      console.error('Toggle wishlist failed:', error);
      res.status(500).json({ error: 'Unable to update wishlist.' });
    }
  });

  router.patch('/api/customer/consent', requireAuth, async (req: AuthRequest, res) => {
    try {
      const marketingConsent = Boolean(req.body?.marketingConsent);
      const unsubscribed = Boolean(req.body?.unsubscribed);
      const [updated] = await db
        .update(users)
        .set({ marketingConsent, unsubscribed, updatedAt: new Date() })
        .where(eq(users.id, req.dbUser!.id))
        .returning();
      res.json({ user: updated });
    } catch (error) {
      console.error('PATCH consent failed:', error);
      res.status(500).json({ error: 'Unable to update privacy preferences.' });
    }
  });

  router.get('/api/customer/privacy-export', requireAuth, async (req: AuthRequest, res) => {
    try {
      const myOrders = await db.select().from(orders).where(eq(orders.customerUserId, req.dbUser!.id));
      const myAppointments = await db.select().from(appointments).where(eq(appointments.customerUserId, req.dbUser!.id));
      const myWishlist = await db.select().from(wishlists).where(eq(wishlists.userId, req.dbUser!.id));

      await writeAudit(req.dbUser!.email, req.dbUser!.role, 'PRIVACY_DATA_EXPORTED', 'User exported personal data JSON');

      res.json({
        exportedAt: new Date().toISOString(),
        profile: req.dbUser,
        orders: myOrders,
        appointments: myAppointments,
        wishlistProductIds: myWishlist.map((w) => w.productId),
      });
    } catch (error) {
      console.error('Privacy export failed:', error);
      res.status(500).json({ error: 'Unable to export account data.' });
    }
  });

  // =========================================================================
  // MODULE 15: APPOINTMENTS & SERVICE BOOKINGS
  // =========================================================================
  const bookingSchema = z.object({
    customerName: z.string().min(2).max(100),
    customerPhone: z.string().min(7).max(20),
    customerEmail: z.string().email().optional().or(z.literal('')),
    serviceName: z.string().min(2).max(120),
    staffAssigned: z.string().max(80).optional(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeSlot: z.string().min(2).max(30),
    advanceAmountInr: z.number().int().min(0).optional(),
    notes: z.string().max(400).optional(),
  });

  router.post('/api/tenants/:slug/appointments', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, req.params.slug)).limit(1);
      if (!tenant) return res.status(404).json({ error: 'Business not found.' });

      const parsed = bookingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Please complete name, phone, service, date (YYYY-MM-DD), and time slot.' });
      }

      const [created] = await db
        .insert(appointments)
        .values({
          tenantId: tenant.id,
          customerUserId: req.dbUser?.id ?? null,
          customerName: parsed.data.customerName,
          customerPhone: parsed.data.customerPhone,
          customerEmail: parsed.data.customerEmail || req.dbUser?.email || '',
          serviceName: parsed.data.serviceName,
          staffAssigned: parsed.data.staffAssigned || 'Any Available',
          bookingDate: parsed.data.bookingDate,
          timeSlot: parsed.data.timeSlot,
          advanceAmountInr: parsed.data.advanceAmountInr || 0,
          status: 'confirmed',
          notes: parsed.data.notes || '',
        })
        .returning();

      res.status(201).json({ appointment: created });
    } catch (error) {
      console.error('Create appointment failed:', error);
      res.status(500).json({ error: 'Unable to create booking.' });
    }
  });

  router.get('/api/customer/appointments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.customerUserId, req.dbUser!.id))
        .orderBy(desc(appointments.createdAt));
      res.json({ appointments: rows });
    } catch (error) {
      console.error('GET customer appointments failed:', error);
      res.status(500).json({ error: 'Unable to load your bookings.' });
    }
  });

  router.get('/api/owner/tenants/:tenantId/appointments', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.tenantId, tenantId))
        .orderBy(desc(appointments.createdAt));
      res.json({ appointments: rows });
    } catch (error) {
      console.error('GET owner appointments failed:', error);
      res.status(500).json({ error: 'Unable to load bookings.' });
    }
  });

  router.patch('/api/owner/appointments/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Booking not found.' });

      const access = await assertTenantOwnership(req, existing.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const status = String(req.body?.status || existing.status);
      const staffAssigned = req.body?.staffAssigned ? String(req.body.staffAssigned) : existing.staffAssigned;
      const [updated] = await db
        .update(appointments)
        .set({ status, staffAssigned })
        .where(eq(appointments.id, id))
        .returning();
      res.json({ appointment: updated });
    } catch (error) {
      console.error('PATCH appointment failed:', error);
      res.status(500).json({ error: 'Unable to update booking.' });
    }
  });

  // =========================================================================
  // MODULE 11: CRM, LEADS, LOYALTY & CONSENT
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/crm', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const leads = await db
        .select()
        .from(crmLeads)
        .where(eq(crmLeads.tenantId, tenantId))
        .orderBy(desc(crmLeads.createdAt));
      res.json({ leads });
    } catch (error) {
      console.error('GET CRM leads failed:', error);
      res.status(500).json({ error: 'Unable to load CRM leads.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/crm', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        name: z.string().min(2).max(100),
        phone: z.string().min(7).max(20),
        email: z.string().max(120).optional(),
        source: z.string().max(40).optional(),
        stage: z.string().max(40).optional(),
        loyaltyPoints: z.number().int().min(0).optional(),
        marketingConsent: z.boolean().optional(),
        nextFollowupDate: z.string().max(20).optional(),
        notes: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Enter valid lead name and phone.' });

      const [lead] = await db
        .insert(crmLeads)
        .values({
          tenantId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email || '',
          source: parsed.data.source || 'website',
          stage: parsed.data.stage || 'new',
          loyaltyPoints: parsed.data.loyaltyPoints || 0,
          marketingConsent: parsed.data.marketingConsent ?? true,
          unsubscribed: false,
          nextFollowupDate: parsed.data.nextFollowupDate || '',
          notes: parsed.data.notes || '',
        })
        .returning();

      res.status(201).json({ lead });
    } catch (error) {
      console.error('POST CRM lead failed:', error);
      res.status(500).json({ error: 'Unable to save CRM lead.' });
    }
  });

  router.patch('/api/owner/crm/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(crmLeads).where(eq(crmLeads.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Lead not found.' });

      const access = await assertTenantOwnership(req, existing.tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [updated] = await db
        .update(crmLeads)
        .set({
          stage: req.body?.stage ? String(req.body.stage) : existing.stage,
          loyaltyPoints:
            req.body?.loyaltyPoints !== undefined ? Number(req.body.loyaltyPoints) : existing.loyaltyPoints,
          unsubscribed:
            req.body?.unsubscribed !== undefined ? Boolean(req.body.unsubscribed) : existing.unsubscribed,
          marketingConsent:
            req.body?.unsubscribed === true
              ? false
              : req.body?.marketingConsent !== undefined
                ? Boolean(req.body.marketingConsent)
                : existing.marketingConsent,
        })
        .where(eq(crmLeads.id, id))
        .returning();

      res.json({ lead: updated });
    } catch (error) {
      console.error('PATCH CRM lead failed:', error);
      res.status(500).json({ error: 'Unable to update CRM lead.' });
    }
  });

  // =========================================================================
  // MODULE 12: GST FINANCE, EXPENSES, QUOTATIONS, CREDIT NOTES & P&L
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/finance', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const records = await db
        .select()
        .from(financeRecords)
        .where(eq(financeRecords.tenantId, tenantId))
        .orderBy(desc(financeRecords.createdAt));

      const tenantOrders = await db.select().from(orders).where(eq(orders.tenantId, tenantId));
      const grossSalesInr = tenantOrders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0);
      const totalExpensesInr = records
        .filter((r) => r.recordType === 'expense')
        .reduce((sum, r) => sum + r.amountInr, 0);
      const totalCreditNotesInr = records
        .filter((r) => r.recordType === 'credit_note')
        .reduce((sum, r) => sum + r.amountInr, 0);
      const inputGstInr = records
        .filter((r) => r.recordType === 'expense')
        .reduce((sum, r) => sum + r.gstAmountInr, 0);
      const estimatedOutputGstInr = Math.round(grossSalesInr - grossSalesInr / 1.18);

      res.json({
        records,
        summary: {
          grossSalesInr,
          totalExpensesInr,
          totalCreditNotesInr,
          netProfitEstimateInr: grossSalesInr - totalExpensesInr - totalCreditNotesInr,
          inputGstInr,
          estimatedOutputGstInr,
        },
      });
    } catch (error) {
      console.error('GET finance failed:', error);
      res.status(500).json({ error: 'Unable to load financial records.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/finance', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const schema = z.object({
        recordType: z.enum(['expense', 'quotation', 'credit_note']),
        partyName: z.string().min(2).max(120),
        category: z.string().min(2).max(60),
        amountInr: z.number().int().positive(),
        gstRatePct: z.number().int().min(0).max(28).default(18),
        notes: z.string().max(400).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Provide valid party name and INR amount.' });

      const gstAmountInr = Math.round((parsed.data.amountInr * parsed.data.gstRatePct) / 100);
      const prefix =
        parsed.data.recordType === 'expense'
          ? 'EXP'
          : parsed.data.recordType === 'quotation'
            ? 'QTN'
            : 'CRN';
      const referenceNo = `${prefix}-${Date.now().toString().slice(-6)}`;

      const [record] = await db
        .insert(financeRecords)
        .values({
          tenantId,
          recordType: parsed.data.recordType,
          referenceNo,
          partyName: parsed.data.partyName,
          category: parsed.data.category,
          amountInr: parsed.data.amountInr,
          gstRatePct: parsed.data.gstRatePct,
          gstAmountInr,
          status: 'recorded',
          notes: parsed.data.notes || '',
        })
        .returning();

      res.status(201).json({ record });
    } catch (error) {
      console.error('POST finance record failed:', error);
      res.status(500).json({ error: 'Unable to save finance record.' });
    }
  });

  // =========================================================================
  // MODULE 13 & 14: WAREHOUSES, SUPPLIERS & STAFF ATTENDANCE / SALARY
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/supply-chain', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [whList, supList, attList] = await Promise.all([
        db.select().from(warehouses).where(eq(warehouses.tenantId, tenantId)).orderBy(desc(warehouses.createdAt)),
        db.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)).orderBy(desc(suppliers.createdAt)),
        db
          .select()
          .from(staffAttendance)
          .where(eq(staffAttendance.tenantId, tenantId))
          .orderBy(desc(staffAttendance.createdAt))
          .limit(50),
      ]);

      const isOwnerOrAdmin = req.dbUser!.role === 'super_admin' || access.tenant.ownerUserId === req.dbUser!.id;
      const safeAttendance = attList.map((row) => ({
        ...row,
        salaryPaidInr: isOwnerOrAdmin ? row.salaryPaidInr : 0,
      }));

      res.json({ warehouses: whList, suppliers: supList, attendance: safeAttendance, canViewPayroll: isOwnerOrAdmin });
    } catch (error) {
      console.error('GET supply chain failed:', error);
      res.status(500).json({ error: 'Unable to load warehouses, suppliers, and HR data.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/warehouses', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const name = String(req.body?.name || '').trim();
      const city = String(req.body?.city || '').trim();
      if (!name || !city) return res.status(400).json({ error: 'Warehouse name and city are required.' });

      const [warehouse] = await db
        .insert(warehouses)
        .values({
          tenantId,
          name,
          city,
          capacityUnits: Number(req.body?.capacityUnits) || 500,
          managerName: String(req.body?.managerName || '').trim(),
        })
        .returning();
      res.status(201).json({ warehouse });
    } catch (error) {
      console.error('POST warehouse failed:', error);
      res.status(500).json({ error: 'Unable to add warehouse.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/suppliers', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const name = String(req.body?.name || '').trim();
      const contactPhone = String(req.body?.contactPhone || '').trim();
      if (!name || !contactPhone) return res.status(400).json({ error: 'Supplier name and phone are required.' });

      const [supplier] = await db
        .insert(suppliers)
        .values({
          tenantId,
          name,
          contactPhone,
          gstin: String(req.body?.gstin || '').toUpperCase().trim(),
          category: String(req.body?.category || 'General Supply').trim(),
          leadTimeDays: Number(req.body?.leadTimeDays) || 3,
          notes: String(req.body?.notes || '').trim(),
        })
        .returning();
      res.status(201).json({ supplier });
    } catch (error) {
      console.error('POST supplier failed:', error);
      res.status(500).json({ error: 'Unable to add supplier.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/attendance', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const isOwnerOrAdmin = req.dbUser!.role === 'super_admin' || access.tenant.ownerUserId === req.dbUser!.id;
      const staffId = Number(req.body?.staffId);
      const recordDate = String(req.body?.recordDate || new Date().toISOString().slice(0, 10));
      const status = String(req.body?.status || 'present');
      const requestedSalary = Number(req.body?.salaryPaidInr) || 0;
      if (requestedSalary > 0 && !isOwnerOrAdmin) {
        return res.status(403).json({ error: 'Only the Business Owner or Super Admin can record salary payouts.' });
      }
      const salaryPaidInr = isOwnerOrAdmin ? requestedSalary : 0;
      if (!staffId) return res.status(400).json({ error: 'Select a staff member.' });

      const [row] = await db
        .insert(staffAttendance)
        .values({
          tenantId,
          staffId,
          recordDate,
          status,
          salaryPaidInr,
          notes: String(req.body?.notes || '').trim(),
        })
        .returning();
      res.status(201).json({ attendance: row });
    } catch (error) {
      console.error('POST attendance failed:', error);
      res.status(500).json({ error: 'Unable to record attendance.' });
    }
  });

  // =========================================================================
  // MODULE 21: EXTENSIBLE DECLARATIVE PLUGIN & WEBHOOK MARKETPLACE
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/plugins', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const installed = await db
        .select()
        .from(tenantPlugins)
        .where(eq(tenantPlugins.tenantId, tenantId))
        .orderBy(desc(tenantPlugins.installedAt));

      res.json({ catalog: PLUGIN_CATALOG, installed });
    } catch (error) {
      console.error('GET plugins failed:', error);
      res.status(500).json({ error: 'Unable to load plugins.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/plugins', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const access = await assertTenantOwnership(req, tenantId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const pluginCode = String(req.body?.pluginCode || '');
      const catalogItem = PLUGIN_CATALOG.find((p) => p.code === pluginCode);
      if (!catalogItem) {
        return res.status(400).json({ error: 'Only verified Vijay Visuals marketplace plugins can be installed.' });
      }

      const existing = await db
        .select()
        .from(tenantPlugins)
        .where(and(eq(tenantPlugins.tenantId, tenantId), eq(tenantPlugins.pluginCode, pluginCode)))
        .limit(1);

      const safeConfig = JSON.stringify({
        endpointUrl: String(req.body?.endpointUrl || '').slice(0, 240),
        trackingId: String(req.body?.trackingId || '').slice(0, 80),
      });

      let saved;
      if (existing.length > 0) {
        [saved] = await db
          .update(tenantPlugins)
          .set({ enabled: req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true, configJson: safeConfig })
          .where(eq(tenantPlugins.id, existing[0].id))
          .returning();
      } else {
        [saved] = await db
          .insert(tenantPlugins)
          .values({
            tenantId,
            pluginCode: catalogItem.code,
            pluginName: catalogItem.name,
            permissionScope: catalogItem.permissionScope,
            configJson: safeConfig,
            enabled: true,
          })
          .returning();
      }

      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'PLUGIN_CONFIGURED',
        `Configured ${catalogItem.name} (${catalogItem.permissionScope})`,
        tenantId
      );

      res.status(201).json({ plugin: saved });
    } catch (error) {
      console.error('POST plugin failed:', error);
      res.status(500).json({ error: 'Unable to configure plugin.' });
    }
  });

  // =========================================================================
  // MODULE 7: SUPER ADMIN ECOSYSTEM CONTROLS (ANNOUNCEMENTS, PAYMENTS, ROUTE KYC)
  // =========================================================================
  router.get('/api/admin/ecosystem', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin access required.' });
      }
      const [payments, sellerAccounts, transfers, announcements, webhooks] = await Promise.all([
        db.select().from(platformPayments).orderBy(desc(platformPayments.createdAt)).limit(50),
        db.select().from(sellerPayoutAccounts).orderBy(desc(sellerPayoutAccounts.updatedAt)).limit(50),
        db.select().from(sellerTransfers).orderBy(desc(sellerTransfers.createdAt)).limit(50),
        db.select().from(platformAnnouncements).orderBy(desc(platformAnnouncements.createdAt)).limit(20),
        db.select().from(webhookEvents).orderBy(desc(webhookEvents.processedAt)).limit(30),
      ]);

      res.json({
        razorpay: getRazorpayStatus(),
        platformPayments: payments,
        sellerAccounts,
        sellerTransfers: transfers,
        announcements,
        webhookEvents: webhooks,
      });
    } catch (error) {
      console.error('GET admin ecosystem failed:', error);
      res.status(500).json({ error: 'Unable to load admin ecosystem data.' });
    }
  });

  router.post('/api/admin/announcements', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin access required.' });
      }
      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      const severity = String(req.body?.severity || 'info');
      if (!title || !message) return res.status(400).json({ error: 'Announcement title and message required.' });

      const [item] = await db
        .insert(platformAnnouncements)
        .values({ title, message, severity, active: true, createdBy: req.dbUser!.email })
        .returning();

      await writeAudit(req.dbUser!.email, req.dbUser!.role, 'ANNOUNCEMENT_PUBLISHED', title);
      res.status(201).json({ announcement: item });
    } catch (error) {
      console.error('POST announcement failed:', error);
      res.status(500).json({ error: 'Unable to publish announcement.' });
    }
  });

  router.patch('/api/admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin access required.' });
      }
      const id = Number(req.params.id);
      const [updated] = await db
        .update(platformAnnouncements)
        .set({ active: Boolean(req.body?.active) })
        .where(eq(platformAnnouncements.id, id))
        .returning();
      res.json({ announcement: updated });
    } catch (error) {
      console.error('PATCH announcement failed:', error);
      res.status(500).json({ error: 'Unable to update announcement.' });
    }
  });

  router.patch('/api/admin/seller-accounts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.dbUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super Admin access required.' });
      }
      const id = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(sellerPayoutAccounts)
        .where(eq(sellerPayoutAccounts.id, id))
        .limit(1);
      if (!existing) return res.status(404).json({ error: 'Seller payout account not found.' });

      const kycStatus = req.body?.kycStatus ? String(req.body.kycStatus) : existing.kycStatus;
      const razorpayAccountId =
        req.body?.razorpayAccountId !== undefined
          ? String(req.body.razorpayAccountId).trim()
          : existing.razorpayAccountId;
      const platformCommissionPct =
        req.body?.platformCommissionPct !== undefined
          ? Math.max(0, Math.min(30, Number(req.body.platformCommissionPct)))
          : existing.platformCommissionPct;
      const routeEnabled =
        kycStatus === 'verified' && Boolean(razorpayAccountId) && Boolean(req.body?.routeEnabled ?? true);

      const [updated] = await db
        .update(sellerPayoutAccounts)
        .set({
          kycStatus,
          razorpayAccountId,
          platformCommissionPct,
          routeEnabled,
          updatedAt: new Date(),
        })
        .where(eq(sellerPayoutAccounts.id, id))
        .returning();

      await writeAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        'SELLER_ROUTE_UPDATED',
        `Seller #${id}: KYC=${kycStatus}, Commission=${platformCommissionPct}%, Route=${routeEnabled}`,
        existing.tenantId
      );
      res.json({ account: updated });
    } catch (error) {
      console.error('PATCH seller account failed:', error);
      res.status(500).json({ error: 'Unable to update seller account.' });
    }
  });

  return router;
}
