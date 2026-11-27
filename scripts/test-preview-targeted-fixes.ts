// ============================================================================
// LOCAL TARGETED PREVIEW REGRESSION SUITE
// No network, no DB writes, no provider calls, no secrets, no Production.
// Verifies the six scoped fixes from the browser QA report:
//  - /demo and /dashboards slash/no-slash shell routing
//  - three explicitly labeled demo sample storefronts + safe fallback
//  - font failure fallback (no required Google Fonts request)
//  - simulated domain / SSL / deployment / publishing labels
//  - white-label error fallback preservation
//  - guarded auth/API boundaries remain untouched
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { onRequest, shouldServeSpaShellDirectly } from '../functions/_middleware.ts';
import {
  getDemoStorefront,
  isDemoStoreSlug,
} from '../src/data/demo.ts';
import { FONT_STACKS, getTenantFontStack } from '../src/lib/fontStacks.ts';
import { ErrorBoundary } from '../src/components/ErrorBoundary.tsx';

const rootDir = process.cwd();
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

const DEMO_SLUGS = [
  'deccan-royal-couture',
  'nocturne-audio-tech',
  'nizam-heritage-kitchen',
] as const;

// ---------------------------------------------------------------------------
// 1. Routing
// ---------------------------------------------------------------------------

await test('exact no-slash SPA entries are recognized only for /demo and /dashboards', () => {
  assert.equal(shouldServeSpaShellDirectly('/demo'), true);
  assert.equal(shouldServeSpaShellDirectly('/dashboards'), true);
  assert.equal(shouldServeSpaShellDirectly('/demo?lang=te'), true);
  assert.equal(shouldServeSpaShellDirectly('/demo/', 'GET'), false);
  assert.equal(shouldServeSpaShellDirectly('/dashboards/', 'HEAD'), false);
  assert.equal(shouldServeSpaShellDirectly('/admin'), false);
  assert.equal(shouldServeSpaShellDirectly('/api/admin/overview'), false);
  assert.equal(shouldServeSpaShellDirectly('/site/deccan-royal-couture'), false);
  assert.equal(shouldServeSpaShellDirectly('/demo', 'POST'), false);
});

