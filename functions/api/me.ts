// ============================================================================
// GET & PATCH /api/me — Supabase Auth + Cloudflare D1 Authenticated User Profile
// Returns real D1 rowid-backed ownedTenants (strictly scoped to the user) and
// supports real profile/address updates persisted in Cloudflare D1.
// ============================================================================

import { requireUser } from './_auth';
import {
  PagesContext,
  handleOptions,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
} from './_shared';
import { PublicationRow, mapPublicationToTenant } from './_tenantMapper';

function mapRoleToUi(
  role: string,
  hasOwnedTenants: boolean = false
): 'super_admin' | 'business_owner' | 'staff' | 'delivery_partner' | 'customer' {
  const r = (role || 'customer').toLowerCase();
  if (r === 'super_admin' || r === 'admin') return 'super_admin';
  if (
    r === 'shop_owner' ||
    r === 'business_owner' ||
    r === 'business_manager' ||
    hasOwnedTenants
  ) {
    return 'business_owner';
  }
  if (r === 'delivery_boy' || r === 'delivery_partner') return 'delivery_partner';
  if (
    r === 'support_agent' ||
    r === 'staff' ||
    r === 'business_staff' ||
    r === 'platform_staff'
  ) {
    return 'staff';
  }
  return 'customer';
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const ownedTenants: Array<Record<string, unknown>> = [];
  const deliveryProfiles: Array<Record<string, unknown>> = [];
  let savedAddresses: string[] = [];
  let savedPhone = '';

  if (env.DB) {
    // Load authorized websites: Super Admins see all active publications to manage & verify any tenant;
    // Business Owners & Staff see their owned or assigned tenants.
    try {
      let rows: PublicationRow[] = [];
      try {
        if (auth.user.isSuperAdmin) {
          const pubs = await env.DB.prepare(
            `SELECT rowid, website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
             FROM customer_website_publications
             ORDER BY updated_at DESC LIMIT 50`
          ).all<PublicationRow>();
          rows = pubs.results || [];
        } else {
          try {
            const pubs = await env.DB.prepare(
              `SELECT rowid, website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
               FROM customer_website_publications
               WHERE owner_id = ? OR owner_id = ? OR owner_id = ?
                  OR website_id IN (
                    SELECT website_id FROM tenant_memberships
                    WHERE (user_id = ? OR user_id = ? OR email = ?) AND status = 'active'
                  )
               ORDER BY updated_at DESC LIMIT 50`
            )
              .bind(
                auth.user.id,
                auth.user.authSubject,
                auth.user.email,
                auth.user.id,
                auth.user.authSubject,
                auth.user.email
              )
              .all<PublicationRow>();
            rows = pubs.results || [];
          } catch {
            const pubs = await env.DB.prepare(
              `SELECT rowid, website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
               FROM customer_website_publications
               WHERE owner_id = ? OR owner_id = ? OR owner_id = ?
               ORDER BY updated_at DESC LIMIT 50`
            )
              .bind(auth.user.id, auth.user.authSubject, auth.user.email)
              .all<PublicationRow>();
            rows = pubs.results || [];
          }
        }
      } catch {
        if (auth.user.isSuperAdmin) {
          const pubs = await env.DB.prepare(
            `SELECT website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
             FROM customer_website_publications
             ORDER BY updated_at DESC LIMIT 50`
          ).all<PublicationRow>();
          rows = pubs.results || [];
        } else {
          const pubs = await env.DB.prepare(
            `SELECT website_id, owner_id, business_name, public_slug, status, website_json, published_at, created_at, updated_at
             FROM customer_website_publications
             WHERE owner_id = ? OR owner_id = ? OR owner_id = ?
             ORDER BY updated_at DESC LIMIT 50`
          )
            .bind(auth.user.id, auth.user.authSubject, auth.user.email)
            .all<PublicationRow>();
          rows = pubs.results || [];
        }
      }

      for (const row of rows) {
        let parsed: Record<string, any> = {};
        try {
          const raw = row.website_json ? JSON.parse(row.website_json) : {};
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            parsed = raw;
          }
        } catch {}
        ownedTenants.push(
          mapPublicationToTenant(row, parsed) as unknown as Record<string, unknown>
        );
      }
    } catch {
      // Non-fatal if D1 table not yet seeded
    }

    // Load delivery partner profiles if user is assigned as delivery partner
    try {
      const delivRes = await env.DB.prepare(
        `SELECT tm.id, tm.website_id, tm.role, tm.status, cwp.business_name, cwp.public_slug
         FROM tenant_memberships tm
         LEFT JOIN customer_website_publications cwp ON tm.website_id = cwp.website_id
         WHERE tm.role = 'delivery_partner' AND tm.status = 'active'
           AND (tm.user_id = ? OR tm.user_id = ? OR tm.email = ?)
         LIMIT 10`
      )
        .bind(auth.user.id, auth.user.authSubject, auth.user.email)
        .all<{
          id: number;
          website_id: string;
          role: string;
          status: string;
          business_name: string | null;
          public_slug: string | null;
        }>();

      for (const d of delivRes.results || []) {
        deliveryProfiles.push({
          id: d.id,
          websiteId: d.website_id,
          businessName: d.business_name || d.public_slug || 'Storefront Delivery',
          slug: d.public_slug,
          status: d.status,
          role: d.role,
        });
      }
    } catch {
      // Optional table not yet migrated
    }

    // Load saved addresses & phone from optional customer_addresses table
    try {
      const addrRes = await env.DB.prepare(
        `SELECT address_line1, phone FROM customer_addresses
         WHERE user_id = ? OR user_id = ?
         ORDER BY is_default DESC, id DESC LIMIT 20`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .all<{ address_line1: string; phone: string }>();
      for (const a of addrRes.results || []) {
        if (a.address_line1) savedAddresses.push(a.address_line1);
        if (!savedPhone && a.phone) savedPhone = a.phone;
      }
    } catch {
      // Optional table may not be migrated yet
    }
  }

  return jsonResponse({
    user: {
      id: 1,
      uid: auth.user.id,
      email: auth.user.email,
      name: auth.user.fullName || auth.user.email.split('@')[0],
      phone: savedPhone,
      role: mapRoleToUi(auth.user.supabaseRole, ownedTenants.length > 0),
      supabaseRole: auth.user.supabaseRole,
      preferredLang: 'en',
      savedAddressesJson: JSON.stringify(savedAddresses),
    },
    ownedTenants,
    deliveryProfiles,
  });
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const auth = await requireUser(request, env);
  if (!auth.ok) return auth.response;

  const body = await parseJsonBody<{
    name?: string;
    phone?: string;
    email?: string;
    preferredLang?: string;
    savedAddressesJson?: string;
  }>(request);
  if (!body) {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  const nextName = sanitizeText(body.name, 120) || auth.user.fullName;
  const nextPhone = sanitizeText(body.phone, 30);
  const nextEmail = body.email && body.email.includes('@') ? sanitizeText(body.email, 120) : auth.user.email;
  const nextLang = ['en', 'te', 'hi'].includes(String(body.preferredLang || ''))
    ? String(body.preferredLang)
    : 'en';

  let parsedAddresses: string[] = [];
  if (typeof body.savedAddressesJson === 'string') {
    try {
      const arr = JSON.parse(body.savedAddressesJson);
      if (Array.isArray(arr)) {
        parsedAddresses = arr
          .map((item) => sanitizeText(item, 300))
          .filter(Boolean)
          .slice(0, 15);
      }
    } catch {
      return jsonResponse({ error: 'savedAddressesJson must be a valid JSON array.' }, 400);
    }
  }

  if (env.DB) {
    try {
      await env.DB.prepare(
        `UPDATE vv_users SET full_name = ?, email = COALESCE(?, email), updated_at = datetime('now') WHERE id = ? OR auth_subject = ?`
      )
        .bind(nextName, nextEmail || null, auth.user.id, auth.user.authSubject)
        .run();
    } catch {
      // Non-fatal if vv_users schema differs
    }

    if (typeof body.savedAddressesJson === 'string') {
      try {
        await env.DB.prepare(`DELETE FROM customer_addresses WHERE user_id = ?`)
          .bind(auth.user.id)
          .run();
        for (let i = 0; i < parsedAddresses.length; i++) {
          await env.DB.prepare(
            `INSERT INTO customer_addresses
             (user_id, label, recipient_name, phone, address_line1, city, state, pincode, is_default)
             VALUES (?, ?, ?, ?, ?, '', '', '', ?)`
          )
            .bind(
              auth.user.id,
              i === 0 ? 'Primary' : `Address ${i + 1}`,
              nextName,
              nextPhone,
              parsedAddresses[i],
              i === 0 ? 1 : 0
            )
            .run();
        }
      } catch {
        // Optional migration 0005 customer_addresses table may not be applied yet
      }
    }
  }

  let hasOwnedTenants = false;
  if (env.DB) {
    try {
      const pubCount = await env.DB.prepare(
        `SELECT count(rowid) as count FROM customer_website_publications WHERE owner_id = ? OR owner_id = ?`
      )
        .bind(auth.user.id, auth.user.authSubject)
        .first<{ count: number }>();
      hasOwnedTenants = Number(pubCount?.count || 0) > 0;
    } catch {}
  }

  return jsonResponse({
    user: {
      id: 1,
      uid: auth.user.id,
      email: nextEmail || auth.user.email,
      name: nextName,
      phone: nextPhone,
      role: mapRoleToUi(auth.user.supabaseRole, hasOwnedTenants),
      supabaseRole: auth.user.supabaseRole,
      preferredLang: nextLang,
      savedAddressesJson: JSON.stringify(parsedAddresses),
    },
  });
}
