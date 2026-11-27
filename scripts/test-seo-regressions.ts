// ============================================================================
// LOCAL SEO / SECURITY REGRESSION SUITE
// Run with: node .\node_modules\tsx\dist\cli.mjs scripts/test-seo-regressions.ts
//
// This suite is intentionally offline. It never reads .env files, never calls
// payment/email/WhatsApp providers, and never touches Production D1 or the
// public site. Fake secrets below are literals used only for HMAC assertions.
// ============================================================================

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  CORE_BUSINESS_CATEGORY_COUNT,
  FAQS,
  LOCALIZATION_AUDIT,
  SEO_READY_LANGUAGES,
  TEMPLATE_CATEGORY_COUNT,
  TEMPLATE_COUNT,
} from '../src/data/content.ts';
import {
  OFFICIAL_SITE_URL,
  STOREFRONT_ROUTE_PREFIX,
  buildHreflangLinks,
  buildNotFoundHtml,
  buildPlatformStructuredData,
  buildRobotsTxt,
  buildSitemapXml,
  buildTenantStructuredData,
  getPageCanonicalUrl,
  getPlatformSeoMeta,
  getStorefrontSlug,
  getTenantRobotsDirective,
  isKnownPlatformHtmlRoute,
  isStaticAssetPath,
  normalizeTenantRobots,
  parseTenantSeoSettings,
  renderPlatformHeadInjection,
  renderTenantHeadInjection,
  replaceHeadMetadata,
  resolveTenantCanonicalUrl,
  safeLastmod,
  setHtmlLangDir,
} from '../shared/seo.ts';
import { applyStorefrontMetadata } from '../src/lib/storefrontMetadata.ts';
import { hmacSha256Base64, hmacSha256Hex, safeEqual } from '../functions/api/_shared.ts';
import { verifyEdgeCashfreeWebhookSignature } from '../functions/api/payments/_cashfree.ts';
import { requireAuthorizedAiTenant } from '../functions/api/_aiTenantAccess.ts';
import { RESERVED_SLUGS, validateSafeImageSource } from '../functions/api/_tenantAccess.ts';

const tests: Array<{ name: string; run: () => void | Promise<void> }> = [];
function test(name: string, run: () => void | Promise<void>): void {
  tests.push({ name, run });
}

function read(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

function listTsxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(fullPath);
    return entry.name.endsWith('.tsx') ? [fullPath] : [];
  });
}

// ---------------------------------------------------------------------------
// Minimal DOM for the real applyStorefrontMetadata() helper. It implements only
// the selectors and mutations that helper uses, so no browser/jsdom is needed.
// ---------------------------------------------------------------------------
class FakeElement {
  tag: string;
  attrs = new Map<string, string>();
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  textContent = '';

  constructor(tag: string) {
    this.tag = tag.toLowerCase();
  }

  get id(): string {
    return this.getAttribute('id') || '';
  }

  set id(value: string) {
    this.setAttribute('id', value);
  }

  get type(): string {
    return this.getAttribute('type') || '';
  }

  set type(value: string) {
    this.setAttribute('type', value);
  }

  setAttribute(name: string, value: unknown): void {
    this.attrs.set(name.toLowerCase(), String(value));
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name.toLowerCase()) ?? null;
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name.toLowerCase());
  }

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

function selectorMatches(element: FakeElement, selector: string): boolean {
  const idMatch = selector.match(/^([a-z]+)#([A-Za-z0-9_-]+)$/i);
  if (idMatch) {
    return element.tag === idMatch[1].toLowerCase() && element.getAttribute('id') === idMatch[2];
  }

  const tagMatch = selector.match(/^[a-z]+/i);
  if (tagMatch && element.tag !== tagMatch[0].toLowerCase()) return false;

  const attributePattern = /\[([^\]=]+)(?:=["']([^"']*)["'])?\]/g;
  for (const match of selector.matchAll(attributePattern)) {
    const name = match[1];
    const expected = match[2];
    const actual = element.getAttribute(name);
    if (expected === undefined && actual === null) return false;
    if (expected !== undefined && actual !== expected) return false;
  }
  return true;
}

class FakeDocument {
  head = new FakeElement('head');
  documentElement = { lang: 'en', dir: 'ltr' };
  title = '';

  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        if (selectorMatches(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this.head);
    return found;
  }
}

