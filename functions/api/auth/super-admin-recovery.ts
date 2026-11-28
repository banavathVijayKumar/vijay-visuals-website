// TEMPORARY Preview-only Super Admin recovery. Removed immediately after use.
// No email, OTP, password reset, Production binding, or D1 primary-key change.
import { createClient } from '@supabase/supabase-js';
import { PagesContext, jsonResponse } from '../_shared';
import { createSupabaseAdminClient, getSupabaseAdminConfig } from './_supabaseAdmin';

const RECOVERY_TOKEN = 'eac3c644865a482cab976f055262f022';
const EXPECTED_EMAIL = 'kalyanibanavath6@gmail.com';
const EXPECTED_UID = 'ebc3f6e2-7b60-4834-b1f6-f75f7f1d4145';
const EXPECTED_D1_ID = '552fe6da-1688-4e8e-aa07-13d9a6857966';
const EXPECTED_FULL_NAME = 'Kalyani Banavath';
const EXPECTED_ROLE = 'admin';
const EXPECTED_PREVIEW_REF = 'nflqxcrgwxoqvqbveisq';

interface DiagnosticUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}

interface D1Row {
  id: string;
  auth_provider: string;
  auth_subject: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function fail(reason: string, status: number = 200, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: false, reason, ...extra }, status, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  if (request.headers.get('X-Recovery-Token') !== RECOVERY_TOKEN) {
    return jsonResponse({ ok: false }, 404);
  }
  if (request.headers.get('X-Recovery-Confirm') !== 'APPLY') {
    return fail('CONFIRMATION_HEADER_REQUIRED', 400);
  }
  if (
    (request.headers.get('X-Recovery-Email') || '').trim().toLowerCase() !== EXPECTED_EMAIL ||
    (request.headers.get('X-Recovery-Uid') || '').trim() !== EXPECTED_UID
  ) {
    return fail('RECOVERY_TARGET_MISMATCH', 400);
  }

  const adminConfig = getSupabaseAdminConfig(env);
  if (!adminConfig) return fail('ADMIN_CREDENTIAL_MISSING');
  const projectRef = new URL(adminConfig.url).hostname.split('.')[0];
  if (projectRef !== EXPECTED_PREVIEW_REF) return fail('NOT_PREVIEW_PROJECT');

  if (!env.DB) return fail('D1_BINDING_MISSING');

  const admin = createSupabaseAdminClient(adminConfig);
  const allUsers: DiagnosticUser[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return fail('ADMIN_LIST_FAILED');
    const users = (data?.users || []) as DiagnosticUser[];
    allUsers.push(...users);
    if (users.length < 200) break;
  }

  const emailMatches = allUsers.filter(
    (user) => String(user.email || '').toLowerCase() === EXPECTED_EMAIL
  );
  const uidMatches = allUsers.filter((user) => String(user.id || '') === EXPECTED_UID);
  if (emailMatches.length !== 1 || uidMatches.length !== 1) return fail('AUTH_IDENTITY_NOT_UNIQUE');
  const authUser = emailMatches[0];
  if (authUser.id !== EXPECTED_UID) return fail('AUTH_UID_MISMATCH');
  if (!authUser.email_confirmed_at) return fail('AUTH_EMAIL_NOT_CONFIRMED');

