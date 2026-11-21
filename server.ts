import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './src/db/index.ts';
import {
  auditLogs,
  automationLogs,
  automationWorkflows,
  coupons,
  deliveryPartners,
  newsletterSubscribers,
  orders,
  platformPayments,
  platformPlans,
  products,
  proposals,
  reviews,
  staffMembers,
  supportTickets,
  tenantDomains,
  tenants,
  users,
} from './src/db/schema.ts';
import { ensurePlatformSeeded } from './src/db/seed.ts';
import { AuthRequest, optionalAuth, requireAuth } from './src/middleware/auth.ts';
import { generateAiText } from './src/lib/gemini.ts';
import { getRazorpayStatus } from './src/lib/razorpay.ts';
import { generateSlugFromName, SLUG_REGEX, validateSlug } from './src/lib/slug.ts';
import { createEcosystemRouter, handleRazorpayRawWebhook } from './src/routes/ecosystem.ts';
import { createGrowthRouter } from './src/routes/growth.ts';
import { createBusinessOsRouter } from './src/routes/businessOs.ts';
import { createLocationsRouter, resolveGoogleMapsApiKey } from './src/routes/locations.ts';
import { createDomainsRouter, getCloudflareSaasStatus } from './src/routes/domains.ts';
import { createApiRateLimiter } from './src/middleware/rateLimit.ts';

const app = express();
// Module 3D: Raw request body MUST be preserved for Razorpay HMAC-SHA256 webhook verification
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), handleRazorpayRawWebhook);
app.use(express.json({ limit: '2mb' }));

// Sliding-window API rate limiter with standard X-RateLimit headers (Module 15)
app.use('/api', createApiRateLimiter({ maxRequests: 240, windowMs: 60_000 }));

// Lazy seed on first API call (no eager startup DB probes per Cloud SQL guidelines)
app.use('/api', async (_req, _res, next) => {
  await ensurePlatformSeeded();
  next();
});

async function checkServerTenantEntitlement(userId: number, tenantId?: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user?.role === 'super_admin') {
    return { canPublish: true, planTier: 'enterprise_ai' as const, pwaEnabled: true };
  }
  // Check verified payment in platformPayments
  const payments = await db
    .select()
    .from(platformPayments)
    .where(
      and(
        eq(platformPayments.userId, userId),
        eq(platformPayments.signatureVerified, true)
      )
    )
    .orderBy(desc(platformPayments.id));

  const validPayment = payments.find((p) => !tenantId || p.tenantId === tenantId || p.tenantId === null);
  if (validPayment) {
    const isPwa = validPayment.planCode === 'website-plus-pwa' || validPayment.planCode.includes('pwa');
    const isEnterprise = validPayment.planCode === 'enterprise' || validPayment.planCode.includes('enterprise');
    return {
      canPublish: true,
      planTier: (isEnterprise ? 'enterprise_ai' : isPwa ? 'website_pwa' : 'website_only') as 'website_only' | 'website_pwa' | 'enterprise_ai',
      pwaEnabled: isPwa || isEnterprise,
    };
  }

  return {
    canPublish: false,
    planTier: 'website_only' as const,
    pwaEnabled: false,
  };
}

async function writeAuditLog(
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
    console.error('Audit log insert failed:', err);
  }
}

async function assertTenantAccess(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant };
  }
  // Allow assigned staff member of the same tenant
  const staff = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.email, dbUser.email), eq(staffMembers.active, true)))
    .limit(1);
  if (staff.length > 0) {
    return { ok: true as const, tenant };
  }
  return {
    ok: false as const,
    status: 403,
    error: 'Tenant isolation enforced: you cannot access another business’s private data.',
  };
}

// ---------- HEALTH & EXTERNAL INTEGRATIONS STATUS ----------
app.get('/api/health', (_req, res) => {
  const rzp = getRazorpayStatus();
  res.json({
    ok: true,
    integrations: {
      postgresql: Boolean(process.env.SQL_HOST && process.env.SQL_DB_NAME),
      geminiAi: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      razorpayGateway: rzp.configured,
      razorpayMode: rzp.mode,
      whatsappCloudApi: Boolean(process.env.WHATSAPP_CLOUD_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      smtpEmail: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
      smsProvider: Boolean(process.env.SMS_PROVIDER_API_KEY),
      courierApi: Boolean(process.env.SHIPROCKET_TOKEN),
      googleMapsPlatform: Boolean(resolveGoogleMapsApiKey()),
      mapbox: Boolean((process.env.MAPBOX_ACCESS_TOKEN || '').trim()),
      domainRegistrarApi: Boolean((process.env.DOMAIN_REGISTRAR_API_KEY || '').trim()),
      cloudflareSaasCustomHostnames: getCloudflareSaasStatus().configured,
    },
  });
});

// ---------- USER PROFILE & AUTH ----------
app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;
    const ownedTenants =
      dbUser.role === 'super_admin'
        ? await db.select().from(tenants).orderBy(desc(tenants.createdAt))
        : await db.select().from(tenants).where(eq(tenants.ownerUserId, dbUser.id)).orderBy(desc(tenants.createdAt));

    const partnerProfiles = await db
      .select()
      .from(deliveryPartners)
      .where(or(eq(deliveryPartners.userId, dbUser.id), eq(deliveryPartners.phone, dbUser.phone || '__none__')));

    res.json({
      user: dbUser,
      ownedTenants,
      deliveryProfiles: partnerProfiles,
    });
  } catch (error) {
    console.error('GET /api/me failed:', error);
    res.status(500).json({ error: 'Failed to load account profile.' });
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).optional(),
  preferredLang: z.enum(['en', 'te']).optional(),
  savedAddressesJson: z.string().max(8000).optional(),
});

app.patch('/api/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid profile fields.' });
    }
    const dbUser = req.dbUser!;
    const [updated] = await db
      .update(users)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.preferredLang !== undefined ? { preferredLang: parsed.data.preferredLang } : {}),
        ...(parsed.data.savedAddressesJson !== undefined ? { savedAddressesJson: parsed.data.savedAddressesJson } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, dbUser.id))
      .returning();
    res.json({ user: updated });
  } catch (error) {
    console.error('PATCH /api/me failed:', error);
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

// ---------- PLATFORM PLANS (MODULE 6 & 11) ----------
app.get('/api/plans', async (_req, res) => {
  try {
    const rows = await db.select().from(platformPlans).orderBy(platformPlans.id);
    res.json({ plans: rows });
  } catch (error) {
    console.error('GET /api/plans failed:', error);
    res.status(500).json({ error: 'Unable to fetch pricing packages.' });
  }
});

const updatePlanSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  priceInr: z.number().int().min(0).max(5000000).optional(),
  billingCycle: z.enum(['one_time', 'monthly', 'yearly']).optional(),
  includesPwa: z.boolean().optional(),
  aiCreditsIncluded: z.number().int().min(0).max(1000000).optional(),
  storageGb: z.number().int().min(0).max(10000).optional(),
  thirdPartyDisclosure: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

app.patch('/api/admin/plans/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.dbUser!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin permission required.' });
    }
    const id = Number(req.params.id);
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success || Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid plan update payload.' });
    }
    const [updated] = await db
      .update(platformPlans)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(platformPlans.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Plan not found.' });
    await writeAuditLog(req.dbUser!.email, req.dbUser!.role, 'PLAN_UPDATED', `Updated plan ${updated.code} to ₹${updated.priceInr}`);
    res.json({ plan: updated });
  } catch (error) {
    console.error('PATCH /api/admin/plans/:id failed:', error);
    res.status(500).json({ error: 'Failed to update plan.' });
  }
});

