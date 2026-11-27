import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  auditLogs,
  crmLeads,
  newsletterSubscribers,
  orders,
  platformPlans,
  products,
  proposals,
  staffMembers,
  tenantDomains,
  tenants,
  tenantSeoSettings,
  tenantVersions,
} from '../db/schema.ts';
import { generateAiText } from '../lib/gemini.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import {
  buildRobotsTxt,
  buildSitemapXml,
  OFFICIAL_SITE_URL,
  safeLastmod,
  STOREFRONT_ROUTE_PREFIX,
} from '../../shared/seo';

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers.host || 'vijay-visuals-site.pages.dev';
  return `${proto}://${host}`;
}

async function assertTenantOwnerOrStaff(req: AuthRequest, tenantId: number) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false as const, status: 404, error: 'Business not found.' };
  const dbUser = req.dbUser;
  if (!dbUser) return { ok: false as const, status: 401, error: 'Authentication required.' };
  if (dbUser.role === 'super_admin' || tenant.ownerUserId === dbUser.id) {
    return { ok: true as const, tenant };
  }
  const [staff] = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.email, dbUser.email), eq(staffMembers.active, true)))
    .limit(1);
  // Growth workflows are available to store managers and support agents.
  // Inventory clerks and unknown legacy roles are denied.
  if (staff && (staff.staffRole === 'store_manager' || staff.staffRole === 'support_agent')) {
    return { ok: true as const, tenant, staffRole: staff.staffRole };
  }
  return { ok: false as const, status: 403, error: 'Forbidden: you do not have access to this business tenant.' };
}

async function logAudit(actorEmail: string, actorRole: string, action: string, details: string, tenantId?: number | null) {
  try {
    await db.insert(auditLogs).values({
      actorEmail,
      actorRole,
      tenantId: tenantId ?? null,
      action,
      details,
    });
  } catch (err) {
    console.error('Growth audit log error:', err);
  }
}

export interface SeoChecklistItem {
  id: string;
  label: string;
  category: 'technical' | 'on_page' | 'local' | 'analytics';
  passed: boolean;
  weight: number;
  recommendation: string;
}

