// ============================================================================
// VIJAY VISUALS — PLATFORM OWNER IDENTITY (ADDITIVE, PREVIEW SAFE)
// The Owner role is authoritative in a singleton D1 table, not in vv_users and
// not in the customer-focused Supabase profiles role. This keeps Super Admin
// (vv_users.role='admin') and Customer (vv_users.role='customer') unchanged.
// ============================================================================

export const PLATFORM_OWNER_EMAIL = 'vk66278@gmail.com';
export const PLATFORM_OWNER_FULL_NAME = 'Vijay Kumar';
export const PLATFORM_OWNER_TITLE = 'Founder & Creative Director';
export const PLATFORM_OWNER_DASHBOARD_ROUTE = '/dashboards/platform-owner';

export interface PlatformOwnerRow {
  singleton_id: number;
  user_id: string;
  email: string;
  full_name: string;
  status: string;
}

/** Only the verified singleton row can authorize the platform Owner role. */
export function isAuthorizedPlatformOwnerRow(
  row: PlatformOwnerRow | null | undefined,
  authSubject: string,
  authEmail: string
): boolean {
  if (!row) return false;
  if (Number(row.singleton_id) !== 1) return false;
  if (String(row.status || '').trim().toLowerCase() !== 'active') return false;
  if (!authSubject || String(row.user_id || '') !== authSubject) return false;

  const expected = PLATFORM_OWNER_EMAIL.toLowerCase();
  return (
    String(row.email || '').trim().toLowerCase() === expected &&
    String(authEmail || '').trim().toLowerCase() === expected
  );
}

/**
 * Idempotent D1 statements shared by migration 0023 and the one-time,
 * token-gated Preview provisioning endpoint. No existing row is rewritten.
 */
export const PLATFORM_OWNER_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS platform_owner (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    user_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Founder & Creative Director',
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_owner_email ON platform_owner(LOWER(email))`,
] as const;