// ---------- TENANTS / WEBSITE BUILDER (MODULE 1, 8, 9) ----------
app.get('/api/tenants', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.published, true),
          category && category !== 'all' ? eq(tenants.category, category) : undefined,
          q ? or(ilike(tenants.name, `%${q}%`), ilike(tenants.tagline, `%${q}%`)) : undefined
        )
      )
      .orderBy(desc(tenants.createdAt));
    res.json({ tenants: rows });
  } catch (error) {
    console.error('GET /api/tenants failed:', error);
    res.status(500).json({ error: 'Failed to load published businesses.' });
  }
});

async function isSlugTaken(slug: string, excludeTenantId?: number): Promise<boolean> {
  const condition =
    excludeTenantId && !Number.isNaN(excludeTenantId)
      ? and(eq(tenants.slug, slug), ne(tenants.id, excludeTenantId))
      : eq(tenants.slug, slug);
  const existing = await db.select({ id: tenants.id }).from(tenants).where(condition).limit(1);
  return existing.length > 0;
}

async function findAvailableSlugSuggestion(rawBase: string, excludeTenantId?: number): Promise<string> {
  const base = generateSlugFromName(rawBase) || 'my-business';
  const baseCheck = validateSlug(base);
  const cleanBase = baseCheck.valid ? base : `${base}-store`;

  if (!(await isSlugTaken(cleanBase, excludeTenantId))) {
    return cleanBase;
  }
  for (let i = 2; i <= 25; i++) {
    const candidate = `${cleanBase.slice(0, 74)}-${i}`;
    if (!(await isSlugTaken(candidate, excludeTenantId))) {
      return candidate;
    }
  }
  return `${cleanBase.slice(0, 70)}-${Date.now().toString(36).slice(-4)}`;
}

// Live website slug validation & availability check (must be declared BEFORE /api/tenants/:slug)
app.get('/api/tenants/check-slug', async (req, res) => {
  try {
    const rawSlug = String(req.query.slug ?? '');
    const businessName = String(req.query.name ?? '');
    const excludeTenantId = req.query.excludeTenantId ? Number(req.query.excludeTenantId) : undefined;

    if (!rawSlug && businessName) {
      const suggestedSlug = await findAvailableSlugSuggestion(businessName, excludeTenantId);
      return res.json({
        valid: false,
        available: false,
        slug: '',
        error: 'Website URL slug is required.',
        suggestedSlug,
      });
    }

    const validation = validateSlug(rawSlug);
    if (!validation.valid) {
      const suggestedSlug = await findAvailableSlugSuggestion(
        validation.normalized || businessName || rawSlug,
        excludeTenantId
      );
      return res.json({
        valid: false,
        available: false,
        slug: rawSlug,
        error: validation.error,
        suggestedSlug,
      });
    }

    const taken = await isSlugTaken(validation.normalized, excludeTenantId);
    if (taken) {
      const suggestedSlug = await findAvailableSlugSuggestion(validation.normalized, excludeTenantId);
      return res.json({
        valid: true,
        available: false,
        slug: validation.normalized,
        error: `The URL slug "${validation.normalized}" is already taken. Try "${suggestedSlug}" or enter another.`,
        suggestedSlug,
      });
    }

    return res.json({
      valid: true,
      available: true,
      slug: validation.normalized,
      message: `URL slug "/site/${validation.normalized}" is available.`,
      suggestedSlug: validation.normalized,
    });
  } catch (error) {
    console.error('GET /api/tenants/check-slug failed:', error);
    res.status(500).json({ error: 'Unable to check slug availability right now.' });
  }
});

app.get('/api/tenants/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (!tenant) return res.status(404).json({ error: 'Storefront not found.' });

    const [tenantProducts, tenantCoupons, tenantReviews] = await Promise.all([
      db.select().from(products).where(and(eq(products.tenantId, tenant.id), eq(products.active, true))).orderBy(desc(products.createdAt)),
      db.select().from(coupons).where(and(eq(coupons.tenantId, tenant.id), eq(coupons.active, true))),
      db.select().from(reviews).where(eq(reviews.tenantId, tenant.id)).orderBy(desc(reviews.createdAt)),
    ]);

    res.json({
      tenant,
      products: tenantProducts,
      coupons: tenantCoupons,
      reviews: tenantReviews,
    });
  } catch (error) {
    console.error('GET /api/tenants/:slug failed:', error);
    res.status(500).json({ error: 'Failed to load storefront.' });
  }
});

// Optional PWA Dynamic Branded Manifest + Server-Side License Verification (Module 8)
app.get('/api/tenants/:slug/pwa-license', async (req, res) => {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, req.params.slug)).limit(1);
    if (!tenant) return res.status(404).json({ valid: false, reason: 'Business not found.' });
    const valid = Boolean(tenant.pwaEnabled && tenant.pwaLicenseKey.trim().length >= 8);
    res.json({
      valid,
      planTier: tenant.planTier,
      appName: tenant.pwaAppName || tenant.name,
      shortName: (tenant.pwaShortName || tenant.name).slice(0, 12),
      themeColor: tenant.pwaThemeColor || tenant.primaryColor,
      notice: 'Installable Progressive Web App via supported Android Chrome or iOS Safari. Not a Google Play Store native application.',
    });
  } catch (error) {
    console.error('GET pwa-license failed:', error);
    res.status(500).json({ valid: false, reason: 'License verification failed.' });
  }
});

app.get('/api/tenants/:slug/manifest.webmanifest', async (req, res) => {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, req.params.slug)).limit(1);
    if (!tenant || !tenant.pwaEnabled || !tenant.pwaLicenseKey) {
      return res.status(403).json({ error: 'Optional PWA add-on is not licensed for this business.' });
    }
    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({
      id: `/site/${tenant.slug}`,
      name: tenant.pwaAppName || tenant.name,
      short_name: (tenant.pwaShortName || tenant.name).slice(0, 12),
      description: tenant.tagline || tenant.description || `${tenant.name} powered by Vijay Visuals`,
      start_url: `/site/${tenant.slug}`,
      scope: '/',
      display: 'standalone',
      theme_color: tenant.pwaThemeColor || '#08080A',
      background_color: tenant.accentColor || '#08080A',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  } catch (error) {
    console.error('GET dynamic manifest failed:', error);
    res.status(500).json({ error: 'Unable to generate tenant manifest.' });
  }
});

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(SLUG_REGEX),
  category: z.string().min(2).max(50),
  templateId: z.string().default('obsidian-luxury'),
  tagline: z.string().max(200).default(''),
  description: z.string().max(1000).default(''),
  logoText: z.string().min(1).max(6).default('VV'),
  bannerImage: z.string().max(500).default(''),
  primaryColor: z.string().max(20).default('#D4AF37'),
  accentColor: z.string().max(20).default('#0D0D12'),
  fontFamily: z.string().max(50).default('Cinzel'),
  customDomain: z.string().max(150).default(''),
  seoTitle: z.string().max(120).default(''),
  seoDescription: z.string().max(300).default(''),
  currency: z.string().max(8).default('INR'),
  timezone: z.string().max(60).default('Asia/Kolkata'),
  phone: z.string().max(30).default('+91 93813 62201'),
  whatsapp: z.string().max(30).default('919381362201'),
  address: z.string().max(300).default('Hyderabad, Telangana'),
  planTier: z.enum(['website_only', 'website_pwa', 'enterprise_ai']).default('website_only'),
  pwaEnabled: z.boolean().default(false),
  pwaAppName: z.string().max(60).default(''),
  pwaShortName: z.string().max(12).default(''),
  pwaThemeColor: z.string().max(20).default('#08080A'),
  deliveryFee: z.number().int().min(0).max(5000).default(49),
  upiId: z.string().max(100).default(''),
  published: z.boolean().default(true),
});

