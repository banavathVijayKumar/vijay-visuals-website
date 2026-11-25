// ============================================================================
// VIJAY VISUALS — SHARED MULTI-TENANT ACCESS CONTROL, VALIDATION & MAPPERS
// Enforces strict backend tenant isolation, XSS-safe media validation,
// honest missing-table detection, and uniform D1 <-> UI record mapping.
// ============================================================================

import { AuthenticatedUser, TenantRole } from './_auth';
import { CloudflareEnv, errorJson } from './_shared';
import { PublicationRow, cleanString } from './_tenantMapper';
import {
  FREE_START_PLAN_CODE,
  FREE_START_TIER,
  PLAN_TIER_SET,
  type PlanTier,
} from './_planTiers';

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'builder',
  'checkout',
  'dashboard',
  'dashboards',
  'domains',
  'health',
  'help',
  'home',
  'index',
  'login',
  'logout',
  'marketplace',
  'me',
  'order',
  'orders',
  'owner',
  'payments',
  'platform',
  'pricing',
  'privacy',
  'public',
  'register',
  'settings',
  'signup',
  'site',
  'sites',
  'static',
  'studio',
  'support',
  'tenants',
  'terms',
  'www',
]);

export const SAFE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const SAFE_DATA_IMAGE_REGEX = /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i;
const MAX_IMAGE_DATA_URL_LENGTH = 360_000; // ~270 KB raw binary

export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /no such table|no such column/i.test(msg);
}

export function validateSafeHttpUrl(raw: unknown, maxLen = 500): string {
  const s = cleanString(raw, maxLen);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return u.toString().slice(0, maxLen);
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Validates an image URL or inline base64 data URL (PNG/JPEG/WEBP only).
 * Strictly rejects SVG/HTML/javascript: URIs to eliminate stored XSS.
 */
export function validateSafeImageSource(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) {
    if (trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) return '';
    return SAFE_DATA_IMAGE_REGEX.test(trimmed) ? trimmed : '';
  }
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/images/')) {
    return trimmed.replace(/["'<>]/g, '').slice(0, 500);
  }
  return validateSafeHttpUrl(trimmed, 1000);
}

export function validateGalleryImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const valid = validateSafeImageSource(item);
    if (valid) out.push(valid);
    if (out.length >= 18) break;
  }
  return out;
}

export function validateGalleryItems(raw: unknown): Array<{
  id: string;
  url: string;
  title: string;
  description: string;
  category: string;
  order: number;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    id: string;
    url: string;
    title: string;
    description: string;
    category: string;
    order: number;
  }> = [];
  raw.forEach((item: any, idx: number) => {
    if (!item || typeof item !== 'object') return;
    const url = validateSafeImageSource(item.url);
    if (!url) return;
    out.push({
      id: cleanString(item.id, 60) || `gal_${idx + 1}`,
      url,
      title: cleanString(item.title, 120),
      description: cleanString(item.description, 400),
      category: cleanString(item.category, 60) || 'Showcase',
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : idx,
    });
  });
  return out.slice(0, 18);
}

export function validateEnabledModules(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const keys = [
    'ecommerce',
    'cartCheckout',
    'gallery',
    'bookings',
    'whatsappOrder',
    'reviews',
    'wishlist',
    'coupons',
    'wholesale',
  ];
  const out: Record<string, boolean> = {};
  for (const k of keys) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function validateSlugFormat(rawSlug: string): {
  valid: boolean;
  normalized: string;
  reason?: string;
} {
  const normalized = String(rawSlug || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length < 3 || normalized.length > 63) {
    return {
      valid: false,
      normalized,
      reason: 'URL slug must be between 3 and 63 characters (lowercase letters, numbers, hyphens).',
    };
  }
  if (!SAFE_SLUG_PATTERN.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'URL slug must start and end with a letter or number.',
    };
  }
  if (RESERVED_SLUGS.has(normalized)) {
    return {
      valid: false,
      normalized,
      reason: `"${normalized}" is a reserved platform route. Choose a unique business slug.`,
    };
  }
  return { valid: true, normalized };
}

/**
 * Resolves a tenant publication row from D1 by numeric rowid, website_id, or public_slug.
 */