// ---------------------------------------------------------------------------
// Source-of-truth and language readiness
// ---------------------------------------------------------------------------

test('SEO-ready languages are limited to complete English pages', () => {
  assert.deepEqual([...SEO_READY_LANGUAGES], ['en']);
  const ready = LOCALIZATION_AUDIT.filter((entry) => entry.seoReady);
  assert.deepEqual(
    ready.map((entry) => entry.code),
    ['en']
  );
  for (const entry of LOCALIZATION_AUDIT) {
    if (entry.code === 'en') continue;
    assert.equal((SEO_READY_LANGUAGES as readonly string[]).includes(entry.code), false);
  }
});

test('hreflang links are reciprocal and exclude partial locales', () => {
  const links = buildHreflangLinks(OFFICIAL_SITE_URL, '/');
  assert.deepEqual(
    links.map((link) => link.hreflang),
    ['x-default', 'en']
  );
  assert.equal(links[0].href, `${OFFICIAL_SITE_URL}/`);
  assert.equal(
    getPageCanonicalUrl(OFFICIAL_SITE_URL, '/', null, false),
    `${OFFICIAL_SITE_URL}/`
  );
  assert.equal(
    getPageCanonicalUrl(OFFICIAL_SITE_URL, '/', 'en', true),
    links.find((link) => link.hreflang === 'en')?.href
  );
  assert.equal(buildHreflangLinks(OFFICIAL_SITE_URL, '/marketplace').length, 0);

  const platformHtml = read('index.html');
  for (const entry of LOCALIZATION_AUDIT) {
    if (entry.code === 'en') continue;
    assert.equal(platformHtml.includes(`hreflang="${entry.code}"`), false);
  }
  assert.match(
    platformHtml,
    /hreflang="en"\s+href="https:\/\/vijay-visuals-site\.pages\.dev\/\?lang=en"/
  );
});

test('language URL and metadata rules keep partial locales on one canonical URL', () => {
  const telugu = getPlatformSeoMeta(OFFICIAL_SITE_URL, '/', 'te', false);
  assert.equal(telugu.lang, 'te');
  assert.equal(telugu.dir, 'ltr');
  assert.equal(telugu.indexable, true);
  assert.equal(telugu.canonicalUrl, `${OFFICIAL_SITE_URL}/`);
  assert.deepEqual(
    telugu.hreflang.map((link) => link.hreflang),
    ['x-default', 'en']
  );

  const urdu = getPlatformSeoMeta(OFFICIAL_SITE_URL, '/', 'ur', true);
  assert.equal(urdu.dir, 'rtl');
  assert.equal(urdu.canonicalUrl, `${OFFICIAL_SITE_URL}/`);
  assert.equal(getPageCanonicalUrl(OFFICIAL_SITE_URL, '/', 'ur', true), `${OFFICIAL_SITE_URL}/`);
  assert.equal(setHtmlLangDir('<html lang="en" dir="ltr"><head></head></html>', 'ur', 'rtl').includes('<html lang="ur" dir="rtl">'), true);
});

test('application routes are known but never indexable', () => {
  assert.equal(isKnownPlatformHtmlRoute('/'), true);
  assert.equal(isKnownPlatformHtmlRoute('/marketplace'), true);
  assert.equal(isKnownPlatformHtmlRoute('/proposal/token-123'), true);
  assert.equal(isKnownPlatformHtmlRoute('/payments/cashfree/return'), true);
  assert.equal(isKnownPlatformHtmlRoute('/demo-builder'), true);
  assert.equal(isKnownPlatformHtmlRoute('/demo-builder/'), true);
  assert.equal(isKnownPlatformHtmlRoute('/demo-builder/step'), true);
  assert.equal(isKnownPlatformHtmlRoute('/not-a-real-page'), false);
  assert.equal(isStaticAssetPath('/favicon.svg'), true);

  assert.equal(getPlatformSeoMeta(OFFICIAL_SITE_URL, '/builder', 'en', false).robots, 'noindex, follow');
  assert.equal(getPlatformSeoMeta(OFFICIAL_SITE_URL, '/dashboards', 'en', false).robots, 'noindex, nofollow');
  assert.equal(getPlatformSeoMeta(OFFICIAL_SITE_URL, '/proposal/token', 'en', false).robots, 'noindex, nofollow');
  assert.equal(getPlatformSeoMeta(OFFICIAL_SITE_URL, '/marketplace', 'en', false).robots, 'index, follow');
});