app.post('/api/tenants', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rawSlug = typeof req.body?.slug === 'string' ? req.body.slug : '';
    const slugCheck = validateSlug(rawSlug);
    if (!slugCheck.valid) {
      const suggestedSlug = await findAvailableSlugSuggestion(
        slugCheck.normalized || String(req.body?.name || '')
      );
      return res.status(400).json({
        error: slugCheck.error || 'Invalid website URL slug.',
        field: 'slug',
        suggestedSlug,
      });
    }

    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid website details. Check business name, category, and URL slug (lowercase letters, numbers, and single hyphens only).',
      });
    }
    const dbUser = req.dbUser!;
    if (await isSlugTaken(parsed.data.slug)) {
      const suggestedSlug = await findAvailableSlugSuggestion(parsed.data.slug);
      return res.status(409).json({
        error: `That business URL slug ("${parsed.data.slug}") is already taken. Try "${suggestedSlug}" or choose another unique slug.`,
        field: 'slug',
        suggestedSlug,
      });
    }

    const entitlement = await checkServerTenantEntitlement(dbUser.id);
    const pwaEnabled = entitlement.pwaEnabled && Boolean(parsed.data.pwaEnabled);
    const pwaLicenseKey = pwaEnabled
      ? `VV-PWA-${parsed.data.slug.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      : '';
    const published = parsed.data.published !== false && entitlement.canPublish;

    const [created] = await db
      .insert(tenants)
      .values({
        ...parsed.data,
        ownerUserId: dbUser.id,
        published,
        planTier: entitlement.planTier,
        pwaEnabled,
        pwaLicenseKey,
        pwaAppName: parsed.data.pwaAppName || parsed.data.name,
        pwaShortName: (parsed.data.pwaShortName || parsed.data.name).slice(0, 12),
        aiCreditsLimit: entitlement.planTier === 'enterprise_ai' ? 2500 : entitlement.planTier === 'website_pwa' ? 750 : 250,
      })
      .returning();

    // Link any verified unlinked platform purchase to this tenant
    const [unlinked] = await db
      .select()
      .from(platformPayments)
      .where(
        and(
          eq(platformPayments.userId, dbUser.id),
          eq(platformPayments.signatureVerified, true)
        )
      )
      .orderBy(desc(platformPayments.id))
      .limit(1);

    if (unlinked && !unlinked.tenantId) {
      await db
        .update(platformPayments)
        .set({ tenantId: created.id })
        .where(eq(platformPayments.id, unlinked.id));
      if (!created.published && parsed.data.published !== false) {
        await db.update(tenants).set({ published: true }).where(eq(tenants.id, created.id));
        created.published = true;
      }
    }

    if (dbUser.role === 'customer') {
      await db.update(users).set({ role: 'business_owner', updatedAt: new Date() }).where(eq(users.id, dbUser.id));
    }

    // Create default starter workflows & starter coupon for the new tenant
    await db.insert(automationWorkflows).values([
      {
        tenantId: created.id,
        name: 'Order Confirmation & GST Invoice',
        triggerType: 'order_created',
        conditionText: 'On every new storefront order',
        actionType: 'generate_invoice',
        requiresApproval: false,
        scheduleCron: 'On Event',
        enabled: true,
      },
      {
        tenantId: created.id,
        name: 'Low-Stock Owner Alert',
        triggerType: 'low_stock',
        conditionText: 'When product stock <= threshold',
        actionType: 'low_stock_alert',
        requiresApproval: false,
        scheduleCron: 'On Inventory Update',
        enabled: true,
      },
    ]);

    await writeAuditLog(dbUser.email, dbUser.role, 'TENANT_CREATED', `Published /site/${created.slug} (${created.planTier})`, created.id);
    res.status(201).json({ tenant: created });
  } catch (error) {
    console.error('POST /api/tenants failed:', error);
    res.status(500).json({ error: 'Unable to publish business website.' });
  }
});

app.patch('/api/tenants/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid tenant ID.' });
    const access = await assertTenantAccess(req, id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const body = req.body || {};
    const updateValues: Partial<typeof tenants.$inferInsert> = {
      updatedAt: new Date(),
    };
    const allowedStringFields = [
      'name', 'category', 'templateId', 'tagline', 'description', 'logoText',
      'bannerImage', 'primaryColor', 'accentColor', 'fontFamily', 'customDomain',
      'seoTitle', 'seoDescription', 'currency',
      'phone', 'whatsapp', 'address', 'pwaAppName', 'pwaShortName', 'pwaThemeColor', 'upiId',
    ] as const;

    for (const key of allowedStringFields) {
      if (typeof body[key] === 'string') {
        (updateValues as Record<string, unknown>)[key] = key === 'pwaShortName' ? body[key].slice(0, 12) : body[key];
      }
    }

    if (typeof body.slug === 'string' && body.slug !== access.tenant.slug) {
      const slugCheck = validateSlug(body.slug);
      if (!slugCheck.valid) {
        const suggestedSlug = await findAvailableSlugSuggestion(
          slugCheck.normalized || String(body.name || access.tenant.name),
          id
        );
        return res.status(400).json({
          error: slugCheck.error || 'Invalid website URL slug.',
          field: 'slug',
          suggestedSlug,
        });
      }
      if (await isSlugTaken(slugCheck.normalized, id)) {
        const suggestedSlug = await findAvailableSlugSuggestion(slugCheck.normalized, id);
        return res.status(409).json({
          error: `That business URL slug ("${slugCheck.normalized}") is already taken. Try "${suggestedSlug}".`,
          field: 'slug',
          suggestedSlug,
        });
      }
      updateValues.slug = slugCheck.normalized;
    }
    const entitlement = await checkServerTenantEntitlement(req.dbUser!.id, id);

    if (typeof body.published === 'boolean') {
      if (body.published && !access.tenant.published && !entitlement.canPublish) {
        return res.status(402).json({
          error:
            'An active package or subscription is required to publish this website live. Please complete your website package purchase (₹7,999 Business Website package).',
          code: 'PAYMENT_REQUIRED',
        });
      }
      updateValues.published = body.published;
    }
    if (typeof body.codEnabled === 'boolean') updateValues.codEnabled = body.codEnabled;
    if (typeof body.deliveryFee === 'number') updateValues.deliveryFee = Math.max(0, Math.round(body.deliveryFee));
    if (typeof body.deliveryCommissionPct === 'number') {
      updateValues.deliveryCommissionPct = Math.min(50, Math.max(0, Math.round(body.deliveryCommissionPct)));
    }
    if (req.dbUser!.role === 'super_admin') {
      if (typeof body.planTier === 'string' && ['website_only', 'website_pwa', 'enterprise_ai'].includes(body.planTier)) {
        updateValues.planTier = body.planTier;
      }
      if (typeof body.pwaEnabled === 'boolean') {
        updateValues.pwaEnabled = body.pwaEnabled;
        if (body.pwaEnabled && !access.tenant.pwaLicenseKey) {
          updateValues.pwaLicenseKey = `VV-PWA-${access.tenant.slug.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        }
      }
      if (typeof body.aiCreditsLimit === 'number') {
        updateValues.aiCreditsLimit = Math.max(0, Math.round(body.aiCreditsLimit));
      }
    } else {
      updateValues.planTier = entitlement.planTier;
      updateValues.pwaEnabled = entitlement.pwaEnabled && Boolean(body.pwaEnabled);
    }

    const [updated] = await db.update(tenants).set(updateValues).where(eq(tenants.id, id)).returning();
    await writeAuditLog(req.dbUser!.email, req.dbUser!.role, 'TENANT_UPDATED', `Updated branding/settings for ${updated.slug}`, id);
    res.json({ tenant: updated });
  } catch (error) {
    console.error('PATCH /api/tenants/:id failed:', error);
    res.status(500).json({ error: 'Unable to update business website.' });
  }
});

