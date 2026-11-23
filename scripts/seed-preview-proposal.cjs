const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const token = 'demo_royal_preview_2026';
const proposalNo = 'VV-2026-RFK882';

const features = [
  { id: 'feat-1', name: 'Premium Website Design', individualValueInr: 2000, whatItDoes: 'Custom responsive design, bespoke branded visual identity, mobile-first layouts, and luxury typography.', customerBenefit: 'Establishes a distinguished, trustworthy digital storefront that converts visitors into customers.', packageStatus: 'included' },
  { id: 'feat-2', name: 'Mobile Responsive Architecture', individualValueInr: 800, whatItDoes: 'Fluid adaptation across smartphones, tablets, and desktops.', customerBenefit: 'Fluid, accessible browsing experience tailored for all modern mobile and desktop screens.', packageStatus: 'included' },
  { id: 'feat-3', name: 'Product Catalog & Categories', individualValueInr: 1000, whatItDoes: 'Organized product and menu showcase with prices, variants, photos, and descriptions.', customerBenefit: 'Customers can quickly browse items and understand offerings and pricing with zero confusion.', packageStatus: 'included' },
  { id: 'feat-4', name: 'Shopping Cart & Frictionless Checkout', individualValueInr: 1000, whatItDoes: 'Real-time cart additions, instant quantity updates, promo coupons, and customer details capture.', customerBenefit: 'Frictionless purchasing process minimizing abandoned carts and maximizing order completions.', packageStatus: 'included' },
  { id: 'feat-5', name: 'Cashfree Payment Gateway Integration', individualValueInr: 1000, whatItDoes: 'Full payment processing with UPI (Google Pay, PhonePe, Paytm), dynamic QR codes, cards, and net banking.', customerBenefit: 'Secure, reliable payments with direct bank settlements and real-time server-side verification.', packageStatus: 'included' },
  { id: 'feat-6', name: 'Business Owner Dashboard (Self-Editing Portal)', individualValueInr: 1000, whatItDoes: 'Dedicated private management portal to update menu/products, edit prices, upload photos, and view orders.', customerBenefit: 'Complete operational independence — update your business anytime with zero ongoing developer costs.', packageStatus: 'included' },
  { id: 'feat-7', name: 'WhatsApp Business Integration', individualValueInr: 400, whatItDoes: 'Direct click-to-chat WhatsApp inquiry buttons and instant order alert notifications.', customerBenefit: 'Direct personal communication with high-intent buyers leading to repeat customer loyalty.', packageStatus: 'included' },
  { id: 'feat-8', name: 'Ethical Local SEO & Search Readiness', individualValueInr: 500, whatItDoes: 'Search-friendly meta tags, sitemap.xml, robots.txt, and local area/city targeting.', customerBenefit: 'Helps local customers discover the business on Google searches with ethical technical hygiene.', packageStatus: 'included' },
  { id: 'feat-9', name: 'Interactive Contact, Map & Business Hours', individualValueInr: 299, whatItDoes: 'Interactive Google Map directions, business hours, click-to-call dialers, and address display.', customerBenefit: 'Walk-in customers find the physical location easily and build immediate operational trust.', packageStatus: 'included' },
];

const products = [
  { name: 'Hyderabadi Special Dum Biryani [Demo]', price: 349, category: 'Biryani and Rice', description: 'Illustrative Demo Data: Slow-cooked aromatic basmati rice layered with tender meat, saffron, and authentic spices.' },
  { name: 'Nawabi Paneer Tikka Masala [Demo]', price: 299, category: 'Curries', description: 'Illustrative Demo Data: Charcoal-grilled cottage cheese cubes simmered in rich tomato cashew gravy with fenugreek.' },
  { name: 'Zafrani Kesar Phirni [Demo]', price: 149, category: 'Desserts', description: 'Illustrative Demo Data: Traditional creamy ground rice pudding infused with saffron, cardamom, and toasted pistachios.' },
  { name: 'Kashmiri Mutton Rogan Josh [Demo]', price: 429, category: 'Signature Curries', description: 'Illustrative Demo Data: Tender lamb chunks braised in a gravy flavored with aromatic Kashmiri spices and rattan jot.' },
];

const businessPhotos = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
];

const packagesComparison = {
  starter: { priceInr: 7999, name: 'STARTER', approved: true, deliveryDays: '3–5 Days', support: '30 Days Complimentary WhatsApp and Email' },
  gold: { priceInr: 14999, name: 'GOLD', approved: false, deliveryDays: '5–7 Days', support: '90 Days Priority Support and Analytics' },
  premium: { priceInr: 24999, name: 'PREMIUM', approved: false, deliveryDays: '7–10 Days', support: '1 Year VIP Support and Mobile PWA' },
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
  'client.royalfeast@gmail.com',
  '+91 9876543210',
  'Plot 42, Hitech City Main Road, Madhapur',
  'Hyderabad',
  'Telangana',
  '500081',
  'Mon - Sun: 11:00 AM – 11:30 PM',
  7999,
  0,
  0,
  7999,
  0,
  0,
  7999,
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
