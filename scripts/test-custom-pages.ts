// ============================================================================
// LOCAL CUSTOM-PAGE REGRESSION SUITE
// No network, no database, no provider call, no secret, no Production access.
// Verifies canonical page sanitization, safe rendering and all write/read paths.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CUSTOM_PAGE_SECTION_IDS,
  sanitizeCustomPages,
} from '../functions/api/_customPages.ts';

const rootDir = process.cwd();
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
};

await test('legacy page shape is preserved with safe defaults', () => {
  const pages = sanitizeCustomPages([
    { slug: 'About Us!', title: 'About Us', content: 'Our story' },
  ]);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0], {
    slug: 'about-us',
    title: 'About Us',
    content: 'Our story',
    inNav: true,
    blocks: [],
  });
});

await test('reserved section slugs cannot collide with built-in navigation', () => {
  for (const slug of CUSTOM_PAGE_SECTION_IDS) {
    const pages = sanitizeCustomPages([{ slug, title: `Page ${slug}` }]);
    assert.equal(pages[0]?.slug, `page-${slug}`);
  }
});

await test('invalid, duplicate and excess pages are rejected safely', () => {
  const pages = sanitizeCustomPages([
    { slug: '', title: 'No slug' },
    { slug: 'about', title: 'First' },
    { slug: 'about', title: 'Duplicate' },
    { slug: 'contact', title: 'Reserved' },
    ...Array.from({ length: 20 }, (_, index) => ({
      slug: `page-${index}`,
      title: `Page ${index}`,
    })),
  ]);
  assert.equal(pages.length, 12);
  assert.equal(new Set(pages.map((page) => page.slug)).size, 12);
  assert.ok(pages.every((page) => !CUSTOM_PAGE_SECTION_IDS.includes(page.slug as never)));
});

await test('block types, text, list items and links are allowlisted', () => {
  const pages = sanitizeCustomPages([
    {
      slug: 'services-detail',
      title: 'Services Detail',
      content: 'Legacy body',
      inNav: false,
      blocks: [
        { type: 'heading', text: '<img src=x onerror=alert(1)>Safe heading' },
        { type: 'list', items: ['One', '<script>bad</script>', '', 'Two'] },
        { type: 'link', text: 'Website', url: 'https://example.com/docs' },
        { type: 'link', text: 'Bad', url: 'javascript:alert(1)' },
        { type: 'image', url: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Logo' },
        { type: 'unknown', text: 'Ignored' },
      ],
    },
  ]);

  assert.equal(pages[0].inNav, false);
  assert.equal(pages[0].blocks.length, 4);
  assert.equal(pages[0].blocks[0].text, 'img src=x onerror=alert(1)Safe heading');
  assert.deepEqual(pages[0].blocks[1].items, ['One', 'scriptbad/script', 'Two']);
  assert.equal(pages[0].blocks[2].url, 'https://example.com/docs');
  assert.equal(pages[0].blocks[3].url, 'data:image/png;base64,iVBORw0KGgo=');
});

await test('every tenant JSON writer and reader uses the canonical sanitizer', () => {
  const files = [
    'functions/api/tenants.ts',
    'functions/api/tenants/[slug].ts',
    'functions/api/owner/tenants/[tenantId]/seo.ts',
    'functions/api/public/tenants/[slug]/seo.ts',
    'functions/api/_tenantMapper.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /sanitizeCustomPages/, `${file} must use the shared sanitizer`);
  }
  const publicSeo = read('functions/api/public/tenants/[slug]/seo.ts');
  assert.match(publicSeo, /customPagesJson: JSON\.stringify\(sanitizeCustomPages\(parsed\.customPages\)\)/);
});

await test('storefront renders standalone pages with text-only blocks and safe hrefs', () => {
  const source = read('src/components/StorefrontView.tsx');
  assert.match(source, /href={`#page-\$\{page\.slug\}`}/);
  assert.match(source, /id={`page-\$\{page\.slug\}`}/);
  assert.match(source, /<CustomPageBlockView/);
  assert.match(source, /function safeCustomPageHref/);
  assert.match(source, /function safeCustomPageImage/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

await test('builder can edit title, content and nav visibility', () => {
  const source = read('src/components/WebsiteBuilder.tsx');
  assert.match(source, /normalizeBuilderPage/);
  assert.match(source, /inNav: page\.inNav !== false/);
  assert.match(source, /Title for page \$\{pg\.slug\}/);
  assert.match(source, /Content for page \$\{pg\.slug\}/);
  assert.match(source, /await loadTenantEditorMeta\(editingTenantId\)/);
});

console.log(`\n${passed} passed, 0 failed`);