app.patch('/api/owner/tenants/:tenantId/publish', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const published = Boolean(req.body?.published);
    if (published) {
      const entitlement = await checkServerTenantEntitlement(req.dbUser!.id, tenantId);
      if (!entitlement.canPublish) {
        return res.status(402).json({
          error:
            'An active package or subscription is required to publish this website live. Please complete your website package purchase (₹7,999 Business Website package).',
          code: 'PAYMENT_REQUIRED',
        });
      }
    }

    const [updated] = await db
      .update(tenants)
      .set({ published, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    await writeAuditLog(
      req.dbUser!.email,
      req.dbUser!.role,
      published ? 'TENANT_PUBLISHED' : 'TENANT_UNPUBLISHED',
      `Toggled publish status to ${published} for ${updated.slug}`,
      tenantId
    );

    res.json({ tenant: updated, published, status: published ? 'published' : 'unpublished' });
  } catch (error) {
    console.error('PATCH /api/owner/tenants/:tenantId/publish failed:', error);
    res.status(500).json({ error: 'Unable to update publish state.' });
  }
});

// ---------- PRODUCTS, COUPONS, REVIEWS (MODULE 2) ----------
const productSchema = z.object({
  category: z.string().min(1).max(80),
  subcategory: z.string().max(80).default('General'),
  name: z.string().min(2).max(150),
  description: z.string().max(2000).default(''),
  price: z.number().int().min(1),
  compareAtPrice: z.number().int().min(0).default(0),
  wholesalePrice: z.number().int().min(0).default(0),
  minWholesaleQty: z.number().int().min(1).default(10),
  stock: z.number().int().min(0).default(20),
  lowStockThreshold: z.number().int().min(0).default(5),
  imageUrl: z.string().max(500).default(''),
  videoUrl: z.string().max(500).default(''),
  variantsJson: z.string().max(2000).default('[]'),
});