export async function findPublicationByIdentifier(
  env: CloudflareEnv,
  identifier: string
): Promise<PublicationRow | null> {
  if (!env.DB) return null;
  const raw = String(identifier || '').trim();
  if (!raw) return null;

  const isNumeric = /^\d+$/.test(raw);
  const cols =
    'rowid, website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at';

  try {
    if (isNumeric) {
      const numId = Number(raw);
      const byRowId = await env.DB.prepare(
        `SELECT ${cols} FROM customer_website_publications WHERE rowid = ? LIMIT 1`
      )
        .bind(numId)
        .first<PublicationRow>();
      if (byRowId) return byRowId;
    }

    const byKey = await env.DB.prepare(
      `SELECT ${cols} FROM customer_website_publications
       WHERE website_id = ? OR public_slug = ?
       LIMIT 1`
    )
      .bind(raw, raw.toLowerCase())
      .first<PublicationRow>();
    return byKey || null;
  } catch {
    // Fallback without rowid column if schema differs
    try {
      const byKey = await env.DB.prepare(
        `SELECT website_id, owner_id, public_slug, business_name, website_json, status, published_at, created_at, updated_at
         FROM customer_website_publications
         WHERE website_id = ? OR public_slug = ?
         LIMIT 1`
      )
        .bind(raw, raw.toLowerCase())
        .first<PublicationRow>();
      return byKey || null;
    } catch {
      return null;
    }
  }
}

export type TenantAccessResult =
  | {
      ok: true;
      row: PublicationRow;
      parsed: Record<string, any>;
      parsedWebsite: Record<string, any>;
      effectiveRole: TenantRole | 'super_admin' | 'platform_staff';
    }
  | {
      ok: false;
      response: Response;
    };

/**
 * Strictly enforces tenant isolation on all owner/manager mutations.
 * - Matches owner_id against user.id or user.authSubject
 * - Checks optional tenant_memberships table for invited managers/staff
 * - Allows super_admin / platform_staff
 * - Returns HTTP 403 for any cross-tenant access attempt.
 */
export async function requireTenantOwnerAccess(
  env: CloudflareEnv,
  user: AuthenticatedUser,
  identifier: string,
  allowedRoles: TenantRole[] = ['business_owner', 'business_manager']
): Promise<TenantAccessResult> {
  if (!env.DB) {
    return { ok: false, response: errorJson('Website storage is not configured.', 503) };
  }

  const row = await findPublicationByIdentifier(env, identifier);
  if (!row) {
    return { ok: false, response: errorJson('Website / tenant not found.', 404) };
  }

  let parsedWebsite: Record<string, any> = {};
  try {
    const raw = row.website_json ? JSON.parse(row.website_json) : {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      parsedWebsite = raw;
    }
  } catch {
    parsedWebsite = {};
  }

  if (user.isSuperAdmin) {
    return { ok: true, row, parsed: parsedWebsite, parsedWebsite, effectiveRole: 'super_admin' };
  }
  if (user.isPlatformStaff) {
    return { ok: true, row, parsed: parsedWebsite, parsedWebsite, effectiveRole: 'platform_staff' };
  }

  const isDirectOwner =
    row.owner_id === user.id ||
    (Boolean(user.authSubject) && row.owner_id === user.authSubject);

  if (isDirectOwner) {
    return { ok: true, row, parsed: parsedWebsite, parsedWebsite, effectiveRole: 'business_owner' };
  }

  // Check delegated tenant_memberships (optional migration 0003 table)
  try {
    const membership = await env.DB.prepare(
      `SELECT role FROM tenant_memberships
       WHERE website_id = ? AND (user_id = ? OR user_id = ?) AND status = 'active'
       LIMIT 1`
    )
      .bind(row.website_id, user.id, user.authSubject || user.id)
      .first<{ role: TenantRole }>();

    if (membership && allowedRoles.includes(membership.role)) {
      return { ok: true, row, parsed: parsedWebsite, parsedWebsite, effectiveRole: membership.role };
    }
  } catch {
    // Optional table may not exist yet
  }

  return {
    ok: false,
    response: errorJson(
      'Forbidden: you do not have permission to access or modify this business website.',
      403
    ),
  };
}

