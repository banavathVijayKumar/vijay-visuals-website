// TEMPORARY Preview-only read-only diagnostic. Removed after investigation.
import { createClient } from '@supabase/supabase-js';
import { PagesContext, jsonResponse } from '../_shared';
import { createSupabaseAdminClient, getSupabaseAdminConfig } from './_supabaseAdmin';

const DIAG_TOKEN = '6bc9213454084f4e87c1707cee31163e';

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

  const adminConfig = getSupabaseAdminConfig(env);
  if (!adminConfig) {
    return jsonResponse({ ok: false, reason: 'ADMIN_MISSING' }, 200);
  }

  const admin = createSupabaseAdminClient(adminConfig);
  let match: DiagnosticUser | null = null;
  for (let page = 1; page <= 10 && !match; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return jsonResponse({ ok: false, reason: 'ADMIN_LIST_FAILED' }, 200);
    const users = (data?.users || []) as DiagnosticUser[];
    match = users.find((user) => String(user.email || '').toLowerCase() === email) || null;
    if (users.length < 200) break;
  }

  let profileExists = false;
  if (match) {
    const client = createClient(adminConfig.url, adminConfig.key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('id', match.id)
      .maybeSingle();
    profileExists = !error && Boolean(data?.id);
  }

  let d1UserExists = false;
  if (env.DB) {
    const row = await env.DB.prepare(
      'SELECT 1 AS ok FROM vv_users WHERE LOWER(email) = LOWER(?) LIMIT 1'
    )
      .bind(email)
      .first();
    d1UserExists = Boolean(row);
  }

  return jsonResponse(
    {
      ok: true,
      projectRef: new URL(adminConfig.url).hostname.split('.')[0],
      authUserExists: Boolean(match),
      emailConfirmed: Boolean(match?.email_confirmed_at),
      profileExists,
      d1UserExists,
      registrationComplete: Boolean(match && match.email_confirmed_at && profileExists && d1UserExists),
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}