// TEMPORARY Preview-only read-only Owner identity inspection. Removed after inspection.
import { createClient } from '@supabase/supabase-js';
import { PagesContext, jsonResponse } from './_shared';
import { createSupabaseAdminClient, getSupabaseAdminConfig } from './auth/_supabaseAdmin';

const DIAG_TOKEN = '8a3a34beff2d4577a14e2fe9f18e5965';
const OWNER_EMAIL = 'vk66278@gmail.com';

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (request.headers.get('X-Preview-Diagnostic') !== DIAG_TOKEN) {
    return jsonResponse({ ok: false }, 404);
  }

  let d1Rows: Array<Record<string, unknown>> = [];
  let roleCounts: Record<string, number> = {};
  let d1Totals: Record<string, number> = {};

  if (env.DB) {
    const found = await env.DB.prepare(
      `SELECT id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at
       FROM vv_users WHERE LOWER(email) = LOWER(?) LIMIT 5`
    ).bind(OWNER_EMAIL).all<{
      id: string;
      auth_provider: string;
      auth_subject: string;
      email: string;
      full_name: string | null;
      role: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>();
    d1Rows = (found.results || []).map((r) => ({
      id: r.id,
      authProvider: r.auth_provider,
      authSubject: r.auth_subject,
      email: String(r.email || '').toLowerCase(),
      fullName: r.full_name || '',
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    for (const [label, sql] of [
      ['vvUsers', 'SELECT COUNT(*) AS count FROM vv_users'],
      ['websites', 'SELECT COUNT(*) AS count FROM customer_website_publications'],
      ['publishedWebsites', "SELECT COUNT(*) AS count FROM customer_website_publications WHERE status = 'published'"],
      ['orders', 'SELECT COUNT(*) AS count FROM vv_orders'],
      ['subscriptions', 'SELECT COUNT(*) AS count FROM vv_subscriptions'],
      ['activeSubscriptions', "SELECT COUNT(*) AS count FROM vv_subscriptions WHERE status = 'active'"],
      ['platformStaff', 'SELECT COUNT(*) AS count FROM platform_staff'],
      ['tenantMemberships', 'SELECT COUNT(*) AS count FROM tenant_memberships'],
    ] as Array<[string, string]>) {
      try {
        const row = await env.DB.prepare(sql).first<{ count: number }>();
        d1Totals[label] = Number(row?.count || 0);
      } catch {
        d1Totals[label] = -1;
      }
    }

    try {
      const rows = await env.DB.prepare('SELECT role, COUNT(*) AS count FROM vv_users GROUP BY role').all<{
        role: string;
        count: number;
      }>();
      for (const row of rows.results || []) roleCounts[row.role] = Number(row.count || 0);
    } catch {}
  }

  const adminConfig = getSupabaseAdminConfig(env);
  if (!adminConfig) {
    return jsonResponse({ ok: true, adminAvailable: false, d1Rows, d1MatchCount: d1Rows.length, roleCounts, d1Totals }, 200, { 'Cache-Control': 'no-store' });
  }

  const admin = createSupabaseAdminClient(adminConfig);
  const users: Array<{ id: string; email?: string; email_confirmed_at?: string | null }> = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const list = (data?.users || []) as Array<{ id: string; email?: string; email_confirmed_at?: string | null }>;
    users.push(...list);
    if (list.length < 200) break;
  }
  const authMatches = users.filter((u) => String(u.email || '').toLowerCase() === OWNER_EMAIL);

  const client = createClient(adminConfig.url, adminConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  let ownerProfileCount = -1;
  try {
    const ownerProfiles = await client.from('profiles').select('id').eq('role', 'owner');
    if (!ownerProfiles.error) ownerProfileCount = ownerProfiles.data?.length || 0;
  } catch {}

  let profile: { exists: boolean; role: string | null; fullName: string | null; isActive: boolean | null } = {
    exists: false,
    role: null,
    fullName: null,
    isActive: null,
  };
  if (authMatches[0]?.id) {
    const p = await client.from('profiles').select('id, role, full_name, is_active').eq('id', authMatches[0].id).maybeSingle();
    if (!p.error && p.data?.id) {
      profile = {
        exists: true,
        role: p.data.role ? String(p.data.role) : null,
        fullName: p.data.full_name ? String(p.data.full_name) : null,
        isActive: typeof p.data.is_active === 'boolean' ? p.data.is_active : Boolean(p.data.is_active),
      };
    }
  }

  return jsonResponse(
    {
      ok: true,
      projectRef: new URL(adminConfig.url).hostname.split('.')[0],
      d1Rows,
      d1MatchCount: d1Rows.length,
      roleCounts,
      d1Totals,
      supabase: {
        authMatchCount: authMatches.length,
        authId: authMatches[0]?.id || null,
        emailConfirmed: Boolean(authMatches[0]?.email_confirmed_at),
      },
      profile,
      ownerProfileCount,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}