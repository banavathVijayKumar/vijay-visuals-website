// ============================================================================
// GET & POST /api/platform/onboarding
// Customer onboarding wizard, business profile, branches, coordinates,
// GST/working hours, handover checklist, and full JSON data export + SHA-256.
// ============================================================================

import { requireUser, requireWebsiteAccess } from '../_auth';
import {
  PagesContext,
  errorJson,
  isValidSlug,
  json,
  parseJsonBody,
  sanitizeText,
  sha256Hex,
  toSlug,
} from '../_shared';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const url = new URL(request.url);
  const websiteId = sanitizeText(url.searchParams.get('websiteId') || '', 120);
  const exportMode = (url.searchParams.get('export') || '').toLowerCase();

  const templatesRes = await env.DB.prepare(
    'SELECT * FROM website_templates WHERE is_active = 1 ORDER BY name ASC'
  ).all();

  if (!websiteId) {
    const sitesRes = await env.DB.prepare(
      `SELECT website_id, public_slug, business_name, status, published_at, updated_at
       FROM customer_website_publications
       WHERE owner_id = ? OR owner_id = ?
       ORDER BY updated_at DESC`
    )
      .bind(auth.user.id, auth.user.authSubject)
      .all();

    return json({
      websites: sitesRes.results || [],
      templates: templatesRes.results || [],
    });
  }

  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
    'business_staff',
  ]);
  if (!access.ok) return access.response;

  const profile = await env.DB.prepare('SELECT * FROM business_profiles WHERE website_id = ? LIMIT 1')
    .bind(websiteId)
    .first<Record<string, unknown>>();

  if (exportMode === 'json') {
    if (access.effectiveRole !== 'business_owner' && access.effectiveRole !== 'super_admin') {
      return errorJson('Only the Business Owner or Super Admin can export complete business data.', 403);
    }

    const [domains, products, orders, crm, ledger, media] = await Promise.all([
      env.DB.prepare('SELECT * FROM tenant_domains WHERE website_id = ?').bind(websiteId).all(),
      env.DB.prepare('SELECT * FROM store_products WHERE website_id = ?').bind(websiteId).all(),
      env.DB.prepare('SELECT * FROM store_orders WHERE website_id = ?').bind(websiteId).all(),
      env.DB.prepare('SELECT * FROM crm_contacts_leads WHERE website_id = ?').bind(websiteId).all(),
      env.DB.prepare('SELECT * FROM finance_ledger WHERE website_id = ?').bind(websiteId).all(),
      env.DB.prepare('SELECT * FROM media_assets WHERE website_id = ?').bind(websiteId).all(),
    ]);

    const bundle = {
      exportedAt: new Date().toISOString(),
      platform: 'Vijay Visuals',
      website: access.website,
      profile: profile || null,
      domains: domains.results || [],
      products: products.results || [],
      orders: orders.results || [],
      crmContacts: crm.results || [],
      financeLedger: ledger.results || [],
      mediaAssets: media.results || [],
    };
    const serialized = JSON.stringify(bundle);
    const checksum = await sha256Hex(serialized);

    await env.DB.prepare(
      `INSERT INTO backup_audit_records (scope, website_id, initiated_by, status, checksum_sha256, notes, created_at)
       VALUES ('tenant_json_export', ?, ?, 'verified', ?, 'Owner requested full business portability JSON export', datetime('now'))`
    )
      .bind(websiteId, auth.user.id, checksum)
      .run();

    return json({ checksumSha256: checksum, export: bundle });
  }

  return json({
    website: access.website,
    profile: profile || null,
    templates: templatesRes.results || [],
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const body = await parseJsonBody<{
    websiteId?: string;
    businessName?: string;
    publicSlug?: string;
    category?: string;
    description?: string;
    phone?: string;
    whatsappNumber?: string;
    email?: string;
    gstNumber?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number | null;
    longitude?: number | null;
    branches?: unknown[];
    workingHours?: Record<string, unknown>;
    socialLinks?: Record<string, unknown>;
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string;
    onboardingStep?: number;
    onboardingCompleted?: boolean;
    handoverChecklist?: Record<string, boolean>;
  }>(request);

  if (!body || !body.websiteId) {
    return errorJson('websiteId is required.', 400);
  }

  const websiteId = sanitizeText(body.websiteId, 120);
  const access = await requireWebsiteAccess(env, auth.user, websiteId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  const businessName = sanitizeText(body.businessName || access.website.business_name, 140);
  if (businessName.length < 2) {
    return errorJson('Business name must be at least 2 characters.', 400);
  }

  // Optional slug validation and update preserving strict slug rules
  if (body.publicSlug !== undefined) {
    const normalizedSlug = toSlug(body.publicSlug);
    if (!isValidSlug(normalizedSlug)) {
      return errorJson(
        'Invalid website slug. Use only lowercase letters (a-z), numbers (0-9), and single hyphens without leading/trailing hyphens.',
        400,
        { suggestedSlug: toSlug(businessName) }
      );
    }
    const conflict = await env.DB.prepare(
      'SELECT website_id FROM customer_website_publications WHERE public_slug = ? AND website_id != ? LIMIT 1'
    )
      .bind(normalizedSlug, websiteId)
      .first();
    if (conflict) {
      return errorJson(`The slug "${normalizedSlug}" is already taken. Choose another slug.`, 409);
    }
    await env.DB.prepare(
      `UPDATE customer_website_publications SET public_slug = ?, business_name = ?, updated_at = datetime('now') WHERE website_id = ?`
    )
      .bind(normalizedSlug, businessName, websiteId)
      .run();
  }

  const lat =
    body.latitude !== undefined && body.latitude !== null && Number.isFinite(Number(body.latitude))
      ? Number(body.latitude)
      : null;
  const lng =
    body.longitude !== undefined && body.longitude !== null && Number.isFinite(Number(body.longitude))
      ? Number(body.longitude)
      : null;

  if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) {
    return errorJson('Latitude must be between -90 and 90 and longitude between -180 and 180.', 400);
  }

  await env.DB.prepare(
    `INSERT INTO business_profiles
      (website_id, owner_id, business_name, category, description, phone, whatsapp_number, email,
       gst_number, address_line, city, state, pincode, latitude, longitude, branches_json,
       working_hours_json, social_links_json, seo_title, seo_description, seo_keywords,
       onboarding_step, onboarding_completed, handover_checklist_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(website_id) DO UPDATE SET
       business_name = excluded.business_name,
       category = excluded.category,
       description = excluded.description,
       phone = excluded.phone,
       whatsapp_number = excluded.whatsapp_number,
       email = excluded.email,
       gst_number = excluded.gst_number,
       address_line = excluded.address_line,
       city = excluded.city,
       state = excluded.state,
       pincode = excluded.pincode,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       branches_json = excluded.branches_json,
       working_hours_json = excluded.working_hours_json,
       social_links_json = excluded.social_links_json,
       seo_title = excluded.seo_title,
       seo_description = excluded.seo_description,
       seo_keywords = excluded.seo_keywords,
       onboarding_step = excluded.onboarding_step,
       onboarding_completed = excluded.onboarding_completed,
       handover_checklist_json = excluded.handover_checklist_json,
       updated_at = datetime('now')`
  )
    .bind(
      websiteId,
      access.website.owner_id,
      businessName,
      sanitizeText(body.category || 'general', 60),
      sanitizeText(body.description || '', 2000),
      sanitizeText(body.phone || '', 30),
      sanitizeText(body.whatsappNumber || '', 30),
      sanitizeText(body.email || '', 120),
      sanitizeText(body.gstNumber || '', 20).toUpperCase(),
      sanitizeText(body.addressLine || '', 250),
      sanitizeText(body.city || '', 80),
      sanitizeText(body.state || '', 80),
      sanitizeText(body.pincode || '', 12),
      lat,
      lng,
      JSON.stringify(Array.isArray(body.branches) ? body.branches.slice(0, 25) : []),
      JSON.stringify(body.workingHours || {}),
      JSON.stringify(body.socialLinks || {}),
      sanitizeText(body.seoTitle || '', 120),
      sanitizeText(body.seoDescription || '', 240),
      sanitizeText(body.seoKeywords || '', 240),
      Math.max(1, Math.min(10, Number(body.onboardingStep || 1))),
      body.onboardingCompleted ? 1 : 0,
      JSON.stringify(
        body.handoverChecklist || {
          account_verified: false,
          domain_configured: false,
          payments_tested: false,
          data_export_tested: false,
        }
      )
    )
    .run();

  const saved = await env.DB.prepare('SELECT * FROM business_profiles WHERE website_id = ? LIMIT 1')
    .bind(websiteId)
    .first();

  return json({ profile: saved, message: 'Business profile saved successfully.' });
}