// ---------------------------------------------------------------------------
// Sitemap, robots, canonical, invalid URLs and real 404s
// ---------------------------------------------------------------------------

test('sitemap advertises only canonical, real HTML routes', () => {
  const xml = buildSitemapXml([
    { loc: `${OFFICIAL_SITE_URL}/`, priority: '1.0', withHreflang: true },
    {
      loc: `${OFFICIAL_SITE_URL}${STOREFRONT_ROUTE_PREFIX}demo-store`,
      lastmod: '2026-01-02',
      priority: '0.8',
    },
  ]);

  assert.match(xml, /<loc>https:\/\/vijay-visuals-site\.pages\.dev\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/vijay-visuals-site\.pages\.dev\/site\/demo-store<\/loc>/);
  assert.equal(xml.includes('/sites/'), false);
  assert.equal(xml.includes('/blog/'), false);
  assert.equal(xml.includes('?product='), false);
  assert.equal(xml.includes('hreflang="te"'), false);
  assert.match(xml, /hreflang="x-default"/);
  assert.match(xml, /hreflang="en"/);
  assert.equal(safeLastmod('2099-01-01'), undefined);
  assert.equal(safeLastmod('2026-01-02T10:00:00Z'), '2026-01-02');
});

test('robots.txt uses one authoritative rule set and official sitemap URL', () => {
  const robots = buildRobotsTxt(OFFICIAL_SITE_URL);
  for (const directive of [
    'Disallow: /api/',
    'Disallow: /builder',
    'Disallow: /admin',
    'Disallow: /dashboards',
    'Disallow: /proposal/',
    'Disallow: /payments/',
    'Disallow: /sites/',
  ]) {
    assert.equal(robots.includes(directive), true, `missing ${directive}`);
  }
  assert.match(robots, /Sitemap: https:\/\/vijay-visuals-site\.pages\.dev\/sitemap\.xml/);
  assert.equal(read('functions/robots.txt.ts').includes('buildRobotsTxt'), true);
  assert.equal(read('src/routes/growth.ts').includes('buildSitemapXml'), true);
});

test('storefront URL parsing rejects invalid and non-canonical paths', () => {
  assert.equal(getStorefrontSlug('/site/acme-store'), 'acme-store');
  assert.equal(getStorefrontSlug('/sites/acme-store'), 'acme-store');
  assert.equal(getStorefrontSlug('/site/Acme-Store'), 'acme-store');
  assert.equal(getStorefrontSlug('/site/acme%20store'), null);
  assert.equal(getStorefrontSlug('/site/%E0%A4%A'), null);
  assert.equal(getStorefrontSlug('/site/acme/extra'), null);
  assert.equal(getStorefrontSlug('/blog/acme'), null);
});

