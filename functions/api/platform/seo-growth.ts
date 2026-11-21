// ============================================================================
// GET & POST /api/platform/seo-growth
// Global SEO, Google Search Console / GBP Guidance, Technical SEO Audit Tool,
// Public Blog & Template Gallery, Referral/Affiliate System & Consent-Gated
// Abandoned Cart Reminders.
// HONESTY GUARANTEE: Never guarantees #1 Google rankings or fabricates metrics.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  json,
  parseJsonBody,
  randomHex,
  sanitizeText,
  sha256Hex,
} from '../_shared';

interface SeoCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

const FALLBACK_BLOG_POSTS = [
  {
    id: 1,
    slug: 'how-to-launch-business-website-india',
    title: 'How to Launch a High-Converting Business Website in India',
    excerpt: 'Step-by-step guidance on setting up custom domains, WhatsApp integration, and UPI payments for Indian small businesses.',
    content_markdown: 'Setting up a digital storefront for your business requires clear branding, fast mobile loading, and direct contact CTAs.',
    category: 'Business Growth',
    language: 'en',
    author_name: 'Vijay Visuals Editorial Team',
    seo_title: 'Launch a High-Converting Business Website in India',
    seo_description: 'Practical guide to establishing your business presence online with Vijay Visuals.',
    published_at: '2026-11-20T00:00:00.000Z',
  },
  {
    id: 2,
    slug: 'pwa-vs-native-mobile-apps-for-local-retailers',
    title: 'PWA vs Native Apps: Why Indian Retailers Are Choosing Progressive Web Apps',
    excerpt: 'Discover how Progressive Web Apps eliminate app store commissions and provide instant homescreen installation without high download drop-offs.',
    content_markdown: 'Progressive Web Apps (PWAs) combine the speed and accessibility of the web with the offline and home screen install capabilities of native apps.',
    category: 'Technology',
    language: 'en',
    author_name: 'Vijay Visuals Tech Desk',
    seo_title: 'Why Retailers Choose Progressive Web Apps',
    seo_description: 'Discover the advantages of PWAs over expensive native app development.',
    published_at: '2026-11-19T00:00:00.000Z',
  },
];

