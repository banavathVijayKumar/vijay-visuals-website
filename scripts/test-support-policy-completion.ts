// ============================================================================
// LOCAL SUPPORT / LEGAL PLACEHOLDER REGRESSION SUITE
// No network, no database, no provider call, no secret, no Production access.
// Verifies the safe Instagram DM handoff and explicit owner-input placeholders.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CONTACT_INFO } from '../src/data/content.ts';
import { OWNER_INPUT_PLACEHOLDERS, PolicyView, type PolicyPageKey } from '../src/components/PolicyView.tsx';

const rootDir = process.cwd();
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

await test('Instagram DM uses a safe click-to-DM handoff URL, not an API claim', () => {
  assert.equal(CONTACT_INFO.instagramDmUrl, 'https://ig.me/m/vijay_visuals_1');
  assert.equal(CONTACT_INFO.instagramUrl, 'https://instagram.com/vijay_visuals_1');
  const url = new URL(CONTACT_INFO.instagramDmUrl);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'ig.me');
});

await test('public landing footer exposes Instagram follow and Instagram DM links', () => {
  const source = read('src/components/StudioLanding.tsx');
  assert.match(source, /CONTACT_INFO\.instagramUrl/);
  assert.match(source, /CONTACT_INFO\.instagramDmUrl/);
  assert.match(source, />Instagram DM</);
});

await test('support center exposes verified direct channels and a sensitive-data warning', () => {
  const source = read('src/components/CustomerSupportCenter.tsx');
  assert.match(source, /Direct channels:/);
  assert.match(source, /CONTACT_INFO\.whatsappUrl/);
  assert.match(source, /CONTACT_INFO\.instagramDmUrl/);
  assert.match(source, /mailto:\$\{CONTACT_INFO\.email\}/);
  assert.match(source, /Never share OTPs, passwords, keys or bank details\./);
});

await test('every policy page renders explicit owner-input placeholders', () => {
  for (const page of ['privacy', 'terms', 'refund', 'shipping', 'cancellation'] as PolicyPageKey[]) {
    const html = renderToStaticMarkup(React.createElement(PolicyView, { page }));
    for (const placeholder of OWNER_INPUT_PLACEHOLDERS) {
      assert.ok(html.includes(placeholder.replaceAll('&', '&amp;')), `${page} must show ${placeholder}`);
    }
    assert.match(html, /Verified contact channels/);
    assert.ok(html.includes(CONTACT_INFO.instagramDmUrl), `${page} must include the safe Instagram DM link`);
    assert.ok(html.includes(`mailto:${CONTACT_INFO.email}`), `${page} must include the verified email link`);
  }
});

await test('policies invent no GSTIN, legal entity, address or grievance contact', () => {
  const source = read('src/components/PolicyView.tsx');
  assert.match(source, /GSTIN \/ tax registration: \[OWNER INPUT REQUIRED\]/);
  assert.match(source, /Legal entity name: \[OWNER INPUT REQUIRED\]/);
  assert.match(source, /Registered business address: \[OWNER INPUT REQUIRED\]/);
  assert.match(source, /Grievance \/ privacy contact: \[OWNER INPUT REQUIRED\]/);
  assert.doesNotMatch(source, /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d\b/);
});

await test('standalone policy routes and rewrites remain intact', () => {
  const app = read('src/App.tsx');
  const redirects = read('public/_redirects');
  const seoRules = read('shared/seo.ts');
  for (const route of ['/privacy', '/terms', '/refund', '/shipping', '/cancellation']) {
    assert.ok(app.includes(`'${route}'`), `App must map ${route}`);
    assert.match(redirects, new RegExp(`^${route.replace('/', '\\/')}\\s+\\/index\\.html\\s+200$`, 'm'));
    assert.ok(
      seoRules.includes(`'${route}'`),
      `Middleware platform-route allowlist must include ${route} or Pages returns 404`
    );
  }
});

console.log(`\n${passed} passed, 0 failed`);