test('unknown HTML routes are real HTTP 404s in edge and production server', () => {
  const middleware = read('functions/_middleware.ts');
  assert.match(middleware, /buildNotFoundHtml/);
  assert.match(middleware, /status: 404/);
  assert.match(middleware, /isKnownPlatformHtmlRoute\(pathname\)/);
  assert.match(middleware, /headers\.set\('X-Robots-Tag', meta\.robots\)/);

  const server = read('server.ts');
  assert.match(server, /buildNotFoundHtml/);
  assert.match(server, /\.status\(404\)/);
  assert.match(server, /isKnownPlatformHtmlRoute\(pathname\)/);
  assert.match(server, /isLegacyStorefrontRoute\(pathname\)/);
  assert.match(server, /res\.redirect\(301, `\$\{STOREFRONT_ROUTE_PREFIX\}/);

  const redirects = read('public/_redirects');
  assert.equal(/^\/\*\s+\/index\.html\s+200/m.test(redirects), false);
  assert.match(redirects, /\/sites\/\*\s+\/site\/:splat\s+301!/);
  assert.match(redirects, /\/site\/\*\s+\/index\.html\s+200/);

  assert.match(buildNotFoundHtml('Page Not Found', 'Missing'), /<meta name="robots" content="noindex, nofollow"/);
});

test('static platform head matches shared canonical rules', () => {
  const html = read('index.html');
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/i)?.[1];
  assert.equal(canonical, getPageCanonicalUrl(OFFICIAL_SITE_URL, '/', null, false));
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /rel="preload"\s+as="image"\s+href="\/founder_hero_portrait\.png"/);
});

// ---------------------------------------------------------------------------
// FAQ JSON-LD parity and honest copy
// ---------------------------------------------------------------------------

test('FAQ JSON-LD matches visible FAQ source and uses Cashfree wording', () => {
  const html = read('index.html');
  const rawJson = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(rawJson, 'static JSON-LD script is missing');
  const graph = (JSON.parse(rawJson) as { '@graph': Array<Record<string, any>> })['@graph'];
  const faqNode = graph.find((node) => node['@type'] === 'FAQPage');
  assert.ok(faqNode, 'FAQPage node is missing');

  assert.deepEqual(
    faqNode.mainEntity.map((question: any) => question.name),
    FAQS.map((faq) => faq.q)
  );
  assert.deepEqual(
    faqNode.mainEntity.map((question: any) => question.acceptedAnswer.text),
    FAQS.map((faq) => faq.a)
  );
  assert.equal(JSON.stringify(graph).includes('Razorpay'), false);
  assert.equal(JSON.stringify(graph).includes('Cashfree'), true);

  const generatedGraph = (
    JSON.parse(buildPlatformStructuredData()) as { '@graph': Array<Record<string, any>> }
  )['@graph'];
  const generatedFaq = generatedGraph.find((node) => node['@type'] === 'FAQPage');
  assert.ok(generatedFaq, 'generated FAQPage node is missing');
  assert.deepEqual(faqNode.mainEntity, generatedFaq.mainEntity);
  assert.match(read('src/components/StudioLanding.tsx'), /FAQS\.map/);
});

test('category and template count claims match source data', () => {
  assert.equal(CORE_BUSINESS_CATEGORY_COUNT, 16);
  assert.equal(TEMPLATE_COUNT, 36);
  assert.equal(TEMPLATE_CATEGORY_COUNT, 36);

  const planSource = read('functions/api/plans.ts');
  const seedSource = read('src/db/seed.ts');
  assert.equal(planSource.includes('35 industry templates'), false);
  assert.equal(seedSource.includes('16 industry templates'), false);
  assert.match(planSource, /16 broad industry groups and 36 ready-to-customize templates/);
  assert.match(seedSource, /16 broad industry groups and 36 ready-to-customize templates/);
  // Commercial values are asserted only to catch accidental price edits.
  assert.match(planSource, /priceInr: 14999/);

  const landing = read('src/components/StudioLanding.tsx');
  assert.match(landing, /Illustrative Studio Examples/);
  assert.match(landing, /Demonstration content only/);
});

// ---------------------------------------------------------------------------
// Tenant robots, canonical parity and hydrated metadata
// ---------------------------------------------------------------------------

test('tenant noindex is computed before hydration for non-public states', () => {
  for (const status of ['draft', 'unpublished', 'private', 'suspended']) {
    assert.equal(getTenantRobotsDirective({ publicationStatus: status }), 'noindex, nofollow');
  }
  assert.equal(
    getTenantRobotsDirective({ publicationStatus: 'published', domainStatus: 'pending' }),
    'noindex, nofollow'
  );
  assert.equal(
    getTenantRobotsDirective({
      publicationStatus: 'published',
      rawJson: JSON.stringify({ visibility: 'private' }),
    }),
    'noindex, nofollow'
  );
  assert.equal(getTenantRobotsDirective({ publicationStatus: 'published' }), 'index, follow');
  assert.equal(normalizeTenantRobots('unrecognized directive'), 'index, follow');

  const injection = renderTenantHeadInjection({
    name: 'Acme Studio',
    seoTitle: 'Acme Studio — Independent local test',
    seoDescription: 'Independent local test description.',
    canonicalUrl: `${OFFICIAL_SITE_URL}/site/acme-studio`,
    robots: 'noindex, nofollow',
    structuredData: buildTenantStructuredData({
      name: 'Acme Studio',
      canonicalUrl: `${OFFICIAL_SITE_URL}/site/acme-studio`,
    }),
  });
  assert.match(injection.injection, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(read('functions/_middleware.ts'), /getTenantRobotsDirective/);
});

test('tenant canonical URLs reject cross-origin and legacy overrides', () => {
  const canonical = resolveTenantCanonicalUrl({
    origin: OFFICIAL_SITE_URL,
    pathname: '/sites/acme-studio',
    platformSiteSlug: 'acme-studio',
    configuredUrl: '',
  });
  assert.equal(canonical, `${OFFICIAL_SITE_URL}${STOREFRONT_ROUTE_PREFIX}acme-studio`);
  assert.equal(
    resolveTenantCanonicalUrl({
      origin: OFFICIAL_SITE_URL,
      pathname: '/',
      platformSiteSlug: 'acme-studio',
      configuredUrl: 'https://custom-domain.example/',
    }),
    canonical
  );
  assert.equal(
    resolveTenantCanonicalUrl({
      origin: OFFICIAL_SITE_URL,
      pathname: '/',
      platformSiteSlug: null,
      configuredUrl: 'http://insecure.example/',
    }),
    `${OFFICIAL_SITE_URL}/`
  );

  const settings = parseTenantSeoSettings(
    JSON.stringify({ canonicalUrl: 'https://custom-domain.example/', robotsDirectives: 'bad value', primaryColor: 'red' })
  );
  // Parsing keeps only syntactically safe HTTPS values; cross-origin values are
  // still rejected by resolveTenantCanonicalUrl before any HTML is emitted.
  assert.equal(settings.canonicalUrl, 'https://custom-domain.example/');
  assert.equal(settings.robotsDirectives, 'index, follow');
  assert.equal(settings.themeColor, '');
  assert.equal(
    resolveTenantCanonicalUrl({
      origin: OFFICIAL_SITE_URL,
      pathname: '/',
      platformSiteSlug: 'acme-studio',
      configuredUrl: settings.canonicalUrl,
    }),
    canonical
  );
  assert.equal(
    parseTenantSeoSettings(JSON.stringify({ canonicalUrl: 'http://insecure.example/' })).canonicalUrl,
    ''
  );
  assert.equal(read('functions/api/public/tenants/[slug]/seo.ts').includes('resolveTenantCanonicalUrl'), true);
});

test('edge and hydrated storefront metadata agree on title, robots, canonical and JSON-LD', () => {
  const canonicalUrl = `${OFFICIAL_SITE_URL}/site/acme-studio`;
  const description = 'Independent local test description.';
  const robots = 'noindex, nofollow';
  const schemaInput = {
    name: 'Acme Studio',
    description,
    canonicalUrl,
    phone: '+91-1111111111',
    address: 'Test Address',
    addressCountry: 'IN',
    products: [
      {
        name: 'Test Product',
        description: 'Local test product.',
        imageUrl: 'https://example.test/banner.png',
        price: 100,
        stock: 2,
      },
    ],
  };
  const structuredData = buildTenantStructuredData(schemaInput);

  const fakeDoc = new FakeDocument();
  const doc = fakeDoc as unknown as Document;
  doc.title = 'Platform title';
  const head = fakeDoc.head;

  const platformMeta = fakeDoc.createElement('meta');
  platformMeta.setAttribute('name', 'description');
  platformMeta.setAttribute('content', 'platform description');
  head.appendChild(platformMeta);

  const platformRobots = fakeDoc.createElement('meta');
  platformRobots.setAttribute('name', 'robots');
  platformRobots.setAttribute('content', 'index, follow');
  head.appendChild(platformRobots);

  const platformToken = fakeDoc.createElement('meta');
  platformToken.setAttribute('name', 'google-site-verification');
  platformToken.setAttribute('content', 'LOCAL_FAKE_PLATFORM_TOKEN');
  head.appendChild(platformToken);

  const oldCanonical = fakeDoc.createElement('link');
  oldCanonical.setAttribute('rel', 'canonical');
  oldCanonical.setAttribute('href', `${OFFICIAL_SITE_URL}/`);
  head.appendChild(oldCanonical);

  const oldAlternate = fakeDoc.createElement('link');
  oldAlternate.setAttribute('rel', 'alternate');
  oldAlternate.setAttribute('hreflang', 'en');
  oldAlternate.setAttribute('href', `${OFFICIAL_SITE_URL}/?lang=en`);
  head.appendChild(oldAlternate);

  const oldScript = fakeDoc.createElement('script');
  oldScript.setAttribute('type', 'application/ld+json');
  oldScript.textContent = '{"@type":"Organization"}';
  head.appendChild(oldScript);

  const cleanup = applyStorefrontMetadata(doc as Document, {
    name: schemaInput.name,
    slug: 'acme-studio',
    description,
    seoTitle: 'Acme Studio — Independent local test',
    seoDescription: description,
    phone: schemaInput.phone,
    address: schemaInput.address,
    bannerImage: 'https://example.test/banner.png',
    canonicalUrl,
    robotsDirectives: robots,
    products: [{ name: 'Test Product', description: 'Local test product.', price: 100, stock: 2 }],
  });

  assert.equal(doc.title, 'Acme Studio — Independent local test');
  assert.equal(fakeDoc.querySelector('meta[name="robots"]')?.getAttribute('content'), robots);
  assert.equal(fakeDoc.querySelector('meta[name="description"]')?.getAttribute('content'), description);
  assert.equal(fakeDoc.querySelector('link[rel="canonical"]')?.getAttribute('href'), canonicalUrl);
  assert.equal(fakeDoc.querySelectorAll('link[rel="alternate"][hreflang]').length, 0);
  assert.equal(fakeDoc.querySelector('meta[name="google-site-verification"]'), null);
  const scriptNodes = fakeDoc.querySelectorAll('script[type="application/ld+json"]');
  assert.equal(scriptNodes.length, 1);
  assert.equal(scriptNodes[0].textContent, structuredData);

  const edge = renderTenantHeadInjection({
    name: schemaInput.name,
    seoTitle: 'Acme Studio — Independent local test',
    seoDescription: description,
    canonicalUrl,
    robots,
    structuredData,
  });
  assert.equal(edge.title, doc.title);
  assert.equal(edge.injection.includes(`<meta name="robots" content="${robots}" />`), true);
  assert.equal(edge.injection.includes(`<link rel="canonical" href="${canonicalUrl}" />`), true);
  assert.equal(edge.injection.includes(`<meta name="description" content="${description}" />`), true);
  assert.equal(edge.injection.includes(`<script type="application/ld+json">${structuredData}</script>`), true);

  cleanup();
  assert.equal(doc.title, 'Platform title');
  assert.equal(
    fakeDoc.querySelector('meta[name="google-site-verification"]')?.getAttribute('content'),
    'LOCAL_FAKE_PLATFORM_TOKEN'
  );
  assert.equal(fakeDoc.querySelector('link[rel="canonical"]')?.getAttribute('href'), `${OFFICIAL_SITE_URL}/`);
  assert.equal(fakeDoc.querySelectorAll('link[rel="alternate"][hreflang]').length, 1);
});

// ---------------------------------------------------------------------------
// Platform head replacement must preserve platform-owned tags
// ---------------------------------------------------------------------------

test('platform metadata replacement preserves PWA/GSC tags and removes stale JSON-LD', () => {
  const source = `<html lang="en" dir="ltr"><head><title>Old title</title>
<meta name="description" content="old description" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#08080A" />
<meta name="google-site-verification" content="LOCAL_FAKE_PLATFORM_TOKEN" />
<link rel="canonical" href="https://old.example/" />
<link rel="alternate" hreflang="te" href="https://old.example/?lang=te" />
<link rel="icon" href="/favicon.svg" />
<script type="application/ld+json">{"stale":true}</script>
</head><body></body></html>`;

  const meta = getPlatformSeoMeta(OFFICIAL_SITE_URL, '/', 'en', false);
  const result = replaceHeadMetadata(source, meta.title, renderPlatformHeadInjection(meta), false);
  assert.equal((result.match(/<title>/g) || []).length, 1);
  assert.match(result, /<title>Vijay Visuals — Made in India\. Built for the World<\/title>/);
  assert.match(result, /<link rel="canonical" href="https:\/\/vijay-visuals-site\.pages\.dev\/" \/>/);
  assert.match(result, /name="theme-color"/);
  assert.match(result, /rel="icon"/);
  assert.match(result, /LOCAL_FAKE_PLATFORM_TOKEN/);
  assert.equal(result.includes('hreflang="te"'), false);
  assert.equal(result.includes('{"stale":true}'), false);

  const tenantResult = replaceHeadMetadata(
    source,
    'Acme Studio',
    '<meta name="vv-tenant-metadata" content="server-rendered" />',
    true
  );
  assert.equal(tenantResult.includes('LOCAL_FAKE_PLATFORM_TOKEN'), false);
  assert.equal(tenantResult.includes('name="theme-color"'), false);
  assert.equal(tenantResult.includes('rel="icon"'), false);
  assert.equal(tenantResult.includes('href="https://old.example/"'), false);
});

// ---------------------------------------------------------------------------
// Image layout hygiene
// ---------------------------------------------------------------------------

test('decoded images declare intrinsic dimensions and a loading strategy', () => {
  const files = listTsxFiles(path.resolve(process.cwd(), 'src'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<img\b[\s\S]*?\/>/g)) {
      const tag = match[0];
      const label = `${path.relative(process.cwd(), file)}: ${tag.split('\n')[0]}`;
      assert.match(tag, /\bwidth=/, `${label} is missing width`);
      assert.match(tag, /\bheight=/, `${label} is missing height`);
      assert.match(tag, /\bloading=/, `${label} is missing loading`);
      assert.match(tag, /\bdecoding=/, `${label} is missing decoding`);
    }
  }
});

// ---------------------------------------------------------------------------
// Existing auth/security/payment behavior (offline checks)
// ---------------------------------------------------------------------------

test('HMAC helpers remain correct and constant-time comparison still works', async () => {
  const secret = 'LOCAL_ONLY_FAKE_SECRET';
  const message = '1700000000{"order":"local-test"}';
  assert.equal(
    await hmacSha256Hex(secret, message),
    createHmac('sha256', secret).update(message).digest('hex')
  );
  assert.equal(
    await hmacSha256Base64(secret, message),
    createHmac('sha256', secret).update(message).digest('base64')
  );
  assert.equal(safeEqual('same-value', 'same-value'), true);
  assert.equal(safeEqual('same-value', 'different'), false);
  assert.equal(safeEqual('a', 'aa'), false);
});

test('Cashfree webhook verification rejects missing secrets and tampered bodies', async () => {
  const env = { CASHFREE_WEBHOOK_SECRET: 'LOCAL_ONLY_FAKE_WEBHOOK_SECRET' };
  const body = '{"order":"local-test","amount":100}';
  const timestamp = '1700000000';
  const signature = await hmacSha256Base64(env.CASHFREE_WEBHOOK_SECRET, `${timestamp}${body}`);

  assert.equal(await verifyEdgeCashfreeWebhookSignature(env, body, signature, timestamp), true);
  assert.equal(await verifyEdgeCashfreeWebhookSignature(env, `${body} `, signature, timestamp), false);
  assert.equal(await verifyEdgeCashfreeWebhookSignature(env, body, signature, '1700000001'), false);
  assert.equal(await verifyEdgeCashfreeWebhookSignature({}, body, signature, timestamp), false);
});

test('AI tenant gate still denies requests without a verified server-side tenant', async () => {
  const result = await requireAuthorizedAiTenant(
    { DB: null } as any,
    { id: 'local-user', authSubject: 'local-user' } as any,
    ''
  );
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 404);
  const body = (await result.response.json()) as { code?: string };
  assert.equal(body.code, 'TENANT_NOT_FOUND');
});

test('tenant isolation and XSS-safe image validation guards remain present', () => {
  assert.equal(validateSafeImageSource('javascript:alert(1)'), '');
  assert.equal(validateSafeImageSource('<svg onload="alert(1)">'), '');
  assert.equal(validateSafeImageSource('https://example.test/logo.png'), 'https://example.test/logo.png');
  assert.equal(RESERVED_SLUGS.has('site'), true);
  assert.equal(RESERVED_SLUGS.has('sites'), true);

  const server = read('server.ts');
  assert.match(server, /tenant\.ownerUserId === dbUser\.id/);
  assert.match(server, /Tenant isolation enforced/);
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
for (const entry of tests) {
  try {
    await entry.run();
    passed += 1;
    console.log(`PASS  ${entry.name}`);
  } catch (error) {
    failed += 1;
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`FAIL  ${entry.name}\n${detail}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
if (failed > 0) process.exit(1);