export function parseProductMeta(rawVariantsJson: unknown): {
  variants: string[];
  subcategory: string;
  featured: boolean;
  bestseller: boolean;
  specs: string;
  videoUrl: string;
  wholesalePrice: number;
  minWholesaleQty: number;
} {
  let variants: string[] = [];
  let subcategory = '';
  let featured = false;
  let bestseller = false;
  let specs = '';
  let videoUrl = '';
  let wholesalePrice = 0;
  let minWholesaleQty = 1;

  try {
    const parsed = rawVariantsJson ? JSON.parse(String(rawVariantsJson)) : [];
    if (Array.isArray(parsed)) {
      variants = parsed.map((v) => cleanString(v, 60)).filter(Boolean);
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.variants)) {
        variants = parsed.variants.map((v: unknown) => cleanString(v, 60)).filter(Boolean);
      }
      subcategory = cleanString(parsed.subcategory, 80);
      featured = Boolean(parsed.featured);
      bestseller = Boolean(parsed.bestseller);
      specs = cleanString(parsed.specs, 600);
      videoUrl = validateSafeHttpUrl(parsed.videoUrl, 400);
      wholesalePrice = Math.max(0, Math.round(Number(parsed.wholesalePrice || 0)));
      minWholesaleQty = Math.max(1, Math.round(Number(parsed.minWholesaleQty || 1)));
    }
  } catch {}

  return {
    variants,
    subcategory,
    featured,
    bestseller,
    specs,
    videoUrl,
    wholesalePrice,
    minWholesaleQty,
  };
}

export function encodeProductMeta(meta: {
  variants: string[];
  subcategory?: string;
  featured?: boolean;
  bestseller?: boolean;
  specs?: string;
  videoUrl?: string;
  wholesalePrice?: number;
  minWholesaleQty?: number;
}): string {
  const hasExtended =
    Boolean(meta.subcategory) ||
    Boolean(meta.featured) ||
    Boolean(meta.bestseller) ||
    Boolean(meta.specs) ||
    Boolean(meta.videoUrl) ||
    Number(meta.wholesalePrice || 0) > 0;

  if (!hasExtended) {
    return JSON.stringify(meta.variants);
  }
  return JSON.stringify({
    variants: meta.variants,
    subcategory: meta.subcategory || '',
    featured: Boolean(meta.featured),
    bestseller: Boolean(meta.bestseller),
    specs: meta.specs || '',
    videoUrl: meta.videoUrl || '',
    wholesalePrice: Math.max(0, Math.round(Number(meta.wholesalePrice || 0))),
    minWholesaleQty: Math.max(1, Math.round(Number(meta.minWholesaleQty || 1))),
  });
}

export function mapProductRowToUi(
  p: Record<string, any>,
  tenantRowId: number,
  rating = '0.0',
  reviewCount = 0
): Record<string, unknown> {
  let images: string[] = [];
  try {
    const imgs = p.images_json ? JSON.parse(String(p.images_json)) : [];
    if (Array.isArray(imgs)) {
      images = imgs
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 6);
    }
  } catch {
    images = [];
  }

  const meta = parseProductMeta(p.variants_json);

  return {
    id: Number(p.id),
    tenantId: tenantRowId,
    category: cleanString(p.category, 80) || 'General',
    subcategory: meta.subcategory,
    name: cleanString(p.name, 160),
    description: cleanString(p.description, 1000),
    price: Number(p.price_inr) || 0,
    compareAtPrice: Number(p.compare_at_price_inr) || 0,
    wholesalePrice: meta.wholesalePrice,
    minWholesaleQty: meta.minWholesaleQty,
    stock: Number(p.stock_qty) || 0,
    lowStockThreshold: Number(p.low_stock_threshold) || 5,
    imageUrl: images[0] || '',
    images,
    videoUrl: meta.videoUrl,
    variantsJson: JSON.stringify(meta.variants),
    specs: meta.specs,
    sku: cleanString(p.sku, 80),
    barcode: cleanString(p.barcode, 80),
    featured: meta.featured,
    bestseller: meta.bestseller,
    rating,
    reviewCount,
    active: Boolean(p.is_active),
  };
}

