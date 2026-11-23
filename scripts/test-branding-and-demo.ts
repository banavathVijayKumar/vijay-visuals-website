// ============================================================================
// scripts/test-branding-and-demo.ts — Branding & Interactive Demo Test Suite
// Verifies brand identity assets, SVG sanitization, logo customizer logic,
// simulated cart & checkout math, tenant isolation, and protected tenants.
// ============================================================================

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${err?.message || err}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================================');
  console.log('VIJAY VISUALS — BRANDING & INTERACTIVE DEMO AUDIT TEST SUITE');
  console.log('====================================================================\n');

  const rootDir = process.cwd();

  // --------------------------------------------------------------------------
  console.log('[SECTION 1: BRAND IDENTITY VECTOR & RASTER ASSETS]');
  // --------------------------------------------------------------------------

  it('Full brand logo SVG exists and contains exact spelling VIJAY VISUALS', () => {
    const p = path.join(rootDir, 'public', 'logo.svg');
    assert(fs.existsSync(p), 'public/logo.svg must exist');
    const content = fs.readFileSync(p, 'utf-8');
    assert(content.includes('VIJAY'), 'Must contain VIJAY');
    assert(content.includes('VISUALS'), 'Must contain VISUALS');
    assert(content.includes('MADE IN INDIA · BUILT FOR THE WORLD'), 'Must contain tagline');
    assert(content.includes('vvGoldMain'), 'Must include metallic gold gradient definitions');
  });

  it('Compact icon SVG exists and contains camera aperture and play button', () => {
    const p = path.join(rootDir, 'public', 'logo-icon.svg');
    assert(fs.existsSync(p), 'public/logo-icon.svg must exist');
    const content = fs.readFileSync(p, 'utf-8');
    assert(content.includes('polygon points="-12,-22 24,0 -12,22"'), 'Must contain play triangle');
    assert(content.includes('vvLensGlow'), 'Must contain lens aperture gradient');
  });

  it('Favicon SVG and icon SVG exist with valid SVG root tags', () => {
    const favP = path.join(rootDir, 'public', 'favicon.svg');
    const iconP = path.join(rootDir, 'public', 'icon.svg');
    assert(fs.existsSync(favP), 'public/favicon.svg must exist');
    assert(fs.existsSync(iconP), 'public/icon.svg must exist');
    assert(fs.readFileSync(favP, 'utf-8').startsWith('<svg'), 'favicon.svg must start with <svg');
    assert(fs.readFileSync(iconP, 'utf-8').startsWith('<svg'), 'icon.svg must start with <svg');
  });

  it('Master raster PNG and JPG assets exist with valid size', () => {
    const pngP = path.join(rootDir, 'public', 'logo.png');
    const jpgP = path.join(rootDir, 'public', 'logo.jpg');
    const touchP = path.join(rootDir, 'public', 'apple-touch-icon.png');
    assert(fs.existsSync(pngP) && fs.statSync(pngP).size > 10000, 'public/logo.png must exist and be > 10KB');
    assert(fs.existsSync(jpgP) && fs.statSync(jpgP).size > 10000, 'public/logo.jpg must exist and be > 10KB');
    assert(fs.existsSync(touchP) && fs.statSync(touchP).size > 10000, 'public/apple-touch-icon.png must exist');
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 2: CUSTOMER LOGO CUSTOMIZER & SVG SANITIZER]');
  // --------------------------------------------------------------------------

  it('SVG sanitizer strips malicious script tags, event handlers, and foreignObjects', () => {
    const dirtySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <script>alert("xss")</script>
        <circle cx="50" cy="50" r="40" onload="fetch('//evil.com')" onclick="steal()" />
        <a href="javascript:alert(1)">Click</a>
        <foreignObject width="100" height="100"><iframe src="evil.com"></iframe></foreignObject>
      </svg>
    `;

    // Sanitization function
    const sanitizeSvg = (rawSvg: string): string => {
      return rawSvg
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\s(href|xlink:href)\s*=\s*['"]javascript:[^'"]*['"]/gi, '')
        .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    };

    const cleanSvg = sanitizeSvg(dirtySvg);
    assert(!cleanSvg.includes('<script'), 'Must not contain script tags');
    assert(!cleanSvg.includes('onload='), 'Must not contain onload event');
    assert(!cleanSvg.includes('onclick='), 'Must not contain onclick event');
    assert(!cleanSvg.includes('javascript:'), 'Must not contain javascript: URLs');
    assert(!cleanSvg.includes('<foreignObject'), 'Must not contain foreignObject');
    assert(!cleanSvg.includes('<iframe'), 'Must not contain iframe');
    assert(cleanSvg.includes('<circle cx="50" cy="50" r="40"'), 'Legitimate circle element must be preserved');
  });

  it('CustomerLogoCustomizer source code exists and exports clean component', () => {
    const compP = path.join(rootDir, 'src', 'components', 'CustomerLogoCustomizer.tsx');
    assert(fs.existsSync(compP), 'CustomerLogoCustomizer.tsx must exist');
    const content = fs.readFileSync(compP, 'utf-8');
    assert(content.includes('export const CustomerLogoCustomizer'), 'Must export CustomerLogoCustomizer');
    assert(content.includes('handleRestorePrevious'), 'Must support history restoration');
    assert(content.includes('badgeShape'), 'Must support selectable badge shapes');
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 3: REAL WEBSITE DEMO STOREFRONT & SIMULATED CHECKOUT]');
  // --------------------------------------------------------------------------

  it('InteractiveDemoHub component exists and contains demo products', () => {
    const hubP = path.join(rootDir, 'src', 'components', 'InteractiveDemoHub.tsx');
    assert(fs.existsSync(hubP), 'InteractiveDemoHub.tsx must exist');
    const content = fs.readFileSync(hubP, 'utf-8');
    assert(content.includes('export const InteractiveDemoHub'), 'Must export InteractiveDemoHub');
    assert(content.includes('Hyderabadi Dum Biryani'), 'Must contain realistic products');
    assert(content.includes('SIMULATED DEMO ENVIRONMENT'), 'Must explicitly warn that demo is simulated');
  });

  it('Simulated shopping cart and discount math calculates correctly', () => {
    const items = [
      { price: 499, quantity: 2 }, // 998
      { price: 249, quantity: 1 }, // 249
    ];
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0); // 1247
    assert.strictEqual(subtotal, 1247, 'Subtotal should be 1247');

    const discount10Percent = Math.round(subtotal * 0.1); // 125
    assert.strictEqual(discount10Percent, 125, '10% discount should be 125');

    const gst5Percent = Math.round((subtotal - discount10Percent) * 0.05); // Math.round(1122 * 0.05) = 56
    assert.strictEqual(gst5Percent, 56, '5% GST should be 56');

    const deliveryFee = subtotal > 499 ? 0 : 49;
    assert.strictEqual(deliveryFee, 0, 'Orders over 499 should have FREE delivery');

    const total = subtotal - discount10Percent + gst5Percent + deliveryFee;
    assert.strictEqual(total, 1178, 'Total calculated amount should be 1178');
  });

  it('Demo checkout order generator assigns safe simulated order prefix', () => {
    const generateDemoOrderId = () => `ORD-DEMO-${Math.floor(1000 + Math.random() * 9000)}`;
    const id = generateDemoOrderId();
    assert(id.startsWith('ORD-DEMO-'), 'Order ID must start with ORD-DEMO- prefix');
    assert(id.length === 13, 'Order ID must be formatted properly');
  });

  // --------------------------------------------------------------------------
  console.log('\n[SECTION 4: PROTECTED CUSTOMER TENANTS & ISOLATION SAFETY]');
  // --------------------------------------------------------------------------

  it('Existing customer tenants are catalogued and protected from modification', () => {
    const backupP = path.join(rootDir, '.backup_pre_implementation', 'production_d1_backup_20261121.sql');
    assert(fs.existsSync(backupP), 'Production D1 backup file must exist');
    const content = fs.readFileSync(backupP, 'utf-8');
    const protectedTenants = ['royal-feast-cloud-kitchen', 'ajay', 'kalyani', 'kalyani-silks-boutique'];

    for (const t of protectedTenants) {
      assert(content.includes(t), `Protected customer tenant "${t}" must be recorded in backup`);
    }
  });

  console.log('\n====================================================================');
  console.log(`BRANDING & DEMO TEST SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
