// ============================================================================
// GET /api/admin/ecosystem — Super Admin Platform Operations & Ecosystem Health
// Protected strictly by `requireAdmin` (zero hardcoded passwords/bypass).
// Returns Cashfree status, platform payment ledger, seller payout accounts,
// seller transfers/settlements, platform announcements, and webhook events.
// ============================================================================

import { requireAdmin } from '../_auth';
import { PagesContext, handleOptions, jsonResponse } from '../_shared';
import { getEdgeCashfreeStatus } from '../payments/_cashfree';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
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

  if (env.DB) {
    // 1. Platform Payments (from cashfree_payments ledger with fallback to platform_payments)
    try {
      const cfPayRes = await env.DB.prepare(
        `SELECT id, order_id, cf_order_id, user_id, base_amount_inr, gst_amount_inr,
                amount_inr, currency, environment, status, cf_payment_id, payment_method,
                payment_time, notes_json, created_at
         FROM cashfree_payments
         ORDER BY created_at DESC LIMIT 50`
      ).all<Record<string, any>>();

      for (const p of cfPayRes.results || []) {
        let notes: Record<string, any> = {};
        try {
          notes = p.notes_json ? JSON.parse(p.notes_json) : {};
        } catch {}

        platformPayments.push({
          id: Number(p.id || 0),
          userId: p.user_id ? Number(p.user_id) || null : null,
          tenantId: notes.tenantId ? Number(notes.tenantId) : null,
          planCode: String(notes.planCode || p.entity_type || 'business-website'),
          planName: String(notes.planName || 'Business Website Package (₹7,999)'),
          amountInr: Number(p.amount_inr || 0),
          currency: String(p.currency || 'INR'),
          mode: String(p.environment || 'sandbox'),
          razorpayOrderId: String(p.order_id || ''),
          razorpayPaymentId: String(p.cf_payment_id || p.cf_order_id || ''),
          status: String(p.status || 'CREATED').toLowerCase(),
          createdAt: String(p.created_at || ''),
        });
      }
    } catch {
      // Fallback to legacy platform_payments table if present
      try {
        const legRes = await env.DB.prepare(
          `SELECT * FROM platform_payments ORDER BY created_at DESC LIMIT 50`
        ).all<Record<string, any>>();
        for (const p of legRes.results || []) {
          platformPayments.push({
            id: Number(p.id || 0),
            userId: p.user_id ? Number(p.user_id) : null,
            tenantId: p.tenant_id ? Number(p.tenant_id) : null,
            planCode: String(p.plan_code || 'business-website'),
            planName: String(p.plan_name || 'Business Website Package'),
            amountInr: Number(p.amount_inr || 0),
            currency: String(p.currency || 'INR'),
            mode: String(p.mode || 'sandbox'),
            razorpayOrderId: String(p.razorpay_order_id || ''),
            razorpayPaymentId: String(p.razorpay_payment_id || ''),
            status: String(p.status || 'completed'),
            createdAt: String(p.created_at || ''),
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
  }

  const razorpayCompat = {
    configured: cfStatus.configured,
    mode: cfStatus.mode,
    message: cfStatus.message,
    webhookConfigured: cfStatus.webhookConfigured,
  };

  return jsonResponse({
    razorpay: razorpayCompat,
    cashfree: cfStatus,
    emailConfigured: Boolean(env.RESEND_API_KEY),
    whatsappConfigured: Boolean(env.WHATSAPP_CLOUD_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    platformPayments,
    sellerAccounts,
    sellerTransfers,
    announcements,
    webhookEvents,
    notificationLogs,
  });
}
