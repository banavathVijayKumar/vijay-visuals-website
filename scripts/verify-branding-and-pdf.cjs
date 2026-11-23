// ============================================================================
// VIJAY VISUALS — OFFICIAL OWNER BRANDING & 9-PAGE PROPOSAL AUDIT SCRIPT
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('====================================================================');
console.log('VIJAY VISUALS — BRANDING & 9-PAGE PROPOSAL AUDIT SUITE');
console.log('====================================================================\n');

// 1. Verify Official Logo File
const logoPath = 'D:/VIJAY_VISUALS_PROJECTS/vvv/public/logo.png';
if (!fs.existsSync(logoPath)) {
  console.error('FAIL: Official logo asset does not exist at ' + logoPath);
  process.exit(1);
}

const logoBytes = fs.readFileSync(logoPath);
const logoHash = crypto.createHash('sha256').update(logoBytes).digest('hex').toUpperCase();
console.log(`[PASS] Official Logo Asset Verified:`);
console.log(`- Path: ${logoPath}`);
console.log(`- Size: ${logoBytes.length} bytes`);
console.log(`- SHA256: ${logoHash}\n`);

// 2. Read proposalPdfGenerator.ts code
const pdfSource = fs.readFileSync('D:/VIJAY_VISUALS_PROJECTS/vvv/src/lib/proposalPdfGenerator.ts', 'utf-8');

// Check that proposalPdfGenerator imports official logo
if (!pdfSource.includes('OFFICIAL_VV_LOGO_BASE64')) {
  console.error('FAIL: proposalPdfGenerator.ts does not use OFFICIAL_VV_LOGO_BASE64');
  process.exit(1);
}
console.log('[PASS] proposalPdfGenerator.ts imports official logo.');

// Check that 9999999999 is not present in proposalPdfGenerator
if (pdfSource.includes('9999999999')) {
  console.error('FAIL: proposalPdfGenerator.ts still contains 9999999999');
  process.exit(1);
}
console.log('[PASS] proposalPdfGenerator.ts free of 9999999999 placeholder.');

// Check that unsupported guarantees are absent from proposal code
const guaranteePatterns = [
  /under[\s-]1[\s-]second/i,
  /sub-second\s+page\s+loads/i,
  /zero\s+server\s+crashes/i,
  /zero\s+payment\s+drop-offs/i,
  /Quality\s+Guaranteed/i,
];

for (const pattern of guaranteePatterns) {
  if (pattern.test(pdfSource)) {
    console.error(`FAIL: proposalPdfGenerator.ts still contains unsupported guarantee matching ${pattern}`);
    process.exit(1);
  }
}
console.log('[PASS] proposalPdfGenerator.ts free of unsupported performance and results guarantees.');

// Check that info@vijayvisuals.com is not present in proposalPdfGenerator
if (pdfSource.includes('info@vijayvisuals.com')) {
  console.error('FAIL: proposalPdfGenerator.ts still contains info@vijayvisuals.com');
  process.exit(1);
}
console.log('[PASS] proposalPdfGenerator.ts free of info@vijayvisuals.com placeholder.');

// Check all 9 pages exist in proposalPdfGenerator.ts
for (let i = 1; i <= 9; i++) {
  const pageStr = `Page ${i} of 9`;
  if (!pdfSource.includes(pageStr)) {
    console.error(`FAIL: proposalPdfGenerator.ts missing "${pageStr}"`);
    process.exit(1);
  }
}
console.log('[PASS] All 9 pages present and verified in proposalPdfGenerator.ts.');

// Check that official mobile +91 9381362201 and email vk66278@gmail.com are embedded
if (!pdfSource.includes('+91 9381362201') || !pdfSource.includes('vk66278@gmail.com')) {
  console.error('FAIL: Official contact details missing from proposalPdfGenerator.ts');
  process.exit(1);
}
console.log('[PASS] Official mobile (+91 9381362201) and email (vk66278@gmail.com) verified in PDF generator.');

// Check clickable tel: and mailto: links in proposalPdfGenerator.ts
if (!pdfSource.includes('href="tel:+919381362201"') || !pdfSource.includes('href="mailto:vk66278@gmail.com"')) {
  console.error('FAIL: Clickable tel: and mailto: links missing from proposalPdfGenerator.ts');
  process.exit(1);
}
console.log('[PASS] Clickable tel:+919381362201 and mailto:vk66278@gmail.com verified.');

// 3. Check entire src and functions directory for remaining placeholders
const searchDirs = ['D:/VIJAY_VISUALS_PROJECTS/vvv/src', 'D:/VIJAY_VISUALS_PROJECTS/vvv/functions'];
let placeholderFound = false;

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes('info@vijayvisuals.com')) {
        console.error(`[FLAG] Found info@vijayvisuals.com in ${full}`);
        placeholderFound = true;
      }
      if (content.includes('+91 9999999999') || content.includes('9999999999')) {
        console.error(`[FLAG] Found 9999999999 in ${full}`);
        placeholderFound = true;
      }
    }
  }
}

for (const d of searchDirs) {
  scanDir(d);
}

if (placeholderFound) {
  console.error('FAIL: Placeholders found in codebase.');
  process.exit(1);
}
console.log('[PASS] Zero placeholders found across all src and functions code.');

// 4. Generate Sample 9-Page HTML Proposal for user review
const logoBase64 = 'data:image/jpeg;base64,' + logoBytes.toString('base64');
let sampleHtml = pdfSource;

