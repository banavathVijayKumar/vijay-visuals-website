// Offline regression checks for the customer Demo Business Builder.
// No network, D1, provider, payment, or publication action is performed.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUSINESS_CATEGORIES,
  DEMO_CATEGORY_PROFILES,
  DEMO_SECTION_LABELS,
  TEMPLATE_TO_DEMO_CATEGORY,
  buildTenantDraftPayload,
  categoryForTemplate,
  createDraftFromTemplate,
  templatesForCategory,
} from '../src/data/demoBuilder';
import { TEMPLATES_DATA } from '../src/lib/templatesData';
import { sanitizeDemoDraftForStorage } from '../functions/api/_demoDraft';

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');
const checks: string[] = [];
const pass = (name: string) => checks.push(name);

// 1. Every supported category and every selectable template is represented.
const categoryIds = BUSINESS_CATEGORIES.map((category) => category.id);
assert.equal(categoryIds.length, 16, 'Expected 16 supported broad categories');
for (const id of categoryIds) {
  assert.ok(DEMO_CATEGORY_PROFILES[id], `Missing demo profile for ${id}`);
  assert.ok(templatesForCategory(id).length > 0, `No templates mapped to ${id}`);
}
pass(`all ${categoryIds.length} supported categories have profiles and templates`);

for (const template of TEMPLATES_DATA) {
  const categoryId = categoryForTemplate(template.id);
  assert.ok(DEMO_CATEGORY_PROFILES[categoryId], `Unmapped template category: ${template.id}`);
  assert.equal(TEMPLATE_TO_DEMO_CATEGORY[template.id], categoryId);
}
assert.equal(Object.keys(TEMPLATE_TO_DEMO_CATEGORY).length, TEMPLATES_DATA.length);
pass(`all ${TEMPLATES_DATA.length} templates mapped without omission`);

// 2. Required category coverage.
for (const required of ['clothing', 'restaurant', 'beauty_salon', 'gym', 'photography', 'real_estate']) {
  assert.ok(templatesForCategory(required as (typeof categoryIds)[number]).length > 0, `Missing ${required}`);
}
assert.match(BUSINESS_CATEGORIES.find((c) => c.id === 'restaurant')!.label, /Cafes/i);
pass('clothing, restaurant/cafe, salon, gym, photography, and real-estate coverage verified');

// 3. Distinct layouts, not one forced generic template.
const modes = new Set(categoryIds.map((id) => DEMO_CATEGORY_PROFILES[id].mode));
assert.deepEqual([...modes].sort(), ['commerce', 'food', 'portfolio', 'property', 'service'].sort());
pass('category profiles use five distinct preview layouts');

// 4. Draft payload stays unpublished and carries full draft state server-side.
const sampleTemplate = TEMPLATES_DATA.find((t) => t.id === 'clothing-store')!;
const draft = createDraftFromTemplate(sampleTemplate);
const payload = buildTenantDraftPayload(draft);
assert.equal(payload.published, false);
assert.equal(payload.status, 'unpublished');
assert.deepEqual(payload.demoBuilderDraft, draft);
assert.equal(payload.enabledModules.cartCheckout, false);
pass('tenant draft payload is explicitly unpublished and preserves draft data');

// 5. Server sanitizer blocks unsafe or oversized fields.
const sanitized = sanitizeDemoDraftForStorage({
  ...draft,
  identity: { ...draft.identity, businessName: '<script>alert(1)</script>Shop', mapUrl: 'javascript:alert(1)' },
  items: [
    { ...draft.items[0], image: 'javascript:alert(1)', sizes: ['<img src=x>', 'M'] },
    ...Array.from({ length: 40 }, (_, idx) => ({ ...draft.items[0], id: `x-${idx}`, name: `Item ${idx}` })),
  ],
});
assert.ok(sanitized);
assert.equal(sanitized.identity.mapUrl, '');
assert.ok(!sanitized.identity.businessName.includes('<script>'));
assert.equal(sanitized.items[0].image, '');
assert.ok(!sanitized.items[0].sizes.some((size) => size.includes('<img')));
assert.ok(sanitized.items.length <= 24);
assert.equal(sanitizeDemoDraftForStorage({ ...draft, categoryId: 'not-a-category' }), undefined);
pass('server draft sanitizer blocks unsafe URLs, markup, and oversized lists');

// 6. Component and route wiring.
const component = read('src/components/DemoBusinessBuilder.tsx');
const app = read('src/App.tsx');
const navbar = read('src/components/Navbar.tsx');
const redirects = read('public/_redirects');
const mapper = read('functions/api/_tenantMapper.ts');
const tenantsPost = read('functions/api/tenants.ts');
const tenantsPatch = read('functions/api/tenants/[slug].ts');

for (const token of [
  'DemoWebsitePreview',
  'saveLocalDraft',
  'saveAccountDraft',
  'openServerDraft',
  'readAndOptimizeImageFile',
  'Mobile',
  'Tablet',
  'Desktop',
  'requestProposal',
  'data-testid="demo-website-preview"',
]) {
  assert.ok(component.includes(token), `Missing builder capability: ${token}`);
}
pass('component includes live preview, responsive controls, uploads, drafts, and proposal handoff');

assert.ok(app.includes("import { DemoBusinessBuilder }"));
assert.ok(app.includes("view: 'demo-builder'"));
assert.ok(navbar.includes("activeView === 'demo-builder'"));
assert.ok(redirects.includes('/demo-builder                 /index.html  200'));
assert.ok(mapper.includes('demoBuilderDraft'));
assert.ok(tenantsPost.includes('sanitizeDemoDraftForStorage'));
assert.ok(tenantsPatch.includes('sanitizeDemoDraftForStorage'));
pass('route, navigation, rewrite, server persistence, and reopen mapping are wired');

// 7. White-label preview: customer brand only.
const previewBody = component.slice(component.indexOf('function DemoWebsitePreview'), component.indexOf('export const DemoBusinessBuilder'));
assert.ok(!previewBody.includes('VIJAY VISUALS'), 'Public preview body must not include platform branding');
assert.ok(previewBody.includes('draft.identity.businessName'), 'Preview must render customer business name');
assert.ok(previewBody.includes('max-w-[375px]'), 'Mobile preview frame is required');
assert.ok(previewBody.includes('max-w-[768px]'), 'Tablet preview frame is required');
pass('preview body is customer-branded and includes mobile/tablet/desktop frames');

// 8. No published-site overwrite path from the builder.
const demoData = read('src/data/demoBuilder.ts');
assert.ok(!component.includes('published: true'));
assert.ok(!component.includes('/publish'));
assert.ok(demoData.includes('published: false'));
pass('builder never publishes or overwrites a published site');

// 9. Section editor coverage.
for (const label of Object.values(DEMO_SECTION_LABELS)) {
  assert.ok(
    component.includes(label) || demoData.includes(label),
    `Missing supported section label: ${label}`
  );
}
assert.ok(component.includes('updateSection'));
assert.ok(component.includes('moveSection'));
assert.ok(component.includes('addSection'));
pass('section show/hide, reorder, title, layout, and add controls are present');

console.log(`DEMO BUILDER CHECKS: ${checks.length}/${checks.length} PASSED`);
checks.forEach((check) => console.log(`PASS: ${check}`));
