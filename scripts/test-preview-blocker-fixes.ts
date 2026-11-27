// ============================================================================
// VIJAY VISUALS — FINAL PREVIEW BLOCKER REGRESSIONS (offline, read-only)
// Covers the consolidated code fixes that are not already exercised by the
// SEO/webhook/website suites. No network, no D1 writes, no deployments.
// ============================================================================

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTENT_SECURITY_POLICY,
  MAX_JSON_BODY_BYTES,
  SECURITY_HEADERS,
  parseJsonBody,
} from '../functions/api/_shared';
import { validateAttachmentUrl } from '../functions/api/_tenantAccess';
import { generateProposalHtml } from '../src/lib/proposalPdfGenerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

let passed = 0;
let failed = 0;

async function it(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

console.log('====================================================================');
console.log('FINAL PREVIEW BLOCKER REGRESSIONS');
console.log('====================================================================');

await it('CSP is consistent across static, edge, API and legacy Express responses', () => {
  const headersFile = read('public/_headers');
  const middleware = read('functions/_middleware.ts');
  const server = read('server.ts');
  assert.match(headersFile, /Content-Security-Policy:/);
  assert.equal(SECURITY_HEADERS['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(middleware, /SECURITY_HEADERS/);
  assert.match(server, /res\.setHeader\('Content-Security-Policy'/);
});

await it('JSON body parser rejects declared and actual oversized payloads', async () => {
  const declared = new Request('https://preview.test/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_JSON_BODY_BYTES + 1) },
    body: '{}',
  });
  assert.equal(await parseJsonBody(declared), null);

  const actual = new Request('https://preview.test/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'x'.repeat(MAX_JSON_BODY_BYTES + 1),
  });
  assert.equal(await parseJsonBody(actual), null);

  const valid = new Request('https://preview.test/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await parseJsonBody<{ ok: boolean }>(valid), { ok: true });
});

await it('attachment URLs accept only absolute HTTPS links', () => {
  assert.equal(
    validateAttachmentUrl('https://cdn.example.test/receipt.png'),
    'https://cdn.example.test/receipt.png'
  );
  assert.equal(validateAttachmentUrl('javascript:alert(1)'), '');
  assert.equal(validateAttachmentUrl('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(validateAttachmentUrl('file:///etc/passwd'), '');
  assert.equal(validateAttachmentUrl('//cdn.example.test/receipt.png'), '');
});

await it('proposal PDF escapes every untrusted field and pins a restrictive CSP', () => {
  const html = generateProposalHtml({
    id: 1,
    proposal_number: 'P-<img src=x onerror=alert(1)>',
    customer_name: '<script>alert("customer")</script>',
    customer_email: 'customer@example.invalid',
    customer_phone: '+91 9000000000',
    business_name: 'Acme <svg onload=alert(1)>',
    business_category: 'retail',
    development_fee_inr: 7999,
    grand_total_inr: 7999,
    city: 'Hyderabad"><img src=x onerror=alert(1)>',
    state: 'Telangana',
    pincode: '500081',
    area: '<b>area</b>',
    gst_percent: 18,
    package_tier: 'STARTER"><script>bad()</script>',
    feature_breakdown_json: JSON.stringify([
      {
        name: '<img src=x onerror=alert(1)> Core Feature',
        whatItDoes: '<script>steal()</script>',
        customerBenefit: '<svg onload=alert(1)>',
        individualValueInr: 1200,
      },
    ]),
    products_json: JSON.stringify([
      { name: '<img src=x onerror=alert(1)> Product', category: '<b>Cat</b>', price: 499 },
    ]),
    status: 'sent',
    created_at: '2026-11-26T00:00:00.000Z',
  });

  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /&lt;script&gt;|&lt;svg|&lt;img/);
  assert.equal(html.includes('<script>alert("customer")</script>'), false);
  assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
  assert.equal(html.includes('<svg onload=alert(1)>'), false);
});

await it('advertised features and SEO checker labels are truthful', () => {
  const templates = read('src/lib/templatesData.ts');
  const content = read('src/data/content.ts');
  const growthHub = read('src/components/GlobalGrowthHub.tsx');
  for (const falseClaim of [
    'Free Website SEO Audit Generator',
    'ROI Ad Spend Calculator',
    'Monthly Retainer Plans',
    'Live Client Campaign Dashboard',
  ]) {
    assert.equal(templates.includes(falseClaim), false, `still advertised: ${falseClaim}`);
  }
  assert.match(templates, /Manual Metadata & Schema Checker/);
  assert.equal(content.includes('9 structured AI modes grounded strictly in your verified store metrics'), false);
  // The old AI-automation service card was intentionally replaced by the
  // five-card Our Platform section; assert the new truthful positioning.
  assert.match(content, /OUR PLATFORM/);
  assert.match(content, /Connecting Customers, Local Businesses & Delivery Partners in One Smart Platform\./);
  assert.equal(content.includes('AI Automation Center & 12-Language Content Studio'), false);
  assert.equal(growthHub.includes('Free Technical SEO Audit'), false);
  assert.match(growthHub, /Manual SEO Metadata Checker/);
  assert.match(growthHub, /does not crawl live URLs/);
  assert.match(growthHub, /status: 'warn'/);
});

await it('unknown client routes render neutral 404 UI on tenant hosts', () => {
  const app = read('src/App.tsx');
  const types = read('src/types/platform.ts');
  const notFound = read('src/components/NotFoundView.tsx');
  assert.match(types, /'not-found'/);
  assert.match(app, /return \{ view: 'not-found', slug: null \};/);
  assert.match(app, /<NotFoundView\s+publicHost=\{isPublicTenantHost\}/);
  assert.match(notFound, /publicHost \? 'Page Not Found'/);
  assert.match(notFound, /\{!publicHost &&/);
});

await it('platform and preview hosts keep unchanged HTML; /site fallthrough stays compatible', () => {
  const middleware = read('functions/_middleware.ts');
  assert.match(middleware, /return rewritten \|\| next\(\);/);
  assert.equal(
    middleware.includes("return (await platformHtmlResponse(context, url, pathname)) || notFoundHtmlResponse();"),
    false
  );
  assert.equal(
    middleware.includes("resolvedCanonicalUrl.replace(/\\/$/, '')"),
    true
  );
});

await it('legacy Express delivery routes enforce tenant and assignment authorization', () => {
  const server = read('server.ts');
  assert.match(server, /assertTenantAccess\(req, tenantId\)/);
  assert.match(server, /inArray\(orders\.tenantId, partnerTenantIds\)/);
  assert.match(server, /assertTenantAccess\(req, partner\.tenantId\)/);
  assert.match(server, /assertTenantAccess\(req, existing\.tenantId\)/);
  assert.match(server, /RESTRICTED_FULFILLMENT_STATUSES/);
  assert.match(server, /existing\.paymentMethod === 'cashfree_online'/);
});

await it('new mutation endpoints are rate limited and OTP verification is fail-closed', () => {
  const verify = read('functions/api/auth/otp/verify.ts');
  const tickets = read('functions/api/tickets.ts');
  const feedback = read('functions/api/feedback.ts');
  const changeRequests = read('functions/api/owner/tenants/[tenantId]/change-requests.ts');
  const demo = read('functions/api/marketplace/demo.ts');
  for (const [name, source] of [
    ['otp/verify.ts', verify],
    ['tickets.ts', tickets],
    ['feedback.ts', feedback],
    ['change-requests.ts', changeRequests],
    ['marketplace/demo.ts', demo],
  ] as const) {
    assert.match(source, /checkRateLimit\(/, `${name} is not rate limited`);
  }
  assert.match(verify, /otp_verify_ip:/);
  assert.match(verify, /otp_verify_email:/);
});

console.log('====================================================================');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('====================================================================');
if (failed > 0) process.exitCode = 1;
