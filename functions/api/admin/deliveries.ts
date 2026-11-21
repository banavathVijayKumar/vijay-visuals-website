// ============================================================================
// GET & POST /api/admin/deliveries
// Super Admin Delivery Operations & Website Provisioning Dashboard
// Lists all platform purchase deliveries, tracks 9-state machine transitions,
// and provides safe one-click manual retry for failed customer deliveries.
// ============================================================================

import { requireAdmin } from '../_auth';
import { PagesContext, errorJson, handleOptions, json, parseJsonBody, sanitizeText, writeAuditLog } from '../_shared';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from '../plans';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export interface AdminDeliveryItem {
  id: number;
  ownerId: string;
  buyerEmail: string;
  buyerName: string;
  planCode: string;
  planName: string;
  billingCycle: string;
  baseAmountInr: number;
  gstAmountInr: number;
  totalAmountInr: number;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  signatureVerified: boolean;
  status: string;
  orderState: string;
  deliveryStatus: string;
  provisioningError: string | null;
  deliveryAttempts: number;
  deliveredAt: string | null;
  websiteId: string | null;
  websiteSlug: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
  websiteStatus: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  try {
    const rows = await env.DB.prepare(
      `SELECT p.*,
              u.email AS user_email,
              u.full_name AS user_name,
              w.public_slug AS site_slug,
              w.business_name AS site_name,
              w.status AS site_status
       FROM platform_payments p
       LEFT JOIN vv_users u ON p.owner_id = u.id
       LEFT JOIN customer_website_publications w ON p.website_id = w.website_id
       ORDER BY p.id DESC
       LIMIT 200`
    ).all<Record<string, any>>();

    const deliveries: AdminDeliveryItem[] = [];
    let totalDelivered = 0;
    let totalPending = 0;
    let totalFailed = 0;
    let totalRefunded = 0;

    for (const r of rows.results || []) {
      let notes: Record<string, any> = {};
      try {
        notes = JSON.parse(r.notes_json || '{}');
      } catch {}

      // Authoritative order state determination
      let orderState = notes.orderState;
      if (!orderState) {
        if (r.status === 'refunded') orderState = 'REFUNDED';
        else if (r.status === 'paid' && r.signature_verified === 1) orderState = r.website_id ? 'ACTIVE' : 'DELIVERY_READY';
        else if (r.status === 'failed') orderState = 'DELIVERY_FAILED';
        else orderState = 'PAYMENT_PENDING';
      }

      let deliveryStatus = notes.deliveryStatus;
      if (!deliveryStatus) {
        if (r.status === 'refunded') deliveryStatus = 'REFUNDED';
        else if (r.status === 'paid' && r.signature_verified === 1) deliveryStatus = 'DELIVERY_READY';
        else if (r.status === 'failed') deliveryStatus = 'DELIVERY_FAILED';
        else deliveryStatus = 'PAYMENT_PENDING';
      }

      if (orderState === 'ACTIVE' || deliveryStatus === 'DELIVERY_READY') totalDelivered++;
      else if (orderState === 'DELIVERY_FAILED' || deliveryStatus === 'DELIVERY_FAILED') totalFailed++;
      else if (orderState === 'REFUNDED') totalRefunded++;
      else totalPending++;

      const slug = r.site_slug || notes.websiteSlug || '';
      const websiteUrl = slug ? `/site/${slug}` : null;

      deliveries.push({
        id: Number(r.id),
        ownerId: String(r.owner_id),
        buyerEmail: String(r.user_email || notes.buyerEmail || ''),
        buyerName: String(r.user_name || notes.buyerName || 'Customer'),
        planCode: String(r.plan_code),
        planName: String(r.plan_name || r.plan_code),
        billingCycle: String(r.billing_cycle),
        baseAmountInr: Number(r.base_amount_inr || 0),
        gstAmountInr: Number(r.gst_amount_inr || 0),
        totalAmountInr: Number(r.amount_inr || 0),
        razorpayOrderId: String(r.razorpay_order_id || ''),
        razorpayPaymentId: r.razorpay_payment_id || null,
        signatureVerified: Number(r.signature_verified) === 1,
        status: String(r.status),
        orderState,
        deliveryStatus,
        provisioningError: notes.provisioningError || null,
        deliveryAttempts: Number(notes.deliveryAttempts || 0),
        deliveredAt: notes.deliveredAt || r.paid_at || null,
        websiteId: r.website_id || null,
        websiteSlug: slug || null,
        websiteName: r.site_name || notes.businessName || null,
        websiteUrl,
        websiteStatus: r.site_status || null,
        paidAt: r.paid_at || null,
        createdAt: String(r.created_at || ''),
      });
    }

    return json({
      stats: {
        totalOrders: deliveries.length,
        totalDelivered,
        totalPending,
        totalFailed,
        totalRefunded,
      },
      deliveries,
    });
  } catch (err) {
    return errorJson(err instanceof Error ? err.message : 'Unable to load delivery records.', 500);
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = (await parseJsonBody<{ paymentId: number }>(request)) || { paymentId: 0 };
  const paymentId = Number(body.paymentId);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return errorJson('Valid paymentId is required to trigger delivery retry.', 400);
  }

  const payment = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
    .bind(paymentId)
    .first<{
      id: number;
      website_id: string | null;
      owner_id: string;
      plan_code: string;
      billing_cycle: string;
      base_amount_inr: number;
      setup_fee_inr: number;
      gst_amount_inr: number;
      amount_inr: number;
      razorpay_order_id: string;
      razorpay_payment_id: string | null;
      signature_verified: number;
      status: string;
      subscription_id: number | null;
      notes_json: string;
    }>();

  if (!payment) return errorJson('Platform payment record not found.', 404);
  if (payment.status !== 'paid' || payment.signature_verified !== 1) {
    return errorJson('Cannot deliver website for an unverified or unpaid order.', 400);
  }

  let notes: Record<string, any> = {};
  try {
    notes = JSON.parse(payment.notes_json || '{}');
  } catch {}

  notes.lastAttemptAt = new Date().toISOString();
  notes.deliveryAttempts = (notes.deliveryAttempts || 0) + 1;
  notes.orderState = 'PROVISIONING';
  notes.deliveryStatus = 'PROVISIONING';

  let targetWebsiteId = payment.website_id;
  let targetSlug = '';

  try {
    if (!targetWebsiteId) {
      const draft = await env.DB.prepare(
        `SELECT website_id, public_slug FROM customer_website_publications
         WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 1`
      )
        .bind(payment.owner_id)
        .first<{ website_id: string; public_slug: string }>();

      if (draft) {
        targetWebsiteId = draft.website_id;
        targetSlug = draft.public_slug;
      }
    }

    if (!targetWebsiteId) {
      const rawSlug = `site-${payment.owner_id.slice(-6)}-${Date.now().toString(36).slice(-4)}`.toLowerCase();
      const newWebsiteId = `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const businessName = notes.businessName || notes.buyerName || 'Business Site';

      const websiteData = {
        name: businessName,
        slug: rawSlug,
        category: 'General Business',
        templateId: 'general-business',
        tagline: 'Welcome to our official business website.',
        description: 'Quality products and professional services.',
        primaryColor: '#D4AF37',
        accentColor: '#0D0D12',
        fontFamily: 'Cinzel',
        enabledModules: {
          ecommerce: true,
          cartCheckout: true,
          gallery: true,
          bookings: false,
          whatsappOrder: true,
          reviews: true,
          wishlist: true,
          coupons: true,
          wholesale: false,
        },
        planTier: payment.plan_code || 'business-website',
        published: true,
        status: 'published',
      };

      await env.DB.prepare(
        `INSERT INTO customer_website_publications
          (website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'), datetime('now'))`
      )
        .bind(newWebsiteId, payment.owner_id, rawSlug, businessName, JSON.stringify(websiteData))
        .run();

      targetWebsiteId = newWebsiteId;
      targetSlug = rawSlug;
    } else {
      const pub = await env.DB.prepare(
        'SELECT public_slug, status FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(targetWebsiteId)
        .first<{ public_slug: string; status: string }>();

      if (pub) {
        targetSlug = pub.public_slug;
        if (pub.status !== 'published') {
          await env.DB.prepare(
            `UPDATE customer_website_publications
             SET status = 'published',
                 published_at = CASE WHEN published_at IS NULL OR published_at = '' THEN datetime('now') ELSE published_at END,
                 updated_at = datetime('now')
             WHERE website_id = ?`
          )
            .bind(targetWebsiteId)
            .run();
        }
      }
    }

    let subscriptionId = payment.subscription_id;
    const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.includes(payment.plan_code as any);
    const isOneTime = payment.billing_cycle === 'one_time' || isWebsitePackage;

    if (!subscriptionId) {
      if (isOneTime) {
        const subRes = await env.DB.prepare(
          `INSERT INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, ?, 'one_time', 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), NULL, datetime('now'), datetime('now'))`
        )
          .bind(
            targetWebsiteId,
            payment.owner_id,
            payment.plan_code,
            payment.base_amount_inr,
            payment.gst_amount_inr,
            payment.amount_inr,
            payment.setup_fee_inr,
            payment.razorpay_payment_id || payment.razorpay_order_id
          )
          .run();
        subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
      } else {
        const durationExpr = payment.billing_cycle === 'yearly' ? '+365 days' : '+30 days';
        const subRes = await env.DB.prepare(
          `INSERT INTO tenant_subscriptions
            (website_id, owner_id, plan_code, billing_cycle, status, base_amount_inr, gst_amount_inr,
             total_amount_inr, setup_fee_inr, payment_gateway, gateway_subscription_id,
             current_period_start, current_period_end, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'razorpay', ?, datetime('now'), datetime('now', ?), datetime('now'), datetime('now'))`
        )
          .bind(
            targetWebsiteId,
            payment.owner_id,
            payment.plan_code,
            payment.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
            payment.base_amount_inr,
            payment.gst_amount_inr,
            payment.amount_inr,
            payment.setup_fee_inr,
            payment.razorpay_payment_id || payment.razorpay_order_id,
            durationExpr
          )
          .run();
        subscriptionId = Number(subRes.meta?.last_row_id || 0) || null;
      }
    }

    notes.orderState = 'ACTIVE';
    notes.deliveryStatus = 'DELIVERY_READY';
    notes.deliveredAt = new Date().toISOString();
    notes.provisioningError = null;
    notes.websiteSlug = targetSlug;
    notes.websiteUrl = targetSlug ? `/site/${targetSlug}` : '';

    await env.DB.prepare(
      `UPDATE platform_payments
       SET website_id = ?, subscription_id = ?, notes_json = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(targetWebsiteId, subscriptionId, JSON.stringify(notes), payment.id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'admin_delivery_provisioning_retried',
      targetType: 'platform_payments',
      targetId: String(payment.id),
      details: {
        websiteId: targetWebsiteId,
        publicSlug: targetSlug,
        subscriptionId,
        deliveryStatus: 'DELIVERY_READY',
      },
    });

    return json({
      ok: true,
      delivered: true,
      orderState: 'ACTIVE',
      deliveryStatus: 'DELIVERY_READY',
      websiteId: targetWebsiteId,
      publicSlug: targetSlug,
      websiteUrl: `/site/${targetSlug}`,
      message: `Delivery successfully provisioned for order #${payment.id}. Website live at /site/${targetSlug}.`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Admin provisioning retry failed';
    notes.orderState = 'DELIVERY_FAILED';
    notes.deliveryStatus = 'DELIVERY_FAILED';
    notes.provisioningError = errorMsg;

    await env.DB.prepare('UPDATE platform_payments SET notes_json = ? WHERE id = ?')
      .bind(JSON.stringify(notes), payment.id)
      .run();

    return errorJson(errorMsg, 500);
  }
}
