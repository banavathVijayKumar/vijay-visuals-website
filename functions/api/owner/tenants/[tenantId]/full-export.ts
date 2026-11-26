// ============================================================================
// GET /api/owner/tenants/:tenantId/full-export
// Complete tenant-isolated JSON data export (Products, Orders, Coupons, Settings, Versions)
// ============================================================================

import { requireUser } from '../../../_auth';
import { PagesContext, handleOptions, jsonResponse, writeAuditLog } from '../../../_shared';
import { requireTenantOwnerAccess, mapProductRowToUi, mapOrderRowToUi } from '../../../_tenantAccess';
import { mapPublicationToTenant } from '../../../_tenantMapper';
import { TenantDomainRow } from '../../../domains/_helpers';
import { deriveDomainFields } from './domains/index';

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(
  context: PagesContext<{ tenantId: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const access = await requireTenantOwnerAccess(env, auth.user, params.tenantId, [
    'business_owner',
    'business_manager',
  ]);
  if (!access.ok) return access.response;

  if (!env.DB) {
    return jsonResponse({ error: 'Database storage is not configured.' }, 503);
  }

  const websiteId = access.row.website_id;
  const tenantRowId = Number(access.row.rowid || 0);
  const tenant = mapPublicationToTenant(access.row, access.parsed);

  const products: any[] = [];
  const orders: any[] = [];
  const coupons: any[] = [];
  const versions: any[] = [];
  const crmLeads: any[] = [];
  const domains: any[] = [];
  const newsletterSubscribers: any[] = [];

  // D1 has no tenant_seo_settings table: tenant SEO config is persisted in
  // customer_website_publications.website_json by the existing /seo route.
  const p = access.parsed;
  const seoSettings = {
    canonicalUrl: p.canonicalUrl || '',
    robotsDirectives: p.robotsDirectives || 'index, follow',
    googleSiteVerification: p.googleSiteVerification || '',
    ga4MeasurementId: p.ga4MeasurementId || '',
    cityAreaKeywords: p.cityAreaKeywords || '',
    googleMapsUrl: p.googleMapsUrl || '',
    gbpProfileUrl: p.gbpProfileUrl || '',
    localBusinessType: p.localBusinessType || 'LocalBusiness',
    sectionOrderJson: JSON.stringify(
      Array.isArray(p.sectionOrder) && p.sectionOrder.length > 0
        ? p.sectionOrder
        : ['hero', 'catalog', 'gallery', 'booking', 'contact']
    ),
    customPagesJson: JSON.stringify(Array.isArray(p.customPages) ? p.customPages : []),
  };

  try {
    const prods = await env.DB.prepare('SELECT * FROM store_products WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const p of prods.results || []) {
      products.push(mapProductRowToUi(p, tenantRowId));
    }
  } catch {}

  try {
    const ords = await env.DB.prepare('SELECT * FROM store_orders WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const o of ords.results || []) {
      orders.push(mapOrderRowToUi(o, tenantRowId));
    }
  } catch {}

  try {
    const coups = await env.DB.prepare('SELECT * FROM store_coupons WHERE website_id = ? ORDER BY id ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const c of coups.results || []) {
      coupons.push(c);
    }
  } catch {}

  try {
    const vers = await env.DB.prepare('SELECT id, version_number, label, created_at FROM website_version_snapshots WHERE website_id = ? ORDER BY version_number ASC')
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const v of vers.results || []) {
      versions.push(v);
    }
  } catch {}

  try {
    const leads = await env.DB.prepare(
      `SELECT id, full_name, phone, email, source, stage, loyalty_points, marketing_consent, unsubscribed_at, created_at
       FROM crm_contacts_leads WHERE website_id = ? ORDER BY id ASC`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const lead of leads.results || []) {
      crmLeads.push({
        id: Number(lead.id),
        tenantId: tenantRowId,
        name: String(lead.full_name || ''),
        phone: String(lead.phone || ''),
        email: String(lead.email || ''),
        source: String(lead.source || 'website'),
        stage: String(lead.stage || 'new'),
        loyaltyPoints: Number(lead.loyalty_points || 0),
        marketingConsent: Boolean(lead.marketing_consent),
        unsubscribed: Boolean(lead.unsubscribed_at),
        createdAt: String(lead.created_at || ''),
      });
    }
  } catch {}

  try {
    const domainRows = await env.DB.prepare(
      'SELECT * FROM tenant_domains WHERE website_id = ? ORDER BY is_primary DESC, created_at DESC'
    )
      .bind(websiteId)
      .all<TenantDomainRow>();
    const checks = await env.DB.prepare(
      'SELECT * FROM domain_health_checks WHERE website_id = ? ORDER BY checked_at DESC LIMIT 100'
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    const healthRows = checks.results || [];
    for (const row of domainRows.results || []) {
      domains.push(
        deriveDomainFields(
          row,
          tenantRowId,
          env,
          healthRows.find((c) => Number(c.domain_id) === Number(row.id)) || null
        )
      );
    }
  } catch {}

  try {
    // Matches the existing /subscribers route: newsletter opt-ins live in
    // crm_contacts_leads with explicit, non-unsubscribed marketing consent.
    const subscribers = await env.DB.prepare(
      `SELECT id, full_name, email, source, marketing_consent, unsubscribed_at, created_at
       FROM crm_contacts_leads
       WHERE website_id = ? AND marketing_consent = 1 AND unsubscribed_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 500`
    )
      .bind(websiteId)
      .all<Record<string, any>>();
    for (const subscriber of subscribers.results || []) {
      const createdAt = String(subscriber.created_at || '');
      newsletterSubscribers.push({
        id: Number(subscriber.id),
        tenantId: tenantRowId,
        email: String(subscriber.email || ''),
        name: String(subscriber.full_name || ''),
        source: String(subscriber.source || 'newsletter'),
        consentGiven: Boolean(subscriber.marketing_consent) && !subscriber.unsubscribed_at,
        createdAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt)
          ? `${createdAt.replace(' ', 'T')}Z`
          : createdAt,
      });
    }
  } catch {}

  const exportPayload = {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    websiteId,
    publicSlug: access.row.public_slug,
    businessName: access.row.business_name,
    tenant,
    products,
    orders,
    coupons,
    versions,
    crmLeads,
    domains,
    seoSettings,
    newsletterSubscribers,
  };

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(exportPayload)));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const checksumSha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  await writeAuditLog(env, {
    actorId: auth.user.id,
    actorRole: access.effectiveRole,
    action: 'tenant_full_export_downloaded',
    targetType: 'website',
    targetId: websiteId,
    details: {
      websiteId,
      checksumSha256,
      productsCount: products.length,
      ordersCount: orders.length,
      crmLeadsCount: crmLeads.length,
      domainsCount: domains.length,
      newsletterSubscribersCount: newsletterSubscribers.length,
    },
  });

  return jsonResponse({
    ...exportPayload,
    checksumSha256,
  });
}