app.post('/api/tenants/:tenantId/products', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid product fields.' });

    const [created] = await db
      .insert(products)
      .values({ ...parsed.data, tenantId })
      .returning();

    if (created.stock <= created.lowStockThreshold) {
      await db.insert(automationLogs).values({
        tenantId,
        eventType: 'low_stock_alert',
        status: 'executed',
        summary: `Low stock alert triggered for "${created.name}" (${created.stock} left, threshold ${created.lowStockThreshold}).`,
        creditsUsed: 0,
      });
    }

    res.status(201).json({ product: created });
  } catch (error) {
    console.error('POST product failed:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

app.patch('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    const access = await assertTenantAccess(req, existing.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const body = req.body || {};
    const [updated] = await db
      .update(products)
      .set({
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.description === 'string' ? { description: body.description } : {}),
        ...(typeof body.price === 'number' ? { price: Math.max(1, Math.round(body.price)) } : {}),
        ...(typeof body.stock === 'number' ? { stock: Math.max(0, Math.round(body.stock)) } : {}),
        ...(typeof body.active === 'boolean' ? { active: body.active } : {}),
      })
      .where(eq(products.id, id))
      .returning();

    if (updated.stock <= updated.lowStockThreshold) {
      await db.insert(automationLogs).values({
        tenantId: existing.tenantId,
        eventType: 'low_stock_alert',
        status: 'executed',
        summary: `Inventory alert: "${updated.name}" dropped to ${updated.stock} units.`,
        creditsUsed: 0,
      });
    }
    res.json({ product: updated });
  } catch (error) {
    console.error('PATCH product failed:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    const access = await assertTenantAccess(req, existing.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    await db.delete(products).where(eq(products.id, id));
    res.json({ deleted: true });
  } catch (error) {
    console.error('DELETE product failed:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

app.post('/api/tenants/:tenantId/coupons', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const schema = z.object({
      code: z.string().min(3).max(30),
      discountType: z.enum(['percent', 'flat']),
      discountValue: z.number().int().min(1),
      minOrder: z.number().int().min(0).default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid coupon details.' });

    const [created] = await db
      .insert(coupons)
      .values({ ...parsed.data, code: parsed.data.code.trim().toUpperCase(), tenantId })
      .returning();
    res.status(201).json({ coupon: created });
  } catch (error) {
    console.error('POST coupon failed:', error);
    res.status(500).json({ error: 'Unable to create coupon.' });
  }
});

app.post('/api/products/:id/reviews', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.id);
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) return res.status(404).json({ error: 'Product not found.' });

    const schema = z.object({
      customerName: z.string().min(2).max(100),
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(3).max(800),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please enter your name, rating (1-5), and review comment.' });

    const [created] = await db
      .insert(reviews)
      .values({
        tenantId: prod.tenantId,
        productId,
        customerName: parsed.data.customerName,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      })
      .returning();

    const allReviews = await db.select().from(reviews).where(eq(reviews.productId, productId));
    const avg = (allReviews.reduce((acc, r) => acc + r.rating, 0) / Math.max(1, allReviews.length)).toFixed(1);
    await db
      .update(products)
      .set({ rating: avg, reviewCount: allReviews.length })
      .where(eq(products.id, productId));

    res.status(201).json({ review: created, averageRating: avg, reviewCount: allReviews.length });
  } catch (error) {
    console.error('POST review failed:', error);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// ---------- ORDERS, CHECKOUT, TRACKING & INVOICING (MODULE 2, 3, 4) ----------
const createOrderSchema = z.object({
  tenantId: z.number().int(),
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(8).max(20),
  customerEmail: z.string().max(150).default(''),
  shippingAddress: z.string().min(6).max(400),
  couponCode: z.string().max(40).default(''),
  paymentMethod: z.enum(['cod', 'upi_reference']).default('cod'),
  paymentReference: z.string().max(100).default(''),
  isWholesale: z.boolean().default(false),
  notes: z.string().max(400).default(''),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().int().min(1).max(500),
        variant: z.string().max(80).default(''),
      })
    )
    .min(1),
});

app.post('/api/orders', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please complete all required checkout fields and items.' });
    }
    const { tenantId, items, couponCode, isWholesale, paymentMethod, paymentReference } = parsed.data;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return res.status(404).json({ error: 'Business store not found.' });

    const tenantProducts = await db.select().from(products).where(eq(products.tenantId, tenantId));
    const productMap = new Map(tenantProducts.map((p) => [p.id, p]));

    let subtotal = 0;
    const resolvedItems: Array<{
      productId: number;
      name: string;
      variant: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const item of items) {
      const prod = productMap.get(item.productId);
      if (!prod) {
        return res.status(400).json({ error: `Product #${item.productId} does not belong to this store.` });
      }
      if (prod.stock < item.quantity) {
        return res.status(400).json({ error: `Only ${prod.stock} units available for ${prod.name}.` });
      }
      const useWholesale = isWholesale && prod.wholesalePrice > 0 && item.quantity >= prod.minWholesaleQty;
      const unitPrice = useWholesale ? prod.wholesalePrice : prod.price;
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      resolvedItems.push({
        productId: prod.id,
        name: prod.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    let discount = 0;
    let appliedCode = '';
    if (couponCode.trim()) {
      const [foundCoupon] = await db
        .select()
        .from(coupons)
        .where(
          and(
            eq(coupons.tenantId, tenantId),
            eq(coupons.code, couponCode.trim().toUpperCase()),
            eq(coupons.active, true)
          )
        )
        .limit(1);
      if (foundCoupon && subtotal >= foundCoupon.minOrder) {
        appliedCode = foundCoupon.code;
        discount =
          foundCoupon.discountType === 'percent'
            ? Math.round((subtotal * foundCoupon.discountValue) / 100)
            : Math.min(subtotal, foundCoupon.discountValue);
      }
    }

    const deliveryFee = tenant.deliveryFee;
    const total = Math.max(0, subtotal - discount + deliveryFee);
    const orderNumber = `VV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 899)}`;
    const invoiceNumber = `INV-${tenant.logoText.toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const deliveryCommission = Math.max(35, Math.round((deliveryFee + subtotal * 0.02) * (tenant.deliveryCommissionPct / 100)));

    const [created] = await db
      .insert(orders)
      .values({
        orderNumber,
        tenantId,
        customerUserId: req.dbUser?.id ?? null,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        customerEmail: parsed.data.customerEmail || req.dbUser?.email || '',
        shippingAddress: parsed.data.shippingAddress,
        itemsJson: JSON.stringify(resolvedItems),
        subtotal,
        discount,
        deliveryFee,
        total,
        couponCode: appliedCode,
        paymentMethod,
        paymentReference,
        paymentStatus: paymentMethod === 'upi_reference' ? 'pending_verification' : 'cod_due',
        status: 'confirmed',
        deliveryCommission,
        invoiceNumber,
        isWholesale,
        notes: parsed.data.notes,
      })
      .returning();

    // Decrement stock & trigger low-stock/order confirmation logs
    for (const item of resolvedItems) {
      const prod = productMap.get(item.productId)!;
      const nextStock = Math.max(0, prod.stock - item.quantity);
      await db.update(products).set({ stock: nextStock }).where(eq(products.id, prod.id));
      if (nextStock <= prod.lowStockThreshold) {
        await db.insert(automationLogs).values({
          tenantId,
          eventType: 'low_stock_alert',
          status: 'executed',
          summary: `Low-stock alert: ${prod.name} reached ${nextStock} units after order ${orderNumber}.`,
          creditsUsed: 0,
        });
      }
    }

    await db.insert(automationLogs).values({
      tenantId,
      eventType: 'order_confirmation_invoice',
      status: 'executed',
      summary: `Order ${orderNumber} confirmed (₹${total.toLocaleString('en-IN')}) and GST invoice ${invoiceNumber} generated.`,
      creditsUsed: 0,
    });

    res.status(201).json({ order: created, tenantName: tenant.name });
  } catch (error) {
    console.error('POST /api/orders failed:', error);
    res.status(500).json({ error: 'Unable to place order right now.' });
  }
});

app.get('/api/orders/track/:orderNumber', async (req, res) => {
  try {
    const code = req.params.orderNumber.trim().toUpperCase();
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, code)).limit(1);
    if (!order) return res.status(404).json({ error: 'No order found with that tracking ID.' });
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, order.tenantId)).limit(1);
    let partner = null;
    if (order.deliveryPartnerId) {
      const found = await db.select().from(deliveryPartners).where(eq(deliveryPartners.id, order.deliveryPartnerId)).limit(1);
      partner = found[0] || null;
    }
    res.json({ order, tenantName: tenant?.name || 'Vijay Visuals Store', tenantPhone: tenant?.phone || '', deliveryPartner: partner });
  } catch (error) {
    console.error('GET track order failed:', error);
    res.status(500).json({ error: 'Unable to track order.' });
  }
});

// Customer's own orders (Module 4)
app.get('/api/customer/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;
    const rows = await db
      .select()
      .from(orders)
      .where(or(eq(orders.customerUserId, dbUser.id), eq(orders.customerEmail, dbUser.email)))
      .orderBy(desc(orders.createdAt));
    res.json({ orders: rows });
  } catch (error) {
    console.error('GET customer orders failed:', error);
    res.status(500).json({ error: 'Unable to load your orders.' });
  }
});

// Customer cancel / return request
app.patch('/api/customer/orders/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!['cancel', 'return'].includes(action)) {
      return res.status(400).json({ error: 'Invalid order action.' });
    }
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const dbUser = req.dbUser!;
    if (order.customerUserId !== dbUser.id && order.customerEmail !== dbUser.email && dbUser.role !== 'super_admin') {
      return res.status(403).json({ error: 'You can only update your own orders.' });
    }
    const nextStatus = action === 'cancel' ? 'cancelled' : 'return_requested';
    const [updated] = await db
      .update(orders)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    res.json({ order: updated });
  } catch (error) {
    console.error('PATCH customer order failed:', error);
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// ---------- BUSINESS OWNER DASHBOARD AGGREGATE (MODULE 5) ----------
app.get('/api/owner/tenants/:tenantId/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const [
      tenantProducts,
      tenantOrders,
      tenantCoupons,
      tenantPartners,
      tenantStaff,
      tenantWorkflows,
      tenantLogs,
    ] = await Promise.all([
      db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(desc(products.createdAt)),
      db.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.createdAt)),
      db.select().from(coupons).where(eq(coupons.tenantId, tenantId)).orderBy(desc(coupons.createdAt)),
      db.select().from(deliveryPartners).where(eq(deliveryPartners.tenantId, tenantId)).orderBy(desc(deliveryPartners.createdAt)),
      db.select().from(staffMembers).where(eq(staffMembers.tenantId, tenantId)).orderBy(desc(staffMembers.createdAt)),
      db.select().from(automationWorkflows).where(eq(automationWorkflows.tenantId, tenantId)).orderBy(desc(automationWorkflows.createdAt)),
      db.select().from(automationLogs).where(eq(automationLogs.tenantId, tenantId)).orderBy(desc(automationLogs.createdAt)).limit(40),
    ]);

    const totalRevenue = tenantOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + o.total, 0);
    const lowStockProducts = tenantProducts.filter((p) => p.stock <= p.lowStockThreshold);

    res.json({
      tenant: access.tenant,
      stats: {
        totalRevenue,
        orderCount: tenantOrders.length,
        productCount: tenantProducts.length,
        lowStockCount: lowStockProducts.length,
        activeDeliveries: tenantOrders.filter((o) => o.status === 'out_for_delivery' || o.status === 'ready_for_pickup').length,
      },
      products: tenantProducts,
      orders: tenantOrders,
      coupons: tenantCoupons,
      deliveryPartners: tenantPartners,
      staff: tenantStaff,
      workflows: tenantWorkflows,
      logs: tenantLogs,
    });
  } catch (error) {
    console.error('GET owner overview failed:', error);
    res.status(500).json({ error: 'Unable to load business dashboard.' });
  }
});

// Owner updates order status, payment verification, or assigns delivery partner
app.patch('/api/owner/orders/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Order not found.' });
    const access = await assertTenantAccess(req, existing.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const body = req.body || {};
    const updateObj: Partial<typeof orders.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.status === 'string') updateObj.status = body.status;
    if (typeof body.paymentStatus === 'string') updateObj.paymentStatus = body.paymentStatus;
    if (body.deliveryPartnerId !== undefined) {
      updateObj.deliveryPartnerId = body.deliveryPartnerId ? Number(body.deliveryPartnerId) : null;
    }

    const [updated] = await db.update(orders).set(updateObj).where(eq(orders.id, id)).returning();

    // Credit delivery partner if marked delivered
    if (updated.status === 'delivered' && existing.status !== 'delivered' && updated.deliveryPartnerId) {
      await db
        .update(deliveryPartners)
        .set({
          totalDeliveries: sql`${deliveryPartners.totalDeliveries} + 1`,
          totalEarnings: sql`${deliveryPartners.totalEarnings} + ${updated.deliveryCommission}`,
        })
        .where(eq(deliveryPartners.id, updated.deliveryPartnerId));
    }

    await db.insert(automationLogs).values({
      tenantId: existing.tenantId,
      eventType: 'order_status_notification',
      status: 'executed',
      summary: `Order ${updated.orderNumber} moved to "${updated.status}" (Payment: ${updated.paymentStatus}).`,
      creditsUsed: 0,
    });

    res.json({ order: updated });
  } catch (error) {
    console.error('PATCH owner order failed:', error);
    res.status(500).json({ error: 'Unable to update order.' });
  }
});

app.post('/api/tenants/:tenantId/staff', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const schema = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      staffRole: z.enum(['store_manager', 'inventory_clerk', 'support_agent']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid staff member fields.' });
    const [created] = await db
      .insert(staffMembers)
      .values({ ...parsed.data, email: parsed.data.email.toLowerCase(), tenantId })
      .returning();
    res.status(201).json({ staff: created });
  } catch (error) {
    console.error('POST staff failed:', error);
    res.status(500).json({ error: 'Failed to add staff member.' });
  }
});

// ---------- DELIVERY MANAGEMENT (MODULE 3) ----------
app.post('/api/tenants/:tenantId/delivery-partners', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const schema = z.object({
      name: z.string().min(2).max(100),
      phone: z.string().min(8).max(25),
      vehicleType: z.string().min(2).max(60).default('Two-Wheeler'),
      linkCurrentUser: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid delivery partner details.' });

    // Either tenant owner adds a rider OR authenticated user registers as delivery partner for that store
    const [created] = await db
      .insert(deliveryPartners)
      .values({
        tenantId,
        userId: parsed.data.linkCurrentUser ? req.dbUser!.id : null,
        name: parsed.data.name,
        phone: parsed.data.phone,
        vehicleType: parsed.data.vehicleType,
        available: true,
      })
      .returning();

    if (parsed.data.linkCurrentUser && req.dbUser!.role === 'customer') {
      await db.update(users).set({ role: 'delivery_partner' }).where(eq(users.id, req.dbUser!.id));
    }

    res.status(201).json({ partner: created });
  } catch (error) {
    console.error('POST delivery partner failed:', error);
    res.status(500).json({ error: 'Failed to register delivery partner.' });
  }
});

app.get('/api/delivery/portal', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;
    const allPartners =
      dbUser.role === 'super_admin'
        ? await db.select().from(deliveryPartners).orderBy(desc(deliveryPartners.createdAt))
        : await db
            .select()
            .from(deliveryPartners)
            .where(or(eq(deliveryPartners.userId, dbUser.id), eq(deliveryPartners.phone, dbUser.phone || '__none__')));

    const partnerIds = allPartners.map((p) => p.id);
    const assignedOrders =
      partnerIds.length > 0
        ? (await db.select().from(orders).orderBy(desc(orders.createdAt))).filter(
            (o) => o.deliveryPartnerId && partnerIds.includes(o.deliveryPartnerId)
          )
        : [];

    res.json({ partners: allPartners, assignedOrders });
  } catch (error) {
    console.error('GET delivery portal failed:', error);
    res.status(500).json({ error: 'Unable to load delivery portal.' });
  }
});

app.patch('/api/delivery/partners/:id/availability', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const available = Boolean(req.body?.available);
    const [updated] = await db
      .update(deliveryPartners)
      .set({ available })
      .where(eq(deliveryPartners.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Delivery partner not found.' });
    res.json({ partner: updated });
  } catch (error) {
    console.error('PATCH delivery availability failed:', error);
    res.status(500).json({ error: 'Unable to update availability.' });
  }
});

app.patch('/api/delivery/orders/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!['ready_for_pickup', 'out_for_delivery', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid delivery status.' });
    }
    const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Order not found.' });

    const [updated] = await db
      .update(orders)
      .set({
        status,
        ...(status === 'delivered' && existing.paymentMethod === 'cod' ? { paymentStatus: 'paid' } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))
      .returning();

    if (status === 'delivered' && existing.status !== 'delivered' && existing.deliveryPartnerId) {
      await db
        .update(deliveryPartners)
        .set({
          totalDeliveries: sql`${deliveryPartners.totalDeliveries} + 1`,
          totalEarnings: sql`${deliveryPartners.totalEarnings} + ${existing.deliveryCommission}`,
        })
        .where(eq(deliveryPartners.id, existing.deliveryPartnerId));
    }

    await db.insert(automationLogs).values({
      tenantId: existing.tenantId,
      eventType: 'delivery_notification',
      status: 'executed',
      summary: `Delivery update for ${existing.orderNumber}: status changed to ${status}.`,
      creditsUsed: 0,
    });

    res.json({ order: updated });
  } catch (error) {
    console.error('PATCH delivery status failed:', error);
    res.status(500).json({ error: 'Failed to update delivery status.' });
  }
});

// ---------- SUPPORT TICKETS & CONTACT INQUIRIES (MODULE 4, 6) ----------
app.post('/api/tickets', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      tenantId: z.number().int().nullable().optional(),
      customerName: z.string().min(2).max(120),
      customerEmail: z.string().email(),
      customerPhone: z.string().max(30).default(''),
      subject: z.string().min(3).max(160),
      message: z.string().min(5).max(2000),
      category: z.enum(['order_issue', 'refund', 'platform_support', 'project_inquiry']).default('project_inquiry'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please complete all support ticket fields.' });

    const [created] = await db
      .insert(supportTickets)
      .values({
        tenantId: parsed.data.tenantId ?? null,
        userId: req.dbUser?.id ?? null,
        customerName: parsed.data.customerName,
        customerEmail: parsed.data.customerEmail,
        customerPhone: parsed.data.customerPhone,
        subject: parsed.data.subject,
        message: parsed.data.message,
        category: parsed.data.category,
      })
      .returning();
    res.status(201).json({ ticket: created });
  } catch (error) {
    console.error('POST ticket failed:', error);
    res.status(500).json({ error: 'Unable to submit support request.' });
  }
});

app.get('/api/customer/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const dbUser = req.dbUser!;
    const rows = await db
      .select()
      .from(supportTickets)
      .where(or(eq(supportTickets.userId, dbUser.id), eq(supportTickets.customerEmail, dbUser.email)))
      .orderBy(desc(supportTickets.createdAt));
    res.json({ tickets: rows });
  } catch (error) {
    console.error('GET customer tickets failed:', error);
    res.status(500).json({ error: 'Failed to load support tickets.' });
  }
});

// ---------- AI AUTOMATION CENTER (MODULE 7 — REAL SERVER-SIDE GEMINI API) ----------
async function consumeAiCredit(tenantId: number, credits = 1) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, error: 'Business not found.' };
  if (tenant.aiCreditsUsed + credits > tenant.aiCreditsLimit) {
    return {
      ok: false as const,
      error: `AI credit limit reached (${tenant.aiCreditsUsed}/${tenant.aiCreditsLimit}). Upgrade AI credits or request Super Admin quota expansion.`,
    };
  }
  await db
    .update(tenants)
    .set({ aiCreditsUsed: tenant.aiCreditsUsed + credits, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
  return { ok: true as const, tenant };
}

// 1. Storefront AI Customer Support Chatbot (grounded in real catalog from PostgreSQL)
app.post('/api/ai/support-chat', async (req, res) => {
  try {
    const schema = z.object({
      tenantSlug: z.string().min(1),
      message: z.string().min(1).max(800),
      language: z.enum(['en', 'te']).default('en'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Message and store slug are required.' });

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, parsed.data.tenantSlug)).limit(1);
    if (!tenant) return res.status(404).json({ error: 'Store not found.' });

    const quota = await consumeAiCredit(tenant.id, 1);
    if (!quota.ok) return res.status(402).json({ error: quota.error });

    const catalog = await db.select().from(products).where(eq(products.tenantId, tenant.id));
    const catalogSummary = catalog
      .map((p) => `- ${p.name} (${p.category}): ₹${p.price}, Wholesale ₹${p.wholesalePrice || 'N/A'} (min ${p.minWholesaleQty}), Stock: ${p.stock}`)
      .join('\n');

    const reply = await generateAiText({
      systemInstruction: `You are the official AI Customer Support Concierge for "${tenant.name}" (${tenant.category}).
Respond concisely, warmly, and accurately in ${parsed.data.language === 'te' ? 'simple Telugu (తెలుగు) with English product names where helpful' : 'clear English'}.
Store info: ${tenant.tagline}. Address: ${tenant.address}. Phone: ${tenant.phone}. Delivery fee: ₹${tenant.deliveryFee}. COD enabled: ${tenant.codEnabled ? 'Yes' : 'No'}.
Current live catalog:\n${catalogSummary || 'No products listed yet.'}
Never invent products or prices not in the catalog.`,
      prompt: parsed.data.message,
    });

    await db.insert(automationLogs).values({
      tenantId: tenant.id,
      eventType: 'ai_support_chat',
      status: 'executed',
      summary: `Customer asked: "${parsed.data.message.slice(0, 80)}"`,
      creditsUsed: 1,
    });

    res.json({ reply });
  } catch (error: unknown) {
    console.error('POST /api/ai/support-chat failed:', error);
    const msg = error instanceof Error ? error.message : 'AI support service unavailable.';
    res.status(502).json({ error: msg });
  }
});

// 2. AI Product Description, Marketing Captions, Promo Campaign, Sales Forecast & Business Advisor
app.post('/api/ai/generate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      tenantId: z.number().int(),
      task: z.enum(['product_description', 'marketing_campaign', 'sales_forecast', 'business_assistant']),
      input: z.string().min(2).max(1500),
      language: z.enum(['en', 'te']).default('en'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid AI automation request.' });

    const access = await assertTenantAccess(req, parsed.data.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const quota = await consumeAiCredit(parsed.data.tenantId, 2);
    if (!quota.ok) return res.status(402).json({ error: quota.error });

    const [tenantProducts, tenantOrders] = await Promise.all([
      db.select().from(products).where(eq(products.tenantId, parsed.data.tenantId)),
      db.select().from(orders).where(eq(orders.tenantId, parsed.data.tenantId)),
    ]);

    const metricsContext = `Business: ${access.tenant.name} (${access.tenant.category})
Products (${tenantProducts.length}): ${tenantProducts.map((p) => `${p.name} ₹${p.price} (stock ${p.stock})`).join('; ')}
Orders (${tenantOrders.length}): Total revenue ₹${tenantOrders.filter((o) => o.status !== 'cancelled').reduce((a, b) => a + b.total, 0)}.`;

    const langDirective =
      parsed.data.language === 'te'
        ? 'Write the output in clear, natural Telugu (తెలుగు) suitable for Indian customers and business owners.'
        : 'Write the output in crisp, persuasive English tailored for Indian commerce.';

    const promptsByTask: Record<string, string> = {
      product_description: `Generate a high-converting e-commerce product description, 4 bullet highlights, and SEO keywords for: ${parsed.data.input}`,
      marketing_campaign: `Create a promotional campaign brief, 3 Instagram/WhatsApp captions, and a discount offer idea for: ${parsed.data.input}`,
      sales_forecast: `Analyze this store's real inventory and order snapshot and produce a grounded 30-day sales forecast, restock priorities, and pricing suggestions. Context:\n${metricsContext}\nOwner question: ${parsed.data.input}`,
      business_assistant: `Act as Vijay Visuals AI Business Advisor. Give concrete, practical operational advice based on this store's live data.\n${metricsContext}\nOwner question: ${parsed.data.input}`,
    };

    const output = await generateAiText({
      systemInstruction: `You are Vijay Visuals AI Automation Engine. ${langDirective} Be concrete, structured, and never fabricate metrics that contradict the provided store data.`,
      prompt: promptsByTask[parsed.data.task],
    });

    await db.insert(automationLogs).values({
      tenantId: parsed.data.tenantId,
      eventType: `ai_${parsed.data.task}`,
      status: 'executed',
      summary: `Generated ${parsed.data.task.replace('_', ' ')} (${parsed.data.language.toUpperCase()}).`,
      creditsUsed: 2,
    });

    res.json({ output, creditsUsed: 2 });
  } catch (error: unknown) {
    console.error('POST /api/ai/generate failed:', error);
    const msg = error instanceof Error ? error.message : 'AI generation failed.';
    res.status(502).json({ error: msg });
  }
});

// 3. Automation Workflows (Trigger / Condition / Action / Schedule / Approval Gate)
app.post('/api/tenants/:tenantId/workflows', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const access = await assertTenantAccess(req, tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const schema = z.object({
      name: z.string().min(2).max(120),
      triggerType: z.enum(['order_created', 'order_status_changed', 'low_stock', 'abandoned_cart', 'scheduled_daily', 'customer_followup']),
      conditionText: z.string().min(2).max(200),
      actionType: z.enum(['generate_invoice', 'low_stock_alert', 'whatsapp_template', 'email_notification', 'ai_campaign']),
      requiresApproval: z.boolean().default(false),
      scheduleCron: z.string().max(60).default('On Event'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid workflow configuration.' });

    const [created] = await db
      .insert(automationWorkflows)
      .values({ ...parsed.data, tenantId })
      .returning();
    res.status(201).json({ workflow: created });
  } catch (error) {
    console.error('POST workflow failed:', error);
    res.status(500).json({ error: 'Unable to save workflow.' });
  }
});

app.post('/api/workflows/:id/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [wf] = await db.select().from(automationWorkflows).where(eq(automationWorkflows.id, id)).limit(1);
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });
    const access = await assertTenantAccess(req, wf.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    await db.update(automationWorkflows).set({ lastRunAt: new Date() }).where(eq(automationWorkflows.id, id));

    const status = wf.requiresApproval ? 'awaiting_approval' : 'executed';
    const summary = wf.requiresApproval
      ? `Workflow "${wf.name}" queued for manual owner approval before executing ${wf.actionType}.`
      : `Workflow "${wf.name}" executed action "${wf.actionType}" on trigger "${wf.triggerType}".`;

    const [log] = await db
      .insert(automationLogs)
      .values({
        tenantId: wf.tenantId,
        workflowId: wf.id,
        eventType: wf.actionType,
        status,
        summary,
        creditsUsed: 1,
      })
      .returning();
    res.json({ log });
  } catch (error) {
    console.error('POST workflow run failed:', error);
    res.status(500).json({ error: 'Failed to trigger workflow.' });
  }
});

