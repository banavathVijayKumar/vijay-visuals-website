// ============================================================================
// PATCH /api/admin/users/:id/role — Super Admin user role change
// Ported from server.ts (Express) to Cloudflare Pages + D1 vv_users.
// The numeric id matches admin/overview.ts (rowid, then list-order fallback).
// ============================================================================

import { requireAdmin } from '../../../_auth';
import {
  PagesContext,
  errorJson,
  jsonResponse,
  parseJsonBody,
  writeAuditLog,
} from '../../../_shared';

const ALLOWED_ROLES = new Set([
  'super_admin',
  'business_owner',
  'staff',
  'delivery_partner',
  'customer',
]);

interface UserRow {
  d1_rowid?: number;
  id: string;
  auth_subject?: string;
  email: string;
  full_name?: string;
  role: string;
  status?: string;
  created_at?: string;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveUserById(
  env: PagesContext['env'],
  id: number
): Promise<UserRow | null> {
  try {
    const byRowId = await env.DB!.prepare(
      `SELECT rowid AS d1_rowid, id, auth_subject, email, full_name, role, status, created_at
       FROM vv_users WHERE rowid = ? LIMIT 1`
    )
      .bind(id)
      .first<UserRow>();
    if (byRowId) return byRowId;
  } catch {
    // Legacy schema may not expose auth_subject; try a narrower query.
    try {
      const narrow = await env.DB!.prepare(
        'SELECT rowid AS d1_rowid, id, email, full_name, role, status, created_at FROM vv_users WHERE rowid = ? LIMIT 1'
      )
        .bind(id)
        .first<UserRow>();
      if (narrow) return narrow;
    } catch {
      // Fall through to UI-order resolution.
    }
  }

  try {
    const byId = await env.DB!.prepare(
      'SELECT rowid AS d1_rowid, id, email, full_name, role, status, created_at FROM vv_users WHERE id = ? LIMIT 1'
    )
      .bind(String(id))
      .first<UserRow>();
    if (byId) return byId;
  } catch {
    // Fall through to UI-order resolution.
  }

  // admin/overview.ts exposes users with id = index + 1 from this exact ordering.
  const listed = await env.DB!.prepare(
    'SELECT rowid AS d1_rowid, id, email, full_name, role, status, created_at FROM vv_users ORDER BY created_at DESC LIMIT 200'
  ).all<UserRow>();
  return listed.results?.[id - 1] || null;
}

function mapUser(row: UserRow, id: number, role: string): Record<string, unknown> {
  return {
    id,
    uid: String(row.id || ''),
    email: String(row.email || ''),
    name: String(row.full_name || row.email || 'User'),
    phone: '',
    role,
    preferredLang: 'en',
    savedAddressesJson: '[]',
    createdAt: String(row.created_at || ''),
  };
}

export async function onRequestPatch(
  context: PagesContext<{ id: string }>
): Promise<Response> {
  const { request, env, params } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  if (!env.DB) return errorJson('Database binding is not configured.', 503);

  const id = parseId(params.id || '');
  const body = await parseJsonBody<{ role?: unknown }>(request);
  const role = String(body?.role || '');

  if (id === null || !ALLOWED_ROLES.has(role)) {
    return errorJson('Invalid role.', 400);
  }

  try {
    const existing = await resolveUserById(env, id);
    if (!existing) return errorJson('User not found.', 404);
    if (!existing.id) return errorJson('User not found.', 404);

    await env.DB.prepare(
      'UPDATE vv_users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?'
    )
      .bind(role, existing.id)
      .run();

    await writeAuditLog(env, {
      actorId: auth.user.id || auth.user.email,
      actorRole: auth.user.platformRole,
      action: 'USER_ROLE_CHANGED',
      targetType: 'vv_users',
      targetId: String(existing.id),
      details: { email: existing.email, role },
    });

    return jsonResponse({ user: mapUser(existing, id, role) });
  } catch {
    return errorJson('Failed to update user role.', 500);
  }
}
