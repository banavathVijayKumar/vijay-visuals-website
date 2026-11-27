// ============================================================================
// GET /api/customer/package-status
// Customer-facing, authoritative package/entitlement status. Payment ledger
// status is reported separately and is never treated as proof of entitlement.
// ============================================================================

import { requireUser } from '../_auth';
import { checkTenantSubscriptionEntitlement } from '../_tenantAccess';
import { CloudflareEnv, PagesContext, errorJson, json, sanitizeText } from '../_shared';
import { DEFAULT_PLANS, getDefaultWebsitePlan } from '../plans';

export type DisplayPackageStatus =
  | 'free_start'
  | 'active'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'expired'
  | 'cancelled'
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
  billing_cycle: string;
  status: string;
  signature_verified: number;
  base_amount_inr: number;
  gst_amount_inr: number;
  amount_inr: number;
  receipt: string;
  paid_at: string | null;
  created_at: string;
  refund_id: string | null;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
}

interface SubscriptionRow {
  plan_code: string;
  status: string;
  billing_cycle?: string;
  current_period_start?: string;
  current_period_end: string;
  cancel_at_period_end?: number;
}

interface CatalogPlan {
  code: string;
  name: string;
  priceInr: number;
  billingCycle: string;
  featuresJson: string;
}

/**
 * Entitlement rows are authoritative. Subscription lifecycle status is shown
 * separately so a cancelled recurring plan is never mislabelled as expired.
 */
export function deriveDisplayPackageStatus(
  entitlement: { hasActiveSubscription: boolean; canPublish: boolean; isFreeStart: boolean },
  paymentStatus: string | null,
  subscription: SubscriptionRow | null
): DisplayPackageStatus {
  const payment = String(paymentStatus || '').toLowerCase();
  const subStatus = String(subscription?.status || '').toLowerCase();
  if (payment === 'refunded') return 'refunded';
  if (subStatus === 'cancelled') return 'cancelled';
  if (subStatus === 'expired') return 'expired';
  if (entitlement.isFreeStart) return 'free_start';
  if (entitlement.hasActiveSubscription && entitlement.canPublish) return 'active';
  if (payment === 'failed') return 'failed';
  if (payment === 'created' || payment === 'pending') return 'pending';
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

function parseFeatures(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function cashfreeOrderId(raw: unknown): string {
  const value = String(raw || '');
  return value.startsWith('cf_') ? value.slice(3) : value;
}

function remainingDays(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}

async function loadPlanCatalog(env: CloudflareEnv): Promise<Map<string, CatalogPlan>> {
  const catalog = new Map<string, CatalogPlan>();
  for (const plan of DEFAULT_PLANS) {
    catalog.set(plan.code, {
      code: plan.code,
      name: plan.name,
      priceInr: plan.priceInr,
      billingCycle: plan.billingCycle,
      featuresJson: plan.featuresJson,
    });
  }

  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        `SELECT code, name, monthly_price_inr, features_json
         FROM subscription_plans WHERE is_active = 1`
      ).all<{ code: string; name: string; monthly_price_inr: number; features_json: string }>();
      for (const row of res.results || []) {
        const local = getDefaultWebsitePlan(String(row.code));
        catalog.set(String(row.code), {
          code: String(row.code),
          name: sanitizeText(String(row.name || local?.name || row.code), 120),
          priceInr: Number(row.monthly_price_inr || 0),
          billingCycle: local?.billingCycle || 'one_time',
          featuresJson: String(row.features_json || local?.featuresJson || '[]'),
        });
      }
    } catch {
      // Authoritative local catalogue remains available before migration 0003.
    }
  }
  return catalog;
}

