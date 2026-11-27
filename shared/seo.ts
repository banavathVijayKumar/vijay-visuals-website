// ============================================================================
// VIJAY VISUALS — SINGLE SOURCE OF TRUTH FOR PUBLIC SEO RULES
// Shared by Cloudflare Pages Functions, the legacy Express server, the browser
// metadata helpers, and local regression tests.
//
// This module never reads environment variables or secret values.
// ============================================================================

import {
  FAQS,
  GLOBAL_CURRENCIES,
  Lang,
  LOCALIZATION_AUDIT,
  SEO_READY_LANGUAGES,
  SUPPORTED_LANGUAGES,
  getI18n,
} from '../src/data/content';

export const OFFICIAL_SITE_URL = 'https://vijay-visuals-site.pages.dev';
export const STOREFRONT_ROUTE_PREFIX = '/site/';
export const LEGACY_STOREFRONT_ROUTE_PREFIX = '/sites/';
export const SEO_HREFLANG_CODES = SEO_READY_LANGUAGES;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const STATIC_FILE_PATTERN = /\.[a-z0-9]{1,8}$/i;
const PUBLIC_PLATFORM_EXACT_ROUTES = new Set([
  '/',
  '/builder',
  '/marketplace',
  '/demo',
  '/ai',
  '/payments/cashfree/return',
]);
const PUBLIC_OR_APP_PREFIXES = [
  '/builder/',
  '/marketplace/',
  '/demo/',
  '/ai/',
  '/dashboards',
  '/admin',
  '/proposal/',
  '/proposals/',
];
const PRIVATE_PLATFORM_PREFIXES = [
  '/dashboards',
  '/admin',
  '/proposal/',
  '/proposals/',
  '/payments/',
];
const TENANT_ROBOTS_DIRECTIVES = new Set([
  'index, follow',
  'index, nofollow',
  'noindex, follow',
  'noindex, nofollow',
]);
const TENANT_SCHEMA_TYPES = new Set([
  'LocalBusiness',
  'Restaurant',
  'Store',
  'OnlineStore',
  'ProfessionalService',
  'HealthClub',
  'BeautySalon',
  'Dentist',
  'MedicalBusiness',
  'LegalService',
  'FinancialService',
  'TravelAgency',
  'EducationalOrganization',
]);
const OG_LOCALES: Record<Lang, string> = {
  en: 'en_IN',
  te: 'te_IN',
  hi: 'hi_IN',
  ta: 'ta_IN',
  kn: 'kn_IN',
  ml: 'ml_IN',
  mr: 'mr_IN',
  bn: 'bn_IN',
  gu: 'gu_IN',
  pa: 'pa_IN',
  or: 'or_IN',
  ur: 'ur_PK',
};

export interface SeoSiteMeta {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: string;
  hreflang: Array<{ hreflang: string; href: string }>;
  structuredData: string;
  lang: Lang;
  dir: 'ltr' | 'rtl';
  indexable: boolean;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  priority?: string;
  withHreflang?: boolean;
}

export interface TenantSchemaProduct {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number | string;
  stock: number;
}

export interface TenantSchemaInput {
  name: string;
  description?: string | null;
  phone?: string | null;
  address?: string | null;
  addressCountry?: string | null;
  canonicalUrl: string;
  localBusinessType?: string | null;
  googleMapsUrl?: string | null;
  currency?: string | null;
  products?: TenantSchemaProduct[];
}

export interface TenantSeoSettings {
  seoTitle: string;
  seoDescription: string;
  phone: string;
  address: string;
  logoUrl: string;
  themeColor: string;
  robotsDirectives: string;
  canonicalUrl: string;
  googleSiteVerification: string;
  googleMapsUrl: string;
  localBusinessType: string;
  currency: string;
}

