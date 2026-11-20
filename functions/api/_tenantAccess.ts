// ============================================================================
// VIJAY VISUALS — SHARED MULTI-TENANT ACCESS CONTROL, VALIDATION & MAPPERS
// Enforces strict backend tenant isolation, XSS-safe media validation,
// honest missing-table detection, and uniform D1 <-> UI record mapping.
// ============================================================================

import { AuthenticatedUser, TenantRole } from './_auth';
import { CloudflareEnv, errorJson } from './_shared';
import { PublicationRow, cleanString } from './_tenantMapper';

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
