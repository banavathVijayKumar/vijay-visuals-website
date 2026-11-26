// ============================================================================
// GET /api/help-center — Help Centre, Live Status & Transparent Costs
// Ported from Express/PostgreSQL to Cloudflare Pages Functions + D1.
// Public endpoint: only configuration booleans are reported, never secret values.
// ============================================================================

import { getSupabaseConfig } from './_auth';
import { CloudflareEnv, PagesContext, handleOptions, jsonResponse } from './_shared';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function hasConfiguredSecret(value: unknown): boolean {
  const s = String(value || '').trim();
  return Boolean(s) && s !== 'MY_GEMINI_API_KEY' && s !== 'YOUR_API_KEY' && s !== 'MY_GOOGLE_MAPS_API_KEY';
}

function hasGoogleMapsKey(env: CloudflareEnv): boolean {
  // Matches functions/api/locations/config.ts env handling.
  return hasConfiguredSecret(env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY);
}

function isCashfreeConfigured(env: CloudflareEnv): boolean {
  const clientId = String(env.CASHFREE_CLIENT_ID || '').trim();
  const clientSecret = String(env.CASHFREE_CLIENT_SECRET || '').trim();
  return Boolean(clientId) && Boolean(clientSecret);
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { env } = context;
  const startedAt = Date.now();
  let dbHealthy = false;

  if (env.DB) {
    try {
      await env.DB.prepare('SELECT 1').first();
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }
  }
  const dbLatencyMs = Date.now() - startedAt;

  return jsonResponse({
    serviceStatus: {
      overall: dbHealthy ? 'operational' : 'degraded',
      checkedAt: new Date().toISOString(),
      database: {
        status: dbHealthy ? 'operational' : 'unreachable',
        latencyMs: dbLatencyMs,
        engine: 'Cloudflare D1',
      },
      apiRateLimiting: { status: 'active', limitPerMinute: 240 },
      integrations: [
        {
          name: 'Cloudflare D1 Database',
          status: dbHealthy ? 'configured' : 'error',
          requiredFor: 'All websites, orders, inventory, finance, CRM & HR data',
        },
        {
          name: 'Supabase Authentication',
          status: getSupabaseConfig(env) ? 'configured' : 'not_configured',
          requiredFor: 'Owner, Staff, Delivery & Customer sign-in',
        },
        {
          name: 'Gemini AI Business Assistant',
          status: hasConfiguredSecret(env.GEMINI_API_KEY) ? 'configured' : 'not_configured',
          requiredFor: 'AI Business Assistant, AI Website Setup, SEO & Content Studio',
        },
        {
          name: 'Google Maps Platform (Maps JS & Geocoding)',
          status: hasGoogleMapsKey(env) ? 'configured' : 'not_configured',
          requiredFor: 'Interactive branch map picker, storefront map preview, geocoding & live delivery map',
        },
        {
          name: 'Cashfree Payments',
          status: isCashfreeConfigured(env) ? 'configured' : 'not_configured',
          requiredFor: 'Online checkout, package payments & seller store orders',
        },
        {
          name: 'Domain Registrar Purchase API',
          status: hasConfiguredSecret(env.DOMAIN_REGISTRAR_API_KEY) ? 'configured' : 'not_configured',
          requiredFor: 'Direct in-app domain registration (external customer-owned DNS wizard is live)',
        },
        {
          name: 'WhatsApp Business Cloud API',
          status: hasConfiguredSecret(env.WHATSAPP_CLOUD_API_TOKEN) ? 'configured' : 'not_configured',
          requiredFor: 'Automated WhatsApp notifications (manual click-to-chat wa.me is live)',
        },
        {
          name: 'Transactional Email (SMTP/Resend)',
          status: hasConfiguredSecret(env.RESEND_API_KEY) || hasConfiguredSecret(env.SMTP_HOST)
            ? 'configured'
            : 'not_configured',
          requiredFor: 'Automated email campaigns & order emails',
        },
        {
          name: 'SMS Gateway (MSG91/Twilio)',
          status: hasConfiguredSecret(env.SMS_PROVIDER_API_KEY) ? 'configured' : 'not_configured',
          requiredFor: 'OTP & SMS order updates',
        },
        {
          name: 'Cloudflare R2 Media Storage',
          status: hasConfiguredSecret(env.R2_BUCKET_NAME) ? 'configured' : 'not_configured',
          requiredFor: 'Direct binary file uploads (URL & data-URI media is supported)',
        },
      ],
    },
    transparentCostBreakdown: [
      {
        item: 'Website Setup Fee',
        billing: 'One-Time',
        ownerCostNote: 'Configurable per package (₹4,999 – ₹24,999 + 18% GST). No hidden setup fees.',
      },
      {
        item: 'Custom Domain (.com / .in / .co.in)',
        billing: 'Annual (Registrar Direct)',
        ownerCostNote:
          'Indicative ₹499–₹1,099/yr + GST paid directly to your registrar (Cloudflare, GoDaddy, Namecheap) under 100% customer ownership.',
      },
      {
        item: 'Cloud Hosting & Bandwidth',
        billing: 'Monthly / Yearly Plan',
        ownerCostNote:
          'Metered fair-usage tiers based on Cloudflare Pages & D1 capacity. Never falsely advertised as unlimited.',
      },
      {
        item: 'Media & Database Storage',
        billing: 'Quota-Based (5 GB – 50 GB)',
        ownerCostNote:
          'Explicit storage quota per plan tier; extra storage billed transparently when upgraded.',
      },
      {
        item: 'AI Assistant & Content Credits',
        billing: 'Credit Pack / Monthly Quota',
        ownerCostNote:
          'Metered per request (1–2 credits per Gemini generation) with visible usage counter in your dashboard.',
      },
      {
        item: 'WhatsApp Cloud API & SMS Charges',
        billing: 'Pay-As-You-Go (External)',
        ownerCostNote:
          'Billed directly by Meta WhatsApp Cloud / SMS provider per conversation or SMS segment when connected.',
      },
      {
        item: 'Optional Branded PWA / Mobile App',
        billing: 'Add-on License',
        ownerCostNote:
          'Branded installable PWA included in Website + PWA tier. Native Play Store Android builds are quoted separately as a future phase.',
      },
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
        q: 'Can I accept Cash on Delivery and UPI before online payments are configured?',
        a: 'Yes. Cash on Delivery and Direct Seller UPI Reference work immediately. Cashfree online checkout activates once valid Sandbox or approved Live credentials and the webhook are configured.',
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
}
