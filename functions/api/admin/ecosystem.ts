// ============================================================================
// GET /api/admin/ecosystem — Super Admin Platform Operations & Ecosystem Health
// Protected strictly by `requireAdmin` (zero hardcoded passwords/bypass).
// Returns Cashfree status, platform payment ledger, seller payout accounts,
// seller transfers/settlements, platform announcements, and webhook events.
// ============================================================================

import { requireAdmin } from '../_auth';
import { listSupabaseEmailVerification } from '../auth/_supabaseAdmin';
import { PagesContext, handleOptions, jsonResponse, sanitizeText } from '../_shared';
import { getEdgeCashfreeStatus } from '../payments/_cashfree';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

function safeNotes(raw: unknown): Record<string, any> {
  try {
    return JSON.parse(String(raw || '{}')) as Record<string, any>;
  } catch {
    return {};
  }
}

function cashfreeOrderId(raw: unknown): string {
  const value = String(raw || '');
  return value.startsWith('cf_') ? value.slice(3) : value;
}

function accessState(input: {
  entitlementStatus: string;
  refundId: string;
  subscriptionStatus: string;
  billingCycle: string;
  paidAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}): { entitlementStatus: string; accessStatus: string; accessStartDate: string | null; accessEndDate: string | null } {
  const entitlement = String(input.entitlementStatus || '').toLowerCase();
  const subscription = String(input.subscriptionStatus || '').toLowerCase();
  const refunded = Boolean(input.refundId);
  const lifetime = String(input.billingCycle || '').toLowerCase() === 'one_time';
  const expired =
    !lifetime &&
    Boolean(input.currentPeriodEnd) &&
    new Date(input.currentPeriodEnd).getTime() <= Date.now();
  const active = entitlement === 'active' || (entitlement !== 'revoked' && subscription === 'active' && !expired);
  return {
    entitlementStatus: refunded ? 'revoked' : active ? 'active' : 'inactive',
    accessStatus: refunded ? 'refunded' : expired ? 'expired' : active ? 'active' : 'inactive',
    accessStartDate: active && !refunded ? input.paidAt || input.currentPeriodStart || null : null,
    accessEndDate: active && !lifetime && input.currentPeriodEnd && !expired ? input.currentPeriodEnd : null,
  };
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;

  const cfStatus = getEdgeCashfreeStatus(env);

  const platformPayments: Array<Record<string, unknown>> = [];
  const sellerAccounts: Array<Record<string, unknown>> = [];
  const sellerTransfers: Array<Record<string, unknown>> = [];
  const announcements: Array<Record<string, unknown>> = [];
  const webhookEvents: Array<{ id: number; event?: string; createdAt?: string }> = [];
  const notificationLogs: Array<Record<string, unknown>> = [];
  const refundHistory: Array<Record<string, unknown>> = [];
  const deliveryHistory: Array<Record<string, unknown>> = [];

  if (env.DB) {
    const verification = await listSupabaseEmailVerification(env);

    // 1. Platform Payments (from cashfree_payments ledger with fallback to platform_payments)
    try {
      const cfPayRes = await env.DB.prepare(
        `SELECT c.id, c.order_id, c.cf_order_id, c.user_id, c.entity_type, c.base_amount_inr,
                c.gst_amount_inr, c.amount_inr, c.currency, c.environment, c.status,
                c.cf_payment_id, c.payment_method, c.payment_time, c.notes_json, c.created_at,
                pp.signature_verified, pp.refund_id, pp.receipt, pp.status AS payment_status,
                pp.website_id, pp.owner_id, pp.billing_cycle, pp.paid_at, pp.subscription_id,
                u.email AS buyer_email, u.full_name AS buyer_name, u.status AS account_status,
                ts.status AS subscription_status, ts.current_period_start, ts.current_period_end,
                pub.public_slug, pub.status AS website_status,
                (SELECT le.status
                 FROM platform_payment_entitlements pe
                 INNER JOIN tenant_lifetime_entitlements le ON le.id = pe.entitlement_id
                 WHERE pe.payment_id = pp.id LIMIT 1) AS entitlement_status
         FROM cashfree_payments c
         LEFT JOIN platform_payments pp ON pp.razorpay_order_id = 'cf_' || c.order_id
         LEFT JOIN vv_users u ON u.id = pp.owner_id OR u.id = c.user_id
         LEFT JOIN tenant_subscriptions ts ON ts.id = pp.subscription_id
         LEFT JOIN customer_website_publications pub ON pub.website_id = pp.website_id
         ORDER BY c.created_at DESC LIMIT 50`
      ).all<Record<string, any>>();

      for (const p of cfPayRes.results || []) {
        const notes = safeNotes(p.notes_json);
        const rawStatus = String(p.payment_status || p.status || 'CREATED').toLowerCase();
        const displayStatus =
          ['paid', 'settled', 'captured', 'success'].includes(rawStatus) ? 'paid' : rawStatus;
        const refundId = String(p.refund_id || notes.refundId || '');
        const access = accessState({
          entitlementStatus: String(p.entitlement_status || ''),
          refundId,
          subscriptionStatus: String(p.subscription_status || ''),
          billingCycle: String(p.billing_cycle || ''),
          paidAt: String(p.paid_at || ''),
          currentPeriodStart: String(p.current_period_start || ''),
          currentPeriodEnd: String(p.current_period_end || ''),
        });
        const email = String(p.buyer_email || '').trim().toLowerCase();
        const verified = verification.available
          ? verification.byId.get(String(p.owner_id || p.user_id || '')) ?? verification.byEmail.get(email) ?? false
          : null;
        const paymentPaid = displayStatus === 'paid' && Number(p.signature_verified) === 1;
        const deliveryStatus = refundId
          ? 'REFUNDED'
          : access.entitlementStatus === 'active' && p.website_status === 'published'
            ? 'DELIVERY_READY'
            : String(notes.deliveryStatus || '') === 'DELIVERY_FAILED'
              ? 'DELIVERY_FAILED'
              : paymentPaid
                ? 'PROVISIONING'
                : 'PAYMENT_PENDING';

        platformPayments.push({
          id: Number(p.id || 0),
          userId: p.user_id ? Number(p.user_id) || null : null,
          tenantId: p.website_id ? String(p.website_id) : null,
          planCode: String(p.plan_code || notes.planCode || p.entity_type || 'business-website'),
          planName: String(notes.planName || 'Business Website Package'),
          amountInr: Number(p.amount_inr || 0),
          currency: String(p.currency || 'INR'),
          mode: String(p.environment || 'sandbox'),
          cashfreeOrderId: cashfreeOrderId(p.order_id),
          cashfreePaymentId: String(p.cf_payment_id || p.cf_order_id || ''),
          status: displayStatus,
          createdAt: String(p.created_at || ''),
          signatureVerified: Number(p.signature_verified) === 1,
          receiptNumber: String(p.receipt || notes.receiptNumber || `VV-${p.id}`),
          refundId,
          refundStatus: refundId ? 'refunded' : null,
          licenseActivated: access.entitlementStatus === 'active',
          entitlementStatus: access.entitlementStatus,
          accessStatus: access.accessStatus,
          accessStartDate: access.accessStartDate,
          accessEndDate: access.accessEndDate,
          deliveryStatus,
          deliveredAt: deliveryStatus === 'DELIVERY_READY' ? String(p.paid_at || notes.deliveredAt || '') || null : null,
          accountStatus: String(p.account_status || 'active'),
          emailVerified: verified,
          verificationStatus: verification.available ? (verified ? 'verified' : 'pending') : 'unavailable',
          websiteSlug: String(p.public_slug || ''),
        });
      }
    } catch {
      // Fallback to legacy platform_payments table if present
      try {
        const legRes = await env.DB.prepare(
          `SELECT p.*, u.email AS buyer_email, u.status AS account_status,
                  ts.status AS subscription_status, ts.current_period_start, ts.current_period_end,
                  pub.public_slug, pub.status AS website_status,
                  (SELECT le.status
                   FROM platform_payment_entitlements pe
                   INNER JOIN tenant_lifetime_entitlements le ON le.id = pe.entitlement_id
                   WHERE pe.payment_id = p.id LIMIT 1) AS entitlement_status
           FROM platform_payments p
           LEFT JOIN vv_users u ON u.id = p.owner_id
           LEFT JOIN tenant_subscriptions ts ON ts.id = p.subscription_id
           LEFT JOIN customer_website_publications pub ON pub.website_id = p.website_id
           ORDER BY p.created_at DESC LIMIT 50`
        ).all<Record<string, any>>();
        for (const p of legRes.results || []) {
          const refundId = String(p.refund_id || '');
          const access = accessState({
            entitlementStatus: String(p.entitlement_status || ''),
            refundId,
            subscriptionStatus: String(p.subscription_status || ''),
            billingCycle: String(p.billing_cycle || ''),
            paidAt: String(p.paid_at || ''),
            currentPeriodStart: String(p.current_period_start || ''),
            currentPeriodEnd: String(p.current_period_end || ''),
          });
          const email = String(p.buyer_email || '').trim().toLowerCase();
          const verified = verification.available
            ? verification.byId.get(String(p.owner_id || '')) ?? verification.byEmail.get(email) ?? false
            : null;
          platformPayments.push({
            id: Number(p.id || 0),
            userId: p.user_id ? Number(p.user_id) : null,
            tenantId: p.website_id ? String(p.website_id) : null,
            planCode: String(p.plan_code || 'business-website'),
            planName: String(p.plan_name || 'Business Website Package'),
            amountInr: Number(p.amount_inr || 0),
            currency: String(p.currency || 'INR'),
            mode: String(p.mode || (p.razorpay_mode === 'live' ? 'production' : 'sandbox')),
            cashfreeOrderId: cashfreeOrderId(p.razorpay_order_id),
            cashfreePaymentId: String(p.razorpay_payment_id || ''),
            status: String(p.status || 'completed').toLowerCase() === 'completed'
              ? 'paid'
              : String(p.status || 'completed').toLowerCase(),
            createdAt: String(p.created_at || ''),
            signatureVerified: Number(p.signature_verified) === 1,
            receiptNumber: String(p.receipt || `VV-${p.id}`),
            refundId,
            refundStatus: refundId ? 'refunded' : null,
            licenseActivated: access.entitlementStatus === 'active',
            entitlementStatus: access.entitlementStatus,
            accessStatus: access.accessStatus,
            accessStartDate: access.accessStartDate,
            accessEndDate: access.accessEndDate,
            deliveryStatus: refundId
              ? 'REFUNDED'
              : access.entitlementStatus === 'active'
                ? 'DELIVERY_READY'
                : 'PAYMENT_PENDING',
            deliveredAt: access.accessStartDate,
            accountStatus: String(p.account_status || 'active'),
            emailVerified: verified,
            verificationStatus: verification.available ? (verified ? 'verified' : 'pending') : 'unavailable',
            websiteSlug: String(p.public_slug || ''),
          });
        }
      } catch {}
    }

    // 2. Seller Payout Accounts
    try {
      const saRes = await env.DB.prepare(
        `SELECT * FROM seller_payout_accounts ORDER BY updated_at DESC LIMIT 50`
      ).all<Record<string, any>>();

      for (const a of saRes.results || []) {
        sellerAccounts.push({
          id: Number(a.id || 0),
          tenantId: Number(a.tenant_id || 0),
          legalBusinessName: String(a.legal_business_name || a.account_holder_name || ''),
          panNumber: String(a.pan_number || ''),
          gstin: String(a.gstin || ''),
          bankAccountHolder: String(a.account_holder_name || ''),
          bankAccountLast4: String(a.bank_account_last4 || ''),
          ifscCode: String(a.bank_ifsc || ''),
          razorpayAccountId: String(a.linked_account_id || ''),
          kycStatus: String(a.kyc_status || 'not_submitted'),
          platformCommissionPct: Number(a.platform_commission_percent || 0),
          settlementHoldDays: 2,
          routeEnabled: Boolean(a.route_enabled),
          updatedAt: String(a.updated_at || a.created_at || ''),
        });
      }
    } catch {}

    // 3. Seller Settlements / Transfers
    try {
      const stRes = await env.DB.prepare(
        `SELECT * FROM cashfree_seller_settlements ORDER BY created_at DESC LIMIT 50`
      ).all<Record<string, any>>();

      for (const s of stRes.results || []) {
        sellerTransfers.push({
          id: Number(s.id || 0),
          tenantId: 0,
          orderId: Number(s.store_order_id || 0),
          razorpayOrderId: String(s.order_number || ''),
          razorpayPaymentId: String(s.cashfree_split_id || ''),
          razorpayTransferId: String(s.settlement_mode || 'cashfree_split'),
          grossAmountInr: Number(s.gross_amount_inr || 0),
          platformCommissionInr: Number(s.platform_fee_inr || 0),
          sellerNetAmountInr: Number(s.seller_payable_inr || 0),
          status: String(s.settlement_status || 'pending_activation'),
          reversalId: '',
          createdAt: String(s.created_at || ''),
        });
      }
    } catch {}

    // 4. Announcements
    try {
      const annRes = await env.DB.prepare(
        `SELECT * FROM platform_announcements ORDER BY created_at DESC LIMIT 20`
      ).all<Record<string, any>>();

      for (const an of annRes.results || []) {
        announcements.push({
          id: Number(an.id || 0),
          title: String(an.title || ''),
          message: String(an.message || ''),
          severity: String(an.severity || 'info'),
          active: Boolean(an.active ?? true),
          createdBy: String(an.created_by || 'Super Admin'),
          createdAt: String(an.created_at || ''),
        });
      }
    } catch {}

    // 5. Webhook Events from platform_audit_logs
    try {
      const whRes = await env.DB.prepare(
        `SELECT id, action, created_at FROM platform_audit_logs
         WHERE action LIKE 'cashfree_webhook%' OR target_type = 'cashfree_payments'
         ORDER BY created_at DESC LIMIT 50`
      ).all<{ id: number; action: string; created_at: string }>();

      for (const w of whRes.results || []) {
        webhookEvents.push({
          id: Number(w.id || 0),
          event: String(w.action || 'cashfree_webhook'),
          createdAt: String(w.created_at || ''),
        });
      }
    } catch {}

    // 6. Transactional Notifications (Email & WhatsApp visibility)
    try {
      const notifRes = await env.DB.prepare(
        `SELECT id, recipient_contact, channel, event_type, subject,
                delivery_status, provider_message_id, error_detail, created_at
         FROM notification_logs
         ORDER BY created_at DESC LIMIT 50`
      ).all<Record<string, any>>();

      for (const n of notifRes.results || []) {
        notificationLogs.push({
          id: Number(n.id || 0),
          recipient: String(n.recipient_contact || ''),
          channel: String(n.channel || 'in_app'),
          eventType: String(n.event_type || ''),
          subject: String(n.subject || ''),
          status: String(n.delivery_status || 'unknown'),
          providerMessageId: String(n.provider_message_id || ''),
          errorDetail: String(n.error_detail || ''),
          createdAt: String(n.created_at || ''),
          fallbackAvailable: n.channel === 'whatsapp',
        });
      }
    } catch {}

    // 7. Refunds and reversals (historical Razorpay-named columns store Cashfree IDs)
    try {
      const refundRes = await env.DB.prepare(
        `SELECT id, flow_type, website_id, platform_payment_id, store_order_id,
                razorpay_payment_id, razorpay_refund_id, amount_inr, reason, status,
                requested_by, processed_by, created_at, updated_at
         FROM refunds ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const r of refundRes.results || []) {
        refundHistory.push({
          id: Number(r.id || 0),
          flowType: String(r.flow_type || ''),
          websiteId: r.website_id ? String(r.website_id) : null,
          platformPaymentId: r.platform_payment_id ? Number(r.platform_payment_id) : null,
          storeOrderId: r.store_order_id ? Number(r.store_order_id) : null,
          cashfreePaymentId: String(r.razorpay_payment_id || ''),
          cashfreeRefundId: String(r.razorpay_refund_id || ''),
          amountInr: Number(r.amount_inr || 0),
          reason: sanitizeText(String(r.reason || ''), 300),
          status: String(r.status || ''),
          requestedBy: String(r.requested_by || ''),
          processedBy: r.processed_by ? String(r.processed_by) : null,
          createdAt: String(r.created_at || ''),
          updatedAt: String(r.updated_at || ''),
        });
      }
    } catch {}

    // 8. Delivery/recovery history from the durable audit ledger
    try {
      const deliveryRes = await env.DB.prepare(
        `SELECT id, action, target_type, target_id, metadata_json, created_at
         FROM platform_audit_logs
         WHERE target_type IN ('platform_payments', 'customer_website_publications')
            OR action LIKE '%delivery%'
         ORDER BY created_at DESC LIMIT 100`
      ).all<Record<string, any>>();
      for (const d of deliveryRes.results || []) {
        deliveryHistory.push({
          id: Number(d.id || 0),
          action: String(d.action || ''),
          targetType: String(d.target_type || ''),
          targetId: String(d.target_id || ''),
          details: sanitizeText(String(d.metadata_json || ''), 300),
          createdAt: String(d.created_at || ''),
        });
      }
    } catch {}
  }

  return jsonResponse({
    cashfree: cfStatus,
    emailConfigured: Boolean(env.RESEND_API_KEY),
    whatsappConfigured: Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    platformPayments,
    sellerAccounts,
    sellerTransfers,
    announcements,
    webhookEvents,
    notificationLogs,
    refundHistory,
    deliveryHistory,
  });
}