export function mapOrderRowToUi(
  o: Record<string, any>,
  tenantRowId = 0
): Record<string, unknown> {
  const rawMethod = String(o.payment_method || 'cod');
  const paymentMethod =
    rawMethod === 'upi_manual' ? 'upi_reference' : rawMethod;

  const rawStatus = String(o.order_status || 'placed');
  const status = rawStatus === 'placed' ? 'pending' : rawStatus;

  return {
    id: Number(o.id),
    orderNumber: String(o.order_number || ''),
    tenantId: tenantRowId,
    websiteId: String(o.website_id || ''),
    customerName: String(o.customer_name || ''),
    customerPhone: String(o.customer_phone || ''),
    customerEmail: String(o.customer_email || ''),
    shippingAddress: String(o.shipping_address || ''),
    itemsJson: typeof o.items_json === 'string' ? o.items_json : JSON.stringify(o.items_json || []),
    subtotal: Number(o.subtotal_inr) || 0,
    discount: Number(o.discount_inr) || 0,
    deliveryFee: Number(o.shipping_inr) || 0,
    gstAmount: Number(o.gst_inr) || 0,
    total: Number(o.total_inr) || 0,
    couponCode: String(o.coupon_code || ''),
    paymentMethod,
    paymentStatus: String(o.payment_status || 'pending'),
    paymentReference: String(o.gateway_payment_id || ''),
    status,
    returnReason: String(o.return_reason || ''),
    createdAt: String(o.created_at || ''),
  };
}

export const AUTHORIZED_WEBSITE_PUBLISHING_PLANS = new Set([
  'free-start',
  'starter-website',
  'business-website',
  'ecommerce-website',
  'website-only',
  'website-plus-pwa',
  'custom-dev-enterprise',
]);

export const LEGACY_SAAS_ONLY_PLANS = new Set([
  'starter',
  'business',
  'ecommerce',
  'premium',
  'enterprise',
]);

export interface SubscriptionEntitlement {
  hasActiveSubscription: boolean;
  canPublish: boolean;
  planCode: string;
  planTier: PlanTier;
  pwaEnabled: boolean;
  enterpriseAiEnabled: boolean;
  maxWebsites: number;
  maxProducts: number;
  isFreeStart: boolean;
}

export type LifetimeEntitlementType = 'free_start' | 'one_time_purchase';

interface LifetimeEntitlementRow {
  id: number;
  website_id: string;
  owner_id: string;
  plan_code: string;
  entitlement_type: LifetimeEntitlementType;
  status: string;
  source: string;
  source_reference: string;
  max_websites?: number;
  max_products?: number;
}

interface EntitlementProvisionResult {
  ok: boolean;
  entitlementId?: number;
  error?: Response;
}

export interface ProvisionLifetimeEntitlementInput {
  websiteId: string;
  ownerId: string;
  planCode: string;
  entitlementType: LifetimeEntitlementType;
  source: string;
  sourceReference?: string;
  paymentId?: number | null;
}

export type QuotaCheckResult =
  | { ok: true; maxProducts: number }
  | { ok: false; error: Response };

function planTierFromPlanCode(code: string): PlanTier {
  if (code === FREE_START_PLAN_CODE) return FREE_START_TIER;
  if (code === 'custom-dev-enterprise' || code === 'enterprise' || code.includes('enterprise')) return 'enterprise_ai';
  if (code === 'website-plus-pwa' || code.includes('pwa')) return 'website_pwa';
  if (code === 'ecommerce-website' || code === 'ecommerce') return 'ecommerce_website';
  if (code === 'starter-website') return 'starter_website';
  return 'website_only';
}

function entitlementFromPlanCode(
  rawCode: string,
  maxWebsites: number,
  maxProducts: number
): SubscriptionEntitlement {
  const code = String(rawCode || '').toLowerCase();
  const isEnterprise = code === 'custom-dev-enterprise' || code === 'enterprise' || code.includes('enterprise');
  const isPwa = code === 'website-plus-pwa' || code.includes('pwa');
  const isFreeStart = code === FREE_START_PLAN_CODE;

  return {
    hasActiveSubscription: true,
    // Legacy SaaS plans never grant website publishing; authorized website packages do.
    canPublish: AUTHORIZED_WEBSITE_PUBLISHING_PLANS.has(code) || isEnterprise,
    planCode: code,
    planTier: planTierFromPlanCode(code),
    pwaEnabled: isPwa || isEnterprise,
    enterpriseAiEnabled: isEnterprise,
    maxWebsites,
    maxProducts,
    isFreeStart,
  };
}