function computeTenantSeoAudit(
  tenant: typeof tenants.$inferSelect,
  tenantProducts: Array<typeof products.$inferSelect>,
  seo: typeof tenantSeoSettings.$inferSelect | null,
  domains: Array<typeof tenantDomains.$inferSelect>
) {
  const titleStr = `${tenant.name} — ${tenant.tagline}`.trim();
  const titleOptimal = titleStr.length >= 20 && titleStr.length <= 75;
  const descOptimal = (tenant.description || '').trim().length >= 60 && (tenant.description || '').trim().length <= 220;
  const activeProducts = tenantProducts.filter((p) => p.active);
  const productsWithGoodDesc = activeProducts.filter((p) => (p.description || '').trim().length >= 30);
  const productsWithImages = activeProducts.filter((p) => Boolean(p.imageUrl && p.imageUrl.trim().length > 5));

  const nameCounts = new Map<string, number>();
  for (const p of activeProducts) {
    const key = p.name.trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const duplicateProductNames = Array.from(nameCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  const hasNap = Boolean(tenant.name && tenant.address && tenant.address.trim().length >= 8 && tenant.phone);
  const hasCityKeywords = Boolean(seo?.cityAreaKeywords && seo.cityAreaKeywords.trim().length >= 3);
  const hasMapsOrGbp = Boolean(seo?.googleMapsUrl || seo?.gbpProfileUrl);
  const hasVerifiedDomain = domains.some((d) => d.dnsStatus === 'verified');
  const hasGa4OrGsc = Boolean(seo?.ga4MeasurementId || seo?.googleSiteVerification);

  const checklist: SeoChecklistItem[] = [
    {
      id: 'published_sitemap',
      label: 'Website Published & Included in /sitemap.xml',
      category: 'technical',
      passed: Boolean(tenant.published),
      weight: 15,
      recommendation: tenant.published
        ? 'Your storefront is published and automatically listed in /sitemap.xml.'
        : 'Publish your storefront so search engines can discover it via /sitemap.xml.',
    },
    {
      id: 'title_length',
      label: 'SEO Page Title & Tagline Length (20–75 chars)',
      category: 'on_page',
      passed: titleOptimal,
      weight: 12,
      recommendation: titleOptimal
        ? `Title length is optimal (${titleStr.length} chars).`
        : `Current title is ${titleStr.length} chars. Aim for 20–75 chars with business name + key service.`,
    },
    {
      id: 'meta_description',
      label: 'Original Meta Description (60–220 chars)',
      category: 'on_page',
      passed: descOptimal,
      weight: 12,
      recommendation: descOptimal
        ? `Meta description length looks clear (${tenant.description.trim().length} chars).`
        : 'Write a clear, original 60–220 character summary of your business and offerings.',
    },
    {
      id: 'catalog_copy',
      label: 'Product / Service Descriptions & Media Alt Readiness',
      category: 'on_page',
      passed: activeProducts.length > 0 && productsWithGoodDesc.length === activeProducts.length && productsWithImages.length === activeProducts.length,
      weight: 15,
      recommendation:
        activeProducts.length === 0
          ? 'Add at least one active product or service with an original description and image.'
          : productsWithGoodDesc.length < activeProducts.length || productsWithImages.length < activeProducts.length
            ? `${activeProducts.length - productsWithGoodDesc.length} item(s) have short descriptions and ${activeProducts.length - productsWithImages.length} lack images.`
            : 'All active catalog items have descriptions and images ready for rich Product schema.',
    },
    {
      id: 'no_duplicates',
      label: 'No Duplicate Product Titles Detected',
      category: 'on_page',
      passed: duplicateProductNames.length === 0,
      weight: 8,
      recommendation:
        duplicateProductNames.length === 0
          ? 'Zero duplicate product titles found.'
          : `Rename duplicate product titles: ${duplicateProductNames.join(', ')}.`,
    },
    {
      id: 'local_nap',
      label: 'Local SEO NAP (Business Name, Address & Phone)',
      category: 'local',
      passed: hasNap,
      weight: 12,
      recommendation: hasNap
        ? 'Name, Address, and Phone are present and injected into LocalBusiness JSON-LD.'
        : 'Complete your physical address and phone number so LocalBusiness schema is accurate.',
    },
    {
      id: 'local_city_maps',
      label: 'City / Area Keywords & Google Maps / Business Profile',
      category: 'local',
      passed: hasCityKeywords && hasMapsOrGbp,
      weight: 10,
      recommendation:
        hasCityKeywords && hasMapsOrGbp
          ? 'City/area keywords and Google Maps / GBP link are configured.'
          : 'Add your target city/neighborhood keywords and Google Maps or Google Business Profile link.',
    },
    {
      id: 'custom_domain_https',
      label: 'Custom Domain DNS Verified & Canonical URL Ready',
      category: 'technical',
      passed: hasVerifiedDomain || Boolean(seo?.canonicalUrl),
      weight: 8,
      recommendation: hasVerifiedDomain
        ? 'Verified custom domain connected.'
        : 'Connect and verify your own business domain (.com / .in / .co.in) or set a canonical URL.',
    },
    {
      id: 'google_tools',
      label: 'GA4 Measurement ID / Google Search Console Verification Tag',
      category: 'analytics',
      passed: hasGa4OrGsc,
      weight: 8,
      recommendation: hasGa4OrGsc
        ? 'Google measurement/verification tag configured on your storefront.'
        : 'Add your GA4 Measurement ID (G-XXXXXXXXXX) and Google Search Console HTML verification code.',
    },
  ];

  const score = checklist.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);

  return {
    score,
    checklist,
    duplicateProductNames,
    honestDisclosure:
      'Ethical SEO Notice: Vijay Visuals provides clean technical SEO, structured data, sitemaps, and on-page guidance. No platform can guarantee #1 or first-page Google rankings — real search visibility depends on competition, original content quality, site reputation, backlinks, and genuine customer reviews.',
  };
}

export function createGrowthRouter() {
  const router = express.Router();

  // =========================================================================
  // MODULE 4: TECHNICAL SEO — DYNAMIC /robots.txt AND /sitemap.xml
  // =========================================================================
  router.get('/robots.txt', (_req: Request, res: Response) => {
    res.type('text/plain').send(buildRobotsTxt(OFFICIAL_SITE_URL));
  });

  router.get('/sitemap.xml', async (_req: Request, res: Response) => {
    try {
      const publishedTenants = await db.select().from(tenants).where(eq(tenants.published, true));
      const entries = [
        { loc: `${OFFICIAL_SITE_URL}/`, priority: '1.0', withHreflang: true },
        ...publishedTenants.map((tenant) => ({
          loc: `${OFFICIAL_SITE_URL}${STOREFRONT_ROUTE_PREFIX}${encodeURIComponent(tenant.slug)}`,
          lastmod: safeLastmod(tenant.createdAt),
          priority: '0.8',
        })),
      ];
      res.type('application/xml').send(buildSitemapXml(entries));
    } catch (error) {
      console.error('GET /sitemap.xml failed:', error);
      res.status(500).type('text/plain').send('Failed to generate sitemap.');
    }
  });

  // Domain Management routes are mounted via createDomainsRouter() in src/routes/domains.ts

  // =========================================================================
  // MODULE 2: DRAFT SNAPSHOTS, VERSION RESTORE & PUBLISH/UNPUBLISH
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/versions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const rows = await db
        .select()
        .from(tenantVersions)
        .where(eq(tenantVersions.tenantId, tenantId))
        .orderBy(desc(tenantVersions.versionNumber));
      res.json({ versions: rows, published: check.tenant.published });
    } catch (error) {
      console.error('GET tenant versions failed:', error);
      res.status(500).json({ error: 'Failed to load website version history.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/versions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const label = String(req.body?.label || 'Saved Website Draft').slice(0, 80);
      const [seo] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1);
      const existing = await db
        .select({ versionNumber: tenantVersions.versionNumber })
        .from(tenantVersions)
        .where(eq(tenantVersions.tenantId, tenantId))
        .orderBy(desc(tenantVersions.versionNumber))
        .limit(1);
      const nextVersion = (existing[0]?.versionNumber || 0) + 1;

      const snapshot = {
        name: check.tenant.name,
        category: check.tenant.category,
        templateId: check.tenant.templateId,
        tagline: check.tenant.tagline,
        description: check.tenant.description,
        logoText: check.tenant.logoText,
        bannerImage: check.tenant.bannerImage,
        primaryColor: check.tenant.primaryColor,
        accentColor: check.tenant.accentColor,
        fontFamily: check.tenant.fontFamily,
        phone: check.tenant.phone,
        whatsapp: check.tenant.whatsapp,
        address: check.tenant.address,
        sectionOrderJson: seo?.sectionOrderJson || '["hero","catalog","reviews","booking","contact"]',
        customPagesJson: seo?.customPagesJson || '[]',
      };

      const [created] = await db
        .insert(tenantVersions)
        .values({
          tenantId,
          versionNumber: nextVersion,
          label,
          snapshotJson: JSON.stringify(snapshot),
          isPublished: check.tenant.published,
          createdBy: req.dbUser!.email,
        })
        .returning();

      await logAudit(req.dbUser!.email, req.dbUser!.role, 'VERSION_SAVED', `Saved v${nextVersion} (${label})`, tenantId);
      res.status(201).json({ version: created });
    } catch (error) {
      console.error('POST tenant version failed:', error);
      res.status(500).json({ error: 'Failed to save draft version.' });
    }
  });

  router.post('/api/owner/tenants/:tenantId/versions/:versionId/restore', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const versionId = Number(req.params.versionId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const [ver] = await db
        .select()
        .from(tenantVersions)
        .where(and(eq(tenantVersions.id, versionId), eq(tenantVersions.tenantId, tenantId)))
        .limit(1);
      if (!ver) return res.status(404).json({ error: 'Version snapshot not found.' });

      const snap = JSON.parse(ver.snapshotJson || '{}');
      const [restoredTenant] = await db
        .update(tenants)
        .set({
          name: snap.name || check.tenant.name,
          category: snap.category || check.tenant.category,
          templateId: snap.templateId || check.tenant.templateId,
          tagline: snap.tagline ?? check.tenant.tagline,
          description: snap.description ?? check.tenant.description,
          logoText: snap.logoText || check.tenant.logoText,
          bannerImage: snap.bannerImage ?? check.tenant.bannerImage,
          primaryColor: snap.primaryColor || check.tenant.primaryColor,
          accentColor: snap.accentColor || check.tenant.accentColor,
          fontFamily: snap.fontFamily || check.tenant.fontFamily,
          phone: snap.phone ?? check.tenant.phone,
          whatsapp: snap.whatsapp ?? check.tenant.whatsapp,
          address: snap.address ?? check.tenant.address,
        })
        .where(eq(tenants.id, tenantId))
        .returning();

      if (snap.sectionOrderJson || snap.customPagesJson) {
        const [existingSeo] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1);
        if (existingSeo) {
          await db
            .update(tenantSeoSettings)
            .set({
              sectionOrderJson: snap.sectionOrderJson || existingSeo.sectionOrderJson,
              customPagesJson: snap.customPagesJson || existingSeo.customPagesJson,
              updatedAt: new Date(),
            })
            .where(eq(tenantSeoSettings.tenantId, tenantId));
        } else {
          await db.insert(tenantSeoSettings).values({
            tenantId,
            sectionOrderJson: snap.sectionOrderJson || '["hero","catalog","reviews","booking","contact"]',
            customPagesJson: snap.customPagesJson || '[]',
          });
        }
      }

      await logAudit(req.dbUser!.email, req.dbUser!.role, 'VERSION_RESTORED', `Restored v${ver.versionNumber} (${ver.label})`, tenantId);
      res.json({ tenant: restoredTenant, restoredVersion: ver.versionNumber });
    } catch (error) {
      console.error('POST restore version failed:', error);
      res.status(500).json({ error: 'Failed to restore website version.' });
    }
  });

  router.patch('/api/owner/tenants/:tenantId/publish', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const published = Boolean(req.body?.published);
      const [updated] = await db.update(tenants).set({ published }).where(eq(tenants.id, tenantId)).returning();
      await logAudit(
        req.dbUser!.email,
        req.dbUser!.role,
        published ? 'SITE_PUBLISHED' : 'SITE_UNPUBLISHED',
        `${updated.name} set to ${published ? 'Published' : 'Draft / Unpublished'}`,
        tenantId
      );
      res.json({ tenant: updated });
    } catch (error) {
      console.error('PATCH publish toggle failed:', error);
      res.status(500).json({ error: 'Failed to update publish status.' });
    }
  });

  // =========================================================================
  // MODULE 4: GOOGLE SEO & SEARCH VISIBILITY + LOCAL SEO + AI SEO ASSISTANT
  // =========================================================================
  router.get('/api/public/tenants/:slug/seo', async (req: Request, res: Response) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.slug, req.params.slug), eq(tenants.published, true)))
        .limit(1);
      if (!tenant) return res.status(404).json({ error: 'Published storefront not found.' });

      const [seo] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenant.id)).limit(1);
      res.json({
        seo: seo || {
          canonicalUrl: '',
          robotsDirectives: 'index, follow',
          googleSiteVerification: '',
          ga4MeasurementId: '',
          cityAreaKeywords: '',
          googleMapsUrl: '',
          gbpProfileUrl: '',
          localBusinessType: 'LocalBusiness',
          sectionOrderJson: '["hero","catalog","reviews","booking","contact"]',
          customPagesJson:
            '[{"slug":"about","title":"About Us","content":"Welcome to our official business storefront.","inNav":true},{"slug":"shipping-returns","title":"Shipping & Returns","content":"Transparent delivery timelines and customer-friendly return guidelines.","inNav":true}]',
          lastAuditScore: 0,
        },
      });
    } catch (error) {
      console.error('GET public tenant SEO failed:', error);
      res.status(500).json({ error: 'Failed to load storefront SEO settings.' });
    }
  });

  router.get('/api/owner/tenants/:tenantId/seo', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      let [seo] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1);
      if (!seo) {
        [seo] = await db
          .insert(tenantSeoSettings)
          .values({
            tenantId,
            canonicalUrl: `${getBaseUrl(req)}/site/${check.tenant.slug}`,
          })
          .returning();
      }

      const [tenantProducts, domains] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
      ]);

      const audit = computeTenantSeoAudit(check.tenant, tenantProducts, seo, domains);
      if (audit.score !== seo.lastAuditScore) {
        await db.update(tenantSeoSettings).set({ lastAuditScore: audit.score }).where(eq(tenantSeoSettings.id, seo.id));
      }

      res.json({
        seo: { ...seo, lastAuditScore: audit.score },
        audit,
        sitemapUrl: `${getBaseUrl(req)}/sitemap.xml`,
        robotsUrl: `${getBaseUrl(req)}/robots.txt`,
        gscApiConfigured: Boolean(process.env.GSC_OAUTH_CLIENT_ID),
        gscHonestNotice:
          'Google Search Console clicks, impressions, and CTR require authorized Google Search Console OAuth API credentials (not configured yet). You can add your Search Console HTML verification tag & GA4 Measurement ID now.',
      });
    } catch (error) {
      console.error('GET owner SEO failed:', error);
      res.status(500).json({ error: 'Failed to load SEO dashboard.' });
    }
  });

  router.put('/api/owner/tenants/:tenantId/seo', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const schema = z.object({
        canonicalUrl: z.string().max(300).optional(),
        robotsDirectives: z.enum(['index, follow', 'noindex, follow', 'noindex, nofollow']).optional(),
        googleSiteVerification: z.string().max(180).optional(),
        ga4MeasurementId: z.string().max(40).optional(),
        cityAreaKeywords: z.string().max(300).optional(),
        googleMapsUrl: z.string().max(500).optional(),
        gbpProfileUrl: z.string().max(500).optional(),
        localBusinessType: z.string().max(80).optional(),
        sectionOrderJson: z.string().max(500).optional(),
        customPagesJson: z.string().max(12000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid SEO settings payload.' });

      const [existing] = await db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)).limit(1);
      let saved;
      if (existing) {
        [saved] = await db
          .update(tenantSeoSettings)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(tenantSeoSettings.tenantId, tenantId))
          .returning();
      } else {
        [saved] = await db
          .insert(tenantSeoSettings)
          .values({
            tenantId,
            ...parsed.data,
          })
          .returning();
      }

      const [tenantProducts, domains] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
      ]);
      const audit = computeTenantSeoAudit(check.tenant, tenantProducts, saved, domains);
      await db.update(tenantSeoSettings).set({ lastAuditScore: audit.score }).where(eq(tenantSeoSettings.id, saved.id));

      res.json({ seo: { ...saved, lastAuditScore: audit.score }, audit });
    } catch (error) {
      console.error('PUT owner SEO failed:', error);
      res.status(500).json({ error: 'Failed to save SEO settings.' });
    }
  });

  router.post('/api/ai/seo-assistant', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.body?.tenantId);
      const task = String(req.body?.task || 'keywords'); // keywords | meta_copy | content_ideas | audit_fixes
      const targetCity = String(req.body?.targetCity || 'Hyderabad');
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      if (check.tenant.aiCreditsUsed >= check.tenant.aiCreditsLimit) {
        return res.status(402).json({ error: 'AI credits limit reached for this business tenant.' });
      }

      const tenantProducts = await db.select().from(products).where(eq(products.tenantId, tenantId));
      const catalogSummary = tenantProducts
        .slice(0, 8)
        .map((p) => `${p.name} (₹${p.price})`)
        .join(', ');

      const systemInstruction =
        'You are an ethical Google SEO specialist for small and medium businesses. Provide original, helpful, non-spammy SEO recommendations. NEVER promise #1 rankings or guaranteed first-page placement on Google; explain that rankings depend on competition, content quality, reviews, and backlinks.';
      const prompt = `Business: "${check.tenant.name}" (Category: ${check.tenant.category}, Location: ${targetCity}, Address: ${check.tenant.address || targetCity}).
Catalog: ${catalogSummary || check.tenant.tagline}.
Task: ${task}.
Include practical local SEO keywords, crisp title/meta description suggestions (<= 60 chars title, <= 155 chars meta), and 3 actionable steps tailored to this exact business.`;

      const output = await generateAiText({ systemInstruction, prompt });

      await db
        .update(tenants)
        .set({ aiCreditsUsed: check.tenant.aiCreditsUsed + 1 })
        .where(eq(tenants.id, tenantId));

      res.json({
        output,
        creditsUsed: check.tenant.aiCreditsUsed + 1,
        creditsLimit: check.tenant.aiCreditsLimit,
      });
    } catch (error) {
      console.error('POST /api/ai/seo-assistant failed:', error);
      res.status(503).json({ error: error instanceof Error ? error.message : 'AI SEO Assistant failed.' });
    }
  });

  // =========================================================================
  // MODULE 5: NEWSLETTER CONSENT & STOREFRONT QUOTE REQUESTS
  // =========================================================================
  router.post('/api/newsletter/subscribe', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        tenantId: z.number().int().positive().nullable().optional(),
        email: z.string().email(),
        name: z.string().max(100).optional().default(''),
        source: z.string().max(50).optional().default('website'),
        consentGiven: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Please provide a valid email address and explicit consent.' });
      }
      if (!parsed.data.consentGiven) {
        return res.status(400).json({ error: 'Explicit opt-in consent is required before subscribing.' });
      }

      const [sub] = await db
        .insert(newsletterSubscribers)
        .values({
          tenantId: parsed.data.tenantId ?? null,
          email: parsed.data.email.toLowerCase().trim(),
          name: parsed.data.name,
          source: parsed.data.source,
          consentGiven: true,
        })
        .returning();

      res.status(201).json({ subscriber: sub });
    } catch (error) {
      console.error('POST /api/newsletter/subscribe failed:', error);
      res.status(500).json({ error: 'Newsletter subscription failed.' });
    }
  });

  router.get('/api/owner/tenants/:tenantId/subscribers', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const rows = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.tenantId, tenantId))
        .orderBy(desc(newsletterSubscribers.createdAt));
      res.json({ subscribers: rows });
    } catch (error) {
      console.error('GET subscribers failed:', error);
      res.status(500).json({ error: 'Failed to load subscribers.' });
    }
  });

  router.post('/api/public/tenants/:slug/quote-request', async (req: Request, res: Response) => {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.slug, req.params.slug), eq(tenants.published, true)))
        .limit(1);
      if (!tenant) return res.status(404).json({ error: 'Business storefront not found.' });

      const schema = z.object({
        name: z.string().min(2).max(100),
        phone: z.string().min(7).max(24),
        email: z.string().email().optional().or(z.literal('')),
        requirement: z.string().min(5).max(800),
        marketingConsent: z.boolean().optional().default(true),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Please complete your name, phone, and requirement details.' });

      const [lead] = await db
        .insert(crmLeads)
        .values({
          tenantId: tenant.id,
          name: parsed.data.name,
          phone: parsed.data.phone,
          email: parsed.data.email || '',
          source: 'quote_request',
          stage: 'new',
          marketingConsent: parsed.data.marketingConsent,
          notes: parsed.data.requirement,
        })
        .returning();

      res.status(201).json({ lead, message: 'Quote request sent to the business owner.' });
    } catch (error) {
      console.error('POST quote-request failed:', error);
      res.status(500).json({ error: 'Failed to submit quote request.' });
    }
  });

  // =========================================================================
  // MODULE 9: REAL TENANT DATA EXPORT (JSON BACKUP)
  // =========================================================================
  router.get('/api/owner/tenants/:tenantId/export', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const tenantId = Number(req.params.tenantId);
      const check = await assertTenantOwnerOrStaff(req, tenantId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });

      const [tenantProducts, tenantOrders, tenantLeads, domains, seo, subscribers] = await Promise.all([
        db.select().from(products).where(eq(products.tenantId, tenantId)),
        db.select().from(orders).where(eq(orders.tenantId, tenantId)),
        db.select().from(crmLeads).where(eq(crmLeads.tenantId, tenantId)),
        db.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId)),
        db.select().from(tenantSeoSettings).where(eq(tenantSeoSettings.tenantId, tenantId)),
        db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.tenantId, tenantId)),
      ]);

      res.json({
        exportedAt: new Date().toISOString(),
        tenant: check.tenant,
        products: tenantProducts,
        orders: tenantOrders,
        crmLeads: tenantLeads,
        domains,
        seoSettings: seo[0] || null,
        newsletterSubscribers: subscribers,
      });
    } catch (error) {
      console.error('GET tenant export failed:', error);
      res.status(500).json({ error: 'Failed to export tenant data.' });
    }
  });

  // =========================================================================
  // MODULES 10 & 11: SERVER-VALIDATED PACKAGE CART & LOCKED PROPOSALS / QUOTES
  // =========================================================================
  async function calculateServerProposal(planCodes: string[], billingPeriod: 'monthly' | 'yearly') {
    const uniqueCodes = Array.from(new Set(planCodes)).filter(Boolean);
    if (uniqueCodes.length === 0) {
      return { error: 'Please select at least one package or add-on.' as const };
    }
    const dbPlans = await db
      .select()
      .from(platformPlans)
      .where(and(inArray(platformPlans.code, uniqueCodes), eq(platformPlans.active, true)));

    if (dbPlans.length === 0) {
      return { error: 'No valid active packages found for the selected codes.' as const };
    }

    let oneTimeSubtotalInr = 0;
    let recurringSubtotalInr = 0;

    const items = dbPlans.map((plan) => {
      const isRecurring = plan.billingCycle === 'monthly' || plan.billingCycle === 'yearly';
      let lineTotal = plan.priceInr;
      let cycleLabel = 'One-Time Setup';
      if (isRecurring) {
        if (billingPeriod === 'yearly' && plan.billingCycle === 'monthly') {
          // 12 months with transparent 15% annual prepay discount
          lineTotal = Math.round(plan.priceInr * 12 * 0.85);
          cycleLabel = 'Yearly Recurring (15% Annual Discount)';
        } else {
          cycleLabel = plan.billingCycle === 'monthly' ? 'Monthly Recurring' : 'Yearly Recurring';
        }
        recurringSubtotalInr += lineTotal;
      } else {
        oneTimeSubtotalInr += lineTotal;
      }

      return {
        code: plan.code,
        name: plan.name,
        category: plan.category,
        billingCycle: plan.billingCycle,
        cycleLabel,
        unitPriceInr: plan.priceInr,
        lineTotalInr: lineTotal,
        isRecurring,
      };
    });

    const taxableSubtotalInr = oneTimeSubtotalInr + recurringSubtotalInr;
    const gstInr = Math.round(taxableSubtotalInr * 0.18);
    const grandTotalInr = taxableSubtotalInr + gstInr;

    return {
      items,
      billingPeriod,
      oneTimeSubtotalInr,
      recurringSubtotalInr,
      discountInr: 0,
      gstRatePct: 18,
      gstInr,
      grandTotalInr,
      thirdPartyNote:
        'Excludes third-party pass-through charges: custom domain registration/renewal, Cashfree transaction MDR, Meta WhatsApp Business API conversation fees, external SMS/SMTP, and cloud hosting/storage overages.',
    };
  }

  router.post('/api/proposals/calculate', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        planCodes: z.array(z.string()).min(1).max(20),
        billingPeriod: z.enum(['monthly', 'yearly']).optional().default('monthly'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Select at least one package or add-on.' });

      const calc = await calculateServerProposal(parsed.data.planCodes, parsed.data.billingPeriod);
      if ('error' in calc) return res.status(400).json({ error: calc.error });
      res.json(calc);
    } catch (error) {
      console.error('POST /api/proposals/calculate failed:', error);
      res.status(500).json({ error: 'Failed to calculate proposal totals.' });
    }
  });

  router.post('/api/proposals', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        planCodes: z.array(z.string()).min(1).max(20),
        billingPeriod: z.enum(['monthly', 'yearly']).optional().default('monthly'),
        customerName: z.string().min(2).max(100),
        customerEmail: z.string().email(),
        customerPhone: z.string().min(7).max(24),
        businessName: z.string().min(2).max(120),
        businessCategory: z.string().max(60).optional().default('clothing'),
        tenantId: z.number().int().positive().nullable().optional(),
        leadSource: z.string().max(60).optional().default('pricing_builder'),
        notes: z.string().max(1000).optional().default(''),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Please complete customer name, email, phone, business name, and selected items.' });
      }

      const calc = await calculateServerProposal(parsed.data.planCodes, parsed.data.billingPeriod);
      if ('error' in calc) return res.status(400).json({ error: calc.error });

      const year = new Date().getFullYear();
      const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
      const proposalNumber = `VV-QT-${year}-${rand}`;

      const [created] = await db
        .insert(proposals)
        .values({
          proposalNumber,
          userId: req.dbUser?.id ?? null,
          tenantId: parsed.data.tenantId ?? null,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail.toLowerCase().trim(),
          customerPhone: parsed.data.customerPhone,
          businessName: parsed.data.businessName,
          businessCategory: parsed.data.businessCategory,
          billingPeriod: parsed.data.billingPeriod,
          itemsJson: JSON.stringify(calc.items),
          oneTimeSubtotalInr: calc.oneTimeSubtotalInr,
          recurringSubtotalInr: calc.recurringSubtotalInr,
          discountInr: calc.discountInr,
          gstInr: calc.gstInr,
          grandTotalInr: calc.grandTotalInr,
          status: 'sent',
          lockedAt: new Date(),
          leadSource: parsed.data.leadSource,
          notes: parsed.data.notes,
        })
        .returning();

      await logAudit(
        req.dbUser?.email || parsed.data.customerEmail,
        req.dbUser?.role || 'customer',
        'PROPOSAL_CREATED',
        `Locked quotation ${proposalNumber} for ${parsed.data.businessName} (₹${calc.grandTotalInr} incl. 18% GST)`,
        parsed.data.tenantId ?? null
      );

      res.status(201).json({ proposal: created, calculation: calc });
    } catch (error) {
      console.error('POST /api/proposals failed:', error);
      res.status(500).json({ error: 'Failed to create locked proposal.' });
    }
  });

  router.get('/api/proposals', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const dbUser = req.dbUser!;
      let rows;
      if (dbUser.role === 'super_admin') {
        rows = await db.select().from(proposals).orderBy(desc(proposals.createdAt)).limit(100);
      } else {
        rows = await db
          .select()
          .from(proposals)
          .where(eq(proposals.customerEmail, dbUser.email.toLowerCase()))
          .orderBy(desc(proposals.createdAt))
          .limit(50);
      }
      res.json({ proposals: rows });
    } catch (error) {
      console.error('GET /api/proposals failed:', error);
      res.status(500).json({ error: 'Failed to load proposals.' });
    }
  });

  router.patch('/api/proposals/:id/status', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status || '');
      if (!['accepted', 'converted', 'expired'].includes(status)) {
        return res.status(400).json({ error: 'Invalid proposal status.' });
      }
      const [existing] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Proposal not found.' });

      const dbUser = req.dbUser!;
      const isOwner = existing.userId === dbUser.id || existing.customerEmail.toLowerCase() === dbUser.email.toLowerCase();
      if (dbUser.role !== 'super_admin' && !isOwner) {
        return res.status(403).json({ error: 'Forbidden: you cannot update this proposal.' });
      }
      if (status !== 'accepted' && dbUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can mark proposals converted or expired.' });
      }
      // Module 11 rule: never silently alter an already accepted quotation's pricing
      if (existing.status === 'accepted' && status === 'accepted') {
        return res.json({ proposal: existing });
      }

      const [updated] = await db
        .update(proposals)
        .set({
          status,
          acceptedAt: status === 'accepted' ? new Date() : existing.acceptedAt,
          lockedAt: existing.lockedAt || new Date(),
        })
        .where(eq(proposals.id, id))
        .returning();

      await logAudit(
        dbUser.email,
        dbUser.role,
        'PROPOSAL_STATUS_UPDATED',
        `Proposal ${updated.proposalNumber} marked ${status} (Locked total: ₹${updated.grandTotalInr})`,
        updated.tenantId
      );

      res.json({ proposal: updated });
    } catch (error) {
      console.error('PATCH /api/proposals/:id/status failed:', error);
      res.status(500).json({ error: 'Failed to update proposal status.' });
    }
  });

  return router;
}