export interface CanonicalResolutionInput {
  origin: string;
  pathname: string;
  platformSiteSlug?: string | null;
  configuredUrl?: string | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXml(value: unknown): string {
  return escapeHtml(value);
}

export function normalizePathname(rawPathname: string): string {
  const path = String(rawPathname || '').split(/[?#]/)[0] || '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  const trimmed = withSlash.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isSupportedLang(value: string | null | undefined): value is Lang {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_LANGUAGES.some((language) => language.code === normalized);
}

export function isSeoReadyLang(value: string | null | undefined): value is Lang {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (SEO_READY_LANGUAGES as readonly string[]).includes(normalized);
}

export function getLanguageMeta(lang: Lang) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === lang) || SUPPORTED_LANGUAGES[0];
}

export function getStorefrontSlug(rawPathname: string): string | null {
  const pathname = normalizePathname(rawPathname);
  const match = pathname.match(/^\/sites?\/([^/]+)$/);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export function isLegacyStorefrontRoute(rawPathname: string): boolean {
  return normalizePathname(rawPathname).startsWith(LEGACY_STOREFRONT_ROUTE_PREFIX);
}

export function isKnownPlatformHtmlRoute(rawPathname: string): boolean {
  const pathname = normalizePathname(rawPathname);
  if (PUBLIC_PLATFORM_EXACT_ROUTES.has(pathname)) return true;
  return PUBLIC_OR_APP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isIndexablePlatformRoute(rawPathname: string): boolean {
  const pathname = normalizePathname(rawPathname);
  return pathname === '/' || pathname === '/marketplace';
}

export function isPrivatePlatformRoute(rawPathname: string): boolean {
  const pathname = normalizePathname(rawPathname);
  return PRIVATE_PLATFORM_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isStaticAssetPath(rawPathname: string): boolean {
  const pathname = normalizePathname(rawPathname);
  return pathname !== '/' && STATIC_FILE_PATTERN.test(pathname);
}

export function normalizeTenantRobots(value: string | null | undefined): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return TENANT_ROBOTS_DIRECTIVES.has(normalized) ? normalized : 'index, follow';
}

export interface TenantIndexabilityInput {
  publicationStatus?: string | null;
  domainStatus?: string | null;
  rawJson?: unknown;
  configuredRobots?: string | null;
}

const NON_INDEXABLE_TENANT_STATUSES = new Set([
  'draft',
  'unpublished',
  'private',
  'suspended',
  'expired',
  'rejected',
  'disconnected',
  'pending',
]);

/**
 * Computes tenant robots before the SPA hydrates. Callers must pass the
 * publication status and, for custom domains, the domain status. This prevents
 * draft/private/suspended storefronts from relying on a client-only noindex.
 */
export function getTenantRobotsDirective(input: TenantIndexabilityInput): string {
  const statuses = [input.publicationStatus, input.domainStatus]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  if (statuses.some((status) => NON_INDEXABLE_TENANT_STATUSES.has(status))) {
    return 'noindex, nofollow';
  }

  let settings: Record<string, unknown> = {};
  if (typeof input.rawJson === 'string') {
    try {
      const parsed = JSON.parse(input.rawJson);
      if (parsed && typeof parsed === 'object') settings = parsed as Record<string, unknown>;
    } catch {
      settings = {};
    }
  } else if (input.rawJson && typeof input.rawJson === 'object') {
    settings = input.rawJson as Record<string, unknown>;
  }

  const explicitPrivate =
    settings.isPrivate === true ||
    settings.private === true ||
    settings.draft === true ||
    settings.visibility === 'private' ||
    settings.indexable === false;
  if (explicitPrivate) return 'noindex, nofollow';

  return normalizeTenantRobots(input.configuredRobots);
}

export function isIndexableRobotsDirective(robots: string | null | undefined): boolean {
  return !/\bnoindex\b/i.test(String(robots || ''));
}

function clampText(value: string, maxLength: number): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function getSeoLocaleCopy(lang: Lang): { title: string; description: string } {
  if (lang === 'en') {
    return {
      title: 'Vijay Visuals — Made in India. Built for the World',
      description:
        'Empowering every business to go digital. Build websites, launch e-commerce stores, connect custom domains, and automate growth in 12 Indian & global languages.',
    };
  }
  // Only translated strings already present in the repository are used here.
  // Languages without complete page translations are intentionally excluded
  // from hreflang and sitemap alternates.
  const strings = getI18n(lang);
  return {
    title: `${strings.heroTitle} | VIJAY VISUALS`,
    description: clampText(strings.heroSubtitle, 160),
  };
}

export function getLanguageUrl(origin: string, lang: Lang | null | undefined): string {
  const base = `${String(origin || '').replace(/\/$/, '')}/`;
  if (!isSeoReadyLang(lang)) return base;
  return `${base}?lang=${encodeURIComponent(lang)}`;
}

export function getPageCanonicalUrl(
  origin: string,
  rawPathname: string,
  lang: Lang | null | undefined,
  hasExplicitLang = false
): string {
  const pathname = normalizePathname(rawPathname);
  const cleanOrigin = String(origin || '').replace(/\/$/, '');
  if (pathname !== '/') return `${cleanOrigin}${pathname}`;
  if (hasExplicitLang && isSeoReadyLang(lang)) return getLanguageUrl(cleanOrigin, lang);
  return `${cleanOrigin}/`;
}

export function buildHreflangLinks(
  origin: string,
  rawPathname: string
): Array<{ hreflang: string; href: string }> {
  if (normalizePathname(rawPathname) !== '/') return [];
  const cleanOrigin = String(origin || '').replace(/\/$/, '');
  return [
    { hreflang: 'x-default', href: `${cleanOrigin}/` },
    ...SEO_READY_LANGUAGES.map((code) => ({
      hreflang: code,
      href: `${cleanOrigin}/?lang=${encodeURIComponent(code)}`,
    })),
  ];
}

export function buildPlatformStructuredData(includeFaq = true): string {
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      name: 'Vijay Visuals',
      slogan: 'Made in India. Built for the World. Empowering Every Business to Go Digital.',
      url: `${OFFICIAL_SITE_URL}/`,
      logo: `${OFFICIAL_SITE_URL}/pwa-512x512.png`,
      telephone: '+91-93813-62201',
      email: 'vk66278@gmail.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Hyderabad',
        addressRegion: 'Telangana',
        addressCountry: 'IN',
      },
    },
    {
      '@type': 'WebApplication',
      name: 'Vijay Visuals Business Platform',
      url: `${OFFICIAL_SITE_URL}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: [...SEO_READY_LANGUAGES],
      description:
        'Made in India multi-tenant business website builder, e-commerce storefront engine, custom domain DNS wizard, technical SEO readiness tools, delivery management, and AI Automation Center.',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Studio', item: `${OFFICIAL_SITE_URL}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Marketplace',
          item: `${OFFICIAL_SITE_URL}/marketplace`,
        },
      ],
    },
  ];

  if (includeFaq) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function getPlatformSeoMeta(
  origin: string,
  rawPathname: string,
  rawLang: string | null | undefined,
  hasExplicitLang = false
): SeoSiteMeta {
  const pathname = normalizePathname(rawPathname);
  const lang: Lang = isSupportedLang(rawLang) ? rawLang : 'en';
  const copy = getSeoLocaleCopy(lang);
  const isIndexable = isIndexablePlatformRoute(pathname);
  const canonicalUrl = getPageCanonicalUrl(origin, pathname, lang, hasExplicitLang);
  const hreflang = isIndexable && pathname === '/' ? buildHreflangLinks(origin, pathname) : [];

  if (pathname === '/marketplace') {
    return {
      title: 'Live Business Storefronts | VIJAY VISUALS',
      description:
        'Explore published VIJAY VISUALS multi-tenant storefronts, products, services, checkout flows and live business directories.',
      canonicalUrl,
      robots: 'index, follow',
      hreflang,
      structuredData: buildPlatformStructuredData(false),
      lang,
      dir: getLanguageMeta(lang).dir,
      indexable: true,
    };
  }

  if (pathname === '/') {
    return {
      title: copy.title,
      description: copy.description,
      canonicalUrl,
      robots: 'index, follow',
      hreflang,
      structuredData: buildPlatformStructuredData(true),
      lang,
      dir: getLanguageMeta(lang).dir,
      indexable: true,
    };
  }

  const pageTitles: Record<string, string> = {
    '/builder': 'Website Builder | VIJAY VISUALS',
    '/demo': 'Interactive Demo | VIJAY VISUALS',
    '/ai': 'AI Automation Center | VIJAY VISUALS',
    '/dashboards': 'Workspace Dashboards | VIJAY VISUALS',
    '/admin': 'Admin Console | VIJAY VISUALS',
    '/payments/cashfree/return': 'Payment Return | VIJAY VISUALS',
  };
  const title =
    pageTitles[pathname] ||
    (pathname.startsWith('/proposal') ? 'Customer Proposal | VIJAY VISUALS' : 'VIJAY VISUALS');
  return {
    title,
    description: copy.description,
    canonicalUrl,
    robots: isPrivatePlatformRoute(pathname) ? 'noindex, nofollow' : 'noindex, follow',
    hreflang: [],
    structuredData: '',
    lang,
    dir: getLanguageMeta(lang).dir,
    indexable: false,
  };
}

