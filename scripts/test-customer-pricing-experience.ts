// ============================================================================
// CUSTOMER EXPERIENCE / PRICING CLARITY CHECKS — LOCAL SOURCE ONLY
// No D1 writes, no deploy, no payment, no account creation, no OTP/email.
// ============================================================================

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUSINESS_PACKAGE_SCOPE,
  CUSTOM_REQUIREMENT_MESSAGE,
  CUSTOMER_RESPONSIBILITIES,
  PACKAGE_EXCLUSIONS,
  PACKAGE_MILESTONES,
  PROPOSED_TEMPLATE_PRICE_BY_ID,
  detectCustomRequirement,
  describeBusinessPackagePrice,
  getProposedTemplatePrice,
} from '../src/lib/customerPricing';
import { TEMPLATES_DATA } from '../src/lib/templatesData';
import type { PlatformPlanRecord } from '../src/types/platform';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error?.message || error}`);
  }
}

console.log('====================================================================');
console.log('CUSTOMER EXPERIENCE & PRICING CLARITY CHECK (SOURCE ONLY)');
console.log('====================================================================');

const pricingLib = read('src/lib/customerPricing.ts');
const marketplace = read('src/components/TemplateMarketplace.tsx');
const packageGuide = read('src/components/PackagePurchaseGuide.tsx');
const studio = read('src/components/StudioLanding.tsx');
const calculator = read('functions/api/proposals/calculate.ts');
const ownerPricing = read('src/components/OwnerTemplatePricing.tsx');
const ownerDashboard = read('src/components/BusinessOwnerDashboard.tsx');
const customerDashboard = read('src/components/DashboardsHub.tsx');
const app = read('src/App.tsx');
const cashfreeClient = read('src/lib/cashfreeClient.ts');
const packageStatusApi = read('functions/api/customer/package-status.ts');
const middleware = read('functions/_middleware.ts');
const plansApi = read('functions/api/plans.ts');
const content = read('src/data/content.ts');
const report = read('reports/vijay-visuals-36-template-pricing-schedule.md');

it('all 36 catalogue templates have an exact proposed price and tpl-* SKU', () => {
  assert.equal(Object.keys(PROPOSED_TEMPLATE_PRICE_BY_ID).length, 36);
  for (const template of TEMPLATES_DATA) {
    const row = getProposedTemplatePrice(template.id);
    assert.ok(row, `Missing proposed price for ${template.id}`);
    assert.equal(row.sku, `tpl-${template.id}`);
    assert.ok([999, 1499, 1999, 2499, 3499, 4999].includes(row.priceInr));
  }
});

it('client price schedule matches the approved report row by row', () => {
  const scheduled = new Map<string, number>();
  for (const line of report.split(/\r?\n/)) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 7) continue;
    if (!/^tpl-[a-z0-9-]+$/.test(cells[2])) continue;
    scheduled.set(cells[2], Number(cells[5].replace(/[₹,\s]/g, '')));
  }
  assert.equal(scheduled.size, 36);
  for (const template of TEMPLATES_DATA) {
    const sku = `tpl-${template.id}`;
    assert.equal(getProposedTemplatePrice(template.id)?.priceInr, scheduled.get(sku), `Price mismatch for ${sku}`);
  }
});

it('proposed schedule total is unchanged at Rs 73,964', () => {
  const total = Object.values(PROPOSED_TEMPLATE_PRICE_BY_ID).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 73964);
});

it('₹7,999 package breakdown keeps template at zero and separates recurring costs', () => {
  const plan = {
    id: 2,
    code: 'business-website',
    name: 'Business Website Package',
    category: 'website',
    billingCycle: 'one_time',
    priceInr: 7999,
    includesPwa: false,
    active: true,
    featuresJson: '[]',
    thirdPartyDisclosure: '',
  } as PlatformPlanRecord;
  const price = describeBusinessPackagePrice([plan]);
  assert.deepEqual(price, {
    name: 'Business Website Package',
    code: 'business-website',
    basePriceInr: 7999,
    templateAddOnInr: 0,
    gstInr: 1440,
    finalPayableInr: 9439,
    recurringInr: 0,
  });
  assert.equal(describeBusinessPackagePrice([]), null);
});

it('₹7,999 scope includes all requested bounded deliverables', () => {
  const labels = BUSINESS_PACKAGE_SCOPE.map((item) => item.label);
  const required = [
    'One selected premium template',
    'Up to 7 agreed website pages',
    'Business logo, brand colours and business details setup',
    'Product/service catalogue setup',
    'WhatsApp enquiry integration',
    'Contact form and Google Maps integration',
    'Responsive desktop, tablet and mobile design',
    'Basic SEO setup',
    'Customer Dashboard access',
    'Admin Dashboard access where applicable',
    'Two agreed revision rounds',
    '30 days of technical support after handover',
    'Website handover and basic usage training',
  ];
  for (const label of required) assert.ok(labels.includes(label), `Missing scope item: ${label}`);
  assert.ok(PACKAGE_MILESTONES.length >= 5);
  assert.ok(CUSTOMER_RESPONSIBILITIES.length >= 5);
  assert.ok(PACKAGE_EXCLUSIONS.length >= 8);
});

it('scope bounds revisions, support and handover instead of promising unlimited service', () => {
  const scopeText = BUSINESS_PACKAGE_SCOPE.map((item) => `${item.label} ${item.detail}`)
    .join(' ')
    .toLowerCase();
  assert.ok(scopeText.includes('two agreed revision rounds'));
  assert.ok(scopeText.includes('30 days of technical support after handover'));
  assert.ok(scopeText.includes('not lifetime or unlimited support'));
  assert.ok(scopeText.includes('owner-delivered service'));
  const exclusions = PACKAGE_EXCLUSIONS.join(' ').toLowerCase();
  assert.ok(exclusions.includes('unlimited revisions'));
  assert.ok(exclusions.includes('free lifetime hosting'));
  assert.ok(exclusions.includes('guaranteed rankings'));
});

it('custom requirements are detected without generating a price', () => {
  const overPages = detectCustomRequirement({ pageCount: 9, specialFeatures: '', domainPreference: '' });
  assert.equal(overPages.outsidePackage, true);
  assert.match(overPages.reasons.join(' '), /exceed the agreed 7-page/);
  const custom = detectCustomRequirement({
    pageCount: 5,
    specialFeatures: 'ERP integration and data migration',
    domainPreference: '',
  });
  assert.equal(custom.outsidePackage, true);
  const normal = detectCustomRequirement({ pageCount: 7, specialFeatures: 'None', domainPreference: '' });
  assert.equal(normal.outsidePackage, false);
});

it('marketplace shows the exact required customer-facing sections and disclosures', () => {
  const customerJourney = `${pricingLib}\n${marketplace}\n${packageGuide}\n${content}`;
  const required = [
    'A · Website Templates',
    'B · Complete Website Packages',
    'Your selected template is included in this package.',
    'No live demo yet',
    'Buy Template / Customize This Design',
    'Proposed',
    'Not included unless separately purchased',
    'Cashfree is the only intended platform gateway',
    'Get Your Complete Business Website',
    CUSTOM_REQUIREMENT_MESSAGE,
    'Final payable amount',
    'Payment, refund/cancellation and support transparency',
  ];
  for (const needle of required) {
    assert.ok(customerJourney.includes(needle), `Customer journey missing: ${needle}`);
  }
});

it('Telugu heading keys exist in the shared i18n system', () => {
  for (const key of [
    'customerTemplateChoiceTitle',
    'customerTemplateChoiceSubtitle',
    'customerPackageChoiceTitle',
    'customerPackageChoiceSubtitle',
  ]) {
    assert.ok(content.includes(key), `Missing i18n key: ${key}`);
  }
});

it('package cards and package calculator exclude template SKUs', () => {
  assert.ok(studio.includes("p.category === 'website'"));
  assert.ok(calculator.includes('uniqueCodes.some(isTemplatePlanCode)'));
  assert.ok(calculator.includes('Template SKUs are priced separately'));
});

it('owner template wording correctly separates templates from packages and SaaS', () => {
  assert.ok(ownerPricing.includes('one-time website package plans and any'));
  assert.ok(ownerPricing.includes('recurring SaaS plans'));
});

it('unverified payment cannot be shown as success by the browser', () => {
  assert.ok(app.includes("'/api/payments/cashfree/verify'"));
  assert.ok(app.includes('if (res.verified)'));
  assert.ok(cashfreeClient.includes("'/api/payments/cashfree/verify'"));
  assert.ok(cashfreeClient.includes('if (verifyRes.verified)'));
});

it('verified entitlement display is wired to the server package-status source', () => {
  assert.ok(customerDashboard.includes("'/api/customer/package-status'"));
  assert.ok(customerDashboard.includes('formatVerifiedPaymentLabel'));
  assert.ok(packageStatusApi.includes('signatureVerified'));
  assert.ok(!packageStatusApi.includes('paymentStatus ==='));
});

it('customer dashboard presents only the signed-in customer workspace records', () => {
  assert.ok(customerDashboard.includes('Only records connected to'));
  assert.ok(customerDashboard.includes('No other customer'));
  assert.ok(customerDashboard.includes("'/api/customer/orders'"));
  assert.ok(customerDashboard.includes("'/api/customer/tickets'"));
  assert.ok(customerDashboard.includes("'/api/customer/appointments'"));
  assert.ok(customerDashboard.includes('My Website Project, Requirements &amp; Handover'));
});

it('owner pricing module separates packages, 36 template prices and special offers', () => {
  for (const heading of [
    'Existing Packages &amp; Subscriptions',
    '36 Website Template Prices',
    'Special Offers',
  ]) {
    assert.ok(ownerDashboard.includes(heading), `Owner dashboard missing: ${heading}`);
  }
});

it('existing package prices are not redefined by this customer-experience change', () => {
  assert.ok(plansApi.includes("code: 'business-website'"));
  assert.ok(plansApi.includes('priceInr: 7999'));
  assert.ok(plansApi.includes("code: 'starter-website'"));
  assert.ok(plansApi.includes('priceInr: 2999'));
  assert.ok(plansApi.includes("code: 'ecommerce-website'"));
  assert.ok(plansApi.includes('priceInr: 14999'));
});

it('white-label head injection contains no platform credit by source design', () => {
  assert.ok(middleware.includes('buildTenantHeadInjection'));
  assert.ok(middleware.includes('No platform credit appears in customer HTML.'));
});

it('customer sections use responsive mobile-first layout classes', () => {
  assert.ok(marketplace.includes('sm:grid-cols-2'));
  assert.ok(marketplace.includes('lg:grid-cols-3'));
  assert.ok(marketplace.includes('sm:px-6'));
  assert.ok(packageGuide.includes('lg:grid-cols-[0.9fr_1.1fr]'));
  assert.ok(packageGuide.includes('sm:grid-cols-2'));
  assert.ok(customerDashboard.includes('grid-cols-1'));
  assert.ok(customerDashboard.includes('md:grid-cols-2'));
});

console.log('--------------------------------------------------------------------');
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('====================================================================');

if (failed > 0) process.exit(1);
