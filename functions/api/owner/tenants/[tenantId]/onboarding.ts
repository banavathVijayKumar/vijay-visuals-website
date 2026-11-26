// ============================================================================
// GET & PUT /api/owner/tenants/:tenantId/onboarding — 12-Step Business Setup Wizard
// Evaluates live database records for automatic step completion and persists progress.
// ============================================================================

import { requireUser } from '../../../_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
} from '../../../_shared';
import { isMissingTableError, requireTenantOwnerAccess } from '../../../_tenantAccess';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

interface StepDef {
  step: number;
  key: string;
  title: string;
  simpleGuide: string;
  targetAction: string;
}

const CHECKLIST_STEPS: StepDef[] = [
  {
    step: 1,
    key: 'business_info',
    title: 'Enter Business Name, Address & Contact Details',
    simpleGuide: 'Provide your store contact number, WhatsApp number, and physical store address.',
    targetAction: 'settings',
  },
  {
    step: 2,
    key: 'logo_branding',
    title: 'Upload Brand Logo & Choose Theme Colors',
    simpleGuide: 'Set your primary brand color and upload your official high-resolution logo.',
    targetAction: 'builder',
  },
  {
    step: 3,
    key: 'add_products',
    title: 'Add Your First 3 Products or Services',
    simpleGuide: 'Upload product photos, set selling prices, and configure initial stock levels.',
    targetAction: 'catalog',
  },
  {
    step: 4,
    key: 'setup_categories',
    title: 'Create Store Categories',
    simpleGuide: 'Group your products into categories so customers can browse easily on mobile.',
    targetAction: 'categories',
  },
  {
    step: 5,
    key: 'payout_account',
    title: 'Configure Cashfree or Bank Payout Details',
    simpleGuide: 'Enter your bank account or UPI ID to accept online customer payments.',
    targetAction: 'seller_payout',
  },
  {
    step: 6,
    key: 'shipping_delivery',
    title: 'Set Up Delivery Zones & Shipping Rules',
    simpleGuide: 'Define delivery charges, COD availability, and assign delivery partners.',
    targetAction: 'delivery',
  },
  {
    step: 7,
    key: 'custom_domain',
    title: 'Connect Custom Domain or SSL',
    simpleGuide: 'Map your custom domain (e.g. www.yourshop.com) to your Vijay Visuals storefront.',
    targetAction: 'domain',
  },
  {
    step: 8,
    key: 'seo_settings',
    title: 'Optimize Google SEO & Meta Tags',
    simpleGuide: 'Add title, meta description, and keywords for search engine discovery.',
    targetAction: 'seo',
  },
  {
    step: 9,
    key: 'staff_members',
    title: 'Add Staff or Delivery Partner Accounts',
    simpleGuide: 'Invite your store staff or delivery partners with role-based dashboard access.',
    targetAction: 'staff',
  },
  {
    step: 10,
    key: 'test_order',
    title: 'Place a Test Order & Verify Checkout',
    simpleGuide: 'Open your storefront, add a product to cart, and verify order placement.',
    targetAction: 'storefront',
  },
  {
    step: 11,
    key: 'ai_automation',
    title: 'Enable AI Copywriting & Order Workflows',
    simpleGuide: 'Turn on automated order receipts, WhatsApp notifications, and AI product descriptions.',
    targetAction: 'ai_center',
  },
  {
    step: 12,
    key: 'publish_launch',
    title: 'Publish Storefront & Announce Launch',
    simpleGuide: 'Make your website public and share your link on WhatsApp, Instagram, and Google.',
    targetAction: 'publish',
  },
];

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const { row, parsed } = access;
  const websiteId = row.website_id;

  // Evaluate live database checks for auto-completion
  let hasProducts = false;
  let hasCategories = false;
  let hasOrders = false;
  let hasPayout = false;
  let hasStaff = false;

  if (env.DB) {
    try {
      const prodCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM store_products WHERE website_id = ?`
      )
        .bind(websiteId)
        .first<{ count: number }>();
      hasProducts = (prodCount?.count || 0) > 0;
    } catch {}

    try {
      const catCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM store_categories WHERE website_id = ?`
      )
        .bind(websiteId)
        .first<{ count: number }>();
      hasCategories = (catCount?.count || 0) > 0;
    } catch {}

    try {
      const ordCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM store_orders WHERE website_id = ?`
      )
        .bind(websiteId)
        .first<{ count: number }>();
      hasOrders = (ordCount?.count || 0) > 0;
    } catch {}

    try {
      const payoutRow = await env.DB.prepare(
        `SELECT linked_account_id, upi_id FROM seller_payout_accounts WHERE website_id = ? LIMIT 1`
      )
        .bind(websiteId)
        .first<{ linked_account_id: string; upi_id: string }>();
      hasPayout = Boolean(payoutRow?.linked_account_id || payoutRow?.upi_id);
    } catch {}

    try {
      const staffCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM tenant_memberships WHERE website_id = ?`
      )
        .bind(websiteId)
        .first<{ count: number }>();
      hasStaff = (staffCount?.count || 0) > 0;
    } catch {}
  }

  // Fallbacks from website_json
  if (!hasCategories && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
    hasCategories = true;
  }
  if (!hasPayout && (parsed.codEnabled === true || parsed.upiId)) {
    hasPayout = true;
  }

  const savedDone: number[] = Array.isArray(parsed.onboardingCompletedSteps)
    ? parsed.onboardingCompletedSteps
    : [];

  const steps = CHECKLIST_STEPS.map((s) => {
    let autoCompleted = false;
    switch (s.step) {
      case 1:
        autoCompleted = Boolean(parsed.phone || parsed.whatsapp || parsed.address);
        break;
      case 2:
        autoCompleted = Boolean(parsed.logoImage || parsed.primaryColor || parsed.brandColor);
        break;
      case 3:
        autoCompleted = hasProducts;
        break;
      case 4:
        autoCompleted = hasCategories;
        break;
      case 5:
        autoCompleted = hasPayout;
        break;
      case 6:
        autoCompleted = Boolean(parsed.deliveryZones || parsed.codEnabled);
        break;
      case 7:
        autoCompleted = Boolean(parsed.customDomain && parsed.customDomain.includes('.'));
        break;
      case 8:
        autoCompleted = Boolean(parsed.seoTitle || parsed.seoDescription);
        break;
      case 9:
        autoCompleted = hasStaff;
        break;
      case 10:
        autoCompleted = hasOrders;
        break;
      case 11:
        autoCompleted = Array.isArray(parsed.automationWorkflows) && parsed.automationWorkflows.length > 0;
        break;
      case 12:
        autoCompleted = row.status === 'published';
        break;
    }

    const completed = autoCompleted || savedDone.includes(s.step);

    return {
      step: s.step,
      key: s.key,
      title: s.title,
      simpleGuide: s.simpleGuide,
      autoCompleted,
      completed,
      targetAction: s.targetAction,
    };
  });

  const completedCount = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);
  const currentStep = Math.min(totalSteps, completedCount + 1);

  return jsonResponse({
    steps,
    completedCount,
    totalSteps,
    progressPct,
    currentStep,
  });
}

export async function onRequestPut(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const body = await parseJsonBody<{
    completedSteps?: number[];
    currentStep?: number;
    dismissed?: boolean;
  }>(request);

  if (!body || !Array.isArray(body.completedSteps)) {
    return jsonResponse({ error: 'completedSteps must be an array of step numbers.' }, 400);
  }

  const validSteps = body.completedSteps.filter((n) => typeof n === 'number' && n >= 1 && n <= 12);
  const parsed = access.parsed || {};
  parsed.onboardingCompletedSteps = validSteps;

  try {
    await env.DB!.prepare(
      `UPDATE customer_website_publications
       SET website_json = ?, updated_at = datetime('now')
       WHERE website_id = ?`
    )
      .bind(JSON.stringify(parsed), access.row.website_id)
      .run();

    return jsonResponse({ success: true, completedSteps: validSteps });
  } catch (err) {
    return jsonResponse({ error: 'Failed to save setup progress.' }, 500);
  }
}
