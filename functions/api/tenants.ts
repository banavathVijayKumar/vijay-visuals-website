// ============================================================================
// GET & POST /api/tenants
// GET  — Public Published Storefronts Directory from Cloudflare D1
// POST — Authenticated Customer Creates & Publishes a New Business Website
// ============================================================================

import { requireUser } from './_auth';
import {
  PagesContext,
  checkRateLimit,  rateLimitResponse,
  errorJson,
  getClientIp,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  randomHex,
  sanitizeText,
  writeAuditLog,
} from './_shared';
import {
  checkTenantSubscriptionEntitlement,
  provisionLifetimeEntitlement,
  validateEnabledModules,
  validateGalleryImages,
  validateGalleryItems,
  validateSafeHttpUrl,
  validateSafeImageSource,
  validateSlugFormat,
} from './_tenantAccess';
import { PublicationRow, mapPublicationToTenant } from './_tenantMapper';
import { sanitizeDemoDraftForStorage } from './_demoDraft';
import { FREE_START_PLAN_CODE } from './_planTiers';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from './plans';
import { getEdgeCashfreeStatus } from './payments/_cashfree';

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  const tenants: Array<Record<string, unknown>> = [];

  if (env.DB) {
    try {
      let rows: PublicationRow[] = [];
      try {
        const pubs = await env.DB.prepare(
          `SELECT rowid, website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
           FROM customer_website_publications
           WHERE status = 'published'
           ORDER BY updated_at DESC LIMIT 100`
        ).all<PublicationRow>();
        rows = pubs.results || [];
      } catch {
        const pubs = await env.DB.prepare(
          `SELECT website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
           FROM customer_website_publications
           WHERE status = 'published'
           ORDER BY updated_at DESC LIMIT 100`
        ).all<PublicationRow>();
        rows = pubs.results || [];
      }

      const cfStatus = getEdgeCashfreeStatus(env);
      const cashfreeOnlineReady = Boolean(cfStatus.configured);

      for (const row of rows) {
        let parsed: Record<string, any> = {};
        try {
          const raw = row.website_json ? JSON.parse(row.website_json) : {};
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            parsed = raw;
          }
        } catch {}
        tenants.push(
          mapPublicationToTenant(row, parsed, {
            cashfreeOnlineReady,
            razorpayOnlineReady: cashfreeOnlineReady,
          }) as unknown as Record<string, unknown>
        );
      }
    } catch {
      // Safe fallback when D1 table has not yet been populated
    }
  }

  return jsonResponse({ tenants });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Website storage is not configured.' }, 503);
  }

  const rl = await checkRateLimit(
    env,
    `tenant_create:${auth.user.id}:${getClientIp(request)}`,
    10,
    3600
  );
  if (!rl.allowed) return rateLimitResponse(rl, 'Too many websites created recently. Please wait and try again.')

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);
  }

  const name = sanitizeText(body.name || body.businessName, 140);
  if (!name || name.length < 2) {
    return jsonResponse({ error: 'Business name is required (minimum 2 characters).' }, 400);
  }

  const slugCheck = validateSlugFormat(String(body.slug || ''));
  if (!slugCheck.valid) {
    return jsonResponse({ error: slugCheck.reason || 'Invalid store URL slug.' }, 400);
  }
  const slug = slugCheck.normalized;

  // Enforce global slug uniqueness
  const existingSlug = await env.DB.prepare(
    'SELECT website_id FROM customer_website_publications WHERE public_slug = ? LIMIT 1'
  )
    .bind(slug)
    .first<{ website_id: string }>();
  if (existingSlug) {
    return jsonResponse(
      { error: `The URL slug "${slug}" is already taken. Please choose another slug.` },
      409
    );
  }

  const primaryColor = SAFE_COLOR.test(String(body.primaryColor || ''))
    ? String(body.primaryColor)
    : '#D4AF37';
  const accentColor = SAFE_COLOR.test(String(body.accentColor || ''))
    ? String(body.accentColor)
    : '#0D0D12';
  const pwaThemeColor = SAFE_COLOR.test(String(body.pwaThemeColor || ''))
    ? String(body.pwaThemeColor)
    : primaryColor;

  // Verify server-side subscription entitlements (never trust client planTier or published flags)
  const entitlement = await checkTenantSubscriptionEntitlement(
    env,
    '',
    auth.user.id,
    auth.user.isSuperAdmin
  );

  const planTier = auth.user.isSuperAdmin
    ? (['website_only', 'website_pwa', 'enterprise_ai'].includes(String(body.planTier || ''))
        ? String(body.planTier)
        : 'website_only')
    : entitlement.planTier;

  const templateFeatures = Array.isArray(body.templateFeatures)
    ? body.templateFeatures
        .map((f: unknown) => sanitizeText(f, 120))
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const sectionOrder = Array.isArray(body.sectionOrder)
    ? body.sectionOrder
        .map((s: unknown) => sanitizeText(s, 40))
        .filter(Boolean)
        .slice(0, 12)
    : ['hero', 'catalog', 'gallery', 'booking', 'contact'];

  const customPages = Array.isArray(body.customPages)
    ? body.customPages
        .filter((p: any) => p && typeof p === 'object' && p.slug && p.title)
        .map((p: any) => ({
          slug: sanitizeText(p.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, ''),
          title: sanitizeText(p.title, 80),
          content: sanitizeText(p.content, 2000),
        }))
        .filter((p: any) => p.slug && p.title)
        .slice(0, 10)
    : [];

  const rawSocials = body.socialLinks && typeof body.socialLinks === 'object' ? body.socialLinks : {};
  const socialLinks = {
    instagram: validateSafeHttpUrl(rawSocials.instagram, 300),
    facebook: validateSafeHttpUrl(rawSocials.facebook, 300),
    youtube: validateSafeHttpUrl(rawSocials.youtube, 300),
    website: validateSafeHttpUrl(rawSocials.website, 300),
  };

  const websiteId = `web_${randomHex(10)}`;
  const deliveryFee = Math.max(0, Math.min(10000, Math.round(Number(body.deliveryFee || 0))));
  const nowIso = new Date().toISOString();
  // Unpaid customers can create and customize unpublished drafts, but cannot publish live without entitlement
  const status = body.published === false || !entitlement.canPublish ? 'unpublished' : 'published';

  const galleryItems = validateGalleryItems(body.galleryItems);
  const galleryImages =
    galleryItems.length > 0
      ? galleryItems.map((g) => g.url)
      : validateGalleryImages(body.galleryImages);
  const enabledModules = validateEnabledModules(body.enabledModules);
  const demoBuilderDraft = sanitizeDemoDraftForStorage(body.demoBuilderDraft);

  const websitePayload: Record<string, unknown> = {
    businessName: name,
    name,
    category: sanitizeText(body.category, 80) || 'other',
    templateId: sanitizeText(body.templateId, 100) || 'custom-business',
    template: {
      id: sanitizeText(body.templateId, 100) || 'custom-business',
      name: sanitizeText(body.templateName, 140),
      features: templateFeatures,
    },
    tagline: sanitizeText(body.tagline, 240),
    heroHeadline: sanitizeText(body.heroHeadline, 240),
    heroSubheadline: sanitizeText(body.heroSubheadline, 600),
    ctaText: sanitizeText(body.ctaText, 80),
    description: sanitizeText(body.description, 1200),
    logoText: sanitizeText(body.logoText, 8).toUpperCase(),
    logoImage: validateSafeImageSource(body.logoImage),
    bannerImage: validateSafeImageSource(body.bannerImage),
    galleryImages,
    galleryItems,
    primaryColor,
    themeColor: primaryColor,
    accentColor,
    fontFamily: sanitizeText(body.fontFamily, 60) || 'Cinzel',
    customDomain: sanitizeText(body.customDomain, 200).toLowerCase(),
    seoTitle: sanitizeText(body.seoTitle, 160),
    seoDescription: sanitizeText(body.seoDescription, 320),
    currency: sanitizeText(body.currency, 10).toUpperCase() || 'INR',
    language: ['en', 'te', 'hi'].includes(String(body.language || '')) ? String(body.language) : 'en',
    timezone: sanitizeText(body.timezone, 60) || 'Asia/Kolkata',
    phone: sanitizeText(body.phone, 40),
    whatsapp: sanitizeText(body.whatsapp, 40),
    address: sanitizeText(body.address, 300),
    businessHours: sanitizeText(body.businessHours, 200),
    deliveryInfo: sanitizeText(body.deliveryInfo, 600),
    returnPolicy: sanitizeText(body.returnPolicy, 800),
    ...(enabledModules ? { enabledModules } : {}),
    socialLinks,
    sectionOrder,
    customPages,
    ...(demoBuilderDraft ? { demoBuilderDraft } : {}),
    planTier,
    pwaEnabled: Boolean(body.pwaEnabled && planTier !== 'website_only'),
    pwaAppName: sanitizeText(body.pwaAppName, 100) || name,
    pwaShortName: sanitizeText(body.pwaShortName, 24) || name.slice(0, 12),
    pwaThemeColor,
    deliveryFee,
    deliveryCommissionPct: 10,
    codEnabled: body.codEnabled !== false,
    upiId: sanitizeText(body.upiId, 120),
  };

  await env.DB.prepare(
    `INSERT INTO customer_website_publications
     (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      websiteId,
      auth.user.id,
      slug,
      name,
      JSON.stringify(websitePayload),
      status,
      status === 'published' ? nowIso : '',
      nowIso,
      nowIso
    )
    .run();

  // If user completed a verified platform purchase prior to creating their website draft, link it now
  try {
    const unlinked = await env.DB.prepare(
      `SELECT id, plan_code, billing_cycle, base_amount_inr, gst_amount_inr, amount_inr, setup_fee_inr, razorpay_payment_id
       FROM platform_payments
       WHERE (owner_id = ? OR owner_id = ?) AND website_id IS NULL AND status = 'paid'
       ORDER BY id DESC LIMIT 1`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .first<{
        id: number;
        plan_code: string;
        billing_cycle: string;
        base_amount_inr: number;
        gst_amount_inr: number;
        amount_inr: number;
        setup_fee_inr: number;
        razorpay_payment_id: string;
      }>();

    if (unlinked) {
      await env.DB.prepare('UPDATE platform_payments SET website_id = ? WHERE id = ?')
        .bind(websiteId, unlinked.id)
        .run();

      const isWebsitePackage = (ALLOWED_WEBSITE_PACKAGE_CODES as readonly string[]).includes(unlinked.plan_code);
      const isOneTime = unlinked.billing_cycle === 'one_time' || isWebsitePackage;

      if (isOneTime) {
        // One-time website packages are lifetime entitlements, not subscriptions.
        const provision = await provisionLifetimeEntitlement(env, {
          websiteId,
          ownerId: auth.user.id,
          planCode: unlinked.plan_code,
          entitlementType:
            String(unlinked.plan_code).toLowerCase() === FREE_START_PLAN_CODE
              ? 'free_start'
              : 'one_time_purchase',
          source: 'verified_platform_payment_link',
          sourceReference: unlinked.razorpay_payment_id || '',
          paymentId: unlinked.id,
        });
        if (!provision.ok && provision.error) return provision.error;
      } else {
        const durationExpr = unlinked.billing_cycle === 'yearly' ? '+365 days' : '+30 days';
        await env.DB.prepare(
          `INSERT INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'cashfree', ?, datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
        )
          .bind(
            websiteId,
            auth.user.id,
            unlinked.plan_code,
            unlinked.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
            unlinked.base_amount_inr,
            unlinked.gst_amount_inr,
            unlinked.amount_inr,
            unlinked.setup_fee_inr,
            unlinked.razorpay_payment_id || '',
            durationExpr
          )
          .run();
      }

      // If user desired published status, unlock publishing now that subscription is linked
      if (body.published !== false) {
        await env.DB.prepare(
          `UPDATE customer_website_publications
           SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
           WHERE website_id = ?`
        )
          .bind(websiteId)
          .run();
      }
    }
  } catch (err) {
    console.error('Payment entitlement linking failed:', err);
    return errorJson('Unable to link the verified purchase. Please retry.', 500, {
      code: 'ENTITLEMENT_LINK_FAILED',
    });
  }

  // Optional initial revision snapshot (safe if migration 0003 not applied yet)
  try {
    await env.DB.prepare(
      `INSERT INTO website_revisions (website_id, owner_id, version_number, revision_type, summary, website_json, created_by)
       VALUES (?, ?, 1, ?, 'Initial website publication', ?, ?)`
    )
      .bind(
        websiteId,
        auth.user.id,
        status === 'published' ? 'published' : 'draft',
        JSON.stringify(websitePayload),
        auth.user.id
      )
      .run();
  } catch {
    // Migration 0003 optional
  }

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: auth.user.platformRole,
    action: 'website_created',
    targetType: 'website',
    targetId: websiteId,
    details: { slug, name, status },
  });

  const createdRow = await env.DB.prepare(
    `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
     FROM customer_website_publications
     WHERE website_id = ? LIMIT 1`
  )
    .bind(websiteId)
    .first<PublicationRow>();

  const tenant = mapPublicationToTenant(
    createdRow || {
      rowid: 0,
      website_id: websiteId,
      owner_id: auth.user.id,
      public_slug: slug,
      business_name: name,
      website_json: JSON.stringify(websitePayload),
      status,
      published_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    },
    websitePayload
  );

  return jsonResponse({ tenant }, 201);
}
