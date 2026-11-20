// ============================================================================
// GET & POST /api/platform/proposals
// Configurable Vijay Visuals Website Packages (Starter, Professional, Premium,
// Custom Enterprise) + Transparent GST Quotations & Customer Confirmation Lock.
// NEVER charges customers without explicit confirmation!
// ============================================================================

import { requireUser } from '../_auth';
import { PagesContext, errorJson, json, parseJsonBody, randomHex, sanitizeText } from '../_shared';

export interface WebsitePackageSpec {
  code: 'starter' | 'professional' | 'premium' | 'custom_enterprise';
  name: string;
  oneTimeDevelopmentInr: number;
  optionalMaintenanceMonthlyInr: number;
  optionalDomainHostingYearlyInr: number;
  gstPercent: number;
  included: string[];
  excluded: string[];
}

export const WEBSITE_PACKAGES: WebsitePackageSpec[] = [
  {
    code: 'starter',
    name: 'Starter Website Package',
    oneTimeDevelopmentInr: 7999,
    optionalMaintenanceMonthlyInr: 499,
    optionalDomainHostingYearlyInr: 1499,
    gstPercent: 18,
    included: [
      'Responsive mobile-first business website (up to 5 sections)',
      'Industry template (Clothing, Cafe, Salon, Gym, Local Business, etc.)',
      'Custom logo, colors, fonts & WhatsApp contact CTA',
      'Basic on-page SEO meta tags, sitemap.xml & robots.txt',
      '1 custom domain connection setup & SSL configuration guidance',
    ],
    excluded: [
      'Domain registrar renewal fees (paid directly in customer registrar account)',
      'Paid third-party WhatsApp/SMS API message fees',
      'Guaranteed #1 Google search rankings (unethical & never promised)',
    ],
  },
  {
    code: 'professional',
    name: 'Professional E-Commerce Package',
    oneTimeDevelopmentInr: 18999,
    optionalMaintenanceMonthlyInr: 1499,
    optionalDomainHostingYearlyInr: 1999,
    gstPercent: 18,
    included: [
      'Full online store with categories, variants, inventory & coupons',
      'Verified customer reviews & ratings with shop owner moderation',
      'Shop Owner Admin Dashboard, CRM leads & GST sales summaries',
      'Cash on Delivery + Seller direct/Razorpay Route readiness (subject to KYC)',
      'Multi-branch Google Maps / Mapbox location preview & directions',
    ],
    excluded: [
      'Payment gateway MDR fees (charged directly by Razorpay)',
      'Courier shipping charges (paid directly to Shiprocket/carrier)',
      'Statutory CA tax filing (finance reports are operational estimates)',
    ],
  },
  {
    code: 'premium',
    name: 'Premium Growth & Automation Suite',
    oneTimeDevelopmentInr: 34999,
    optionalMaintenanceMonthlyInr: 2999,
    optionalDomainHostingYearlyInr: 2999,
    gstPercent: 18,
    included: [
      'Everything in Professional + Multi-warehouse inventory & Delivery Partner dashboard',
      'Shiprocket integration support + WhatsApp Cloud API notification templates',
      'AI Business Assistant (English, Telugu & Hindi) with metered usage',
      'Staff accounts & role permissions + priority support & handover training',
    ],
    excluded: [
      'Third-party API subscription & usage charges (WhatsApp, SMS, Maps)',
      'External registrar domain renewal charges',
    ],
  },
  {
    code: 'custom_enterprise',
    name: 'Custom Enterprise Solution',
    oneTimeDevelopmentInr: 75000,
    optionalMaintenanceMonthlyInr: 7999,
    optionalDomainHostingYearlyInr: 5999,
    gstPercent: 18,
    included: [
      'Bespoke multi-branch / multi-storefront architecture & custom workflows',
      'Cloudflare for SaaS custom hostname scaling beyond 100 domains',
      'Dedicated onboarding engineer, custom integrations & SLA',
      'Complete data portability, audit logging & enterprise handover package',
    ],
    excluded: [
      'Dedicated cloud infrastructure overages billed at provider cost',
      'Custom native mobile app store developer accounts (Apple/Google)',
    ],
  },
];

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  let proposals: unknown[] = [];
  if (request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const res = auth.user.isSuperAdmin
      ? await env.DB.prepare('SELECT * FROM platform_proposals ORDER BY created_at DESC LIMIT 100').all()
      : await env.DB.prepare(
          'SELECT * FROM platform_proposals WHERE owner_id = ? OR owner_id = ? ORDER BY created_at DESC LIMIT 50'
        )
          .bind(auth.user.id, auth.user.authSubject)
          .all();
    proposals = res.results || [];
  }

  return json({
    billingTransparencyNotice:
      'One-time website development charges, optional monthly maintenance, and optional domain/hosting charges are itemized separately with 18% GST. Customers are never charged without explicit confirmation.',
    packages: WEBSITE_PACKAGES,
    proposals,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    action?: 'create' | 'accept_and_lock';
    proposalId?: number;
    proposalNumber?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    businessName?: string;
    businessCategory?: string;
    packageCode?: WebsitePackageSpec['code'];
    includeMaintenance?: boolean;
    includeDomainHosting?: boolean;
    websiteId?: string;
  }>(request);

  if (!body) return errorJson('Invalid JSON payload.', 400);
  const action = body.action || 'create';

  // Explicit customer confirmation locks the quotation
  if (action === 'accept_and_lock') {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const propId = Number(body.proposalId || 0);
    const propNum = sanitizeText(body.proposalNumber || '', 60);
    if (!propId && !propNum) {
      return errorJson('proposalId or proposalNumber is required.', 400);
    }

    const row = await env.DB.prepare(
      'SELECT * FROM platform_proposals WHERE id = ? OR proposal_number = ? LIMIT 1'
    )
      .bind(propId || -1, propNum || '__none__')
      .first<{ id: number; owner_id: string | null; customer_email: string; proposal_number: string }>();

    if (!row) return errorJson('Quotation/proposal not found.', 404);
    const isOwner =
      row.owner_id === auth.user.id ||
      row.owner_id === auth.user.authSubject ||
      (row.customer_email && row.customer_email.toLowerCase() === auth.user.email.toLowerCase());
    if (!isOwner && !auth.user.isSuperAdmin) {
      return errorJson('Forbidden: you cannot accept another customer’s quotation.', 403);
    }

    await env.DB.prepare(
      `UPDATE platform_proposals
       SET status = 'accepted_locked', owner_id = COALESCE(owner_id, ?), customer_confirmed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(auth.user.id, row.id)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?').bind(row.id).first();
    return json({
      accepted: true,
      proposal: updated,
      message: `Quotation ${row.proposal_number} confirmed and price-locked. Proceed to Razorpay checkout only when ready to pay.`,
    });
  }

  // Create transparent server-calculated quotation (no automatic charge)
  let ownerId: string | null = null;
  if (request.headers.get('Authorization')) {
    const auth = await requireUser(request, env);
    if (auth.ok) ownerId = auth.user.id;
  }

  const customerName = sanitizeText(body.customerName || '', 120);
  const customerEmail = sanitizeText(body.customerEmail || '', 140);
  const businessName = sanitizeText(body.businessName || '', 140);
  if (customerName.length < 2 || !customerEmail.includes('@') || businessName.length < 2) {
    return errorJson('Valid customerName, customerEmail, and businessName are required.', 400);
  }

  const pkg =
    WEBSITE_PACKAGES.find((p) => p.code === body.packageCode) || WEBSITE_PACKAGES[0];
  const devFee = pkg.oneTimeDevelopmentInr;
  const maintFee = body.includeMaintenance ? pkg.optionalMaintenanceMonthlyInr : 0;
  const domainHostingFee = body.includeDomainHosting ? pkg.optionalDomainHostingYearlyInr : 0;
  const subtotal = devFee + maintFee + domainHostingFee;
  const gst = Math.round((subtotal * pkg.gstPercent) / 100);
  const grandTotal = subtotal + gst;
  const proposalNumber = `VVQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomHex(2).toUpperCase()}`;

  const res = await env.DB.prepare(
    `INSERT INTO platform_proposals
      (proposal_number, owner_id, website_id, customer_name, customer_email, customer_phone,
       business_name, business_category, package_code, package_name, development_fee_inr,
       maintenance_monthly_inr, domain_hosting_yearly_inr, included_items_json, excluded_items_json,
       subtotal_inr, gst_percent, gst_inr, grand_total_inr, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`
  )
    .bind(
      proposalNumber,
      ownerId,
      body.websiteId ? sanitizeText(body.websiteId, 120) : null,
      customerName,
      customerEmail,
      sanitizeText(body.customerPhone || '', 30),
      businessName,
      sanitizeText(body.businessCategory || 'small_business', 60),
      pkg.code,
      pkg.name,
      devFee,
      maintFee,
      domainHostingFee,
      JSON.stringify(pkg.included),
      JSON.stringify(pkg.excluded),
      subtotal,
      pkg.gstPercent,
      gst,
      grandTotal
    )
    .run();

  const saved = await env.DB.prepare('SELECT * FROM platform_proposals WHERE id = ?')
    .bind(Number(res.meta?.last_row_id || 0))
    .first();

  return json(
    {
      proposal: saved,
      noAutoChargeNotice: 'Quotation generated only. No payment is taken until explicit customer confirmation and verified Razorpay checkout.',
    },
    201
  );
}
