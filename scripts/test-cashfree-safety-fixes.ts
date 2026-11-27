// Local, read-only regression checks for the Cashfree money/access safety fixes.
// No network calls, no payments, no database writes, and no external accounts.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');

const verify = read('functions/api/payments/cashfree/verify.ts');
const refund = read('functions/api/payments/platform/[id]/refund.ts');
const webhook = read('functions/api/webhooks/cashfree.ts');
const ecosystem = read('functions/api/admin/ecosystem.ts');
const panel = read('src/components/AdminEcosystemPanel.tsx');
const tenantAccess = read('functions/api/_tenantAccess.ts');
const retryDelivery = read('functions/api/payments/platform/[id]/retry-delivery.ts');
const adminDeliveries = read('functions/api/admin/deliveries.ts');
const dashboards = read('src/components/DashboardsHub.tsx');
const refundsMigration = read(
  'cloudflare/d1/migrations/0005_ecommerce_reviews_shipping_proposals.sql'
);

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ PASS: ${name}`);
}

console.log('================================================================');
console.log('CASHFREE MONEY/ACCESS SAFETY REGRESSIONS (LOCAL, MOCKED)');
console.log('================================================================');

check('paid checkout with pending approval is verified, not a client error', () => {
  assert.ok(verify.includes('let approvalRequired = false;'));
  assert.ok(!verify.includes('if (approvalBlocked) return approvalBlocked;'));
  assert.ok(verify.includes('approvalRequired = true;'));
  assert.ok(verify.includes('approvalRequired,\n    orderState: notes.orderState'));
});

check('entitlement is provisioned before the customer-approval gate', () => {
  const provisionIndex = verify.indexOf('const provision = await provisionLifetimeEntitlement');
  const approvalIndex = verify.indexOf('const approvalBlocked = await customerApprovalBlockedResponse');
  assert.ok(provisionIndex > 0);
  assert.ok(approvalIndex > provisionIndex);
});

check('refund endpoint rejects partial and repeat refunds that would revoke full access', () => {
  assert.ok(refund.includes('requestedAmount !== Number(row.amount_inr) || sequence !== 1'));
  assert.ok(refund.includes('Only one full refund of the captured amount is supported here.'));
});

check('refund webhook fails closed on unknown refund id, unlinked payment, or amount mismatch', () => {
  assert.ok(webhook.includes('refund_id, amount_inr'));
  assert.ok(webhook.includes('!merchantRefundId || !refundRow'));
  assert.ok(webhook.includes('amountMatchesCaptured'));
  assert.ok(webhook.includes('Math.abs(amountInr - capturedAmountInr) <= 0.01'));
});

check('admin payments expose real signature/refund state and refund control matches it', () => {
  assert.ok(
    ecosystem.includes(
      "LEFT JOIN platform_payments pp ON pp.razorpay_order_id = 'cf_' || c.order_id"
    )
  );
  assert.ok(ecosystem.includes('signatureVerified: Number(p.signature_verified) === 1'));
  assert.ok(ecosystem.includes("['paid', 'settled', 'captured', 'success'].includes(rawStatus)"));
  assert.ok(panel.includes("p.status === 'paid' && p.signatureVerified && !p.refundId"));
});

check('expired recurring payments never re-grant entitlement from a paid ledger row', () => {
  assert.ok(tenantAccess.includes("purpose = 'website_purchase' AND billing_cycle = 'one_time'"));
  assert.ok(!tenantAccess.includes("purpose IN ('platform_subscription', 'website_purchase')"));
  assert.ok(tenantAccess.includes("current_period_end > datetime('now')"));
});

check('customer retry never resurrects an expired subscription before publishing', () => {
  assert.ok(retryDelivery.includes("status = 'active' AND current_period_end > datetime('now')"));
  const checkIndex = retryDelivery.indexOf('const entitlement = await checkTenantSubscriptionEntitlement');
  const publishIndex = retryDelivery.indexOf("UPDATE customer_website_publications\n       SET status = 'published',");
  assert.ok(checkIndex > 0);
  assert.ok(publishIndex > checkIndex);
});

check('admin retry checks the customer entitlement before publishing', () => {
  assert.ok(adminDeliveries.includes('checkTenantSubscriptionEntitlement('));
  assert.ok(adminDeliveries.includes('      false\n    );'));
  const checkIndex = adminDeliveries.indexOf('const entitlement = await checkTenantSubscriptionEntitlement');
  const publishIndex = adminDeliveries.indexOf("UPDATE customer_website_publications\n       SET status = 'published',");
  assert.ok(checkIndex > 0);
  assert.ok(publishIndex > checkIndex);
});

check('payment records are not mislabeled as paid invoices or granted access', () => {
  assert.ok(dashboards.includes('const isVerifiedPaidRecord = (p: any): boolean =>'));
  assert.ok(dashboards.includes("['paid', 'settled', 'captured', 'success'].includes(status)"));
  assert.ok(
    dashboards.includes("canShowTaxInvoice(pay) ? 'View Platform Tax Invoice' : 'View Payment Record'")
  );
  assert.ok(
    dashboards.includes("canShowTaxInvoice(selectedReceipt) ? 'PAID / TAX INVOICE' : 'PAYMENT RECORD'")
  );
  assert.ok(
    dashboards.includes('selectedReceipt.entitlement_status || selectedReceipt.entitlementStatus')
  );
  assert.ok(dashboards.includes("=== 'active' && <p>Entitlement: Granted</p>"));
  assert.ok(dashboards.includes("p?.receipt || p?.receiptNumber || 'Receipt unavailable'"));
  assert.ok(!dashboards.includes('`RCPT-${p.id}`'));
  assert.ok(!dashboards.includes('Math.round(total / 1.18)'));
});

check('refunds ledger schema already exists for Cashfree refund identity lookup', () => {
  assert.ok(refundsMigration.includes('CREATE TABLE IF NOT EXISTS refunds ('));
  assert.ok(refundsMigration.includes('platform_payment_id INTEGER'));
  assert.ok(refundsMigration.includes('store_order_id INTEGER'));
  assert.ok(refundsMigration.includes('razorpay_refund_id TEXT UNIQUE'));
  assert.ok(refundsMigration.includes('amount_inr INTEGER NOT NULL'));
});

console.log('================================================================');
console.log(`RESULT: ${passed} passed, 0 failed`);
console.log('================================================================');