const FALLBACK_TEMPLATES = [
  {
    id: 'obsidian-luxury',
    name: 'Obsidian Gold Luxury',
    category: 'Luxury & Jewelry',
    description: 'Deep charcoal canvas with metallic gold typography for boutiques, jewelry, and studios.',
    preview_theme_json: JSON.stringify({ primaryColor: '#D4AF37', accentColor: '#0D0D12', fontFamily: 'Cinzel' }),
    is_featured: 1,
  },
  {
    id: 'slate-precision',
    name: 'Slate Precision Commerce',
    category: 'Electronics & Tech',
    description: 'Structured dark navy surfaces engineered for electronics, audio, and SaaS storefronts.',
    preview_theme_json: JSON.stringify({ primaryColor: '#E5B94C', accentColor: '#0E131A', fontFamily: 'Plus Jakarta Sans' }),
    is_featured: 1,
  },
  {
    id: 'culinary-warm',
    name: 'Heritage Culinary Warmth',
    category: 'Food & Dining',
    description: 'Rich espresso backdrop with saffron gold accents tailored for restaurants & hotels.',
    preview_theme_json: JSON.stringify({ primaryColor: '#DFBA5A', accentColor: '#120D0A', fontFamily: 'Cinzel' }),
    is_featured: 1,
  },
];

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  const url = new URL(request.url);
  const scope = (url.searchParams.get('scope') || 'blog').toLowerCase();

  if (scope === 'blog') {
    const lang = sanitizeText(url.searchParams.get('lang') || '', 10).toLowerCase();
    try {
      if (!env.DB) {
        return json({ posts: FALLBACK_BLOG_POSTS });
      }
      const res = lang
        ? await env.DB.prepare(
            `SELECT id, slug, title, excerpt, content_markdown, category, language, author_name, seo_title, seo_description, published_at
             FROM public_blog_posts WHERE is_published = 1 AND (language = ? OR language = 'en') ORDER BY published_at DESC LIMIT 30`
          )
            .bind(lang)
            .all()
        : await env.DB.prepare(
            `SELECT id, slug, title, excerpt, content_markdown, category, language, author_name, seo_title, seo_description, published_at
             FROM public_blog_posts WHERE is_published = 1 ORDER BY published_at DESC LIMIT 30`
          ).all();

      const posts = Array.isArray(res?.results) && res.results.length > 0 ? res.results : FALLBACK_BLOG_POSTS;
      return json({ posts });
    } catch {
      return json({ posts: FALLBACK_BLOG_POSTS });
    }
  }

  if (scope === 'templates') {
    try {
      if (!env.DB) {
        return json({ templates: FALLBACK_TEMPLATES });
      }
      const res = await env.DB.prepare(
        `SELECT id, name, category, description, preview_theme_json, is_featured
         FROM website_templates ORDER BY is_featured DESC, id ASC`
      ).all();

      const templates = Array.isArray(res?.results) && res.results.length > 0 ? res.results : FALLBACK_TEMPLATES;
      return json({ templates });
    } catch {
      return json({ templates: FALLBACK_TEMPLATES });
    }
  }

  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  if (scope === 'my_referrals') {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const codes = await env.DB.prepare(
      'SELECT * FROM referral_affiliate_codes WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 20'
    )
      .bind(auth.user.id)
      .all();

    return json({
      codes: codes.results || [],
      shareBaseUrl: (env.APP_URL || 'https://vijay-visuals-site.pages.dev').replace(/\/+$/, ''),
    });
  }

  if (scope === 'gsc_status') {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
    let globalSettings: Record<string, unknown> | null = null;
    if (websiteId) {
      const access = await requireWebsiteAccess(env, auth.user, websiteId, [
        'business_owner',
        'business_manager',
      ]);
      if (!access.ok) return access.response;
      globalSettings = await env.DB.prepare(
        'SELECT gsc_site_url, gsc_verification_token, gbp_place_id, gbp_profile_url FROM tenant_global_settings WHERE website_id = ? LIMIT 1'
      )
        .bind(websiteId)
        .first<Record<string, unknown>>()
        .catch(() => null);
    }

    const oauthConfigured = Boolean((env.GSC_OAUTH_CLIENT_ID || '').trim());
    return json({
      googleSearchConsole: {
        oauthConfigured,
        status: oauthConfigured ? 'configured' : 'manual_verification_ready',
        sitemapUrl: `${(env.APP_URL || 'https://vijay-visuals-site.pages.dev').replace(/\/+$/, '')}/sitemap.xml`,
        robotsUrl: `${(env.APP_URL || 'https://vijay-visuals-site.pages.dev').replace(/\/+$/, '')}/robots.txt`,
        savedSiteUrl: globalSettings?.gsc_site_url || '',
        hasVerificationToken: Boolean(globalSettings?.gsc_verification_token),
        honestNotice:
          'Google Search Console live click/impression API sync requires OAuth approval (GSC_OAUTH_CLIENT_ID). Sitemap XML, robots.txt, canonical tags, hreflang, and JSON-LD schema are active immediately. Vijay Visuals never guarantees #1 search ranking.',
      },
      googleBusinessProfile: {
        savedPlaceId: globalSettings?.gbp_place_id || '',
        savedProfileUrl: globalSettings?.gbp_profile_url || '',
        honestNotice:
          'Business verification and Google reviews must be completed directly in Google Business Profile. Vijay Visuals never fabricates Google reviews or verification badges.',
      },
    });
  }

  return errorJson('Unsupported seo-growth scope.', 400);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<Record<string, unknown>>(request);
  if (!body || !body.action) return errorJson('action is required.', 400);
  const action = String(body.action);

  // 1. Public Technical SEO & Core Web Vitals Readiness Audit Tool
  if (action === 'seo_audit') {
    const title = sanitizeText(body.title || '', 200);
    const description = sanitizeText(body.description || '', 400);
    const canonicalUrl = sanitizeText(body.canonicalUrl || '', 300);
    const hasHttps = canonicalUrl ? canonicalUrl.startsWith('https://') : true;
    const totalImages = Math.max(0, Number(body.totalImages || 0));
    const imagesWithAlt = Math.max(0, Math.min(totalImages, Number(body.imagesWithAlt ?? totalImages)));
    const hasStructuredData = body.hasStructuredData !== false;
    const languagesCount = Math.max(1, Number(body.languagesCount || 1));

    const checks: SeoCheckItem[] = [
      {
        id: 'title',
        label: 'Page Title Length (30–60 chars)',
        status: title.length >= 30 && title.length <= 60 ? 'pass' : title.length >= 15 ? 'warn' : 'fail',
        detail: title
          ? `Title is ${title.length} characters. Optimal range is 30–60 characters.`
          : 'Missing page title. Add a clear branded title.',
      },
      {
        id: 'description',
        label: 'Meta Description Length (120–160 chars)',
        status:
          description.length >= 120 && description.length <= 160
            ? 'pass'
            : description.length >= 60
              ? 'warn'
              : 'fail',
        detail: description
          ? `Description is ${description.length} characters. Optimal range is 120–160 characters.`
          : 'Missing meta description. Summarize your business offering in 120–160 characters.',
      },
      {
        id: 'https',
        label: 'HTTPS & Canonical URL',
        status: canonicalUrl && hasHttps ? 'pass' : canonicalUrl ? 'fail' : 'warn',
        detail: canonicalUrl
          ? hasHttps
            ? `Canonical HTTPS URL configured: ${canonicalUrl}`
            : 'Canonical URL must use https:// for search trust and security.'
          : 'No custom canonical URL provided; platform default canonical will be used.',
      },
      {
        id: 'alt_text',
        label: 'Image Alt Text Accessibility',
        status: totalImages === 0 || imagesWithAlt === totalImages ? 'pass' : 'warn',
        detail:
          totalImages === 0
            ? 'No images reported; ensure every uploaded product photo includes descriptive alt text.'
            : `${imagesWithAlt}/${totalImages} images have descriptive alt text.`,
      },
      {
        id: 'schema',
        label: 'JSON-LD Schema (Organization / LocalBusiness / Product)',
        status: hasStructuredData ? 'pass' : 'fail',
        detail: hasStructuredData
          ? 'Structured JSON-LD schema is enabled for rich search snippets.'
          : 'Enable Organization / LocalBusiness / Product JSON-LD schema.',
      },
      {
        id: 'multilingual',
        label: 'Multilingual hreflang Readiness',
        status: languagesCount >= 2 ? 'pass' : 'warn',
        detail:
          languagesCount >= 2
            ? `${languagesCount} languages configured with hreflang alternates and English fallback.`
            : 'Single language active. Adding Indian regional languages expands local search discovery.',
      },
    ];

    const score = Math.round(
      (checks.reduce((acc, c) => acc + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) /
        checks.length) *
        100
    );

    return json({
      technicalReadinessScore: score,
      checks,
      rankingDisclaimer:
        'Technical SEO readiness improves crawlability and Core Web Vitals hygiene, but Google search rankings depend on content quality, competition, and authority. No platform can guarantee #1 search placement.',
    });
  }

  // 2. Referral / Affiliate Code Generation (Authenticated)
  if (action === 'create_referral') {
    const auth = await requireUser(request, env);
    if (!auth.ok) return auth.response;

    const programType = body.programType === 'affiliate' ? 'affiliate' : 'referral';
    const prefix = programType === 'affiliate' ? 'VVAFF' : 'VVREF';
    const customCode = sanitizeText(body.customCode || '', 20)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const code = customCode.length >= 4 ? customCode : `${prefix}-${randomHex(3).toUpperCase()}`;

    try {
      const res = await env.DB.prepare(
        `INSERT INTO referral_affiliate_codes
          (owner_user_id, referral_code, program_type, commission_percent, status, created_at)
         VALUES (?, ?, ?, ?, 'active', datetime('now'))`
      )
        .bind(auth.user.id, code, programType, programType === 'affiliate' ? 15 : 10)
        .run();

      const baseUrl = (env.APP_URL || 'https://vijay-visuals-site.pages.dev').replace(/\/+$/, '');
      return json(
        {
          id: Number(res.meta?.last_row_id || 0),
          referralCode: code,
          programType,
          shareUrl: `${baseUrl}/?ref=${encodeURIComponent(code)}`,
        },
        201
      );
    } catch {
      return errorJson(`Referral code "${code}" is already taken. Try another code.`, 409);
    }
  }

  // 3. Attribute Referral Signup (Public / Onboarding)
  if (action === 'track_referral_signup') {
    const code = sanitizeText(body.referralCode || '', 30).toUpperCase();
    const email = sanitizeText(body.referredEmail || '', 120).toLowerCase();
    if (!code || !email.includes('@')) {
      return errorJson('Valid referralCode and referredEmail are required.', 400);
    }
    const existing = await env.DB.prepare(
      `SELECT referral_code FROM referral_affiliate_codes WHERE referral_code = ? AND status = 'active' LIMIT 1`
    )
      .bind(code)
      .first();
    if (!existing) return errorJson('Referral code not found or inactive.', 404);

    const emailHash = await sha256Hex(email);
    await env.DB.prepare(
      `INSERT INTO referral_conversions (referral_code, referred_email_hash, website_id, status, created_at)
       VALUES (?, ?, ?, 'signed_up', datetime('now'))`
    )
      .bind(code, emailHash, sanitizeText(body.websiteId || '', 120) || null)
      .run();

    await env.DB.prepare(
      `UPDATE referral_affiliate_codes SET signups_count = signups_count + 1 WHERE referral_code = ?`
    )
      .bind(code)
      .run();

    return json({ tracked: true, referralCode: code }, 201);
  }

  // 4. Consent-Gated Abandoned Cart Reminder Registration
  if (action === 'track_abandoned_cart') {
    const websiteId = sanitizeText(body.websiteId || '', 120);
    const contact = sanitizeText(body.customerContact || '', 140);
    const channel = body.channel === 'whatsapp' || body.channel === 'in_app' ? body.channel : 'email';
    const consentGiven = body.marketingConsent === true;
    const cartTotalInr = Math.max(0, Math.round(Number(body.cartTotalInr || 0)));

    if (!websiteId || !contact) return errorJson('websiteId and customerContact are required.', 400);
    if (!consentGiven) {
      return errorJson(
        'Blocked: explicit customer marketing consent is mandatory before scheduling abandoned cart reminders.',
        403
      );
    }

    const res = await env.DB.prepare(
      `INSERT INTO abandoned_cart_reminders
        (website_id, customer_user_id, customer_contact, channel, cart_items_json, cart_total_inr,
         marketing_consent, reminder_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', datetime('now'), datetime('now'))`
    )
      .bind(
        websiteId,
        sanitizeText(body.customerUserId || '', 120) || null,
        contact,
        channel,
        JSON.stringify(Array.isArray(body.cartItems) ? body.cartItems : []),
        cartTotalInr
      )
      .run();

    return json(
      {
        reminderId: Number(res.meta?.last_row_id || 0),
        reminderStatus: 'pending',
        consentRecorded: true,
      },
      201
    );
  }

  return errorJson('Unsupported seo-growth action.', 400);
}