export function renderPlatformHeadInjection(meta: SeoSiteMeta): string {
  const alternateTags = meta.hreflang
    .map(
      (link) =>
        `<link rel="alternate" hreflang="${escapeHtml(link.hreflang)}" href="${escapeHtml(link.href)}" />`
    )
    .join('\n');
  // Title is applied by replaceHeadMetadata(); including it here would create
  // two <title> elements on every platform HTML response.
  return [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`,
    alternateTags,
    `<meta property="og:site_name" content="Vijay Visuals" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${OFFICIAL_SITE_URL}/pwa-512x512.png" />`,
    `<meta property="og:locale" content="${OG_LOCALES[meta.lang]}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${OFFICIAL_SITE_URL}/pwa-512x512.png" />`,
    meta.structuredData
      ? `<script type="application/ld+json">${meta.structuredData}</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function setHtmlLangDir(html: string, lang: Lang, dir: 'ltr' | 'rtl'): string {
  return String(html || '').replace(/<html\b[^>]*>/i, (tag) => {
    const withoutLangDir = tag
      .replace(/\s+lang\s*=\s*(["'])[^"']*\1/gi, '')
      .replace(/\s+dir\s*=\s*(["'])[^"']*\1/gi, '');
    return withoutLangDir.replace(/^<html/i, `<html lang="${lang}" dir="${dir}"`);
  });
}

/**
 * Replaces SPA platform head tags with a single authoritative tag set.
 * The GSC verification tag is preserved on platform pages and removed only
 * for tenant-owned HTML, where a platform token must never leak.
 */
export function replaceHeadMetadata(
  html: string,
  title: string,
  injection: string,
  removeVerification = false
): string {
  const safeTitle = escapeHtml(title);
  let result = String(html || '').replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, `<title>${safeTitle}</title>`);

  // Tenant-owned HTML must not inherit platform GSC tokens, PWA branding or
  // platform icons. Platform HTML only swaps the SEO-owned tags and keeps its
  // PWA manifest/icon declarations intact.
  const metaPattern = removeVerification
    ? 'og:|twitter:|google-site-verification|description|robots|theme-color|mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title'
    : 'og:|twitter:|description|robots';
  const linkPattern = removeVerification
    ? 'canonical|alternate|icon|shortcut icon|apple-touch-icon|manifest'
    : 'canonical|alternate';
  result = result
    .replace(
      new RegExp(
        `<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["'](?:${metaPattern})[^"']*["'][^>]*>`,
        'gi'
      ),
      ''
    )
    .replace(
      new RegExp(
        `<link\\b[^>]*\\brel\\s*=\\s*["'](?:${linkPattern})["'][^>]*>`,
        'gi'
      ),
      ''
    )
    .replace(
      /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      ''
    );

  return result.replace(/<\/head>/i, `${injection}\n</head>`);
}

function safeMediaUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '';
}

function safeHttpUrl(value: unknown): string {
  const raw = String(value || '').trim();
  return /^https:\/\//i.test(raw) ? raw : '';
}

function safeCurrency(value: unknown): string {
  const code = String(value || '').trim().toUpperCase();
  const allowed = new Set(GLOBAL_CURRENCIES.map((currency) => currency.code));
  return allowed.has(code as (typeof GLOBAL_CURRENCIES)[number]['code']) ? code : 'INR';
}

function safeSchemaType(value: unknown): string {
  const type = String(value || '').trim();
  return TENANT_SCHEMA_TYPES.has(type) ? type : 'LocalBusiness';
}

export function parseTenantSeoSettings(rawJson: unknown): TenantSeoSettings {
  let parsed: Record<string, unknown> = {};
  if (typeof rawJson === 'string') {
    try {
      const value = JSON.parse(rawJson);
      if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  } else if (rawJson && typeof rawJson === 'object') {
    parsed = rawJson as Record<string, unknown>;
  }

  const text = (key: string) =>
    typeof parsed[key] === 'string' ? String(parsed[key]).trim() : '';
  return {
    seoTitle: text('seoTitle'),
    seoDescription: text('seoDescription'),
    phone: text('phone'),
    address: text('address'),
    logoUrl: safeMediaUrl(parsed.logoImage || parsed.logoUrl),
    themeColor: /^#[0-9a-fA-F]{6}$/.test(text('primaryColor') || text('themeColor'))
      ? text('primaryColor') || text('themeColor')
      : '',
    robotsDirectives: normalizeTenantRobots(text('robotsDirectives')),
    canonicalUrl: safeHttpUrl(text('canonicalUrl')),
    googleSiteVerification: text('googleSiteVerification'),
    googleMapsUrl: safeHttpUrl(text('googleMapsUrl')),
    localBusinessType: safeSchemaType(text('localBusinessType')),
    currency: safeCurrency(text('currency')),
  };
}

export function resolveTenantCanonicalUrl(input: CanonicalResolutionInput): string {
  const cleanOrigin = String(input.origin || '').replace(/\/$/, '');
  const pathname = normalizePathname(input.pathname);
  const platformSiteSlug = input.platformSiteSlug
    ? String(input.platformSiteSlug).trim().toLowerCase()
    : '';
  const routeCanonical = platformSiteSlug
    ? `${cleanOrigin}${STOREFRONT_ROUTE_PREFIX}${encodeURIComponent(platformSiteSlug)}`
    : `${cleanOrigin}${pathname === '/' ? '/' : pathname}`;

  const configured = String(input.configuredUrl || '').trim();
  if (!configured) return routeCanonical;
  try {
    const url = new URL(configured);
    if (url.origin !== cleanOrigin) return routeCanonical;
    if (url.protocol !== 'https:' && cleanOrigin.startsWith('https:')) return routeCanonical;
    const path = normalizePathname(url.pathname);
    const query = url.searchParams.toString();
    return `${url.origin}${path}${query ? `?${query}` : ''}`;
  } catch {
    return routeCanonical;
  }
}

export function buildTenantStructuredData(input: TenantSchemaInput): string {
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': safeSchemaType(input.localBusinessType),
      name: input.name,
      description: input.description || undefined,
      url: input.canonicalUrl,
      telephone: input.phone || undefined,
      ...(input.address
        ? {
            address: {
              '@type': 'PostalAddress',
              streetAddress: input.address,
              ...(input.addressCountry ? { addressCountry: input.addressCountry } : {}),
            },
          }
        : {}),
      ...(safeHttpUrl(input.googleMapsUrl) ? { hasMap: safeHttpUrl(input.googleMapsUrl) } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: input.name, item: input.canonicalUrl },
      ],
    },
    ...(input.products || [])
      .slice(0, 12)
      .map((product) => ({
        '@type': 'Product',
        name: product.name,
        description: product.description || undefined,
        image: safeMediaUrl(product.imageUrl) || undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: safeCurrency(input.currency),
          price: Number(product.price) || 0,
          availability:
            Number(product.stock) > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
      })),
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function renderTenantHeadInjection(input: {
  name: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  robots: string;
  tenantSlug?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  googleSiteVerification?: string | null;
  themeColor?: string | null;
  pwaAppName?: string | null;
  pwaEnabled?: boolean;
  structuredData: string;
  platformBlogUrl?: string | null;
}): { title: string; injection: string } {
  const brandedPwa = input.pwaEnabled === true;
  const tenantManifestHref = input.tenantSlug
    ? `/api/tenants/${encodeURIComponent(input.tenantSlug)}/manifest.webmanifest`
    : '';
  const tags = [
    '<meta name="vv-tenant-metadata" content="server-rendered" />',
    input.tenantSlug
      ? `<meta name="vv-tenant-slug" content="${escapeHtml(input.tenantSlug)}" />`
      : '',
    `<meta name="robots" content="${escapeHtml(input.robots)}" />`,
    input.googleSiteVerification
      ? `<meta name="google-site-verification" content="${escapeHtml(input.googleSiteVerification)}" />`
      : '',
    `<meta name="description" content="${escapeHtml(input.seoDescription)}" />`,
    `<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(input.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(input.seoTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(input.seoDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${escapeHtml(input.seoTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(input.seoDescription)}" />`,
    `<meta name="twitter:url" content="${escapeHtml(input.canonicalUrl)}" />`,
    input.logoUrl ? `<meta property="og:image" content="${escapeHtml(input.logoUrl)}" />` : '',
    input.logoUrl ? `<link rel="icon" href="${escapeHtml(input.logoUrl)}" />` : '',
    input.logoUrl ? `<link rel="apple-touch-icon" href="${escapeHtml(input.logoUrl)}" />` : '',
    input.themeColor ? `<meta name="theme-color" content="${escapeHtml(input.themeColor)}" />` : '',
    brandedPwa
      ? '<meta name="mobile-web-app-capable" content="yes" />'
      : '',
    brandedPwa
      ? '<meta name="apple-mobile-web-app-capable" content="yes" />'
      : '',
    brandedPwa
      ? '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />'
      : '',
    brandedPwa && input.pwaAppName
      ? `<meta name="apple-mobile-web-app-title" content="${escapeHtml(input.pwaAppName)}" />`
      : '',
    brandedPwa && tenantManifestHref
      ? `<link rel="manifest" href="${escapeHtml(tenantManifestHref)}" />`
      : '',
    `<script type="application/ld+json">${input.structuredData}</script>`,
  ].filter(Boolean);

  return {
    title: input.seoTitle,
    injection: tags.join('\n'),
  };
}