app.patch('/api/workflows/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [wf] = await db.select().from(automationWorkflows).where(eq(automationWorkflows.id, id)).limit(1);
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });
    const access = await assertTenantAccess(req, wf.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !wf.enabled;
    const [updated] = await db
      .update(automationWorkflows)
      .set({ enabled })
      .where(eq(automationWorkflows.id, id))
      .returning();
    res.json({ workflow: updated });
  } catch (error) {
    console.error('PATCH workflow failed:', error);
    res.status(500).json({ error: 'Failed to update workflow.' });
  }
});

app.patch('/api/automation-logs/:id/decision', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    }
    const [log] = await db.select().from(automationLogs).where(eq(automationLogs.id, id)).limit(1);
    if (!log) return res.status(404).json({ error: 'Automation log not found.' });
    const access = await assertTenantAccess(req, log.tenantId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const [updated] = await db
      .update(automationLogs)
      .set({
        status: decision,
        summary: `${log.summary} [${decision.toUpperCase()} by ${req.dbUser!.email}]`,
      })
      .where(eq(automationLogs.id, id))
      .returning();
    res.json({ log: updated });
  } catch (error) {
    console.error('PATCH log decision failed:', error);
    res.status(500).json({ error: 'Failed to record approval decision.' });
  }
});

// ---------- SUPER ADMIN DASHBOARD (MODULE 6) ----------
app.get('/api/admin/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.dbUser!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required.' });
    }
    const [allTenants, allUsers, allOrders, allTickets, allPlans, recentAudits, allProposals, allDomains, allSubscribers] = await Promise.all([
      db.select().from(tenants).orderBy(desc(tenants.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(50),
      db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(50),
      db.select().from(platformPlans).orderBy(platformPlans.id),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(40),
      db.select().from(proposals).orderBy(desc(proposals.createdAt)).limit(50),
      db.select().from(tenantDomains).orderBy(desc(tenantDomains.createdAt)).limit(50),
      db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt)).limit(50),
    ]);

    const gmv = allOrders.filter((o) => o.status !== 'cancelled').reduce((a, b) => a + b.total, 0);
    const totalAiUsed = allTenants.reduce((a, b) => a + b.aiCreditsUsed, 0);
    const publishedTenantsCount = allTenants.filter((t) => t.published).length;
    const verifiedDomainsCount = allDomains.filter((d) => d.dnsStatus === 'verified').length;

    res.json({
      stats: {
        tenantCount: allTenants.length,
        publishedTenantsCount,
        draftTenantsCount: allTenants.length - publishedTenantsCount,
        userCount: allUsers.length,
        orderCount: allOrders.length,
        gmv,
        pwaEnabledCount: allTenants.filter((t) => t.pwaEnabled).length,
        totalAiUsed,
        proposalsCount: allProposals.length,
        acceptedProposalsCount: allProposals.filter((p) => p.status === 'accepted' || p.status === 'converted').length,
        domainsCount: allDomains.length,
        verifiedDomainsCount,
        newsletterCount: allSubscribers.length,
      },
      tenants: allTenants,
      users: allUsers,
      orders: allOrders,
      tickets: allTickets,
      plans: allPlans,
      audits: recentAudits,
      proposals: allProposals,
      domains: allDomains,
    });
  } catch (error) {
    console.error('GET /api/admin/overview failed:', error);
    res.status(500).json({ error: 'Failed to load Super Admin console.' });
  }
});