async function findLifetimeEntitlement(
  env: CloudflareEnv,
  websiteId: string,
  ownerId: string
): Promise<LifetimeEntitlementRow | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT le.id, le.website_id, le.owner_id, le.plan_code, le.entitlement_type,
            le.status, le.source, le.source_reference, sp.max_websites, sp.max_products
     FROM tenant_lifetime_entitlements le
     LEFT JOIN subscription_plans sp ON sp.code = le.plan_code
     WHERE le.website_id = ? AND le.owner_id = ? AND le.status = 'active'
     ORDER BY le.id DESC LIMIT 1`
  )
    .bind(websiteId, ownerId)
    .first<LifetimeEntitlementRow>();
}

async function findOwnerFreeStart(
  env: CloudflareEnv,
  ownerId: string
): Promise<LifetimeEntitlementRow | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT id, website_id, owner_id, plan_code, entitlement_type, status, source, source_reference
     FROM tenant_lifetime_entitlements
     WHERE owner_id = ? AND entitlement_type = 'free_start'
     ORDER BY id DESC LIMIT 1`
  )
    .bind(ownerId)
    .first<LifetimeEntitlementRow>();
}

async function findActiveLifetimePurchase(
  env: CloudflareEnv,
  websiteId: string,
  ownerId: string,
  planCode: string
): Promise<LifetimeEntitlementRow | null> {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT id, website_id, owner_id, plan_code, entitlement_type, status, source, source_reference
     FROM tenant_lifetime_entitlements
     WHERE website_id = ? AND owner_id = ? AND plan_code = ?
       AND entitlement_type = 'one_time_purchase' AND status = 'active'
     ORDER BY id DESC LIMIT 1`
  )
    .bind(websiteId, ownerId, planCode)
    .first<LifetimeEntitlementRow>();
}

export async function linkPaymentToEntitlement(
  env: CloudflareEnv,
  paymentId: number,
  entitlementId: number
): Promise<void> {
  if (!env.DB || !paymentId || !entitlementId) return;
  await env.DB.prepare(
    `INSERT INTO platform_payment_entitlements (payment_id, entitlement_id)
     VALUES (?, ?)
     ON CONFLICT(payment_id) DO UPDATE SET entitlement_id = excluded.entitlement_id`
  )
    .bind(paymentId, entitlementId)
    .run();
}

export async function getPaymentEntitlementId(
  env: CloudflareEnv,
  paymentId: number
): Promise<number | null> {
  if (!env.DB || !paymentId) return null;
  const row = await env.DB.prepare(
    'SELECT entitlement_id FROM platform_payment_entitlements WHERE payment_id = ? LIMIT 1'
  )
    .bind(paymentId)
    .first<{ entitlement_id: number }>();
  return row ? Number(row.entitlement_id) || null : null;
}

export async function revokePaymentEntitlement(
  env: CloudflareEnv,
  paymentId: number
): Promise<void> {
  const entitlementId = await getPaymentEntitlementId(env, paymentId);
  if (!env.DB || !entitlementId) return;
  await env.DB.prepare(
    `UPDATE tenant_lifetime_entitlements
     SET status = 'revoked', updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(entitlementId)
    .run();
}