export function buildNotFoundHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08080A;color:#E8E8ED;font-family:system-ui,-apple-system,sans-serif;padding:24px;}
    .card{max-width:520px;background:#111116;border:1px solid #262630;border-radius:14px;padding:28px;}
    h1{margin:0 0 10px;font-size:20px;color:#F8FAFC;}
    p{margin:0;font-size:14px;line-height:1.6;color:#A1A1AA;}
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

export function safeLastmod(value: unknown): string | undefined {
  const dateText = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  const timestamp = Date.parse(`${dateText}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 86_400_000) return undefined;
  return dateText;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = safeLastmod(entry.lastmod);
      let alternateOrigin = '';
      try {
        alternateOrigin = new URL(entry.loc).origin;
      } catch {
        alternateOrigin = '';
      }
      const hreflangLinks =
        entry.withHreflang && alternateOrigin ? buildHreflangLinks(alternateOrigin, '/') : [];
      const hreflangXml = hreflangLinks.length
        ? `\n${hreflangLinks
            .map(
              (link) =>
                `    <xhtml:link rel="alternate" hreflang="${escapeXml(link.hreflang)}" href="${escapeXml(link.href)}" />`
            )
            .join('\n')}\n  `
        : '';
      return `  <url><loc>${escapeXml(entry.loc)}</loc>${
        lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
      }${entry.priority ? `<priority>${escapeXml(entry.priority)}</priority>` : ''}${hreflangXml}</url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export function buildRobotsTxt(origin: string): string {
  const cleanOrigin = String(origin || '').replace(/\/$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /dashboards',
    'Disallow: /builder',
    'Disallow: /demo',
    'Disallow: /ai',
    'Disallow: /proposal/',
    'Disallow: /proposals',
    'Disallow: /payments/',
    'Disallow: /sites/',
    '',
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function getLocalizationAudit() {
  return LOCALIZATION_AUDIT;
}
