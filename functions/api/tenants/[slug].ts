// ============================================================================
// GET & PATCH /api/tenants/:slug
// GET   — Public Published Storefront Endpoint (Cloudflare D1)
//         Returns { tenant, products, coupons, reviews } expected by StorefrontView.
// PATCH — Authenticated Owner Updates Business Website (strictly tenant-scoped)
// ============================================================================

import { requireUser } from '../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  writeAuditLog,
} from '../_shared';
import {
  checkTenantSubscriptionEntitlement,
  customerApprovalBlockedResponse,
  mapProductRowToUi,
  requireTenantOwnerAccess,
  validateEnabledModules,
  validateGalleryImages,
  validateGalleryItems,
  validateSafeHttpUrl,
  validateSafeImageSource,
  validateSlugFormat,
} from '../_tenantAccess';
import {
  BusinessProfileEnrichment,
  PublicationRow,
  SellerPayoutEnrichment,
  TenantGlobalEnrichment,
  cleanString,
  mapPublicationToTenant,
} from '../_tenantMapper';
import { getEdgeCashfreeStatus } from '../payments/_cashfree';
import { sanitizeDemoDraftForStorage } from '../_demoDraft';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

interface StoreProductRow {
  id: number;
  category: string;
  name: string;
  description: string;
  price_inr: number;
  compare_at_price_inr?: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  variants_json?: string | null;
  images_json?: string | null;
  is_active: number;
}

interface StoreCouponRow {
  id: number;
  code: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  min_order_inr: number;
  expires_at?: string | null;
  is_active: number;
}

