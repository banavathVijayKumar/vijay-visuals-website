// ============================================================================
// POST /api/payments/platform/:id/retry-delivery
// Safe Customer & Super Admin Website Delivery Recovery Endpoint
// Recovers failed or unlinked website provisioning for verified paid orders.
// Idempotent: Never duplicates websites or charges the customer again.
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, errorJson, json, sanitizeText, writeAuditLog } from '../../../_shared';
import {
  checkTenantSubscriptionEntitlement,
  getPaymentEntitlementId,
  provisionLifetimeEntitlement,
} from '../../../_tenantAccess';
import { ALLOWED_WEBSITE_PACKAGE_CODES } from '../../../plans';

export async function onRequestPost(context: PagesContext<{ id: string }>): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const paymentId = Number(params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return errorJson('Invalid platform payment ID.', 400);
  }

  const payment = await env.DB.prepare('SELECT * FROM platform_payments WHERE id = ? LIMIT 1')
    .bind(paymentId)
    .first<{
      id: number;
      website_id: string | null;
      owner_id: string;
      purpose: string;
      plan_code: string;
      plan_name: string;
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

  if (!payment) {
    return errorJson('Platform payment record not found.', 404);
  }

  // Strictly enforce customer ownership or Super Admin authorization
  const isOwner =
    payment.owner_id === auth.user.id ||
    payment.owner_id === auth.user.authSubject ||
    auth.user.isSuperAdmin;

  if (!isOwner) {
    return errorJson('You are not authorized to recover delivery for this payment.', 403);
  }

  // Safety: Payment must be legitimately verified & paid
  if (payment.status !== 'paid' || payment.signature_verified !== 1) {
    return errorJson('Only verified and paid orders can undergo website delivery provisioning.', 400);
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
    // 1. Resolve or verify existing customer website
    if (!targetWebsiteId) {
      // Check latest customer draft publication
      const draft = await env.DB.prepare(
        `SELECT website_id, public_slug FROM customer_website_publications
         WHERE owner_id = ? OR owner_id = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
        .bind(payment.owner_id, auth.user.authSubject)
        .first<{ website_id: string; public_slug: string }>();

      if (draft) {
        targetWebsiteId = draft.website_id;
        targetSlug = draft.public_slug;
      }
    }

    if (!targetWebsiteId) {
      // Customer has no website record yet. Safely create a default tenant publication from draft/template.
      const rawSlug = `site-${payment.owner_id.slice(-6)}-${Date.now().toString(36).slice(-4)}`.toLowerCase();
      const newWebsiteId = `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const businessName = notes.businessName || notes.buyerName || 'My Business Site';

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
         VALUES (?, ?, ?, ?, ?, 'unpublished', NULL, datetime('now'), datetime('now'))`
      )
        .bind(newWebsiteId, payment.owner_id, rawSlug, businessName, JSON.stringify(websiteData))
        .run();

      targetWebsiteId = newWebsiteId;
      targetSlug = rawSlug;
    } else {
      // Ensure target website exists and get its slug
      const pub = await env.DB.prepare(
        'SELECT public_slug, status FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(targetWebsiteId)
        .first<{ public_slug: string; status: string }>();

      if (pub) {
        targetSlug = pub.public_slug;
        // Publication is deferred until the entitlement has been persisted.
      }
    }

    // 2. Attach or verify subscription
    let subscriptionId = payment.subscription_id;
    const isWebsitePackage = ALLOWED_WEBSITE_PACKAGE_CODES.includes(payment.plan_code as any);
    const isOneTime = payment.billing_cycle === 'one_time' || isWebsitePackage;

    const existingEntitlementId = await getPaymentEntitlementId(env, payment.id);

    if (isOneTime) {
      // One-time website packages are lifetime entitlements, never subscriptions.
      if (!existingEntitlementId) {
        const provision = await provisionLifetimeEntitlement(env, {
          websiteId: targetWebsiteId,
          ownerId: payment.owner_id,
          planCode: payment.plan_code,
          entitlementType: 'one_time_purchase',
          source: 'delivery_retry',
          sourceReference: payment.razorpay_payment_id || payment.razorpay_order_id || '',
          paymentId: payment.id,
        });
        if (!provision.ok && provision.error) return provision.error;
      }
    } else if (!subscriptionId) {
      // A paid recurring ledger row without a linked subscription is only
      // historical evidence. Never mint fresh active access from it.
      return errorJson(
        'This recurring payment has no active linked subscription. A fresh purchase is required before publishing.',
        409
      );
    } else {
      // Never resurrect a cancelled or expired recurring subscription. A paid
      // ledger row is historical proof of payment, not current access.
      const activeSub = await env.DB.prepare(
        `SELECT id FROM tenant_subscriptions
         WHERE id = ? AND status = 'active' AND current_period_end > datetime('now')
         LIMIT 1`
      )
        .bind(subscriptionId)
        .first<{ id: number }>();
      if (!activeSub) {
        return errorJson(
          'The linked subscription is no longer active. A fresh purchase is required before publishing.',
          409
        );
      }
      await env.DB.prepare(
        `UPDATE tenant_subscriptions
         SET website_id = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(targetWebsiteId, subscriptionId)
        .run();
    }

    // Publish only after a fresh entitlement check confirms current access.
    const entitlement = await checkTenantSubscriptionEntitlement(
      env,
      targetWebsiteId,
      payment.owner_id,
      false
    );
    if (!entitlement.canPublish) {
      return errorJson(
        'No active entitlement exists for this website. Payment alone cannot publish it.',
        409
      );
    }

    // Publish only after the paid entitlement/subscription has been persisted.
    await env.DB.prepare(
      `UPDATE customer_website_publications
       SET status = 'published',
           published_at = CASE WHEN published_at IS NULL OR published_at = '' THEN datetime('now') ELSE published_at END,
           updated_at = datetime('now')
       WHERE website_id = ? AND status != 'published'`
    )
      .bind(targetWebsiteId)
      .run();

    // 3. Mark delivery success
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
      action: 'delivery_provisioning_retried',
      targetType: 'platform_payments',
      targetId: String(payment.id),
      details: {
        websiteId: targetWebsiteId,
        publicSlug: targetSlug,
        subscriptionId,
        lifetimeEntitlementId: existingEntitlementId || null,
        status: 'DELIVERY_READY',
      },
    });

    return json({
      ok: true,
      recovered: true,
      orderState: 'ACTIVE',
      deliveryStatus: 'DELIVERY_READY',
      websiteId: targetWebsiteId,
      publicSlug: targetSlug,
      websiteUrl: `/site/${targetSlug}`,
      message: `Website delivery successfully provisioned! Live at /site/${targetSlug}.`,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Provisioning retry failed';
    notes.orderState = 'DELIVERY_FAILED';
    notes.deliveryStatus = 'DELIVERY_FAILED';
    notes.provisioningError = errorMsg;

    await env.DB.prepare(
      'UPDATE platform_payments SET notes_json = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(JSON.stringify(notes), payment.id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id,
      actorRole: auth.user.platformRole,
      action: 'delivery_provisioning_retry_failed',
      targetType: 'platform_payments',
      targetId: String(payment.id),
      details: { error: errorMsg },
    });

    return errorJson(
      'Website delivery retry failed. Please contact platform support for manual review.',
      502,
      { code: 'DELIVERY_RETRY_FAILED', error: errorMsg }
    );
  }
}
