// ============================================================================
// BRAND CLEANUP REGRESSIONS
// Static source checks only: no network, build, D1, or provider calls.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_SECTION,
  PLATFORM_SERVICES_DATA,
  TEMPLATE_CATEGORY_COUNT,
  TEMPLATE_COUNT,
} from '../src/data/content';
import { TEMPLATES_DATA } from '../src/lib/templatesData';

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

function walk(directory: string, extensions: string[]): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Historical scratch/backup folders are not active source.
      if (/scratch|backup|legacy|__old__/i.test(entry.name)) return [];
      return walk(fullPath, extensions);
    }
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [fullPath] : [];
  });
}

/**
 * `UNUSED_OLD_TEMPLATES` in supabase.ts is dead historical demo data, not
 * customer-facing copy. Drop that block from active-source scans so the
 * assertions apply only to live application content.
 */
function stripHistoricalBlocks(content: string): string {
  const start = content.indexOf('const UNUSED_OLD_TEMPLATES');
  if (start < 0) return content;
  const end = content.indexOf('\n];', start);
  return end < 0 ? content : content.slice(0, start) + content.slice(end + 3);
}

const srcFiles = walk(path.join(root, 'src'), ['.ts', '.tsx']).map((file) => ({
  file: path.relative(root, file).split(path.sep).join('/'),
  content: stripHistoricalBlocks(fs.readFileSync(file, 'utf8')),
}));

const forbiddenPhrases = [
  // Customer-facing agency-service branding
  'Cinematic Media',
  'Professional video editing, photography & branding',
  'Professional video editing, photography &amp; branding',
  'Creative Solutions for a Digital World',
  // Unsupported service / turnaround promises
  '24/7 Support',
  '24/7 AI Customer Support Chatbot',
  'Express 24-Hour Rush Turnaround',
  '24-hour room service',
  '24/7 Chemist',
  '24/7 Open',
  '24/7 Midnight Delivery Slot',
  '24/7 emergency ambulance hotline',
  // Platform-branded creative-service template copy
  'Vijay Visuals Master Photography Studio',
  'Vijay Visuals Post-Production & Color Grade Studio',
  'Royal Heritage Wedding Cinema & Candid Photography',
  'Cinematic wedding films',
  '4K Drone Teaser Showcase',
  // Illustrative wedding-film testimonial
  'Dr. Priya & Rohit Verma',
  'Udaipur Palace Wedding',
  'Watching our wedding film edited by Vijay',
  'The color grading is pure royal cinema',
  // Agency self-description in platform proposal/error copy
  'digital agency',
  'agency support',
  'OFFICIAL AGENCY CONTACT STRIP',
  // Removed unused CONTACT_INFO fields
  'experienceYears',
  'projectsCompleted',
  'satisfactionRate',
];

await test('forbidden agency/wedding-film/24-hour phrases are absent from active source', () => {
  for (const { file, content } of srcFiles) {
    const lower = content.toLowerCase();
    for (const phrase of forbiddenPhrases) {
      assert.ok(
        !lower.includes(phrase.toLowerCase()),
        `${file} still contains forbidden phrase: ${phrase}`
      );
    }
  }
});

const allowedTechnical24HourFiles = new Set([
  'src/routes/domains.ts',
  'functions/api/domains/_helpers.ts',
  'functions/api/_whatsapp.ts',
  'functions/api/payments/_cashfree.ts',
]);

await test('non-technical 24-hour claims are gone while DNS/Meta/Cashfree references remain', () => {
  for (const { file, content } of srcFiles) {
    if (allowedTechnical24HourFiles.has(file)) continue;
    const matches = content.match(/\b24\s*(?:\/7|-hour|hours|hour)\b/gi) ?? [];
    assert.deepEqual(matches, [], `${file} still contains a non-technical 24-hour claim`);
  }
  assert.match(read('src/routes/domains.ts'), /up to 24 hours/);
  assert.match(read('functions/api/domains/_helpers.ts'), /5 minutes to 24 hours/);
  assert.match(read('functions/api/_whatsapp.ts'), /24-hour window/);
  assert.match(read('functions/api/payments/_cashfree.ts'), /24-hour resend range/);
});

await test('approved OUR PLATFORM copy and exactly five cards are preserved', () => {
  assert.equal(PLATFORM_SECTION.title, 'OUR PLATFORM');
  assert.equal(
    PLATFORM_SECTION.subtitle,
    'Connecting Customers, Local Businesses & Delivery Partners in One Smart Platform.'
  );
  assert.equal(
    PLATFORM_SECTION.description,
    'Discover local businesses, manage online orders, and make local commerce simpler with connected digital experiences.'
  );
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
  const landing = read('src/components/StudioLanding.tsx');
  assert.match(landing, /\{PLATFORM_SECTION\.title\}/);
  assert.match(landing, /\{PLATFORM_SECTION\.subtitle\}/);
  assert.match(landing, /\{PLATFORM_SECTION\.description\}/);
  assert.match(landing, /PLATFORM_SERVICES_DATA\.map/);
  const navbar = read('src/components/Navbar.tsx');
  assert.match(navbar, /Our Platform/);
});

await test('founder title is preserved exactly', () => {
  const hero = read('src/components/CinematicHero.tsx');
  assert.match(hero, /Vijay Kumar — Founder & Creative Director/);
  assert.match(hero, /Founder &amp; Creative Director/);
});

await test('36 templates and 36 distinct categories are preserved', () => {
  assert.equal(TEMPLATES_DATA.length, 36);
  assert.equal(TEMPLATE_COUNT, 36);
  assert.equal(TEMPLATE_CATEGORY_COUNT, 36);
  assert.equal(new Set(TEMPLATES_DATA.map((t) => t.id)).size, 36);
  assert.equal(new Set(TEMPLATES_DATA.map((t) => t.category)).size, 36);
  const templateSource = read('src/lib/templatesData.ts');
  assert.equal((templateSource.match(/demo_slug: '/g) ?? []).length, 36);
  // Photography Studios remains a supported customer industry category.
  assert.match(read('src/data/content.ts'), /label: 'Photography Studios'/);
  // The three reworded entries are grounded customer-business templates.
  assert.match(templateSource, /Portrait & Event Photography/);
  assert.match(templateSource, /Creator Video Portfolio/);
  assert.match(templateSource, /Wedding Photography Business/);
});

console.log(`\n${passed}/${passed} brand cleanup checks passed.`);