export async function provisionLifetimeEntitlement(
  env: CloudflareEnv,
  input: ProvisionLifetimeEntitlementInput
): Promise<EntitlementProvisionResult> {
  if (!env.DB) {
    return {
      ok: false,
      error: errorJson('Database unavailable. Please retry.', 503, { code: 'DB_UNAVAILABLE' }),
    };
  }

  const planCode = String(input.planCode || '').toLowerCase();
  const source = String(input.source || 'manual').slice(0, 60);

  try {
    const plan = await env.DB.prepare('SELECT code FROM subscription_plans WHERE code = ? LIMIT 1')
      .bind(planCode)
      .first<{ code: string }>();
    if (!plan) {
      return {
        ok: false,
        error: errorJson(`Plan "${planCode}" is not available.`, 409, { code: 'PLAN_NOT_FOUND' }),
      };
    }

    if (input.entitlementType === 'free_start') {
      const existing = await findOwnerFreeStart(env, input.ownerId);
      if (existing) {
        if (existing.website_id === input.websiteId) {
          if (input.paymentId) await linkPaymentToEntitlement(env, input.paymentId, existing.id);
          return { ok: true, entitlementId: existing.id };
        }
        return {
          ok: false,
          error: errorJson('Only one Free Start website is allowed per account.', 409, {
            code: 'FREE_START_LIMIT',
          }),
        };
      }
    } else {
      const existing = await findActiveLifetimePurchase(env, input.websiteId, input.ownerId, planCode);
      if (existing) {
        if (input.paymentId) await linkPaymentToEntitlement(env, input.paymentId, existing.id);
        return { ok: true, entitlementId: existing.id };
      }
    }

    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_lifetime_entitlements
        (website_id, owner_id, plan_code, entitlement_type, status, source, source_reference, acquired_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now'), datetime('now'))`
    )
      .bind(
        input.websiteId,
        input.ownerId,
        planCode,
        input.entitlementType,
        source,
        String(input.sourceReference || '').slice(0, 160)
      )
      .run();

    let entitlementId = Number(result?.meta?.last_row_id || 0) || null;
    if (!entitlementId) {
      const existing =
        input.entitlementType === 'free_start'
          ? await findOwnerFreeStart(env, input.ownerId)
          : await findActiveLifetimePurchase(env, input.websiteId, input.ownerId, planCode);
      entitlementId = existing ? Number(existing.id) : null;
    }

    if (!entitlementId) {
      return {
        ok: false,
        error: errorJson(
          input.entitlementType === 'free_start'
            ? 'Only one Free Start website is allowed per account.'
            : 'Lifetime entitlement could not be provisioned.',
          409,
          { code: input.entitlementType === 'free_start' ? 'FREE_START_LIMIT' : 'ENTITLEMENT_CONFLICT' }
        ),
      };
    }

    if (input.paymentId) await linkPaymentToEntitlement(env, input.paymentId, entitlementId);
    return { ok: true, entitlementId };
  } catch (err) {
    console.error('Lifetime entitlement provisioning failed:', err);
    return {
      ok: false,
      error: errorJson('Unable to provision entitlement. Please retry.', 500, {
        code: 'ENTITLEMENT_PROVISIONING_FAILED',
      }),
    };
  }
}

export async function assertProductQuota(
  env: CloudflareEnv,
  websiteId: string,
  ownerId: string,
  isSuperAdmin = false,
  additional = 1
): Promise<QuotaCheckResult> {
  if (isSuperAdmin) return { ok: true, maxProducts: 100000 };
  if (!env.DB) {
    return {
      ok: false,
      error: errorJson('Database unavailable. Please retry.', 503, { code: 'DB_UNAVAILABLE' }),
    };
  }

  try {
    const entitlement = await checkTenantSubscriptionEntitlement(env, websiteId, ownerId, false);
    let maxProducts = entitlement.hasActiveSubscription ? entitlement.maxProducts : 50;

    if (!entitlement.hasActiveSubscription) {
      // Drafts are editable before purchase, but a draft explicitly selected as
      // Free Start still obeys the free catalog limit.
      const pub = await env.DB.prepare(
        'SELECT website_json FROM customer_website_publications WHERE website_id = ? LIMIT 1'
      )
        .bind(websiteId)
        .first<{ website_json: string }>();
      if (pub?.website_json) {
        try {
          const parsed = JSON.parse(pub.website_json);
          if (parsed.planTier === FREE_START_TIER || parsed.planCode === FREE_START_PLAN_CODE) {
            maxProducts = 15;
          }
        } catch {}
      }
    }

    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM store_products WHERE website_id = ?'
    )
      .bind(websiteId)
      .first<{ count: number }>();
    const current = Number(countRow?.count || 0);

    if (current + additional > maxProducts) {
      return {
        ok: false,
        error: errorJson(`This plan allows up to ${maxProducts} products.`, 403, {
          code: 'PRODUCT_LIMIT',
          limit: maxProducts,
          current,
        }),
      };
    }

    return { ok: true, maxProducts };
  } catch (err) {
    console.error('Product quota check failed:', err);
    return {
      ok: false,
      error: errorJson('Unable to verify product quota. Please retry.', 500, {
        code: 'QUOTA_CHECK_FAILED',
      }),
    };
  }
}

