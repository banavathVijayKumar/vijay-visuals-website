// ============================================================================
// OUR PLATFORM SECTION REGRESSIONS
// Verifies the five-card platform replacement, removal of old agency-service
// cards, responsive/accessible markup, and absence of fake routes or buttons.
// Static local checks only: no network, build, D1, or provider calls.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_SECTION, PLATFORM_SERVICES_DATA } from '../src/data/content';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(directory: string, extension: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath, extension);
    return entry.name.endsWith(extension) ? [fullPath] : [];
  });
}

const srcDir = path.join(root, 'src');
const allSource = walk(srcDir, '.tsx')
  .concat(walk(srcDir, '.ts'))
  .map((file) => ({ file: path.relative(root, file), content: fs.readFileSync(file, 'utf8') }));

const landing = read('src/components/StudioLanding.tsx');
const navbar = read('src/components/Navbar.tsx');
const sectionStart = landing.indexOf('{/* Our Platform');
const sectionEnd = landing.indexOf('</section>', sectionStart);
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'Our Platform section must exist');
const section = landing.slice(sectionStart, sectionEnd);

await test('section copy matches the approved platform positioning exactly', () => {
  assert.equal(PLATFORM_SECTION.title, 'OUR PLATFORM');
  assert.equal(
    PLATFORM_SECTION.subtitle,
    'Connecting Customers, Local Businesses & Delivery Partners in One Smart Platform.'
  );
  assert.equal(
    PLATFORM_SECTION.description,
    'Discover local businesses, manage online orders, and make local commerce simpler with connected digital experiences.'
  );
  assert.match(section, /\{PLATFORM_SECTION\.title\}/);
  assert.match(section, /\{PLATFORM_SECTION\.subtitle\}/);
  assert.match(section, /\{PLATFORM_SECTION\.description\}/);
});

await test('exactly five platform cards exist with the requested titles and descriptions', () => {
  assert.equal(PLATFORM_SERVICES_DATA.length, 5);
  assert.deepEqual(
    PLATFORM_SERVICES_DATA.map((card) => card.title),
    [
      'ONLINE SHOPPING & STOREFRONTS',
      'SMART BUSINESS MANAGEMENT',
      'SMART DELIVERY & LIVE TRACKING',
      'MULTI-STORE LOCAL COMMERCE',
      'DIGITAL GROWTH & BUSINESS INSIGHTS',
    ]
  );
  const descriptions = [
    'Discover local stores, explore available products, compare prices, and conveniently place online orders.',
    'Help local shop owners manage products, inventory, customer orders, payments, and daily business operations from one dashboard.',
    'Connect shops, customers, and delivery partners through organised pickup, parcel verification, delivery updates, and order tracking.',
    'Bring different local businesses and product categories together so customers can discover convenient shopping options nearby.',
    'Support business growth through multilingual experiences, clear business reports, search visibility, and useful automation.',
  ];
  assert.deepEqual(PLATFORM_SERVICES_DATA.map((card) => card.description), descriptions);
});

await test('every card contains the exact approved highlights', () => {
  assert.deepEqual(PLATFORM_SERVICES_DATA[0].highlights, [
    'Local shop discovery',
    'Product browsing',
    'Shopping cart',
    'Online ordering',
    'Customer accounts',
  ]);
  assert.deepEqual(PLATFORM_SERVICES_DATA[1].highlights, [
    'Shop owner dashboard',
    'Product and inventory management',
    'Order management',
    'Sales overview',
    'Business operations',
  ]);
  assert.deepEqual(PLATFORM_SERVICES_DATA[2].highlights, [
    'Rider assignment',
    'QR-based parcel scanning',
    'Pickup verification',
    'Delivery status updates',
    'Customer tracking',
    'Secure delivery proof',
  ]);
  assert.deepEqual(PLATFORM_SERVICES_DATA[3].highlights, [
    'Multiple business categories',
    'Independent shop storefronts',
    'Local product discovery',
    'Customer-friendly shopping',
    'White-label customer websites',
  ]);
  assert.deepEqual(PLATFORM_SERVICES_DATA[4].highlights, [
    'Multilingual customer experience',
    'Business analytics',
    'Sales and order reports',
    'SEO foundations',
    'Business automation',
  ]);
  assert.match(section, /service\.highlights\.map/);
});

await test('old agency services and the Our Creative Craft heading are fully removed', () => {
  const removedCopy = [
    'Our Creative Craft',
    'Website Design & Dev',
    'Video Editing & Cinema',
    'Photo Editing & Retouch',
    'Graphic Design & Branding',
    'Digital Growth Solutions',
    'AI Website Builder & Global E-Commerce Engine',
    'CRM, Finance, Warehouses, HR & Delivery OS',
    'AI Automation Center & 12-Language Content Studio',
    'Optional Branded PWA & Creative Studio',
    '4K multi-cam wedding film grading',
    'Everything Required to Run an Independent Online Business',
    'SERVICES_DATA',
  ];
  for (const { file, content } of allSource) {
    for (const phrase of removedCopy) {
      const pattern =
        phrase === 'SERVICES_DATA'
          ? '\\bSERVICES_DATA\\b'
          : phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.doesNotMatch(content, new RegExp(pattern, 'i'), `${file} still contains ${phrase}`);
    }
  }
});

await test('platform section does not present agency or AI-video services', () => {
  assert.doesNotMatch(section + JSON.stringify(PLATFORM_SERVICES_DATA), /video editing|photo editing|filmmaking|graphic design|logo design|ai video creation/i);
});

await test('section appears exactly once and only on the official landing page', () => {
  const idMatches = allSource.filter(({ content }) => content.includes('id="services"'));
  assert.deepEqual(
    idMatches.map((item) => item.file.split(path.sep).join('/')),
    ['src/components/StudioLanding.tsx']
  );
  assert.equal((landing.match(/id="services"/g) || []).length, 1);
  assert.equal((landing.match(/our-platform-title/g) || []).length, 2);
  for (const file of ['src/components/StorefrontView.tsx', 'src/components/DashboardsHub.tsx']) {
    assert.doesNotMatch(read(file), /our-platform-title|PLATFORM_SECTION|PLATFORM_SERVICES_DATA/);
  }
});

await test('Navbar links to the real section without hidden legacy cards', () => {
  assert.doesNotMatch(navbar, /servicesDropdownOpen|servicesList|Our Creative Craft/);
  assert.match(navbar, /href="\/#services"/);
  assert.ok((navbar.match(/Our Platform/g) || []).length >= 2);
});

await test('cards use existing icon library and responsive, accessible markup', () => {
  assert.match(landing, /import \{[\s\S]*?BarChart3[\s\S]*?\} from 'lucide-react'/);
  assert.match(landing, /const PLATFORM_ICONS: Record<string, typeof Truck>/);
  assert.match(section, /aria-labelledby="our-platform-title"/);
  assert.match(section, /id="our-platform-title"/);
  assert.match(section, /grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(section, /px-4 sm:px-6/);
  assert.match(section, /<article/);
  assert.match(section, /<ul className="mt-5 space-y-2/);
  assert.match(section, /aria-hidden="true"/);
  assert.match(section, /hover:-translate-y-1 hover:border-\[#D4AF37\]\/60/);
});

await test('no fake buttons, links, routes, or play controls are added to the section', () => {
  assert.doesNotMatch(section, /<button|onClick=|href=|onNavigate|Play/);
});

console.log(`\n${passed}/${passed} Our Platform section checks passed.`);
