// ============================================================================
// VIJAY VISUALS — PROPOSALS MANAGEMENT API
// Endpoints for creating, listing, and updating customer proposals with
// business future preview, feature-wise pricing, and multi-channel delivery.
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, errorJson, handleOptions, json, parseJsonBody, randomHex, sanitizeText } from '../_shared';

export interface ProposalFeatureItem {
  id: string;
  name: string;
  individualValueInr: number;
  whatItDoes: string;
  customerBenefit: string;
  packageStatus: 'included' | 'optional_addon' | 'not_included' | 'third_party';
}

export const DEFAULT_STARTER_FEATURES: ProposalFeatureItem[] = [
  {
    id: 'feat-1',
    name: 'Premium Website Design',
    individualValueInr: 2000,
    whatItDoes: 'Custom responsive design, branded visual identity, mobile-first layouts, and typography.',
    customerBenefit: 'Establishes a luxury, trustworthy brand image that converts visitors into customers.',
    packageStatus: 'included',
  },
  {
    id: 'feat-2',
    name: 'Mobile Responsive Design',
    individualValueInr: 800,
    whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops.',
    customerBenefit: 'Fast, seamless experience for 85%+ customers browsing on mobile devices.',
    packageStatus: 'included',
  },
  {
    id: 'feat-3',
    name: 'Product Catalog and Categories',
    individualValueInr: 1000,
    whatItDoes: 'Organized product/service showcase with prices, variants, photos, and descriptions.',
    customerBenefit: 'Customers can quickly browse items and understand offerings and pricing.',
    packageStatus: 'included',
  },
  {
    id: 'feat-4',
    name: 'Shopping Cart and Checkout',
    individualValueInr: 1000,
    whatItDoes: 'Real-time item additions, instant quantity updates, promo coupons, and address capture.',
    customerBenefit: 'Frictionless purchasing process minimizing abandoned carts and maximizing revenue.',
    packageStatus: 'included',
  },
  {
    id: 'feat-5',
    name: 'Cashfree Payment Integration',
    individualValueInr: 1000,
    whatItDoes: 'Full payment processing with UPI (Google Pay, PhonePe, Paytm), Dynamic QR, Cards, and Net Banking.',
    customerBenefit: 'Direct, reliable payments with instant server verification and zero payment drop-offs.',
    packageStatus: 'included',
  },
  {
    id: 'feat-6',
    name: 'Admin Dashboard',
    individualValueInr: 1000,
    whatItDoes: 'Dedicated business management portal to edit products, prices, banners, orders, and inquiries.',
    customerBenefit: 'Total business independence without needing expensive developers for daily updates.',
    packageStatus: 'included',
  },
  {
    id: 'feat-7',
    name: 'WhatsApp Integration',
    individualValueInr: 400,
    whatItDoes: 'Direct click-to-chat WhatsApp enquiry buttons and instant order alerts.',
    customerBenefit: 'Direct personal interaction with customers on India’s #1 messaging platform.',
    packageStatus: 'included',
  },
  {
    id: 'feat-8',
    name: 'Basic SEO Setup',
    individualValueInr: 500,
    whatItDoes: 'Search-friendly meta tags, sitemap.xml, robots.txt, and local area/city targeting.',
    customerBenefit: 'Helps local customers discover the business on Google searches without paid ads.',
    packageStatus: 'included',
  },
  {
    id: 'feat-9',
    name: 'Contact and Location Setup',
    individualValueInr: 299,
    whatItDoes: 'Interactive Google Map directions, business hours, phone dialers, and address display.',
    customerBenefit: 'Walk-in customers find the physical shop easily and build immediate trust.',
    packageStatus: 'included',
  },
];

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  try {
    const query = auth.user.isSuperAdmin
      ? 'SELECT * FROM platform_proposals ORDER BY created_at DESC LIMIT 100'
      : 'SELECT * FROM platform_proposals WHERE owner_id = ? OR owner_id = ? ORDER BY created_at DESC LIMIT 50';

    const stmt = auth.user.isSuperAdmin
      ? env.DB.prepare(query)
      : env.DB.prepare(query).bind(auth.user.id, auth.user.authSubject);

    const res = await stmt.all<Record<string, any>>();
    const proposals = res.results || [];

    // Calculate revenue & status summary
    let totalProposedInr = 0;
    let approvedInr = 0;
    let pendingInr = 0;
    let approvedCount = 0;

    for (const p of proposals) {
      const amt = Number(p.grand_total_inr || p.development_fee_inr || 0);
      totalProposedInr += amt;
      if (p.status === 'accepted_locked' || p.status === 'paid' || p.delivery_status === 'approved') {
        approvedInr += amt;
        approvedCount++;
      } else {
        pendingInr += amt;
      }
    }

    return json({
      proposals,
      defaultFeatures: DEFAULT_STARTER_FEATURES,
      summary: {
        totalCount: proposals.length,
        totalProposedInr,
        approvedInr,
        pendingInr,
        approvedCount,
        conversionRatePct: proposals.length > 0 ? Math.round((approvedCount / proposals.length) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('Failed to list proposals:', err);
    return errorJson('Failed to load proposals list.', 500);
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body) return errorJson('Invalid request payload.', 400);

  const customerName = sanitizeText(body.customerName || '', 120);
  const customerEmail = sanitizeText(body.customerEmail || '', 140);
  const customerPhone = sanitizeText(body.customerPhone || '', 30);
  const businessName = sanitizeText(body.businessName || '', 140);
  const businessCategory = sanitizeText(body.businessCategory || 'small_business', 60);

  if (customerName.length < 2 || !customerEmail.includes('@') || businessName.length < 2) {
    return errorJson('Customer name, valid email, and business name are required.', 400);
  }

  // Feature breakdown & pricing calculation
  let features: ProposalFeatureItem[] = DEFAULT_STARTER_FEATURES;
  if (Array.isArray(body.featureBreakdown) && body.featureBreakdown.length > 0) {
    features = body.featureBreakdown.map((f: any, idx: number) => ({
      id: sanitizeText(f.id || `feat-${idx + 1}`, 40),
      name: sanitizeText(f.name || 'Custom Feature', 120),
      individualValueInr: Math.max(0, Number(f.individualValueInr) || 0),
      whatItDoes: sanitizeText(f.whatItDoes || '', 400),
      customerBenefit: sanitizeText(f.customerBenefit || '', 400),
      packageStatus: ['included', 'optional_addon', 'not_included', 'third_party'].includes(f.packageStatus)
        ? f.packageStatus
        : 'included',
    }));
  }

  // Automatically calculate development fee from included features
  const includedSum = features
    .filter((f) => f.packageStatus === 'included')
    .reduce((sum, f) => sum + f.individualValueInr, 0);

  const devFee = includedSum > 0 ? includedSum : 7999;
  const maintFee = Math.max(0, Number(body.maintenanceMonthlyInr) || 0);
  const domainHostingFee = Math.max(0, Number(body.domainHostingYearlyInr) || 0);
  const subtotal = devFee + maintFee + domainHostingFee;
  const gstPercent = 18;
  const gstInr = Math.round((subtotal * gstPercent) / 100);
  const grandTotal = subtotal + gstInr;

  const proposalNumber = `VVQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomHex(2).toUpperCase()}`;
  const secureToken = `vv_prop_${randomHex(16)}`;

  const packageTier = ['STARTER', 'GOLD', 'PREMIUM'].includes(body.packageTier) ? body.packageTier : 'STARTER';
  const packageCode = packageTier === 'STARTER' ? 'starter' : packageTier === 'GOLD' ? 'professional' : 'premium';

  const packagesComparison = body.packagesComparison || {
    starter: { priceInr: 7999, name: 'STARTER', deliveryDays: '3–5 Days', support: '30 Days Free WhatsApp & Email' },
    gold: { priceInr: Math.max(devFee + 7000, Number(body.goldPriceInr) || 14999), name: 'GOLD', deliveryDays: '5–7 Days', support: '90 Days Priority Support' },
    premium: { priceInr: Math.max(devFee + 17000, Number(body.premiumPriceInr) || 24999), name: 'PREMIUM', deliveryDays: '7–10 Days', support: '1 Year VIP Support + PWA' },
  };

  const defaultProducts = [
    { name: 'Featured Offering 1', price: 999, category: 'Main', description: 'Core product or signature service with premium presentation.' },
    { name: 'Featured Offering 2', price: 1499, category: 'Popular', description: 'Bestseller customer choice with custom options.' },
    { name: 'Special Package', price: 2999, category: 'Combos', description: 'High-value bundled package with exclusive customer perks.' },
  ];

  const productsJson = Array.isArray(body.products) && body.products.length > 0
    ? JSON.stringify(body.products)
    : JSON.stringify(defaultProducts);

  const businessPhotosJson = Array.isArray(body.businessPhotos)
    ? JSON.stringify(body.businessPhotos)
    : JSON.stringify([
        'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80',
      ]);

  const socialLinksJson = JSON.stringify(body.socialLinks || { instagram: '', facebook: '', whatsapp: customerPhone });
  const preferredColorsJson = JSON.stringify(body.preferredColors || { primary: '#D4AF37', accent: '#0D0D12', theme: 'luxury_gold' });

  try {
    const res = await env.DB.prepare(
      `INSERT INTO platform_proposals (
        proposal_number, owner_id, website_id, customer_name, customer_email, customer_phone,
        business_name, business_category, package_code, package_name, development_fee_inr,
        maintenance_monthly_inr, domain_hosting_yearly_inr, included_items_json, excluded_items_json,
        subtotal_inr, gst_percent, gst_inr, grand_total_inr, status,
        secure_token, business_logo_url, cover_image_url, business_photos_json, products_json,
        business_address, area, city, state, pincode, opening_hours, social_links_json,
        preferred_colors_json, feature_breakdown_json, package_tier, packages_comparison_json,
        delivery_status, view_count, expires_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 'draft',
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        'draft', 0, datetime('now', '+30 days'), datetime('now'), datetime('now')
      )`
    )
      .bind(
        proposalNumber,
        auth.user.id,
        body.websiteId ? sanitizeText(body.websiteId, 120) : null,
        customerName,
        customerEmail,
        customerPhone,
        businessName,
        businessCategory,
        packageCode,
        `${packageTier} Business Website Package`,
        devFee,
        maintFee,
        domainHostingFee,
        JSON.stringify(features.filter((f) => f.packageStatus === 'included').map((f) => f.name)),
        JSON.stringify(features.filter((f) => f.packageStatus !== 'included').map((f) => f.name)),
        subtotal,
        gstPercent,
        gstInr,
        grandTotal,
        secureToken,
        sanitizeText(body.businessLogoUrl || '', 300),
        sanitizeText(body.coverImageUrl || '', 300),
        businessPhotosJson,
        productsJson,
        sanitizeText(body.businessAddress || '', 300),
        sanitizeText(body.area || '', 100),
        sanitizeText(body.city || 'Hyderabad', 100),
        sanitizeText(body.state || 'Telangana', 100),
        sanitizeText(body.pincode || '500081', 20),
        sanitizeText(body.openingHours || 'Mon–Sat: 10:00 AM – 9:00 PM', 120),
        socialLinksJson,
        preferredColorsJson,
        JSON.stringify(features),
        packageTier,
        JSON.stringify(packagesComparison)
      )
      .run();

    const newId = Number(res.meta?.last_row_id || 0);
    const created = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(newId).first();

    return json({ proposal: created, secureToken, proposalNumber }, 201);
  } catch (err) {
    console.error('Failed to create proposal:', err);
    return errorJson('Failed to create proposal record.', 500);
  }
}

export async function onRequestPut(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<Record<string, any>>(request);
  if (!body || !body.id) return errorJson('Proposal ID is required.', 400);

  const id = Number(body.id);
  const existing = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!existing) return errorJson('Proposal not found.', 404);

  const isOwner = existing.owner_id === auth.user.id || existing.owner_id === auth.user.authSubject || auth.user.isSuperAdmin;
  if (!isOwner) return errorJson('Forbidden: you cannot edit this proposal.', 403);

  // Recalculate feature prices if provided
  let features = existing.feature_breakdown_json ? JSON.parse(existing.feature_breakdown_json) : DEFAULT_STARTER_FEATURES;
  if (Array.isArray(body.featureBreakdown)) {
    features = body.featureBreakdown;
  }

  const includedSum = features
    .filter((f: any) => f.packageStatus === 'included')
    .reduce((sum: number, f: any) => sum + (Number(f.individualValueInr) || 0), 0);

  const devFee = includedSum > 0 ? includedSum : (Number(body.developmentFeeInr) || existing.development_fee_inr);
  const maintFee = body.maintenanceMonthlyInr !== undefined ? Number(body.maintenanceMonthlyInr) : existing.maintenance_monthly_inr;
  const domainHostingFee = body.domainHostingYearlyInr !== undefined ? Number(body.domainHostingYearlyInr) : existing.domain_hosting_yearly_inr;
  const subtotal = devFee + maintFee + domainHostingFee;
  const gstInr = Math.round((subtotal * 18) / 100);
  const grandTotal = subtotal + gstInr;

  try {
    await env.DB.prepare(
      `UPDATE platform_proposals SET
        customer_name = COALESCE(?, customer_name),
        customer_email = COALESCE(?, customer_email),
        customer_phone = COALESCE(?, customer_phone),
        business_name = COALESCE(?, business_name),
        business_category = COALESCE(?, business_category),
        development_fee_inr = ?,
        maintenance_monthly_inr = ?,
        domain_hosting_yearly_inr = ?,
        subtotal_inr = ?,
        gst_inr = ?,
        grand_total_inr = ?,
        business_logo_url = COALESCE(?, business_logo_url),
        cover_image_url = COALESCE(?, cover_image_url),
        business_photos_json = COALESCE(?, business_photos_json),
        products_json = COALESCE(?, products_json),
        business_address = COALESCE(?, business_address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        pincode = COALESCE(?, pincode),
        opening_hours = COALESCE(?, opening_hours),
        feature_breakdown_json = ?,
        package_tier = COALESCE(?, package_tier),
        packages_comparison_json = COALESCE(?, packages_comparison_json),
        delivery_status = COALESCE(?, delivery_status),
        updated_at = datetime('now')
      WHERE id = ?`
    )
      .bind(
        body.customerName ? sanitizeText(body.customerName, 120) : null,
        body.customerEmail ? sanitizeText(body.customerEmail, 140) : null,
        body.customerPhone ? sanitizeText(body.customerPhone, 30) : null,
        body.businessName ? sanitizeText(body.businessName, 140) : null,
        body.businessCategory ? sanitizeText(body.businessCategory, 60) : null,
        devFee,
        maintFee,
        domainHostingFee,
        subtotal,
        gstInr,
        grandTotal,
        body.businessLogoUrl ? sanitizeText(body.businessLogoUrl, 300) : null,
        body.coverImageUrl ? sanitizeText(body.coverImageUrl, 300) : null,
        body.businessPhotos ? JSON.stringify(body.businessPhotos) : null,
        body.products ? JSON.stringify(body.products) : null,
        body.businessAddress ? sanitizeText(body.businessAddress, 300) : null,
        body.city ? sanitizeText(body.city, 100) : null,
        body.state ? sanitizeText(body.state, 100) : null,
        body.pincode ? sanitizeText(body.pincode, 20) : null,
        body.openingHours ? sanitizeText(body.openingHours, 120) : null,
        JSON.stringify(features),
        body.packageTier ? sanitizeText(body.packageTier, 40) : null,
        body.packagesComparison ? JSON.stringify(body.packagesComparison) : null,
        body.deliveryStatus ? sanitizeText(body.deliveryStatus, 40) : null,
        id
      )
      .run();

    const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(id).first();
    return json({ proposal: updated });
  } catch (err) {
    console.error('Failed to update proposal:', err);
    return errorJson('Failed to update proposal.', 500);
  }
}