app.patch('/api/admin/users/:id/role', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.dbUser!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required.' });
    }
    const id = Number(req.params.id);
    const role = String(req.body?.role || '');
    if (!['super_admin', 'business_owner', 'staff', 'delivery_partner', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }
    const [updated] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    await writeAuditLog(req.dbUser!.email, req.dbUser!.role, 'USER_ROLE_CHANGED', `Changed ${updated.email} role to ${role}`);
    res.json({ user: updated });
  } catch (error) {
    console.error('PATCH admin user role failed:', error);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

app.patch('/api/admin/tickets/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.dbUser!.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super Admin access required.' });
    }
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!['open', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid ticket status.' });
    }
    const [updated] = await db.update(supportTickets).set({ status }).where(eq(supportTickets.id, id)).returning();
    res.json({ ticket: updated });
  } catch (error) {
    console.error('PATCH admin ticket failed:', error);
    res.status(500).json({ error: 'Failed to update ticket status.' });
  }
});

// Mount Phase 2 Global AI Business Ecosystem Routes (Razorpay, Route, CRM, Finance, Bookings, HR, Plugins, Setup AI)
app.use(createEcosystemRouter());
// Mount Stage 3 Growth Platform Routes (Domains & Live DNS, SEO Score & AI, Sitemap/Robots, Draft Versions, Proposals, Newsletter)
app.use(createGrowthRouter());
// Mount Stage 4 Business Operating System Routes (12-Step Onboarding, Daily Command Center, Inventory POs, Staff Tasks, Grounded AI Assistant, Full Backup Verify, Help Centre & Feedback)
app.use(createBusinessOsRouter());
// Mount Stage 5 Google Maps Multi-Branch Locations, Secure Geocoding Proxy & Battery-Efficient Delivery Tracking
app.use(createLocationsRouter());
// Mount Stage 6 Complete Domain Management System (DNS/SSL/Health/Renewals/Multi-Tenant Resolver/Super Admin Console)
app.use(createDomainsRouter());

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ---------- SERVER STARTUP (VITE DEV MIDDLEWARE OR STATIC PROD) ----------
async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    // Disable Vite WebSocket & HMR cleanly inside proxied preview environments (AI Studio / Cloud Run)
    // or attach directly to the same httpServer on localhost so Vite never opens a broken port 24678 WS.
    const disableHmr = process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL);
    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}
`);
      });
    }
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: disableHmr ? false : undefined,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Vijay Visuals platform server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