await test('no-slash routes fetch the canonical shell directly instead of redirecting', async () => {
  const shellHtml =
    '<!doctype html><html lang="en"><head><title>Vijay Visuals</title></head><body><div id="root"></div></body></html>';

  for (const pathname of ['/demo', '/dashboards']) {
    const shellRequests: string[] = [];
    const nextRequests: Array<string | null> = [];
    const context = {
      request: new Request(
        `https://75b7aa83.vijay-visuals-site.pages.dev${pathname}`,
        { method: 'GET' }
      ),
      env: {
        ASSETS: {
          fetch: async (request: Request) => {
            shellRequests.push(request.url);
            return new Response(shellHtml, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          },
        },
      },
      next: async (input?: string | Request) => {
        nextRequests.push(typeof input === 'string' ? input : null);
        return new Response('unexpected next()', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
      params: {},
      waitUntil: () => {},
    };

    const response = await onRequest(context as any);
    assert.equal(response.status, 200, `${pathname} must not be a 308/301`);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(shellRequests.length, 1, `${pathname} must fetch the shell asset`);
    assert.ok(shellRequests[0].endsWith('/'), `${pathname} shell URL must be canonical root`);
    assert.equal(nextRequests.length, 0, `${pathname} must not fall through`);
    assert.match(await response.text(), /<div id="root">/);
    assert.ok(response.headers.get('X-Robots-Tag'), `${pathname} keeps edge SEO headers`);
  }
});

await test('trailing-slash routes keep the existing static rewrite path', async () => {
  for (const pathname of ['/demo/', '/dashboards/']) {
    const shellRequests: string[] = [];
    const nextRequests: Array<string | null> = [];
    const context = {
      request: new Request(
        `https://75b7aa83.vijay-visuals-site.pages.dev${pathname}`,
        { method: 'GET' }
      ),
      env: {
        ASSETS: {
          fetch: async (request: Request) => {
            shellRequests.push(request.url);
            return new Response('shell', {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          },
        },
      },
      next: async (input?: string | Request) => {
        nextRequests.push(typeof input === 'string' ? input : null);
        return new Response('<html><body>next</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
      params: {},
      waitUntil: () => {},
    };

    const response = await onRequest(context as any);
    assert.equal(response.status, 200);
    assert.equal(shellRequests.length, 0);
    assert.equal(nextRequests.length, 1);
  }
});

await test('static rewrites cover both slash forms and client router accepts both', () => {
  const redirects = read('public/_redirects');
  assert.match(redirects, /^\/demo\s+\/index\.html\s+200$/m);
  assert.match(redirects, /^\/demo\/\s+\/index\.html\s+200$/m);
  assert.match(redirects, /^\/dashboards\s+\/index\.html\s+200$/m);
  assert.match(redirects, /^\/dashboards\/\s+\/index\.html\s+200$/m);

  const app = read('src/App.tsx');
  assert.match(app, /pathname\.startsWith\('\/demo'\)/);
  assert.match(app, /pathname\.startsWith\('\/dashboards'\)/);
});

await test('direct-shell branch cannot bypass API or private admin routes', () => {
  const middleware = read('functions/_middleware.ts');
  assert.match(middleware, /isPlatformHost && shouldServeSpaShellDirectly\(url\.pathname, request\.method\)/);
  assert.match(middleware, /SPA_SHELL_EXACT_ROUTES = new Set\(\['\/demo', '\/dashboards'\]\)/);
  assert.doesNotMatch(middleware, /SPA_SHELL_EXACT_ROUTES[^\n]*'\/admin'/);
  assert.doesNotMatch(middleware, /SPA_SHELL_EXACT_ROUTES[^\n]*'\/api/);
});

// ---------------------------------------------------------------------------
// 2. Demo sample storefronts
// ---------------------------------------------------------------------------

await test('all three advertised sample storefronts have complete isolated demo data', () => {
  for (const slug of DEMO_SLUGS) {
    const data = getDemoStorefront(slug);
    assert.ok(data, `${slug} must be present as a client-only sample`);
    assert.equal(isDemoStoreSlug(slug), true);
    assert.equal(data.tenant.slug, slug);
    assert.equal(data.products.length, 3);
    assert.equal(data.coupons.length, 1);
    assert.equal(data.reviews.length, 1);

    // Demo data must never impersonate a published, owned, payable business.
    assert.equal(data.tenant.published, false);
    assert.equal(data.tenant.status, 'demo_sample');
    assert.equal(data.tenant.ownerUserId, null);
    assert.equal(data.tenant.codEnabled, false);
    assert.equal(data.tenant.upiId, '');
    assert.equal(data.tenant.cashfreeOnlineReady, false);
    assert.match(String(data.tenant.seoDescription || ''), /not a live business/i);
    assert.match(String(data.tenant.description || ''), /demo/i);
    assert.match(String(data.products[0].description || ''), /Illustrative demo item/i);
    assert.match(String(data.reviews[0].comment || ''), /not feedback from a real customer/i);
  }
});

await test('unknown or missing demo slugs do not receive fabricated data', () => {
  assert.equal(getDemoStorefront(null), null);
  assert.equal(getDemoStorefront(''), null);
  assert.equal(getDemoStorefront('not-a-published-store'), null);
  assert.equal(isDemoStoreSlug('not-a-published-store'), false);

  const storefront = read('src/components/StorefrontView.tsx');
  assert.match(storefront, /if \(sampleStorefront\) \{[\s\S]*return sampleStorefront;/);
  assert.match(storefront, /throw err;/);
});

await test('demo fallback returns a deep copy so mutations cannot leak between loads', () => {
  const first = getDemoStorefront(DEMO_SLUGS[0]);
  const second = getDemoStorefront(DEMO_SLUGS[0]);
  assert.ok(first && second);
  first.tenant.name = 'MUTATED SAMPLE';
  first.products[0].price = 1;
  assert.notEqual(second.tenant.name, 'MUTATED SAMPLE');
  assert.notEqual(second.products[0].price, 1);
});

await test('sample storefronts block all remote write paths', () => {
  const storefront = read('src/components/StorefrontView.tsx');
  assert.match(storefront, /const blockDemoWrite = \(\): boolean =>/);
  const guardedHandlers = [
    'const handleCheckout',
    'const handleSubmitReview',
    'const handleChatSend',
  ];
  for (const handler of guardedHandlers) {
    const start = storefront.indexOf(handler);
    assert.ok(start >= 0, `${handler} is missing`);
    const slice = storefront.slice(start, start + 1400);
    assert.match(slice, /blockDemoWrite\(\)|demoSample/, `${handler} must be demo-guarded`);
  }
  for (const endpoint of [
    "'/api/orders'",
    "'/api/ai/support-chat'",
    "'/api/newsletter/subscribe'",
    '`/api/public/tenants/${encodeURIComponent(tenant.slug)}/quote-request`',
    '`/api/tenants/${tenant.slug}/appointments`',
  ]) {
    assert.ok(storefront.includes(endpoint), `${endpoint} still exists in storefront`);
  }
  assert.match(storefront, /setPwaLicenseValid\(false\)/);
  assert.match(storefront, /setSeoConfig\(null\)/);
  assert.doesNotMatch(storefront, /isDemoStoreSlug\(tenant\.slug\)/);

  const reviews = read('src/components/StorefrontReviews.tsx');
  assert.match(reviews, /const blockDemoReviewWrite = \(\): boolean =>/);
  assert.match(reviews, /disabled=\{isDemoStore\}/);
  assert.match(reviews, /Reviews Read-Only \(Demo\)/);
});

// ---------------------------------------------------------------------------
// 3. Font fallback
// ---------------------------------------------------------------------------

await test('no required Google Fonts network request remains', () => {
  const indexHtml = read('index.html');
  assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com/);
  assert.doesNotMatch(indexHtml, /fonts\.gstatic\.com/);
  assert.match(indexHtml, /No\s+Google Fonts network request is required/);
});

await test('CSS and inline tenant fonts always end in system fallbacks', () => {
  const css = read('src/index.css');
  assert.match(css, /--font-cinzel:[^;]*Georgia[^;]*serif/);
  assert.match(css, /--font-jakarta:[^;]*Segoe UI[^;]*Arial[^;]*sans-serif/);
  assert.match(css, /--font-mono:[^;]*ui-monospace[^;]*Consolas[^;]*monospace/);
  assert.match(css, /\.font-script[^}]*'Brush Script MT'[^}]*cursive/);

  assert.equal(getTenantFontStack('Cinzel'), FONT_STACKS.luxury);
  assert.equal(getTenantFontStack('Plus Jakarta Sans'), FONT_STACKS.sans);
  assert.equal(getTenantFontStack(undefined), FONT_STACKS.sans);
  assert.match(FONT_STACKS.luxury, /Georgia/);
  assert.match(FONT_STACKS.sans, /Arial/);
  assert.match(FONT_STACKS.mono, /Consolas/);
  assert.match(FONT_STACKS.script, /cursive/);

  const storefront = read('src/components/StorefrontView.tsx');
  const builder = read('src/components/WebsiteBuilder.tsx');
  assert.match(storefront, /getTenantFontStack\(tenant\.fontFamily\)/);
  assert.doesNotMatch(storefront, /'Cinzel, serif'/);
  assert.doesNotMatch(storefront, /'Plus Jakarta Sans, sans-serif'/);
  assert.match(builder, /getTenantFontStack\(fontFamily\)/);
  assert.doesNotMatch(builder, /'Cinzel, serif'/);
  assert.doesNotMatch(builder, /'Plus Jakarta Sans, sans-serif'/);
});

// ---------------------------------------------------------------------------
// 4. Demo honesty labels
// ---------------------------------------------------------------------------

await test('demo hub no longer presents a live domain, SSL, deployment or publish state', () => {
  const hub = read('src/components/InteractiveDemoHub.tsx');
  assert.doesNotMatch(hub, /royal-kitchen\.vijayvisuals\.in/);
  assert.doesNotMatch(hub, /SSL Active/);
  assert.doesNotMatch(hub, />Live Sync</);
  assert.doesNotMatch(hub, />6 Live Items</);
  assert.match(hub, /simulated:\/\/demo-storefront \(no domain configured\)/);
  assert.match(hub, /NO DOMAIN · NO SSL · NOT DEPLOYED/);
  assert.match(hub, /Simulation only\./);
  assert.match(hub, /SAMPLE DATA · NO LIVE SYNC/);
  assert.match(hub, /Simulated Dispatch · No Delivery Created/);
  assert.match(hub, /platform preview only/);
  assert.match(hub, /This demo publishes nothing/);
  assert.doesNotMatch(hub, /Active immediately upon clicking Publish/);
});

// ---------------------------------------------------------------------------
// 5. White-label error fallback
// ---------------------------------------------------------------------------

const renderBoundary = (publicHost: boolean): string => {
  const boundary = new ErrorBoundary({
    children: React.createElement('div', null, 'content'),
    sectionName: 'Website',
    publicHost,
  });
  (boundary as any).state = {
    hasError: true,
    error: new Error('local test error'),
    errorId: 'err_local_test',
  };
  return renderToStaticMarkup(boundary.render() as React.ReactElement);
};

await test('tenant-facing error fallback contains no platform support or branding', () => {
  const html = renderBoundary(true);
  assert.match(html, /Reload Storefront/);
  assert.match(html, /Your information remains safe/);
  assert.doesNotMatch(html, /VIJAY VISUALS/i);
  assert.doesNotMatch(html, /vk66278@gmail\.com/i);
  assert.doesNotMatch(html, /9381362201/);
  assert.doesNotMatch(html, /wa\.me/);
  assert.doesNotMatch(html, /main platform/i);
});

await test('platform error fallback retains official support contact', () => {
  const originalDocument = (globalThis as any).document;
  const originalWindow = (globalThis as any).window;
  (globalThis as any).document = { querySelector: () => null };
  (globalThis as any).window = {
    location: {
      hostname: 'vijay-visuals-site.pages.dev',
      pathname: '/',
      search: '',
      href: 'https://vijay-visuals-site.pages.dev/',
    },
  };
  try {
    const html = renderBoundary(false);
    assert.match(html, /Return to Home/);
    assert.match(html, /vk66278@gmail\.com/);
    assert.match(html, /9381362201/);
    assert.match(html, /wa\.me/);
  } finally {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  }
});

await test('storefront error boundary is explicitly marked as public-host where applicable', () => {
  const app = read('src/App.tsx');
  assert.match(app, /<ErrorBoundary[\s\S]*sectionName=\{isPublicTenantHost \? 'Website' : 'Storefront View'\}[\s\S]*publicHost=\{isPublicTenantHost\}/);
});

console.log(`\nPASS — ${passed}/15 targeted preview regression groups.`);
