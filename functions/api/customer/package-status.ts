// ============================================================================
// GET /api/customer/package-status
// Customer-facing, authoritative package/entitlement status. Payment ledger
// status is reported separately and is never treated as proof of entitlement.
// ============================================================================

import { requireUser } from '../_auth';
import { checkTenantSubscriptionEntitlement } from '../_tenantAccess';
import { PagesContext, errorJson, json, sanitizeText } from '../_shared';

export type DisplayPackageStatus =
  | 'free_start'
  | 'active'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'expired'
  | 'none';

interface WebsiteRow {
  website_id: string;
  public_slug: string;
  business_name: string;
}

interface PaymentRow {
  id: number;
  plan_code: string;
  plan_name: string;
  status: string;
  signature_verified: number;
  amount_inr: number;
  created_at: string;
}

interface SubscriptionRow {
  plan_code: string;
  status: string;
  current_period_end: string;
}

export function deriveDisplayPackageStatus(
  entitlement: { hasActiveSubscription: boolean; canPublish: boolean; isFreeStart: boolean },
  paymentStatus: string | null,
  subscription: SubscriptionRow | null
): DisplayPackageStatus {
  if (entitlement.isFreeStart) return 'free_start';
  if (entitlement.hasActiveSubscription && entitlement.canPublish) return 'active';

  const status = String(paymentStatus || '').toLowerCase();
  if (status === 'refunded') return 'refunded';
  if (status === 'failed') return 'failed';
  if (status === 'created' || status === 'pending') return 'pending';
  if (subscription && !entitlement.hasActiveSubscription) return 'expired';
  return 'none';
}

function humanizePlanName(raw: string): string {
  return String(raw || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  try {
    const websitesRes = await env.DB.prepare(
      `SELECT website_id, public_slug, business_name
       FROM customer_website_publications
       WHERE owner_id = ? OR owner_id = ?
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 20`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all<WebsiteRow>();

    const websites = websitesRes.results || [];
    if (!websites.length) {
      return json({
        packageStatus: 'none' as DisplayPackageStatus,
        planCode: '',
        planName: 'No package selected',
        paymentStatus: null,
        canPublish: false,
        currentPeriodEnd: null,
        isFreeStart: false,
        amountInr: null,
        websiteId: null,
        websites: [],
      });
    }

    const summaries = await Promise.all(
      websites.map(async (site) => {
        const entitlement = await checkTenantSubscriptionEntitlement(
          env,
          site.website_id,
          auth.user.id,
          auth.user.isSuperAdmin
        );

        const payment = await env.DB!.prepare(
          `SELECT id, plan_code, plan_name, status, signature_verified, amount_inr, created_at
           FROM platform_payments
           WHERE website_id = ? AND purpose IN ('platform_subscription', 'website_purchase', 'addon')
           ORDER BY id DESC LIMIT 1`
        )
          .bind(site.website_id)
          .first<PaymentRow>();

        const subscription = await env.DB!.prepare(
          `SELECT plan_code, status, current_period_end
           FROM tenant_subscriptions
           WHERE website_id = ? OR owner_id = ?
           ORDER BY id DESC LIMIT 1`
        )
          .bind(site.website_id, auth.user.id)
          .first<SubscriptionRow>();

        const packageStatus = deriveDisplayPackageStatus(
          entitlement,
          payment?.status || null,
          subscription
        );
        const hasPlanEvidence =
          entitlement.hasActiveSubscription || Boolean(payment) || Boolean(subscription);
        const resolvedPlanCode = hasPlanEvidence
          ? entitlement.planCode || payment?.plan_code || ''
          : '';
        const planRow = resolvedPlanCode
          ? await env.DB!.prepare('SELECT name FROM subscription_plans WHERE code = ? LIMIT 1')
              .bind(resolvedPlanCode)
              .first<{ name: string }>()
          : null;

        return {
          websiteId: site.website_id,
          publicSlug: site.public_slug,
          businessName: site.business_name,
          packageStatus,
          planCode: resolvedPlanCode,
          planName: !hasPlanEvidence
            ? 'No package selected'
            : sanitizeText(planRow?.name || payment?.plan_name || '', 120) ||
              humanizePlanName(resolvedPlanCode) ||
              'Package details unavailable',
          paymentStatus: payment?.status || null,
          signatureVerified: Boolean(payment?.signature_verified),
          canPublish: Boolean(entitlement.canPublish),
          currentPeriodEnd: subscription?.current_period_end || null,
          isFreeStart: Boolean(entitlement.isFreeStart),
          amountInr: payment ? Number(payment.amount_inr) : null,
        };
      })
    );

    const mostRelevant =
      summaries.find((s) => s.packageStatus !== 'none') || summaries[0];

    return json({ ...mostRelevant, websites: summaries });
  } catch (error) {
    console.error('Package status lookup failed:', error);
    return errorJson('Unable to load package status right now.', 500);
  }
}
