// ============================================================================
// CHECK 36-TEMPLATE PRICING SCHEDULE — LOCAL REPORT/CATALOGUE VALIDATION ONLY
// Compares the proposed schedule report with the authoritative template source.
// No D1 access, no network, no deployment, no runtime price configuration.
// ============================================================================

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TEMPLATES_DATA } from '../src/lib/templatesData';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const reportPath = path.join(
  root,
  'reports',
  'vijay-visuals-36-template-pricing-schedule.md'
);

const ALLOWED_PRICES = [999, 1499, 1999, 2499, 3499, 4999] as const;
const FORBIDDEN_REASON_TERMS = [
  'unlimited',
  'lifetime',
  'free hosting',
  'free forever',
  'guaranteed ranking',
  'permanent',
  'never expire',
];

interface ScheduleRow {
  index: number;
  name: string;
  sku: string;
  category: string;
  designClass: string;
  price: number;
  reason: string;
}

function extractRows(): ScheduleRow[] {
  const text = fs.readFileSync(reportPath, 'utf8');
  const startMarker = '<!-- PRICING_SCHEDULE_START -->';
  const endMarker = '<!-- PRICING_SCHEDULE_END -->';
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  assert.ok(start >= 0, 'Pricing schedule start marker is missing.');
  assert.ok(end > start, 'Pricing schedule end marker is missing or misplaced.');

  const block = text.slice(start + startMarker.length, end);
  const rows: ScheduleRow[] = [];

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 7) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    if (/^-+$/.test(cells[0])) continue;

    rows.push({
      index: Number(cells[0]),
      name: cells[1],
      sku: cells[2],
      category: cells[3],
      designClass: cells[4],
      price: Number(cells[5].replace(/[₹,\s]/g, '')),
      reason: cells[6],
    });
  }

  return rows;
}

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void | Promise<void>): void {
  try {
    void fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error?.message || error}`);
  }
}

console.log('====================================================================');
console.log('36-TEMPLATE PRICING SCHEDULE CHECK (REPORT ONLY, NO D1 WRITE)');
console.log('====================================================================');

const rows = extractRows();

it('report contains exactly 36 schedule rows', () => {
  assert.equal(rows.length, 36, `Expected 36 rows, found ${rows.length}.`);
});

it('row numbers run from 1 to 36 in order', () => {
  assert.deepEqual(
    rows.map((row) => row.index),
    Array.from({ length: 36 }, (_, index) => index + 1)
  );
});

it('every catalogue template is present exactly once', () => {
  const scheduleSkus = new Set(rows.map((row) => row.sku));
  const catalogueSkus = new Set(TEMPLATES_DATA.map((template) => `tpl-${template.id}`));
  const missing = [...catalogueSkus].filter((sku) => !scheduleSkus.has(sku));
  const extra = [...scheduleSkus].filter((sku) => !catalogueSkus.has(sku));
  assert.deepEqual(missing, [], `Missing SKUs: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `Unexpected SKUs: ${extra.join(', ')}`);
  assert.equal(scheduleSkus.size, 36, 'SKU values are not unique.');
});

it('all 36 SKUs are unique', () => {
  const skus = rows.map((row) => row.sku);
  assert.equal(new Set(skus).size, skus.length);
});

it('names and categories match the authoritative catalogue', () => {
  const bySku = new Map<string, (typeof TEMPLATES_DATA)[number]>(
    TEMPLATES_DATA.map((template) => [`tpl-${template.id}` as string, template])
  );
  for (const row of rows) {
    const template = bySku.get(row.sku);
    assert.ok(template, `No catalogue entry for ${row.sku}.`);
    assert.equal(row.name, template.name, `Name mismatch for ${row.sku}.`);
    assert.equal(row.category, template.category, `Category mismatch for ${row.sku}.`);
  }
});

it('all prices use the six approved levels', () => {
  for (const row of rows) {
    assert.ok(
      (ALLOWED_PRICES as readonly number[]).includes(row.price),
      `${row.sku} uses unapproved price ₹${row.price}.`
    );
  }
});

it('all six approved price levels are represented', () => {
  const used = new Set(rows.map((row) => row.price));
  assert.deepEqual(
    [...used].sort((a, b) => a - b),
    [...ALLOWED_PRICES]
  );
});

it('schedule is not priced uniformly', () => {
  assert.ok(new Set(rows.map((row) => row.price)).size > 1);
});

it('every row has a design class and a non-empty reason', () => {
  for (const row of rows) {
    assert.ok(row.designClass.length > 0, `${row.sku} has no design class.`);
    assert.ok(row.reason.length >= 40, `${row.sku} reason is too short.`);
  }
});

it('reasons do not contain misleading service promises', () => {
  for (const row of rows) {
    const lower = row.reason.toLowerCase();
    for (const term of FORBIDDEN_REASON_TERMS) {
      assert.ok(!lower.includes(term), `${row.sku} reason contains "${term}".`);
    }
  }
});

it('report states that prices are not written to D1 or activated', () => {
  const text = fs.readFileSync(reportPath, 'utf8');
  assert.match(text, /Not written to D1, not activated/);
  assert.match(text, /Prices written to D1 \| 0/);
  assert.match(text, /SKUs activated \| 0/);
});

const distribution = rows.reduce<Record<number, number>>((acc, row) => {
  acc[row.price] = (acc[row.price] || 0) + 1;
  return acc;
}, {});
const total = rows.reduce((sum, row) => sum + row.price, 0);

console.log('--------------------------------------------------------------------');
console.log(`Distribution: ${ALLOWED_PRICES.map((price) => `₹${price}=${distribution[price] || 0}`).join(', ')}`);
console.log(`Proposed one-time list-price total: ₹${total.toLocaleString('en-IN')}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('====================================================================');

if (failed > 0) process.exit(1);
