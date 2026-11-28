// TEMPORARY Preview-only read-only recovery diagnostic. Removed after inspection.
import { createClient } from '@supabase/supabase-js';
import { PagesContext, jsonResponse } from '../_shared';
import { createSupabaseAdminClient, getSupabaseAdminConfig } from './_supabaseAdmin';

const DIAG_TOKEN = '0cbd014e99ff4f68bea0e1f115fde98d';

interface DiagnosticUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (request.headers.get('X-Preview-Diagnostic') !== DIAG_TOKEN) {
    return jsonResponse({ ok: false }, 404);
  }

  const email = (request.headers.get('X-Diagnostic-Email') || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ ok: false, reason: 'INVALID_EMAIL' }, 400);
  }

  let d1: Record<string, unknown> | null = null;
  let platformStaff: Record<string, unknown> | null = null;
  let tenantMembershipCount = 0;

  if (env.DB) {
    const row = await env.DB.prepare(
      `SELECT id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at
       FROM vv_users WHERE LOWER(email) = LOWER(?) LIMIT 1`
    ).bind(email).first<{
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

    if (row) {
      d1 = {
        id: row.id,
        authProvider: row.auth_provider,
        authSubject: row.auth_subject,
        email: String(row.email || '').toLowerCase(),
        fullName: row.full_name || '',
        role: row.role,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      try {
        const staff = await env.DB.prepare(
          `SELECT staff_role, permissions_json, is_active, assigned_by
           FROM platform_staff WHERE user_id = ? OR LOWER(email) = LOWER(?) LIMIT 1`
        ).bind(row.id, email).first<{
          staff_role: string;
          permissions_json: string;
          is_active: number;
          assigned_by: string;
        }>();
        if (staff) {
          let permissionCount = 0;
          try {
            const parsed = JSON.parse(staff.permissions_json || '[]');
            if (Array.isArray(parsed)) permissionCount = parsed.length;
          } catch {}
          platformStaff = {
            staffRole: staff.staff_role,
            isActive: Number(staff.is_active) === 1,
            assignedBy: staff.assigned_by || '',
            permissionCount,
          };
        }
      } catch {}

      try {
        const memberships = await env.DB.prepare(
          `SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = ? OR LOWER(email) = LOWER(?)`
        ).bind(row.id, email).first<{ count: number }>();
        tenantMembershipCount = Number(memberships?.count || 0);
      } catch {}
    }
  }

  const adminConfig = getSupabaseAdminConfig(env);
  if (!adminConfig) {
    return jsonResponse({ ok: true, d1, platformStaff, tenantMembershipCount, adminAvailable: false }, 200, { 'Cache-Control': 'no-store' });
  }

  const admin = createSupabaseAdminClient(adminConfig);
  let match: DiagnosticUser | null = null;
  for (let page = 1; page <= 10 && !match; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = (data?.users || []) as DiagnosticUser[];
    match = users.find((user) => String(user.email || '').toLowerCase() === email) || null;
    if (users.length < 200) break;
  }

  let profile: { exists: boolean; role: string | null } = { exists: false, role: null };
  if (match) {
    const client = createClient(adminConfig.url, adminConfig.key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', match.id)
      .maybeSingle();
    if (!error && data?.id) profile = { exists: true, role: data.role ? String(data.role) : null };
  }

  return jsonResponse(
    {
      ok: true,
      projectRef: new URL(adminConfig.url).hostname.split('.')[0],
      d1,
      platformStaff,
      tenantMembershipCount,
      supabase: {
        authUserExists: Boolean(match),
        emailConfirmed: Boolean(match?.email_confirmed_at),
        profileExists: profile.exists,
        profileRole: profile.role,
      },
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}