// Replace TypeScript constructs and render a standalone HTML sample
const startIndex = sampleHtml.indexOf('<!DOCTYPE html>');
const endIndex = sampleHtml.lastIndexOf('</html>') + '</html>'.length;
if (startIndex !== -1 && endIndex !== -1) {
  let rawHtml = sampleHtml.substring(startIndex, endIndex);
  rawHtml = rawHtml
    .replace(/\$\{OFFICIAL_VV_LOGO_BASE64\}/g, logoBase64)
    .replace(/\$\{p\.proposal_number\}/g, 'VV-2026-RFK882')
    .replace(/\$\{p\.business_name\}/g, 'Royal Feast Gourmet Kitchen')
    .replace(/\$\{categoryName\}/g, 'Restaurant & Gourmet Dining')
    .replace(/\$\{tier\}/g, 'STARTER')
    .replace(/\$\{totalAmount\.toLocaleString\('en-IN'\)\}/g, '7,999')
    .replace(/\$\{p\.customer_name\}/g, 'Vikram Malhotra')
    .replace(/\$\{p\.customer_phone \|\| '\+91 9381362201'\}/g, '+91 9381362201')
    .replace(/\$\{p\.city \|\| 'Hyderabad'\}/g, 'Hyderabad')
    .replace(/\$\{p\.state \|\| 'Telangana'\}/g, 'Telangana')
    .replace(/\$\{p\.pincode \|\| '500081'\}/g, '500081')
    .replace(/\$\{dateFormatted\}/g, 'November 24, 2026')
    .replace(/\$\{p\.business_address \|\| 'Plot 42, Hitech City Main Road, Madhapur' \}/g, 'Plot 42, Hitech City Main Road, Madhapur')
    .replace(/\$\{p\.opening_hours \|\| 'Monday – Saturday: 10:00 AM – 9:00 PM'\}/g, 'Mon - Sun: 11:00 AM – 11:30 PM')
    .replace(/\$\{devFee\.toLocaleString\('en-IN'\)\}/g, '7,999')
    .replace(/\$\{maintFee\.toLocaleString\('en-IN'\)\}/g, '0')
    .replace(/\$\{domainHostingFee\.toLocaleString\('en-IN'\)\}/g, '0')
    .replace(/\$\{subtotal\.toLocaleString\('en-IN'\)\}/g, '7,999')
    .replace(/\$\{hasConfirmedGst\s*\?\s*`\+₹\$\{gstAmount\.toLocaleString\('en-IN'\)\}\s*\(\$\{p\.gst_percent\}%\s*GST\)`\s*:\s*'GST:\s*Excluded\s*\/\s*As\s*Applicable'\}/g, 'GST: Excluded / As Applicable')
    .replace(/\$\{hasConfirmedGst\s*\?\s*`\(One-Time\s*·\s*\$\{p\.gst_percent\}%\s*GST\s*Included\)`\s*:\s*'\(One-Time\s*Base\s*Price\s*·\s*Exclusive\s*of\s*GST\s*\/\s*As\s*Applicable\)'\}/g, '(One-Time Base Price · Exclusive of GST / As Applicable)')
    .replace(/\$\{hasConfirmedGst\s*\?\s*'All-Inclusive'\s*:\s*'\(Base Price\)'\}/g, '(Base Price)');

  // Replace features loop with rendered table rows
  const featuresRows = `
    <tr><td><strong>1. Premium Website Design</strong></td><td>Custom responsive design, branded visual identity, mobile-first layouts, and typography.</td><td class="col-price">₹2,000</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>2. Mobile Responsive Architecture</strong></td><td>Fluid adaptation across smartphones, tablets, and desktops.</td><td class="col-price">₹800</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>3. Product Catalog & Categories</strong></td><td>Organized product/service showcase with prices, variants, photos, and descriptions.</td><td class="col-price">₹1,000</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>4. Shopping Cart & Frictionless Checkout</strong></td><td>Real-time item additions, instant quantity updates, promo coupons, and address capture.</td><td class="col-price">₹1,000</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>5. Cashfree Payment Gateway Integration</strong></td><td>Full payment processing with UPI (Google Pay, PhonePe, Paytm), dynamic QR codes, cards, and net banking.</td><td class="col-price">₹1,000</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>6. Business Owner Dashboard (Self-Editing)</strong></td><td>Dedicated private management portal to update items, change prices, and track orders with zero developer fees.</td><td class="col-price">₹1,000</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>7. WhatsApp Business Integration</strong></td><td>One-click direct WhatsApp chat inquiry buttons and order alerts.</td><td class="col-price">₹400</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>8. Ethical Local SEO & Search Readiness</strong></td><td>Search-friendly meta tags, sitemap.xml, robots.txt, and local area/city targeting.</td><td class="col-price">₹500</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
    <tr><td><strong>9. Interactive Contact, Map & Business Hours</strong></td><td>Interactive Google Map directions, opening hours, click-to-call dialers, and address display.</td><td class="col-price">₹299</td><td style="color: #10B981; font-weight: 700; text-align: center;">INCLUDED</td></tr>
  `;
  rawHtml = rawHtml.replace(/\$\{features\.map\(\(f, idx\) =>[\s\S]*?join\(''\)\}/, featuresRows);

  const outDist = 'D:/VIJAY_VISUALS_PROJECTS/vvv/dist/sample_9_page_proposal_official.html';
  const outArtifact = 'C:/Users/vijay/.gemini/antigravity/brain/72261e4e-ed8e-4130-a6cb-9da8e7079dcf/sample_9_page_proposal_official.html';

  fs.writeFileSync(outDist, rawHtml, 'utf-8');
  fs.writeFileSync(outArtifact, rawHtml, 'utf-8');
  console.log(`[PASS] Sample 9-Page Proposal HTML generated:`);
  console.log(`- Project output: ${outDist}`);
  console.log(`- Artifact output: ${outArtifact}`);
}

console.log('\n====================================================================');
console.log('ALL BRANDING & PDF AUDIT CHECKS PASSED SUCCESSFULLY!');
console.log('====================================================================');