export async function checkTenantSubscriptionEntitlement(
  env: CloudflareEnv,
  websiteId: string,
  ownerId: string,
  isSuperAdmin = false
): Promise<SubscriptionEntitlement> {
  if (isSuperAdmin) {
    return {
      hasActiveSubscription: true,
      canPublish: true,
      planCode: 'custom-dev-enterprise',
      planTier: 'enterprise_ai',
      pwaEnabled: true,
      enterpriseAiEnabled: true,
      maxWebsites: 25,
      maxProducts: 100000,
      isFreeStart: false,
    };
  }

  if (!env.DB) {
    return {
      hasActiveSubscription: false,
      canPublish: false,
      planCode: 'starter-website',
      planTier: 'website_only',
      pwaEnabled: false,
      enterpriseAiEnabled: false,
      maxWebsites: 1,
      maxProducts: 50,
      isFreeStart: false,
    };
  }

  // 1. Explicit lifetime entitlements (Free Start / one-time website purchases)
  try {
    const lifetime = await findLifetimeEntitlement(env, websiteId, ownerId);
    if (lifetime) {
      const code = String(lifetime.plan_code || '').toLowerCase();
      return entitlementFromPlanCode(
        code,
        Number(lifetime.max_websites || 1),
        Number(lifetime.max_products || (code === FREE_START_PLAN_CODE ? 15 : 500))
      );
    }
  } catch (err) {
    console.error('Lifetime entitlement lookup failed:', err);
  }

  // 2. Active recurring subscriptions. Period end is always a real timestamp.
  try {
    const sub = await env.DB.prepare(
      `SELECT ts.plan_code, ts.status, ts.current_period_end, sp.max_websites, sp.max_products
       FROM tenant_subscriptions ts
       LEFT JOIN subscription_plans sp ON sp.code = ts.plan_code
       WHERE (ts.website_id = ? OR ts.owner_id = ?)
         -- Self-service trial subscriptions do not grant live publishing.
         -- Trial users may edit/save/preview drafts; verified paid or
         -- Super Admin activated subscriptions use status = 'active'.
         AND ts.status = 'active'
         AND ts.current_period_end > datetime('now')
       ORDER BY ts.id DESC LIMIT 1`
    )
      .bind(websiteId, ownerId)
      .first<{
        plan_code: string;
        status: string;
        current_period_end: string;
        max_websites?: number;
        max_products?: number;
      }>();

    if (sub) {
      const code = String(sub.plan_code || '').toLowerCase();
      return entitlementFromPlanCode(
        code,
        Number(sub.max_websites || 1),
        Number(sub.max_products || 500)
      );
    }
  } catch (err) {
    console.error('Subscription entitlement lookup failed:', err);
  }

  // 3. Verified paid platform payment fallback for provisioning races.
  // Free Start is never a payment and must not be inferred from a payment row.
  try {
    const payment = await env.DB.prepare(
      `SELECT plan_code FROM platform_payments
       WHERE (website_id = ? OR owner_id = ?)
         AND status = 'paid' AND signature_verified = 1
         AND purpose IN ('platform_subscription', 'website_purchase')
         AND plan_code <> ?
       ORDER BY id DESC LIMIT 1`
    )
      .bind(websiteId, ownerId, FREE_START_PLAN_CODE)
      .first<{ plan_code: string }>();

    if (payment) {
      const code = String(payment.plan_code || '').toLowerCase();
      return entitlementFromPlanCode(code, 1, 500);
    }
  } catch (err) {
    console.error('Platform payment entitlement lookup failed:', err);
  }

  return {
    hasActiveSubscription: false,
    canPublish: false,
    planCode: 'business-website',
    planTier: 'website_only',
    pwaEnabled: false,
    enterpriseAiEnabled: false,
    maxWebsites: 1,
    maxProducts: 50,
    isFreeStart: false,
  };
}
