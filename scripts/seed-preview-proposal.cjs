const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = 'demo_royal_preview_2026';
const proposalNo = 'VV-2026-RFK882';

const features = [
  { id: 'feat-1', name: 'Premium Website Design', individualValueInr: 2000, whatItDoes: 'Custom responsive design, branded visual identity, mobile-first layouts, and typography.', customerBenefit: 'Establishes a luxury, trustworthy brand image that converts visitors into customers.', packageStatus: 'included' },
  { id: 'feat-2', name: 'Mobile Responsive Design', individualValueInr: 800, whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops.', customerBenefit: 'Fast, seamless experience for 85%+ customers browsing on mobile devices.', packageStatus: 'included' },
  { id: 'feat-3', name: 'Product Catalog and Categories', individualValueInr: 1000, whatItDoes: 'Organized product/service showcase with prices, variants, photos, and descriptions.', customerBenefit: 'Customers can quickly browse items and understand offerings and pricing.', packageStatus: 'included' },
  { id: 'feat-4', name: 'Shopping Cart and Checkout', individualValueInr: 1000, whatItDoes: 'Real-time item additions, instant quantity updates, promo coupons, and address capture.', customerBenefit: 'Frictionless purchasing process minimizing abandoned carts and maximizing revenue.', packageStatus: 'included' },
  { id: 'feat-5', name: 'Cashfree Payment Integration', individualValueInr: 1000, whatItDoes: 'Full payment processing with UPI (Google Pay, PhonePe, Paytm), dynamic QR codes, cards, and net banking.', customerBenefit: 'Zero setup friction for customer payments; direct settlements into business bank account.', packageStatus: 'included' },
  { id: 'feat-6', name: 'Direct WhatsApp Ordering', individualValueInr: 700, whatItDoes: 'One-click WhatsApp order generation with complete itemized cart summaries.', customerBenefit: 'Direct personal communication with high-intent buyers leading to repeat customer loyalty.', packageStatus: 'included' },
  { id: 'feat-7', name: 'Fast Cloudflare Hosting and SSL', individualValueInr: 700, whatItDoes: 'Edge-distributed fast SSD hosting with free automatic HTTPS/SSL encryption.', customerBenefit: 'Under 1-second load times worldwide with zero server crashes during peak traffic.', packageStatus: 'included' },
  { id: 'feat-8', name: 'Search Engine Optimization (SEO)', individualValueInr: 500, whatItDoes: 'Search-friendly meta tags, sitemap.xml, robots.txt, and local area/city targeting.', customerBenefit: 'Helps local customers discover the business on Google searches without paid ads.', packageStatus: 'included' },
  { id: 'feat-9', name: 'Contact and Location Setup', individualValueInr: 299, whatItDoes: 'Interactive Google Map directions, business hours, phone dialers, and address display.', customerBenefit: 'Walk-in customers find the physical shop easily and build immediate trust.', packageStatus: 'included' },
];

const products = [
  { name: 'Hyderabadi Special Dum Biryani', price: 349, category: 'Biryani and Rice', description: 'Slow-cooked aromatic basmati rice layered with tender meat, saffron, and authentic secret spices.' },
  { name: 'Nawabi Paneer Tikka Masala', price: 299, category: 'Curries', description: 'Charcoal-grilled cottage cheese cubes simmered in rich tomato cashew gravy with fenugreek.' },
  { name: 'Zafrani Kesar Phirni', price: 149, category: 'Desserts', description: 'Traditional creamy ground rice pudding infused with saffron, cardamom, and toasted pistachios.' },
  { name: 'Kashmiri Mutton Rogan Josh', price: 429, category: 'Signature Curries', description: 'Tender lamb chunks braised in a gravy flavored with aromatic Kashmiri spices and rattan jot.' },
];

const businessPhotos = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
];

const packagesComparison = {
  starter: { priceInr: 7999, name: 'STARTER', deliveryDays: '3–5 Days', support: '30 Days Free WhatsApp and Email' },
  gold: { priceInr: 14999, name: 'GOLD', deliveryDays: '5–7 Days', support: '90 Days Priority Support and Analytics' },
  premium: { priceInr: 24999, name: 'PREMIUM', deliveryDays: '7–10 Days', support: '1 Year VIP Support and Mobile PWA' },
};

const sql = `
DELETE FROM platform_proposals WHERE secure_token = '${token}';
INSERT INTO platform_proposals (
  proposal_number, secure_token, business_name, business_category, package_code, package_name,
  customer_name, customer_email, customer_phone, business_address, city, state, pincode,
  opening_hours, development_fee_inr, maintenance_monthly_inr, domain_hosting_yearly_inr,
  subtotal_inr, gst_percent, gst_inr, grand_total_inr, status, package_tier,
  feature_breakdown_json, products_json, business_photos_json, packages_comparison_json,
  delivery_status, view_count, expires_at, created_at, updated_at
) VALUES (
  '${proposalNo}',
  '${token}',
  'Royal Feast Gourmet Kitchen',
  'restaurant',
  'starter',
  'Starter Business Website Package',
  'Vikram Malhotra',
  'owner@royalfeast.in',
  '+91 98765 43210',
  'Plot 42, Hitech City Main Road, Madhapur',
  'Hyderabad',
  'Telangana',
  '500081',
  'Mon - Sun: 11:00 AM – 11:30 PM',
  7999,
  0,
  0,
  7999,
  18,
  1440,
  9439,
  'sent',
  'STARTER',
  '${JSON.stringify(features).replace(/'/g, "''")}',
  '${JSON.stringify(products).replace(/'/g, "''")}',
  '${JSON.stringify(businessPhotos).replace(/'/g, "''")}',
  '${JSON.stringify(packagesComparison).replace(/'/g, "''")}',
  'delivered',
  0,
  datetime('now', '+30 days'),
  datetime('now'),
  datetime('now')
);
`;

const sqlFilePath = path.join(__dirname, 'seed.sql');
fs.writeFileSync(sqlFilePath, sql, 'utf-8');

console.log('Seeding demo proposal into Preview D1 from file...');
try {
  const res = execSync(
    `& "C:\\Program Files\\nodejs\\npx.cmd" wrangler d1 execute vijay-visuals-preview --remote --file="${sqlFilePath}"`,
    { shell: 'powershell.exe', encoding: 'utf-8' }
  );
  console.log(res);
  console.log('PASS: Demo proposal seeded successfully!');
  fs.unlinkSync(sqlFilePath);
} catch (err) {
  console.error('Error seeding proposal:', err.message);
  process.exit(1);
}