function lockedReason(status: DisplayPackageStatus): string | null {
  if (status === 'active' || status === 'free_start') return null;
  if (status === 'refunded') return 'Entitlement revoked after a completed refund.';
  if (status === 'cancelled') return 'Recurring subscription was cancelled.';
  if (status === 'expired') return 'Recurring subscription has expired.';
  if (status === 'failed') return 'Payment failed; a successful payment is required.';
  if (status === 'pending') return 'Payment is awaiting server-side Cashfree verification.';
  return 'No active entitlement has been granted for this feature.';
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const account = {
    accountEmail: auth.user.email,
    emailVerified: Boolean(auth.user.emailVerified),
    accountStatus: auth.user.status,
  };

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
        ...account,
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

    const catalog = await loadPlanCatalog(env);

    const summaries = await Promise.all(
      websites.map(async (site) => {
        const entitlement = await checkTenantSubscriptionEntitlement(
          env,
          site.website_id,
          auth.user.id,
          auth.user.isSuperAdmin
        );

        const payment = await env.DB!.prepare(
          `SELECT id, plan_code, plan_name, billing_cycle, status, signature_verified,
                  base_amount_inr, gst_amount_inr, amount_inr, receipt, paid_at, created_at,
                  refund_id, razorpay_order_id, razorpay_payment_id
           FROM platform_payments
           WHERE website_id = ? AND purpose IN ('platform_subscription', 'website_purchase', 'addon')
           ORDER BY id DESC LIMIT 1`
        )
          .bind(site.website_id)
          .first<PaymentRow>();

        let subscription: SubscriptionRow | null = null;
        try {
          subscription = await env.DB!.prepare(
            `SELECT plan_code, status, billing_cycle, current_period_start,
                    current_period_end, cancel_at_period_end
             FROM tenant_subscriptions
             WHERE website_id = ? OR owner_id = ?
             ORDER BY id DESC LIMIT 1`
          )
            .bind(site.website_id, auth.user.id)
            .first<SubscriptionRow>();
        } catch {
          subscription = await env.DB!.prepare(
            `SELECT plan_code, status, current_period_end
             FROM tenant_subscriptions
             WHERE website_id = ? OR owner_id = ?
             ORDER BY id DESC LIMIT 1`
          )
            .bind(site.website_id, auth.user.id)
            .first<SubscriptionRow>();
        }

        const packageStatus = deriveDisplayPackageStatus(
          entitlement,
          payment?.status || null,
          subscription
        );
        const hasPlanEvidence =
          entitlement.hasActiveSubscription || Boolean(payment) || Boolean(subscription);
        const resolvedPlanCode = hasPlanEvidence
          ? entitlement.planCode || payment?.plan_code || subscription?.plan_code || ''
          : '';
        const planRow = resolvedPlanCode
          ? await env.DB!.prepare('SELECT name FROM subscription_plans WHERE code = ? LIMIT 1')
              .bind(resolvedPlanCode)
              .first<{ name: string }>()
          : null;
        const plan = resolvedPlanCode ? catalog.get(resolvedPlanCode) : undefined;
        const planName = !hasPlanEvidence
          ? 'No package selected'
          : sanitizeText(planRow?.name || payment?.plan_name || plan?.name || '', 120) ||
            humanizePlanName(resolvedPlanCode) ||
            'Package details unavailable';

        const verifiedPayment =
          Boolean(payment) &&
          ['paid', 'captured', 'settled', 'success'].includes(String(payment?.status || '').toLowerCase()) &&
          payment?.signature_verified === 1;
        const billingCycle =
          String(payment?.billing_cycle || subscription?.billing_cycle || plan?.billingCycle || 'one_time');
        const isLifetime = billingCycle === 'one_time';
        const entitled = entitlement.canPublish || entitlement.isFreeStart;
        const features = parseFeatures(plan?.featuresJson).map((feature) => ({
          name: feature,
          unlocked: entitled,
          lockedReason: entitled ? null : lockedReason(packageStatus),
        }));
        const upgradeOptions = Array.from(catalog.values())
          .filter((candidate) => candidate.code !== resolvedPlanCode && candidate.priceInr > Number(plan?.priceInr || 0))
          .sort((a, b) => a.priceInr - b.priceInr)
          .map((candidate) => ({
            planCode: candidate.code,
            planName: candidate.name,
            priceInr: candidate.priceInr,
            billingCycle: candidate.billingCycle,
            features: parseFeatures(candidate.featuresJson),
            lockedReason: 'Requires a separately purchased package with verified payment.',
          }));

        return {
          websiteId: site.website_id,
          publicSlug: site.public_slug,
          businessName: site.business_name,
          packageStatus,
          subscriptionStatus: subscription?.status || null,
          planCode: resolvedPlanCode,
          planName,
          paymentStatus: payment?.status || null,
          signatureVerified: Boolean(payment?.signature_verified),
          verifiedPayment,
          canPublish: Boolean(entitlement.canPublish),
          entitlementStatus: entitlement.canPublish ? 'active' : entitlement.isFreeStart ? 'free_start' : 'inactive',
          currentPeriodStart: isLifetime ? null : subscription?.current_period_start || null,
          currentPeriodEnd: isLifetime ? null : subscription?.current_period_end || null,
          remainingValidityDays: isLifetime && entitled ? null : remainingDays(subscription?.current_period_end),
          validityLabel: isLifetime
            ? entitled
              ? 'Lifetime access (no recurring expiry)'
              : 'One-time package not yet activated'
            : subscription?.current_period_end
              ? `Recurring access until ${subscription.current_period_end}`
              : 'No active validity record',
          isFreeStart: Boolean(entitlement.isFreeStart),
          amountInr: payment ? Number(payment.amount_inr) : null,
          baseAmountInr: payment ? Number(payment.base_amount_inr) : null,
          gstAmountInr: payment ? Number(payment.gst_amount_inr) : null,
          receiptNumber: payment?.receipt || null,
          cashfreeOrderId: payment ? cashfreeOrderId(payment.razorpay_order_id) : null,
          cashfreePaymentId: payment?.razorpay_payment_id || null,
          purchaseDate: payment?.paid_at || payment?.created_at || null,
          activationDate: entitled ? payment?.paid_at || subscription?.current_period_start || null : null,
          refundId: payment?.refund_id || null,
          billingCycle,
          planFeatures: features,
          lockedReason: lockedReason(packageStatus),
          upgradeOptions,
        };
      })
    );

    const mostRelevant =
      summaries.find((s) => s.packageStatus !== 'none') || summaries[0];

    return json({ ...account, ...mostRelevant, websites: summaries });
  } catch (error) {
    console.error('Package status lookup failed:', error);
    return errorJson('Unable to load package status right now.', 500);
  }
}
