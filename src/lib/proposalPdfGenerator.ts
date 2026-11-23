// ============================================================================
// VIJAY VISUALS — LUXURY GOLD & MATTE BLACK PROPOSAL PDF GENERATOR
// Produces an international digital agency 9-page A4 print-ready proposal
// with Deep Matte Black, Metallic Gold, device mockups, feature tables,
// and honest transparent cost explanations.
// ============================================================================

import { OFFICIAL_VV_LOGO_BASE64 } from './officialLogo';

export interface ProposalRecord {
  id: number;
  proposal_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  business_name: string;
  business_category: string;
  business_logo_url?: string;
  cover_image_url?: string;
  business_photos_json?: string;
  products_json?: string;
  business_address?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  opening_hours?: string;
  development_fee_inr: number;
  maintenance_monthly_inr?: number;
  domain_hosting_yearly_inr?: number;
  subtotal_inr?: number;
  gst_percent?: number;
  gst_inr?: number;
  grand_total_inr: number;
  package_tier?: string;
  packages_comparison_json?: string;
  feature_breakdown_json?: string;
  status: string;
  delivery_status?: string;
  view_count?: number;
  secure_token?: string;
  created_at: string;
  expires_at?: string;
}

export function generateProposalHtml(p: ProposalRecord): string {
  let features = [];
  try {
    features = p.feature_breakdown_json ? JSON.parse(p.feature_breakdown_json) : [];
  } catch {}

  let products = [];
  try {
    products = p.products_json ? JSON.parse(p.products_json) : [];
  } catch {}

  let packagesCmp: any = {};
  try {
    packagesCmp = p.packages_comparison_json ? JSON.parse(p.packages_comparison_json) : {};
  } catch {}

  const tier = p.package_tier || 'STARTER';
  const devFee = p.development_fee_inr || 7999;
  const totalAmount = p.grand_total_inr || (devFee + Math.round((devFee * 18) / 100));
  const goldPrice = packagesCmp.gold?.priceInr || 14999;
  const premiumPrice = packagesCmp.premium?.priceInr || 24999;

  const dateFormatted = new Date(p.created_at || Date.now()).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const categoryName = (p.business_category || 'Business')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>VIJAY VISUALS — Proposal ${p.proposal_number} for ${p.business_name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #0A0A0F;
      color: #E2E2EA;
      line-height: 1.5;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      padding: 16mm 18mm 14mm 18mm;
      position: relative;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #0A0A0F;
      border-bottom: 1px solid #1A1A24;
      overflow: hidden;
    }
    .page:last-child {
      page-break-after: avoid;
    }
    .page-light {
      background: #0E0E16;
    }
    .gold-gradient-text {
      background: linear-gradient(135deg, #ECC86A 0%, #D4AF37 50%, #B89628 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .gold-border {
      border: 1px solid #D4AF37;
    }
    .gold-box {
      background: rgba(212, 175, 55, 0.05);
      border: 1px solid rgba(212, 175, 55, 0.35);
      border-radius: 8px;
    }
    .header-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid #222230;
      margin-bottom: 16px;
    }
    .header-logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-logo-img {
      width: 24px;
      height: 24px;
      object-fit: contain;
      border-radius: 4px;
      border: 1px solid rgba(212, 175, 55, 0.4);
      background: #0A0A0F;
    }
    .header-logo-text {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #D4AF37;
    }
    .header-meta {
      font-size: 9px;
      color: #8E8EA2;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid #1F1F2C;
      font-size: 8.5px;
      color: #717182;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .table-luxury {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
      margin-top: 10px;
    }
    .table-luxury th {
      background: #14141E;
      color: #D4AF37;
      text-align: left;
      padding: 7px 10px;
      border-bottom: 1px solid #2A2A3A;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .table-luxury td {
      padding: 6.5px 10px;
      border-bottom: 1px solid #1A1A24;
      color: #D4D4E0;
    }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-included {
      background: rgba(16, 185, 129, 0.15);
      color: #10B981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-optional {
      background: rgba(234, 179, 8, 0.15);
      color: #EAB308;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }
    .badge-thirdparty {
      background: rgba(147, 51, 234, 0.15);
      color: #C084FC;
      border: 1px solid rgba(147, 51, 234, 0.3);
    }
    .device-mockup {
      background: #12121A;
      border: 2px solid #2A2A38;
      border-radius: 12px;
      padding: 8px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .card-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .feature-card {
      background: #12121C;
      border: 1px solid #222232;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .package-column {
      background: #111119;
      border: 1px solid #242436;
      border-radius: 10px;
      padding: 14px 12px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .package-column.featured {
      border: 1.5px solid #D4AF37;
      background: #14131B;
      box-shadow: 0 0 20px rgba(212, 175, 55, 0.15);
    }
    @media print {
      body {
        background: transparent;
      }
      .page {
        border-bottom: none;
      }
    }
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: LUXURY COVER PAGE                                                -->
  <!-- ========================================================================= -->
  <div class="page" style="background: radial-gradient(circle at 50% 20%, #1A1710 0%, #0A0A0F 80%); justify-content: space-between;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 14px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS Official Logo" style="width: 44px; height: 44px; border-radius: 8px; border: 1.5px solid #D4AF37; background: #0A0A0F; object-fit: contain;" />
        <div>
          <div style="font-size: 16px; font-weight: 800; letter-spacing: 2px; color: #D4AF37;">VIJAY VISUALS</div>
          <div style="font-size: 8.5px; color: #8E8EA2; letter-spacing: 1px; text-transform: uppercase;">Official Mobile: +91 9381362201 · vk66278@gmail.com</div>
        </div>
      </div>
      <div style="text-align: right; font-size: 9px; color: #D4AF37; border: 1px solid rgba(212, 175, 55, 0.4); padding: 5px 12px; border-radius: 6px;">
        PROPOSAL #${p.proposal_number}
      </div>
    </div>

    <div style="text-align: center; margin: 24px 0 16px 0;">
      <div style="display: inline-block; padding: 10px; background: rgba(10, 10, 15, 0.95); border: 1.5px solid rgba(212, 175, 55, 0.6); border-radius: 14px; box-shadow: 0 0 30px rgba(212, 175, 55, 0.2); margin-bottom: 12px;">
        <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS Monogram" style="width: 130px; height: auto; display: block; margin: 0 auto; object-fit: contain;" />
      </div>
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: #D4AF37; margin-bottom: 8px; font-weight: 600;">
        Executive Digital Architecture Proposal
      </div>
      <h1 style="font-size: 32px; font-weight: 800; margin: 0 0 8px 0; color: #FFFFFF; letter-spacing: 1px;">
        ${p.business_name}
      </h1>
      <div style="font-size: 14px; color: #ECC86A; font-weight: 500; letter-spacing: 0.5px;">
        ${categoryName} Digital Storefront & Online Ecosystem
      </div>

      <div style="max-width: 440px; margin: 24px auto 0 auto; padding: 16px 24px; background: rgba(18, 18, 26, 0.8); border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 12px;">
        <div style="font-size: 10px; color: #8E8EA2; text-transform: uppercase; letter-spacing: 1.5px;">Selected Package Tier</div>
        <div style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin: 4px 0 6px 0;">
          ${tier} <span style="font-size: 15px; font-weight: 400; color: #A5A5B8;">PACKAGE</span>
        </div>
        <div style="font-size: 20px; font-weight: 800; color: #ECC86A;">
          ₹${totalAmount.toLocaleString('en-IN')} <span style="font-size: 10px; font-weight: 400; color: #8E8EA2;">(One-Time · 18% GST Included)</span>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 16px; background: #111119; border: 1px solid #222232; border-radius: 10px;">
      <div>
        <div style="font-size: 8.5px; color: #7C7C92; text-transform: uppercase;">Client / Owner</div>
        <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-top: 2px;">${p.customer_name}</div>
        <div style="font-size: 9.5px; color: #9A9AB0;">${p.customer_phone || '+91 9381362201'}</div>
      </div>
      <div>
        <div style="font-size: 8.5px; color: #7C7C92; text-transform: uppercase;">Location / Region</div>
        <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-top: 2px;">${p.city || 'Hyderabad'}, ${p.state || 'Telangana'}</div>
        <div style="font-size: 9.5px; color: #9A9AB0;">PIN: ${p.pincode || '500081'}</div>
      </div>
      <div>
        <div style="font-size: 8.5px; color: #7C7C92; text-transform: uppercase;">Proposal Date & Status</div>
        <div style="font-size: 11px; font-weight: 600; color: #ECC86A; margin-top: 2px;">${dateFormatted}</div>
        <div style="font-size: 9.5px; color: #10B981;">Valid for 30 Days · Verified</div>
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · Official Mobile: +91 9381362201 · vk66278@gmail.com · Hyderabad, Telangana</div>
      <div>Page 1 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 2: BUSINESS FUTURE VISION                                            -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 01 · Online Business Architecture</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 16px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Strategic Transformation</div>
        <h2 style="font-size: 20px; font-weight: 700; color: #FFFFFF; margin: 2px 0 6px 0;">How ${p.business_name} Will Look Online</h2>
        <p style="font-size: 10.5px; color: #B0B0C4; margin: 0; line-height: 1.6;">
          In today’s digital market, your customer’s first impression happens online before they ever walk into your shop or place an order. We design a bespoke, high-converting digital presence engineered specifically for the <strong>${categoryName}</strong> industry.
        </p>
      </div>

      <div style="background: #12121C; border: 1px solid #222234; border-radius: 10px; padding: 14px; margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 600; color: #ECC86A; margin-bottom: 6px;">Customer Experience Journey</div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 9.5px;">
          <div style="background: #171724; padding: 10px; border-radius: 6px; border: 1px solid #27273A;">
            <div style="color: #D4AF37; font-weight: 700; font-size: 12px; margin-bottom: 3px;">01. Discover</div>
            <div style="color: #D4D4E2;">Customer searches on Google or clicks your Instagram/WhatsApp link.</div>
          </div>
          <div style="background: #171724; padding: 10px; border-radius: 6px; border: 1px solid #27273A;">
            <div style="color: #D4AF37; font-weight: 700; font-size: 12px; margin-bottom: 3px;">02. Browse</div>
            <div style="color: #D4D4E2;">Explores high-res catalog, prices, reviews & chef specials on any phone.</div>
          </div>
          <div style="background: #171724; padding: 10px; border-radius: 6px; border: 1px solid #27273A;">
            <div style="color: #D4AF37; font-weight: 700; font-size: 12px; margin-bottom: 3px;">03. Order / Enquire</div>
            <div style="color: #D4D4E2;">Adds items to cart with instant WhatsApp enquiry or online checkout.</div>
          </div>
          <div style="background: #171724; padding: 10px; border-radius: 6px; border: 1px solid #27273A;">
            <div style="color: #D4AF37; font-weight: 700; font-size: 12px; margin-bottom: 3px;">04. Pay & Repeat</div>
            <div style="color: #D4D4E2;">Fast UPI / QR / NetBanking payment, automated tracking & repeat visits.</div>
          </div>
        </div>
      </div>

      <div class="card-grid">
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 4px;">Mobile-First Responsive Layout</div>
          <p style="font-size: 9.5px; color: #9A9AB4; margin: 0; line-height: 1.5;">
            Over 85% of retail & dining customers browse on smartphones. Your website fluidly adapts to iOS Safari and Android Chrome with instant sub-second page loads.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 4px;">Brand-Aligned Visual Identity</div>
          <p style="font-size: 9.5px; color: #9A9AB4; margin: 0; line-height: 1.5;">
            Custom metallic gold accents, tailored color palette, high-contrast typography, and curated imagery reflecting your real business pride and local reputation.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 4px;">Direct Walk-In & Directions CTA</div>
          <p style="font-size: 9.5px; color: #9A9AB4; margin: 0; line-height: 1.5;">
            Interactive map integration for ${p.area || p.city || 'your area'}, instant one-tap calling, and accurate business opening hours so nearby customers find you easily.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 4px;">Self-Editing Business Control</div>
          <p style="font-size: 9.5px; color: #9A9AB4; margin: 0; line-height: 1.5;">
            You own a dedicated Business Owner Dashboard to change prices, upload photos, add products, view orders, and manage inquiries without hiring a web developer.
          </p>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Business Future Architecture</div>
      <div>Page 2 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 3: FEATURES & BUSINESS BENEFITS                                      -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 02 · Feature Specifications & Real Business Value</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Core Specifications</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Every Feature Explained in Plain Language</h2>
        <p style="font-size: 10px; color: #A0A0B8; margin: 0;">
          We don't use confusing technical jargon. Here is exactly what each core feature does, why it is essential, and how it directly benefits ${p.business_name}:
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${(features.length > 0 ? features : [
          { name: 'Premium Website Design', whatItDoes: 'Custom responsive design, branded visual identity, mobile-first layouts, and typography.', customerBenefit: 'Establishes a luxury, trustworthy brand image that converts visitors into customers.', individualValueInr: 2000 },
          { name: 'Mobile Responsive Design', whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops.', customerBenefit: 'Fast, seamless experience for 85%+ customers browsing on mobile devices.', individualValueInr: 800 },
          { name: 'Product Catalog and Categories', whatItDoes: 'Organized product/service showcase with prices, variants, photos, and descriptions.', customerBenefit: 'Customers can quickly browse items and understand offerings and pricing.', individualValueInr: 1000 },
          { name: 'Shopping Cart and Checkout', whatItDoes: 'Real-time item additions, instant quantity updates, promo coupons, and address capture.', customerBenefit: 'Frictionless purchasing process minimizing abandoned carts and maximizing revenue.', individualValueInr: 1000 },
          { name: 'Cashfree Payment Integration', whatItDoes: 'Full payment processing with UPI (Google Pay, PhonePe, Paytm), Dynamic QR, Cards, and Net Banking.', customerBenefit: 'Direct, reliable payments with instant server verification and zero payment drop-offs.', individualValueInr: 1000 },
          { name: 'Admin Dashboard', whatItDoes: 'Dedicated business management portal to edit products, prices, banners, orders, and inquiries.', customerBenefit: 'Total business independence without needing expensive developers for daily updates.', individualValueInr: 1000 },
          { name: 'WhatsApp Integration', whatItDoes: 'Direct click-to-chat WhatsApp enquiry buttons and instant order alerts.', customerBenefit: 'Direct personal interaction with customers on India’s #1 messaging platform.', individualValueInr: 400 },
          { name: 'Basic SEO Setup', whatItDoes: 'Search-friendly meta tags, sitemap.xml, robots.txt, and local area/city targeting.', customerBenefit: 'Helps local customers discover the business on Google searches without paid ads.', individualValueInr: 500 },
          { name: 'Contact and Location Setup', whatItDoes: 'Interactive Google Map directions, business hours, phone dialers, and address display.', customerBenefit: 'Walk-in customers find the physical shop easily and build immediate trust.', individualValueInr: 299 },
        ]).slice(0, 7).map((f: any, i: number) => `
          <div style="background: #12121B; border: 1px solid #232332; border-radius: 6px; padding: 7px 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="color: #D4AF37; font-weight: 700; font-size: 10px;">0${i + 1}.</span>
                <span style="font-size: 11px; font-weight: 600; color: #FFFFFF;">${f.name}</span>
                <span class="badge badge-included">Included</span>
              </div>
              <div style="font-size: 9px; color: #8E8EA2; margin-top: 2px;">
                <strong>What it does:</strong> ${f.whatItDoes}
              </div>
              <div style="font-size: 9px; color: #10B981; margin-top: 1px;">
                <strong>Benefit:</strong> ${f.customerBenefit}
              </div>
            </div>
            <div style="text-align: right; min-width: 65px;">
              <div style="font-size: 8px; color: #7C7C92; text-transform: uppercase;">Valued at</div>
              <div style="font-size: 11px; font-weight: 700; color: #ECC86A;">₹${(f.individualValueInr || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Specifications & Real Benefits</div>
      <div>Page 3 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 4: FEATURE-WISE PRICING BREAKDOWN (TOTAL ₹7,999)                     -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 03 · Transparent Feature-wise Pricing</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 8px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Itemized Transparency</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Feature-Wise Value Allocation</h2>
        <p style="font-size: 9.5px; color: #9A9AB0; margin: 0;">
          These proposed package allocations detail what each component is valued at in our <strong>₹7,999 Starter Business Package</strong>. Every price is editable, itemized, and transparently verified with zero hidden costs:
        </p>
      </div>

      <table class="table-luxury">
        <thead>
          <tr>
            <th style="width: 28%;">Feature</th>
            <th style="width: 14%; text-align: right;">Value</th>
            <th style="width: 28%;">What It Does</th>
            <th style="width: 20%;">Customer Benefit</th>
            <th style="width: 10%; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Premium Website Design</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹2,000</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Bespoke layout, luxury branding & typography</td>
            <td style="font-size: 8.5px; color: #10B981;">Converts visitors into paying clients</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>2. Mobile Responsive Design</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹800</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Fluid viewport adaptation for smartphones</td>
            <td style="font-size: 8.5px; color: #10B981;">Smooth experience for 85%+ mobile users</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>3. Product Catalog & Categories</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹1,000</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">High-res items, prices, variants & photos</td>
            <td style="font-size: 8.5px; color: #10B981;">Clear product offerings and menu pricing</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>4. Shopping Cart & Checkout</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹1,000</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Real-time cart, promo coupons, checkout drawer</td>
            <td style="font-size: 8.5px; color: #10B981;">Minimizes cart drop-offs & friction</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>5. Cashfree Payment Gateway</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹1,000</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">UPI, Dynamic QR, Visa/Mastercard/RuPay & Banks</td>
            <td style="font-size: 8.5px; color: #10B981;">Reliable direct payments to your account</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>6. Business Owner Dashboard</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹1,000</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Self-editing portal for products, prices & orders</td>
            <td style="font-size: 8.5px; color: #10B981;">Zero developer dependency for updates</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>7. WhatsApp Integration</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹400</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Click-to-chat WhatsApp inquiry & order alerts</td>
            <td style="font-size: 8.5px; color: #10B981;">Direct personal customer relationship</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>8. Basic SEO & Search Setup</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹500</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Meta tags, sitemap.xml, Google local targeting</td>
            <td style="font-size: 8.5px; color: #10B981;">Helps local customers find you on Google</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
          <tr>
            <td><strong>9. Contact & Map Location Setup</strong></td>
            <td style="text-align: right; color: #ECC86A; font-weight: 600;">₹299</td>
            <td style="font-size: 8.5px; color: #B0B0C4;">Interactive Google Map directions & hours</td>
            <td style="font-size: 8.5px; color: #10B981;">Walk-in footfall trust and easy navigation</td>
            <td style="text-align: center;"><span class="badge badge-included">Included</span></td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 10px; background: #141420; border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 9px; color: #8E8EA2; text-transform: uppercase;">Starter Package Base Fee</div>
          <div style="font-size: 13px; font-weight: 700; color: #FFFFFF;">₹7,999 Subtotal</div>
        </div>
        <div>
          <div style="font-size: 9px; color: #8E8EA2; text-transform: uppercase;">GST (18% Statutory)</div>
          <div style="font-size: 13px; font-weight: 700; color: #FFFFFF;">+₹1,440 Tax</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 9px; color: #ECC86A; text-transform: uppercase; font-weight: 600;">Total Investment</div>
          <div style="font-size: 17px; font-weight: 800; color: #ECC86A;">₹9,439 All-Inclusive</div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Transparent Value Allocation</div>
      <div>Page 4 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 5: E-COMMERCE & PAYMENT EXPERIENCE                                  -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 04 · Storefront & Cashfree Payment Architecture</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Checkout & Conversion</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Seamless Cashfree Payments for ${p.business_name}</h2>
        <p style="font-size: 9.5px; color: #A0A0B8; margin: 0;">
          Give your customers the most trusted and convenient payment methods in India. All transactions settle directly into your merchant bank account with real-time server-side verification:
        </p>
      </div>

      <div class="card-grid" style="margin-bottom: 14px;">
        <div class="feature-card">
          <div style="color: #D4AF37; font-weight: 700; font-size: 11px; margin-bottom: 2px;">⚡ UPI Instant Apps</div>
          <p style="font-size: 9px; color: #D4D4E2; margin: 0; line-height: 1.4;">
            Google Pay, PhonePe, Paytm, BHIM, Cred. Customers pay in 2 clicks with their preferred mobile UPI app.
          </p>
        </div>
        <div class="feature-card">
          <div style="color: #D4AF37; font-weight: 700; font-size: 11px; margin-bottom: 2px;">📷 Dynamic UPI QR Code</div>
          <p style="font-size: 9px; color: #D4D4E2; margin: 0; line-height: 1.4;">
            Order-specific dynamic QR generated on screen. Customers simply scan from any phone to authorize exact payment.
          </p>
        </div>
        <div class="feature-card">
          <div style="color: #D4AF37; font-weight: 700; font-size: 11px; margin-bottom: 2px;">💳 Debit & Credit Cards</div>
          <p style="font-size: 9px; color: #D4D4E2; margin: 0; line-height: 1.4;">
            Visa, Mastercard, RuPay, Maestro with secure RBI-compliant two-factor OTP verification and tokenization.
          </p>
        </div>
        <div class="feature-card">
          <div style="color: #D4AF37; font-weight: 700; font-size: 11px; margin-bottom: 2px;">🏦 50+ Net Banking Banks</div>
          <p style="font-size: 9px; color: #D4D4E2; margin: 0; line-height: 1.4;">
            HDFC, ICICI, SBI, Axis, Kotak, and all major commercial banks for retail and wholesale transactions.
          </p>
        </div>
      </div>

      <div style="background: #12121C; border: 1px solid #242436; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 6px;">Sample Product Presentation in Your Online Catalog</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 9px;">
          ${(products.length > 0 ? products : [
            { name: 'Signature Item 1', price: 999, category: 'Bestseller' },
            { name: 'Special Offering 2', price: 1499, category: 'Featured' },
            { name: 'Executive Bundle 3', price: 2999, category: 'Combo' },
          ]).slice(0, 3).map((pr: any) => `
            <div style="background: #171724; border: 1px solid #2B2B3E; border-radius: 6px; padding: 8px;">
              <div style="font-weight: 700; color: #FFFFFF; font-size: 10px; margin-bottom: 2px;">${pr.name}</div>
              <div style="color: #8E8EA2; font-size: 8px; text-transform: uppercase;">${pr.category || 'General'}</div>
              <div style="color: #ECC86A; font-weight: 700; font-size: 12px; margin-top: 4px;">₹${(pr.price || 0).toLocaleString('en-IN')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 10px; font-size: 9px; color: #B0E4D2;">
        <strong>Merchant Account Ownership:</strong> Payments are processed via your own registered Cashfree merchant account. Vijay Visuals never holds your customer funds or intercepts settlements.
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Payment Architecture</div>
      <div>Page 5 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 6: BUSINESS GROWTH & ONLINE DISCOVERY                               -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 05 · Online Discovery & Local SEO</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 14px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Local Search Foundation</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Growing ${p.business_name} Online</h2>
        <p style="font-size: 9.5px; color: #A0A0B8; margin: 0;">
          A website only succeeds when potential customers can discover it easily. We configure technical search foundations and local area targeting to maximize your reach:
        </p>
      </div>

      <div class="card-grid" style="margin-bottom: 16px;">
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 3px;">📍 Local Area & City Targeting</div>
          <p style="font-size: 9px; color: #9A9AB4; margin: 0; line-height: 1.4;">
            Metadata and schema tailored for <strong>${p.city || 'Hyderabad'}</strong>, <strong>${p.area || 'your area'}</strong>, and surrounding districts so customers nearby find your storefront.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 3px;">🗺️ Google Search Console & Sitemap</div>
          <p style="font-size: 9px; color: #9A9AB4; margin: 0; line-height: 1.4;">
            Automated XML sitemap generation and indexing guidance ensuring Google search spiders crawl and index your pages quickly.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 3px;">💬 WhatsApp Direct Linkage</div>
          <p style="font-size: 9px; color: #9A9AB4; margin: 0; line-height: 1.4;">
            Add your website link to your WhatsApp Business Profile, Instagram bio, and Google Maps listing to turn social followers into website orders.
          </p>
        </div>
        <div class="feature-card">
          <div style="font-size: 11px; font-weight: 600; color: #FFFFFF; margin-bottom: 3px;">🛡️ Clean Code & Fast Core Web Vitals</div>
          <p style="font-size: 9px; color: #9A9AB4; margin: 0; line-height: 1.4;">
            Hosted on Cloudflare Pages global edge network with sub-second response times, SSL security certificates, and lightweight clean bundles.
          </p>
        </div>
      </div>

      <div style="background: rgba(234, 179, 8, 0.05); border: 1px solid rgba(234, 179, 8, 0.25); border-radius: 8px; padding: 12px; font-size: 9px; color: #E8D390; line-height: 1.5;">
        <strong>Honest Digital Agency Ethics:</strong> Vijay Visuals establishes rock-solid technical SEO and search-engine compliance. We do <em>not</em> make fake or deceptive guarantees of "#1 Google Ranking in 7 days" or "guaranteed ₹10 Lakh sales", which are unethical and technically impossible for any agency to guarantee. Your growth comes from genuine business quality paired with elite digital presentation.
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Discovery & Growth Ethics</div>
      <div>Page 6 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 7: PACKAGE COMPARISON (STARTER, GOLD, PREMIUM)                      -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 06 · Package Comparison Matrix</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Choose Your Growth Pace</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Configurable Package Options</h2>
        <p style="font-size: 9.5px; color: #A0A0B8; margin: 0;">
          Select the package that best matches your immediate business goals. You can start with Starter and upgrade anytime as your business expands:
        </p>
      </div>

      <div class="card-grid-3" style="margin-bottom: 12px;">
        <!-- STARTER -->
        <div class="package-column ${tier === 'STARTER' ? 'featured' : ''}">
          <div>
            <div style="font-size: 9px; color: #D4AF37; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">STARTER TIER</div>
            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin: 4px 0;">₹7,999</div>
            <div style="font-size: 8px; color: #8E8EA2; margin-bottom: 10px;">+18% GST (₹9,439 Total)</div>
            <div style="font-size: 8.5px; color: #A0A0B8; text-align: left; line-height: 1.5; border-top: 1px solid #242436; padding-top: 8px;">
              ✓ Premium Responsive Design<br>
              ✓ 9 Core Website Features<br>
              ✓ Product Catalog & Cart<br>
              ✓ Cashfree Payment Gateway<br>
              ✓ Business Owner Dashboard<br>
              ✓ WhatsApp Order CTA<br>
              ✓ Google Maps & Basic SEO<br>
              ✓ 30 Days Free Support
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 8.5px; color: #ECC86A; font-weight: 600;">
            Timeline: 3–5 Days
          </div>
        </div>

        <!-- GOLD -->
        <div class="package-column ${tier === 'GOLD' ? 'featured' : ''}">
          <div>
            <div style="font-size: 9px; color: #D4AF37; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">GOLD TIER</div>
            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin: 4px 0;">₹${goldPrice.toLocaleString('en-IN')}</div>
            <div style="font-size: 8px; color: #8E8EA2; margin-bottom: 10px;">+18% GST (₹${Math.round(goldPrice * 1.18).toLocaleString('en-IN')} Total)</div>
            <div style="font-size: 8.5px; color: #A0A0B8; text-align: left; line-height: 1.5; border-top: 1px solid #242436; padding-top: 8px;">
              ✓ Everything in Starter<br>
              ✓ Verified Customer Reviews<br>
              ✓ Discount Promo Engine<br>
              ✓ Shiprocket Courier Tracking<br>
              ✓ Priority Custom DNS Setup<br>
              ✓ Monthly Sales Analytics<br>
              ✓ 90 Days Priority Support<br>
              ✓ 2 Monthly Content Updates
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 8.5px; color: #ECC86A; font-weight: 600;">
            Timeline: 5–7 Days
          </div>
        </div>

        <!-- PREMIUM -->
        <div class="package-column ${tier === 'PREMIUM' ? 'featured' : ''}">
          <div>
            <div style="font-size: 9px; color: #D4AF37; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">PREMIUM TIER</div>
            <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; margin: 4px 0;">₹${premiumPrice.toLocaleString('en-IN')}</div>
            <div style="font-size: 8px; color: #8E8EA2; margin-bottom: 10px;">+18% GST (₹${Math.round(premiumPrice * 1.18).toLocaleString('en-IN')} Total)</div>
            <div style="font-size: 8.5px; color: #A0A0B8; text-align: left; line-height: 1.5; border-top: 1px solid #242436; padding-top: 8px;">
              ✓ Everything in Gold<br>
              ✓ Installable Mobile PWA App<br>
              ✓ Custom App Icon & Offline Mode<br>
              ✓ Multi-Currency FX Engine<br>
              ✓ Automated AI Descriptions<br>
              ✓ Dedicated Account Manager<br>
              ✓ 1 Year VIP Support<br>
              ✓ Quarterly Strategy Audits
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 8.5px; color: #ECC86A; font-weight: 600;">
            Timeline: 7–10 Days
          </div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Package Comparison</div>
      <div>Page 7 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 8: TRANSPARENT COSTS & TERMS                                         -->
  <!-- ========================================================================= -->
  <div class="page page-light">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 07 · Total Cost of Ownership & Terms</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="font-size: 9px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 1.5px;">Complete Honesty</div>
        <h2 style="font-size: 19px; font-weight: 700; color: #FFFFFF; margin: 2px 0 4px 0;">Zero Surprise Fees. Zero Lock-in.</h2>
        <p style="font-size: 9.5px; color: #A0A0B8; margin: 0;">
          Unlike traditional agencies that trap clients with hidden maintenance bills, we provide 100% itemized transparency:
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; font-size: 9px;">
        <div style="background: #12121C; border: 1px solid #222232; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between;">
          <div>
            <strong style="color: #FFFFFF;">1. Website Development (One-Time)</strong>
            <div style="color: #8E8EA2;">Complete architecture, design, catalog and setup. Paid once to Vijay Visuals.</div>
          </div>
          <div style="color: #ECC86A; font-weight: 700;">₹${devFee.toLocaleString('en-IN')}</div>
        </div>
        <div style="background: #12121C; border: 1px solid #222232; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between;">
          <div>
            <strong style="color: #FFFFFF;">2. Custom Domain Name (.com / .in)</strong>
            <div style="color: #8E8EA2;">Directly registered under your own name via GoDaddy, Cloudflare or Namecheap (~₹800–₹1,200/year). You own it 100%.</div>
          </div>
          <div style="color: #B0B0C4;">Paid to Registrar</div>
        </div>
        <div style="background: #12121C; border: 1px solid #222232; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between;">
          <div>
            <strong style="color: #FFFFFF;">3. Cloud Hosting & SSL Security</strong>
            <div style="color: #8E8EA2;">Hosted on Cloudflare Pages high-speed global CDN with free automated SSL encryption included.</div>
          </div>
          <div style="color: #10B981; font-weight: 700;">Included Free</div>
        </div>
        <div style="background: #12121C; border: 1px solid #222232; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between;">
          <div>
            <strong style="color: #FFFFFF;">4. Cashfree Payment Gateway Charges</strong>
            <div style="color: #8E8EA2;">Zero platform commission. Standard Cashfree PG MDR (~1.9% on cards/netbanking, 0% on standard UPI) paid directly to Cashfree.</div>
          </div>
          <div style="color: #B0B0C4;">Standard Gateway MDR</div>
        </div>
        <div style="background: #12121C; border: 1px solid #222232; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between;">
          <div>
            <strong style="color: #FFFFFF;">5. Maintenance & Support (Optional)</strong>
            <div style="color: #8E8EA2;">First 30 days are completely free. Optional monthly maintenance (₹999/mo) only if you require dedicated hands-on staff assistance.</div>
          </div>
          <div style="color: #B0B0C4;">Optional Only</div>
        </div>
      </div>

      <div style="background: #13131F; border: 1px solid #27273C; border-radius: 8px; padding: 12px; font-size: 9px; color: #D0D0E2; line-height: 1.5;">
        <strong>Customer Data Portability Guarantee:</strong> You are not locked into any proprietary platform. You retain full ownership of your domain, business photos, product data, customer inquiries, and payment merchant account at all times.
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · +91 9381362201 · vk66278@gmail.com · Transparent Costs & Terms</div>
      <div>Page 8 of 9</div>
    </div>
  </div>

  <!-- ========================================================================= -->
  <!-- PAGE 9: NEXT STEPS & APPROVAL                                             -->
  <!-- ========================================================================= -->
  <div class="page" style="background: radial-gradient(circle at 50% 80%, #1A1710 0%, #0A0A0F 80%); justify-content: space-between;">
    <div>
      <div class="header-banner">
        <div class="header-logo">
          <img src="${OFFICIAL_VV_LOGO_BASE64}" alt="VIJAY VISUALS" class="header-logo-img" />
          <div class="header-logo-text">VIJAY VISUALS</div>
          <div style="color: #4A4A60;">·</div>
          <div class="header-meta">Section 08 · Project Authorization & Next Steps</div>
        </div>
        <div class="header-meta">Proposal #${p.proposal_number}</div>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 10px; text-transform: uppercase; color: #D4AF37; font-weight: 600; letter-spacing: 2px;">Ready to Launch</div>
        <h2 style="font-size: 26px; font-weight: 800; color: #FFFFFF; margin: 4px 0 8px 0;">Authorize & Begin Development</h2>
        <p style="font-size: 11px; color: #A0A0B8; max-width: 480px; margin: 0 auto; line-height: 1.5;">
          Review the proposal terms, approve online using your secure link, and proceed with safe Cashfree payment to initiate immediate development.
        </p>
      </div>

      <div style="background: #111119; border: 1.5px solid #D4AF37; border-radius: 12px; padding: 20px; max-width: 520px; margin: 0 auto 24px auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #252538; padding-bottom: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 10px; color: #8E8EA2; text-transform: uppercase;">Selected Package</div>
            <div style="font-size: 16px; font-weight: 800; color: #FFFFFF;">${tier} Business Package</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #8E8EA2; text-transform: uppercase;">Total Payable</div>
            <div style="font-size: 22px; font-weight: 800; color: #ECC86A;">₹${totalAmount.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div style="font-size: 9.5px; color: #D0D0E2; line-height: 1.6;">
          <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            <span style="color: #D4AF37; font-weight: 700;">Step 1:</span>
            <span>Click <strong>Approve Proposal</strong> on your secure online link.</span>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            <span style="color: #D4AF37; font-weight: 700;">Step 2:</span>
            <span>Authorize payment via Cashfree Sandbox / Live gateway (UPI / QR / Cards / NetBanking).</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <span style="color: #D4AF37; font-weight: 700;">Step 3:</span>
            <span>Your dedicated onboarding manager begins storefront deployment immediately.</span>
          </div>
        </div>
      </div>

      <div style="text-align: center; font-size: 10px; color: #8E8EA2; border-top: 1px solid #1F1F2C; padding-top: 12px; margin-top: 12px;">
        <div style="color: #ECC86A; font-weight: 700; margin-bottom: 4px; letter-spacing: 1.5px; font-size: 11px;">VIJAY VISUALS</div>
        <div style="line-height: 1.8;">
          Official Mobile: <a href="tel:+919381362201" style="color: #ECC86A; font-weight: 700; text-decoration: none;">+91 9381362201</a> · 
          Official Email: <a href="mailto:vk66278@gmail.com" style="color: #ECC86A; font-weight: 700; text-decoration: none;">vk66278@gmail.com</a> · 
          Hyderabad, Telangana, India
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <div>VIJAY VISUALS · Official Mobile: +91 9381362201 · vk66278@gmail.com</div>
      <div>Page 9 of 9</div>
    </div>
  </div>

</body>
</html>`;
}

export function printOrDownloadProposalPdf(p: ProposalRecord): void {
  const html = generateProposalHtml(p);
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    alert('Please allow popups to download or print your luxury proposal PDF.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };
}
