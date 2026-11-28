// TEMPORARY Preview-only read-only Super Admin linkage diagnostic. Removed after inspection.
import { createClient } from '@supabase/supabase-js';
import { PagesContext, jsonResponse } from '../_shared';
import { createSupabaseAdminClient, getSupabaseAdminConfig } from './_supabaseAdmin';

const DIAG_TOKEN = 'a5848ee73e724749b15c0f93e4929753';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DiagnosticUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  created_at?: string | null;
}

interface ProfileView {
  exists: boolean;
  role: string | null;
  fullName: string | null;
  isActive: boolean | null;
}

const emptyProfile: ProfileView = { exists: false, role: null, fullName: null, isActive: null };

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (request.headers.get('X-Preview-Diagnostic') !== DIAG_TOKEN) {
    return jsonResponse({ ok: false }, 404);
  }

  const email = (request.headers.get('X-Diagnostic-Email') || '').trim().toLowerCase();
  const uid = (request.headers.get('X-Diagnostic-Uid') || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !UUID_RE.test(uid)) {
    return jsonResponse({ ok: false, reason: 'INVALID_INPUT' }, 400);
  }

  type SafeD1Row = {
    id: string;
    authProvider: string;
    authSubject: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };

  let d1Rows: SafeD1Row[] = [];
  let platformStaffByEmail = false;
  let platformStaffByUid = false;
  let tenantMembershipCountByEmail = 0;
  let tenantMembershipCountByUid = 0;

  if (env.DB) {
    const rows = await env.DB.prepare(
      `SELECT id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at
       FROM vv_users
       WHERE id = ? OR auth_subject = ? OR LOWER(email) = LOWER(?)
       ORDER BY CASE WHEN LOWER(email) = LOWER(?) THEN 0 ELSE 1 END
       LIMIT 10`
    )
      .bind(uid, uid, email, email)
      .all<{
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
    d1Rows = (rows.results || []).map((row) => ({
      id: row.id,
      authProvider: row.auth_provider,
      authSubject: row.auth_subject,
      email: String(row.email || '').toLowerCase(),
      fullName: row.full_name || '',
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const d1Id = d1Rows.find((row) => row.email === email)?.id || d1Rows[0]?.id || '';

    if (d1Id) {
      try {
        const staff = await env.DB.prepare(
          `SELECT 1 AS ok FROM platform_staff WHERE user_id = ? OR LOWER(email) = LOWER(?) LIMIT 1`
        ).bind(d1Id, email).first<{ ok: number }>();
        platformStaffByEmail = Boolean(staff);
      } catch {}

      try {
        const count = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = ? OR LOWER(email) = LOWER(?)`
        ).bind(d1Id, email).first<{ count: number }>();
        tenantMembershipCountByEmail = Number(count?.count || 0);
      } catch {}
    }

    try {
      const staff = await env.DB.prepare(
        'SELECT 1 AS ok FROM platform_staff WHERE user_id = ? LIMIT 1'
      ).bind(uid).first<{ ok: number }>();
      platformStaffByUid = Boolean(staff);
    } catch {}

    try {
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = ?'
      ).bind(uid).first<{ count: number }>();
      tenantMembershipCountByUid = Number(count?.count || 0);
    } catch {}
  }

  const adminConfig = getSupabaseAdminConfig(env);
  if (!adminConfig) {
    return jsonResponse(
      { ok: true, adminAvailable: false, d1Rows, d1MatchCount: d1Rows.length },
      200,
      { 'Cache-Control': 'no-store' }
    );
  }

  const admin = createSupabaseAdminClient(adminConfig);
  const allUsers: DiagnosticUser[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = (data?.users || []) as DiagnosticUser[];
    allUsers.push(...users);
    if (users.length < 200) break;
  }

  const authByEmail = allUsers.find((user) => String(user.email || '').toLowerCase() === email) || null;
  const authByUid = allUsers.find((user) => String(user.id || '') === uid) || null;

  const client = createClient(adminConfig.url, adminConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  async function readProfile(id: string): Promise<ProfileView> {
    if (!id) return emptyProfile;
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', id)
      .maybeSingle();
    if (error || !data?.id) return emptyProfile;
    return {
      exists: true,
      role: data.role ? String(data.role) : null,
      fullName: data.full_name ? String(data.full_name) : null,
      isActive: typeof data.is_active === 'boolean' ? data.is_active : Boolean(data.is_active),
    };
  }

  const d1ByEmail = d1Rows.find((row) => row.email === email) || null;
  const d1ByUid = d1Rows.find((row) => row.id === uid || row.authSubject === uid) || null;
  const profileByUid = await readProfile(uid);
  const profileByD1 = await readProfile(d1ByEmail?.authSubject || d1ByEmail?.id || '');
  const profileByAuthEmail = await readProfile(authByEmail?.id || '');

  return jsonResponse(
    {
      ok: true,
      projectRef: new URL(adminConfig.url).hostname.split('.')[0],
      requestedUid: uid,
      d1Rows,
      d1MatchCount: d1Rows.length,
      d1ByEmailExists: Boolean(d1ByEmail),
      d1ByUidExists: Boolean(d1ByUid),
      platformStaffByEmail,
      platformStaffByUid,
      tenantMembershipCountByEmail,
      tenantMembershipCountByUid,
      supabase: {
        authByEmailExists: Boolean(authByEmail),
        authByEmailId: authByEmail?.id || null,
        authByEmailConfirmed: Boolean(authByEmail?.email_confirmed_at),
        authByEmailCreatedAt: authByEmail?.created_at || null,
        authByUidExists: Boolean(authByUid),
        authByUidEmail: authByUid?.email ? String(authByUid.email).toLowerCase() : null,
        authByUidConfirmed: Boolean(authByUid?.email_confirmed_at),
        uidMatchesEmailIdentity: Boolean(authByEmail && authByEmail.id === uid),
      },
      profiles: {
        byRequestedUid: profileByUid,
        byD1Subject: profileByD1,
        byAuthEmailIdentity: profileByAuthEmail,
      },
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}