interface ProductReviewRow {
  id: number;
  product_id?: number | null;
  product_name?: string | null;
  reviewer_name: string;
  rating: number;
  title?: string;
  comment: string;
  verified_purchase?: number;
  owner_reply?: string;
  owner_replied_at?: string;
  created_at: string;
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, params, env } = context;
  const slug = String(params?.slug || '').toLowerCase().trim();

  if (!SLUG_PATTERN.test(slug)) {
    return jsonResponse({ error: 'Storefront not found.' }, 404);
  }

  if (!env.DB) {
    return jsonResponse(
      { error: 'Website publishing storage is not configured yet.' },
      503
    );
  }

  let row: PublicationRow | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT rowid, website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
       FROM customer_website_publications
       WHERE public_slug = ? AND status = 'published'
       LIMIT 1`
    )
      .bind(slug)
      .first<PublicationRow>();
  } catch (err) {
    try {
      row = await env.DB.prepare(
        `SELECT website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
         FROM customer_website_publications
         WHERE public_slug = ? AND status = 'published'
         LIMIT 1`
      )
        .bind(slug)
        .first<PublicationRow>();
    } catch (innerErr) {
      console.error('Public tenant lookup failed:', err, innerErr);
      return jsonResponse(
        { error: 'Website publishing storage is not configured yet.' },
        503
      );
    }
  }

  if (!row) {
    return jsonResponse(
      { error: 'This storefront is not published or does not exist.' },
      404
    );
  }

  let parsedWebsite: Record<string, any> = {};
  try {
    const raw = row.website_json ? JSON.parse(row.website_json) : {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return jsonResponse({ error: 'Published website data is invalid.' }, 500);
    }
    parsedWebsite = raw as Record<string, any>;
  } catch {
    return jsonResponse({ error: 'Published website data is invalid.' }, 500);
  }

  let profile: BusinessProfileEnrichment | null = null;
  let payout: SellerPayoutEnrichment | null = null;
  let globalSettings: TenantGlobalEnrichment | null = null;

  try {
    profile = await env.DB.prepare(
      `SELECT category, description, phone, whatsapp_number, address_line, city, state, pincode, seo_title, seo_description
       FROM business_profiles
       WHERE website_id = ?
       LIMIT 1`
    )
      .bind(row.website_id)
      .first<BusinessProfileEnrichment>();
  } catch {
    // Optional table
  }

  try {
    payout = await env.DB.prepare(
      `SELECT upi_id, settlement_mode, kyc_status, linked_account_id
       FROM seller_payout_accounts
       WHERE website_id = ?
       LIMIT 1`
    )
      .bind(row.website_id)
      .first<SellerPayoutEnrichment>();
  } catch {
    // Optional table
  }

  try {
    globalSettings = await env.DB.prepare(
      `SELECT primary_currency, timezone
       FROM tenant_global_settings
       WHERE website_id = ?
       LIMIT 1`
    )
      .bind(row.website_id)
      .first<TenantGlobalEnrichment>();
  } catch {
    // Optional table
  }

  const cfStatus = getEdgeCashfreeStatus(env);
  const cashfreeOnlineReady = Boolean(cfStatus.configured);

  const tenant = mapPublicationToTenant(row, parsedWebsite, {
    profile,
    payout,
    globalSettings,
    cashfreeOnlineReady,
    razorpayOnlineReady: cashfreeOnlineReady,
  });

  // Load real reviews with photos & verified purchase badges
  const reviews: Array<{
    id: number;
    tenantId: number;
    websiteId: string;
    productId: number;
    productName: string;
    customerName: string;
    rating: number;
    title: string;
    comment: string;
    verifiedPurchase: boolean;
    ownerReply: string;
    ownerRepliedAt: string;
    photos: Array<{ id: number; photoUrl: string; caption: string }>;
    createdAt: string;
  }> = [];

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  try {
    const revRes = await env.DB.prepare(
      `SELECT r.id, r.product_id, r.reviewer_name, r.rating, r.title, r.comment,
              r.verified_purchase, r.owner_reply, r.owner_replied_at, r.created_at, p.name AS product_name
       FROM product_reviews r
       LEFT JOIN store_products p ON p.id = r.product_id
       WHERE r.website_id = ? AND r.moderation_status = 'published'
       ORDER BY r.created_at DESC
       LIMIT 100`
    )
      .bind(row.website_id)
      .all<ProductReviewRow>();

    // Load review photos
    const photosRes = await env.DB.prepare(
      'SELECT id, review_id, photo_url, caption FROM review_photos WHERE website_id = ? ORDER BY id ASC'
    )
      .bind(row.website_id)
      .all<{ id: number; review_id: number; photo_url: string; caption: string }>();

    const photoMap = new Map<number, Array<{ id: number; photoUrl: string; caption: string }>>();
    for (const ph of photosRes.results || []) {
      const list = photoMap.get(ph.review_id) || [];
      list.push({ id: ph.id, photoUrl: ph.photo_url, caption: ph.caption });
      photoMap.set(ph.review_id, list);
    }

    for (const r of revRes.results || []) {
      const star = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5)));
      distribution[star as 1 | 2 | 3 | 4 | 5] = (distribution[star as 1 | 2 | 3 | 4 | 5] || 0) + 1;

      reviews.push({
        id: Number(r.id),
        tenantId: tenant.id,
        websiteId: row.website_id,
        productId: Number(r.product_id || 0),
        productName: r.product_name || '',
        customerName: cleanString(r.reviewer_name, 120) || 'Verified Customer',
        rating: Number(r.rating) || 0,
        title: cleanString(r.title, 140) || '',
        comment: cleanString(r.comment, 1000),
        verifiedPurchase: Boolean(r.verified_purchase),
        ownerReply: cleanString(r.owner_reply, 1000) || '',
        ownerRepliedAt: r.owner_replied_at || '',
        photos: photoMap.get(Number(r.id)) || [],
        createdAt: r.created_at || '',
      });
    }
  } catch {
    // Optional table
  }

  const ratingStats = new Map<number, { sum: number; count: number }>();
  for (const rev of reviews) {
    if (rev.productId > 0) {
      const cur = ratingStats.get(rev.productId) || { sum: 0, count: 0 };
      cur.sum += rev.rating;
      cur.count += 1;
      ratingStats.set(rev.productId, cur);
    }
  }

  // Load real active products
  const products: Array<Record<string, unknown>> = [];
  try {
    const prodRes = await env.DB.prepare(
      `SELECT id, category, name, description, price_inr, compare_at_price_inr, stock_qty, low_stock_threshold, variants_json, images_json, is_active
       FROM store_products
       WHERE website_id = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 200`
    )
      .bind(row.website_id)
      .all<StoreProductRow>();

    for (const p of prodRes.results || []) {
      const stats = ratingStats.get(Number(p.id));
      const avgRating = stats && stats.count > 0 ? (stats.sum / stats.count).toFixed(1) : '0.0';
      products.push(mapProductRowToUi(p, tenant.id, avgRating, stats?.count || 0));
    }
  } catch {
    // Optional table
  }

  // The ₹1 Cashfree test item is for local/preview verification only. It must
  // never be injected into a customer's public production catalog.
  const requestHost = String(new URL(request.url).hostname || '').toLowerCase().replace(/\.$/, '');
  const isPreviewHost =
    requestHost === 'localhost' ||
    requestHost === '127.0.0.1' ||
    (requestHost.endsWith('.vijay-visuals-site.pages.dev') &&
      requestHost !== 'vijay-visuals-site.pages.dev');

  if (cfStatus.mode === 'sandbox' && isPreviewHost) {
    products.unshift({
      id: 999999,
      tenantId: tenant.id,
      name: '[SANDBOX TEST] Cashfree Test Item — ₹1',
      description: 'SAFE SANDBOX PAYMENT TEST ITEM. Non-commercial test order for Cashfree Sandbox Payment Gateway verification. Exactly ₹1.00 authorization in Sandbox mode. Zero real money.',
      category: 'Sandbox Testing',
      subcategory: 'Cashfree PG',
      price: 1,
      compareAtPrice: 100,
      wholesalePrice: 1,
      minWholesaleQty: 1,
      stock: 9999,
      stockQty: 9999,
      lowStockThreshold: 5,
      sku: 'SANDBOX-TEST-1INR',
      barcode: 'SANDBOX-TEST-CF',
      featured: true,
      bestseller: false,
      imageUrl: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=500&auto=format&fit=crop&q=80',
      images: ['https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=500&auto=format&fit=crop&q=80'],
      variantsJson: JSON.stringify(['Test Standard (₹1)']),
      variants: ['Test Standard (₹1)'],
      specs: 'Cashfree Sandbox Test Mode · Safe ₹1 Authorization · RBI Simulator Card/UPI',
      videoUrl: '',
      rating: '5.0',
      reviewCount: 1,
      reviewsCount: 1,
      active: true,
      isActive: true,
    });
  }

  // Load real active coupons
  const coupons: Array<{
    id: number;
    tenantId: number;
    code: string;
    discountType: 'percent' | 'flat';
    discountValue: number;
    minOrder: number;
    active: boolean;
  }> = [];

  try {
    const coupRes = await env.DB.prepare(
      `SELECT id, code, discount_type, discount_value, min_order_inr, expires_at, is_active
       FROM store_coupons
       WHERE website_id = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 50`
    )
      .bind(row.website_id)
      .all<StoreCouponRow>();

    const nowMs = Date.now();
    for (const c of coupRes.results || []) {
      if (c.expires_at) {
        const expMs = Date.parse(c.expires_at);
        if (Number.isFinite(expMs) && expMs < nowMs) continue;
      }
      coupons.push({
        id: Number(c.id),
        tenantId: tenant.id,
        code: cleanString(c.code, 40),
        discountType: c.discount_type === 'flat' ? 'flat' : 'percent',
        discountValue: Number(c.discount_value) || 0,
        minOrder: Number(c.min_order_inr) || 0,
        active: Boolean(c.is_active),
      });
    }
  } catch {
    // Optional table
  }

  const verifiedPurchaseCount = reviews.filter((r) => r.verifiedPurchase).length;
  const averageRating = reviews.length > 0
    ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2))
    : 0;
  const verifiedPurchasePercentage = reviews.length > 0
    ? Number(((verifiedPurchaseCount / reviews.length) * 100).toFixed(1))
    : 0;

  return jsonResponse(
    {
      tenant,
      products,
      coupons,
      reviews,
      reviewSummary: {
        totalReviews: reviews.length,
        averageRating,
        verifiedPurchaseCount,
        verifiedPurchasePercentage,
        distribution,
      },
    },
    200,
    { 'Cache-Control': 'public, max-age=30, s-maxage=60' }
  );
}

export async function onRequestPatch(
  context: PagesContext<{ slug: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.slug, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request payload.' }, 400);
  }

  const current = { ...access.parsedWebsite };
  const nextName =
    typeof body.name === 'string' && body.name.trim()
      ? sanitizeText(body.name, 140)
      : typeof body.businessName === 'string' && body.businessName.trim()
        ? sanitizeText(body.businessName, 140)
        : access.row.business_name;

  let nextSlug = access.row.public_slug;
  if (typeof body.slug === 'string' && body.slug.trim()) {
    const slugCheck = validateSlugFormat(body.slug);
    if (!slugCheck.valid) {
      return jsonResponse({ error: slugCheck.reason || 'Invalid store slug.' }, 400);
    }
    if (slugCheck.normalized !== access.row.public_slug) {
      const conflict = await env.DB!.prepare(
        'SELECT website_id FROM customer_website_publications WHERE public_slug = ? AND website_id != ? LIMIT 1'
      )
        .bind(slugCheck.normalized, access.row.website_id)
        .first<{ website_id: string }>();
      if (conflict) {
        return jsonResponse({ error: `Slug "${slugCheck.normalized}" is already taken.` }, 409);
      }
      nextSlug = slugCheck.normalized;
    }
  }

  current.businessName = nextName;
  current.name = nextName;

  if (typeof body.category === 'string') current.category = sanitizeText(body.category, 80) || 'other';
  if (typeof body.templateId === 'string') {
    const tid = sanitizeText(body.templateId, 100);
    current.templateId = tid;
    current.template = {
      ...(current.template && typeof current.template === 'object' ? current.template : {}),
      id: tid,
      ...(typeof body.templateName === 'string' ? { name: sanitizeText(body.templateName, 140) } : {}),
      ...(Array.isArray(body.templateFeatures)
        ? {
            features: body.templateFeatures
              .map((f: unknown) => sanitizeText(f, 120))
              .filter(Boolean)
              .slice(0, 10),
          }
        : {}),
    };
  }
  if (typeof body.tagline === 'string') current.tagline = sanitizeText(body.tagline, 240);
  if (typeof body.heroHeadline === 'string') current.heroHeadline = sanitizeText(body.heroHeadline, 240);
  if (typeof body.heroSubheadline === 'string') current.heroSubheadline = sanitizeText(body.heroSubheadline, 600);
  if (typeof body.ctaText === 'string') current.ctaText = sanitizeText(body.ctaText, 80);
  if (typeof body.description === 'string') current.description = sanitizeText(body.description, 1200);
  if (typeof body.logoText === 'string') current.logoText = sanitizeText(body.logoText, 8).toUpperCase();
  if (body.logoImage !== undefined) current.logoImage = validateSafeImageSource(body.logoImage);
  if (body.bannerImage !== undefined) current.bannerImage = validateSafeImageSource(body.bannerImage);

  if (Array.isArray(body.galleryItems)) {
    const validatedItems = validateGalleryItems(body.galleryItems);
    current.galleryItems = validatedItems;
    current.galleryImages = validatedItems.map((g) => g.url);
  } else if (Array.isArray(body.galleryImages)) {
    const imgs = validateGalleryImages(body.galleryImages);
    current.galleryImages = imgs;
    current.galleryItems = imgs.map((url, idx) => ({
      id: `gal_${idx + 1}`,
      url,
      title: '',
      description: '',
      category: 'Showcase',
      order: idx,
    }));
  }

  if (typeof body.primaryColor === 'string' && SAFE_COLOR.test(body.primaryColor)) {
    current.primaryColor = body.primaryColor;
    current.themeColor = body.primaryColor;
  }
  if (typeof body.accentColor === 'string' && SAFE_COLOR.test(body.accentColor)) {
    current.accentColor = body.accentColor;
  }
  if (typeof body.fontFamily === 'string') current.fontFamily = sanitizeText(body.fontFamily, 60) || 'Cinzel';
  if (typeof body.customDomain === 'string') current.customDomain = sanitizeText(body.customDomain, 200).toLowerCase();
  if (typeof body.seoTitle === 'string') current.seoTitle = sanitizeText(body.seoTitle, 160);
  if (typeof body.seoDescription === 'string') current.seoDescription = sanitizeText(body.seoDescription, 320);
  if (typeof body.currency === 'string') current.currency = sanitizeText(body.currency, 10).toUpperCase() || 'INR';
  if (typeof body.language === 'string' && ['en', 'te', 'hi'].includes(body.language)) {
    current.language = body.language;
  }
  if (typeof body.timezone === 'string') current.timezone = sanitizeText(body.timezone, 60) || 'Asia/Kolkata';
  if (typeof body.phone === 'string') current.phone = sanitizeText(body.phone, 40);
  if (typeof body.whatsapp === 'string') current.whatsapp = sanitizeText(body.whatsapp, 40);
  if (typeof body.address === 'string') current.address = sanitizeText(body.address, 300);
  if (typeof body.businessHours === 'string') current.businessHours = sanitizeText(body.businessHours, 200);
  if (typeof body.deliveryInfo === 'string') current.deliveryInfo = sanitizeText(body.deliveryInfo, 600);
  if (typeof body.returnPolicy === 'string') current.returnPolicy = sanitizeText(body.returnPolicy, 800);

  if (body.enabledModules !== undefined) {
    const validMods = validateEnabledModules(body.enabledModules);
    if (validMods) {
      current.enabledModules = {
        ...(current.enabledModules && typeof current.enabledModules === 'object' ? current.enabledModules : {}),
        ...validMods,
      };
    }
  }

  if (body.socialLinks && typeof body.socialLinks === 'object') {
    current.socialLinks = {
      instagram: validateSafeHttpUrl(body.socialLinks.instagram, 300),
      facebook: validateSafeHttpUrl(body.socialLinks.facebook, 300),
      youtube: validateSafeHttpUrl(body.socialLinks.youtube, 300),
      website: validateSafeHttpUrl(body.socialLinks.website, 300),
    };
  }

  if (Array.isArray(body.sectionOrder)) {
    current.sectionOrder = body.sectionOrder
      .map((s: unknown) => sanitizeText(s, 40))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (Array.isArray(body.customPages)) {
    current.customPages = body.customPages
      .filter((p: any) => p && typeof p === 'object' && p.slug && p.title)
      .map((p: any) => ({
        slug: sanitizeText(p.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, ''),
        title: sanitizeText(p.title, 80),
        content: sanitizeText(p.content, 2000),
      }))
      .filter((p: any) => p.slug && p.title)
      .slice(0, 10);
  }

  if (body.demoBuilderDraft !== undefined) {
    const safeDraft = sanitizeDemoDraftForStorage(body.demoBuilderDraft);
    if (safeDraft) current.demoBuilderDraft = safeDraft;
  }

  // Server-side subscription entitlement verification (never trust frontend planTier or published flags)
  const entitlement = await checkTenantSubscriptionEntitlement(
    env,
    access.row.website_id,
    auth.user.id,
    auth.user.isSuperAdmin
  );

  // If client requests publishing an unpublished website, verify entitlement
  if (body.published === true && access.row.status !== 'published') {
    if (!entitlement.canPublish) {
      return jsonResponse(
        {
          error:
            'An active package or subscription is required to publish this website live. Please complete your website package purchase (₹7,999 Business Website package).',
          code: 'PAYMENT_REQUIRED',
        },
        402
      );
    }
  }

  if (auth.user.isSuperAdmin) {
    const validTiers = new Set(['website_only', 'website_pwa', 'enterprise_ai']);
    if (typeof body.planTier === 'string' && validTiers.has(body.planTier)) {
      current.planTier = body.planTier;
    }
    if (typeof body.pwaEnabled === 'boolean') {
      current.pwaEnabled = body.pwaEnabled && current.planTier !== 'website_only';
    }
  } else {
    current.planTier = entitlement.planTier;
    current.pwaEnabled = entitlement.pwaEnabled && Boolean(body.pwaEnabled);
  }

  if (typeof body.pwaAppName === 'string') current.pwaAppName = sanitizeText(body.pwaAppName, 100);
  if (typeof body.pwaShortName === 'string') current.pwaShortName = sanitizeText(body.pwaShortName, 24);
  if (typeof body.pwaThemeColor === 'string' && SAFE_COLOR.test(body.pwaThemeColor)) {
    current.pwaThemeColor = body.pwaThemeColor;
  }
  if (body.deliveryFee !== undefined) {
    current.deliveryFee = Math.max(0, Math.min(10000, Math.round(Number(body.deliveryFee || 0))));
  }
  if (body.deliveryCommissionPct !== undefined) {
    const pct = Number(body.deliveryCommissionPct || 0);
    current.deliveryCommissionPct = Number.isFinite(pct)
      ? Math.max(0, Math.min(100, Math.round(pct)))
      : 0;
  }
  if (typeof body.codEnabled === 'boolean') current.codEnabled = body.codEnabled;
  if (typeof body.upiId === 'string') current.upiId = sanitizeText(body.upiId, 120);

  if (body.published === true) {
    const approvalBlocked = await customerApprovalBlockedResponse(env, access.row.website_id);
    if (approvalBlocked) return approvalBlocked;
  }

  const nextStatus =
    typeof body.published === 'boolean'
      ? body.published
        ? entitlement.canPublish
          ? 'published'
          : 'unpublished'
        : 'unpublished'
      : access.row.status;

  const nowIso = new Date().toISOString();
  const nextJson = JSON.stringify(current);

  await env.DB!.prepare(
    `UPDATE customer_website_publications
     SET business_name = ?, public_slug = ?, website_json = ?, status = ?,
         published_at = CASE WHEN ? = 'published' AND (published_at IS NULL OR published_at = '') THEN ? ELSE published_at END,
         updated_at = ?
     WHERE website_id = ?`
  )
    .bind(
      nextName,
      nextSlug,
      nextJson,
      nextStatus,
      nextStatus,
      nowIso,
      nowIso,
      access.row.website_id
    )
    .run();

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'website_updated',
    targetType: 'website',
    targetId: access.row.website_id,
    details: { slug: nextSlug, name: nextName, status: nextStatus },
  });

  const updatedRow: PublicationRow = {
    ...access.row,
    business_name: nextName,
    public_slug: nextSlug,
    website_json: nextJson,
    status: nextStatus,
    updated_at: nowIso,
  };

  return jsonResponse({
    tenant: mapPublicationToTenant(updatedRow, current),
  });
}