  const dataClient = createClient(adminConfig.url, adminConfig.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const profileRead = await dataClient
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', EXPECTED_UID)
    .maybeSingle();
  if (profileRead.error || !profileRead.data?.id) return fail('PROFILE_MISSING');
  const profileBefore = {
    role: String(profileRead.data.role || ''),
    fullName: String(profileRead.data.full_name || ''),
    isActive: Boolean(profileRead.data.is_active),
  };
  if (profileBefore.role !== 'customer' && profileBefore.role !== EXPECTED_ROLE) {
    return fail('UNEXPECTED_PROFILE_ROLE');
  }

  const rows = await env.DB.prepare(
    `SELECT id, auth_provider, auth_subject, email, full_name, role, status, created_at, updated_at
     FROM vv_users WHERE id = ? OR auth_subject = ? OR LOWER(email) = LOWER(?)
     LIMIT 5`
  )
    .bind(EXPECTED_D1_ID, EXPECTED_UID, EXPECTED_EMAIL)
    .all<D1Row>();
  const d1Rows = rows.results || [];
  if (d1Rows.length !== 1) return fail('D1_ROW_NOT_UNIQUE', 200, { d1MatchCount: d1Rows.length });
  const d1 = d1Rows[0];
  if (
    d1.id !== EXPECTED_D1_ID ||
    String(d1.email || '').toLowerCase() !== EXPECTED_EMAIL ||
    String(d1.full_name || '') !== EXPECTED_FULL_NAME ||
    d1.role !== EXPECTED_ROLE ||
    d1.status !== 'active'
  ) {
    return fail('D1_ROLE_GUARD_FAILED');
  }
  if (d1.auth_subject !== EXPECTED_D1_ID && d1.auth_subject !== EXPECTED_UID) {
    return fail('D1_SUBJECT_UNEXPECTED');
  }
  const linkNeeded = d1.auth_subject !== EXPECTED_UID;

  let staffCount = 0;
  let membershipCount = 0;
  try {
    const staff = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM platform_staff WHERE user_id = ? OR LOWER(email) = LOWER(?)'
    ).bind(d1.id, EXPECTED_EMAIL).first<{ count: number }>();
    staffCount = Number(staff?.count || 0);
  } catch {}
  try {
    const memberships = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM tenant_memberships WHERE user_id = ? OR LOWER(email) = LOWER(?)'
    ).bind(d1.id, EXPECTED_EMAIL).first<{ count: number }>();
    membershipCount = Number(memberships?.count || 0);
  } catch {}

  const profileNeedsFix =
    profileBefore.role !== EXPECTED_ROLE ||
    profileBefore.fullName !== EXPECTED_FULL_NAME ||
    !profileBefore.isActive;

  let profileChanged = false;
  if (profileNeedsFix) {
    const updated = await dataClient
      .from('profiles')
      .update({ role: EXPECTED_ROLE, full_name: EXPECTED_FULL_NAME, is_active: true })
      .eq('id', EXPECTED_UID);
    if (updated.error) return fail('PROFILE_UPDATE_FAILED');
    profileChanged = true;
  }

  let d1Changed = false;
  if (linkNeeded) {
    const linked = await env.DB.prepare(
      `UPDATE vv_users
       SET auth_subject = ?, updated_at = datetime('now')
       WHERE id = ? AND auth_subject = ? AND LOWER(email) = LOWER(?)
         AND role = ? AND status = 'active'`
    )
      .bind(EXPECTED_UID, EXPECTED_D1_ID, EXPECTED_D1_ID, EXPECTED_EMAIL, EXPECTED_ROLE)
      .run();
    if (!linked.meta?.changes) return fail('D1_LINK_CONDITION_FAILED', 200, { profileChanged });
    d1Changed = true;
  }

  const verifyProfile = await dataClient
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', EXPECTED_UID)
    .maybeSingle();
  const verifyD1 = await env.DB.prepare(
    `SELECT id, auth_subject, email, full_name, role, status
     FROM vv_users WHERE id = ? LIMIT 1`
  )
    .bind(EXPECTED_D1_ID)
    .first<D1Row>();

  const verified =
    !verifyProfile.error &&
    Boolean(verifyProfile.data?.id) &&
    String(verifyProfile.data?.role || '') === EXPECTED_ROLE &&
    String(verifyProfile.data?.full_name || '') === EXPECTED_FULL_NAME &&
    Boolean(verifyProfile.data?.is_active) &&
    Boolean(verifyD1) &&
    verifyD1?.auth_subject === EXPECTED_UID &&
    verifyD1?.id === EXPECTED_D1_ID &&
    verifyD1?.role === EXPECTED_ROLE &&
    verifyD1?.status === 'active' &&
    String(verifyD1?.full_name || '') === EXPECTED_FULL_NAME;

  if (!verified) return fail('POST_REPAIR_VERIFICATION_FAILED', 200, { profileChanged, d1Changed });

  return jsonResponse(
    {
      ok: true,
      projectRef,
      profileChanged,
      d1Changed,
      profileRole: EXPECTED_ROLE,
      d1Role: verifyD1?.role || '',
      d1Status: verifyD1?.status || '',
      d1IdUnchanged: verifyD1?.id === EXPECTED_D1_ID,
      d1AuthSubject: verifyD1?.auth_subject || '',
      staffCount,
      membershipCount,
      noDowngrade: true,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}