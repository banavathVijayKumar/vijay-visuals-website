// ============================================================================
// SUPABASE PUBLIC ROLE LOCKDOWN — STATIC SQL SOURCE REGRESSIONS
// Reads the migration as text only. No SQL execution, no database connection,
// no Cloudflare access, no secrets, and no Production resource is touched.
// ============================================================================

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '0001_vijay_visuals_rls_and_auth.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

const PRIVILEGED_ROLES = [
  'shop_owner',
  'admin',
  'super_admin',
  'platform_staff',
  'business_manager',
  'business_staff',
  'delivery_boy',
  'delivery_partner',
] as const;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, evidence = ''): void {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${name}${evidence ? ` — ${evidence}` : ''}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}${evidence ? ` — ${evidence}` : ''}`);
  }
}

function extractFunction(functionName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}`);
  assert.ok(start >= 0, `Missing function: ${functionName}`);
  const dollarStart = sql.indexOf('$$', start);
  const dollarEnd = sql.indexOf('$$', dollarStart + 2);
  assert.ok(dollarStart >= 0 && dollarEnd > dollarStart, `Unterminated function body: ${functionName}`);
  return sql.slice(start, dollarEnd + 2);
}

function extractPolicy(policyName: string): string {
  const start = sql.indexOf(`CREATE POLICY "${policyName}"`);
  assert.ok(start >= 0, `Missing policy: ${policyName}`);
  const end = sql.indexOf(';', start);
  assert.ok(end > start, `Unterminated policy: ${policyName}`);
  return sql.slice(start, end + 1);
}

function getSignupRoleLiteral(signupFunction: string): string {
  const insertStart = signupFunction.indexOf('INSERT INTO public.profiles');
  const conflictStart = signupFunction.indexOf('ON CONFLICT');
  assert.ok(insertStart >= 0 && conflictStart > insertStart, 'Missing signup profile INSERT');
  const compact = signupFunction.slice(insertStart, conflictStart).replace(/\s+/g, ' ').trim();
  const match = compact.match(/,\s*'([a-z_]+)'\s*\)\s*$/);
  assert.ok(match, `Could not extract hard-coded signup role from: ${compact}`);
  return match[1];
}

function signupRoleFromSql(signupRoleLiteral: string, _clientMetadata: Record<string, unknown>): string {
  // Models the SQL source: the role returned is the literal found in the
  // migration, independent of any client-provided metadata.
  return signupRoleLiteral;
}

function rlsInsertAllows(role: string, allowedRoles: string[]): boolean {
  return allowedRoles.includes(role);
}

console.log('='.repeat(78));
console.log('SUPABASE PUBLIC ROLE LOCKDOWN — STATIC SQL REGRESSIONS');
console.log('='.repeat(78));
console.log(`Migration: ${path.relative(process.cwd(), migrationPath)}`);
console.log('Mode: source-only static checks; no SQL executed\n');

check(
  'Migration targets the new Preview Supabase project only',
  /nflqxcrgwxoqvqvbvejsa/.test(sql) && /DO NOT APPLY TO PRODUCTION/i.test(sql)
);

check(
  'RLS is enabled on public.profiles',
  /ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY;/i.test(sql)
);

check('No requested_role reference remains', !/requested_role/i.test(sql));

const signupFunction = extractFunction('public.handle_new_vv_user');
const signupRoleLiteral = getSignupRoleLiteral(signupFunction);

check(
  'Signup trigger hard-codes role customer',
  signupRoleLiteral === 'customer',
  `literal=${signupRoleLiteral}`
);

check(
  'Signup trigger does not read role from client metadata',
  !/raw_user_meta_data\s*->>\s*'role'|user_metadata[^\n]*role/i.test(signupFunction)
);
check(
  'Signup trigger is SECURITY DEFINER so it can insert safely past RLS',
  /SECURITY DEFINER/i.test(signupFunction)
);
check(
  'Signup trigger insert is idempotent',
  /ON CONFLICT \(id\) DO NOTHING/i.test(signupFunction)
);

for (const requestedRole of PRIVILEGED_ROLES) {
  const assignedRole = signupRoleFromSql(signupRoleLiteral, { requested_role: requestedRole, role: requestedRole });
  check(
    `New user requesting ${requestedRole} is still assigned customer`,
    assignedRole === 'customer',
    `assigned=${assignedRole}`
  );
}

const insertPolicy = extractPolicy('profiles_insert_self_customer_only');
const insertAllowedRoles = Array.from(insertPolicy.matchAll(/role\s*=\s*'([a-z_]+)'/g)).map((m) => m[1]);

check(
  'Self-insert RLS allows exactly customer',
  insertAllowedRoles.length === 1 && insertAllowedRoles[0] === 'customer',
  `allowed=[${insertAllowedRoles.join(', ')}]`
);
check('Self-insert RLS is scoped to auth.uid() = id', /auth\.uid\(\) = id/.test(insertPolicy));
check('Legacy self-insert policy is dropped', /DROP POLICY IF EXISTS "profiles_insert_self_safe"/.test(sql));

for (const privilegedRole of PRIVILEGED_ROLES) {
  check(
    `Self-insert RLS rejects ${privilegedRole}`,
    !rlsInsertAllows(privilegedRole, insertAllowedRoles)
  );
}

const updatePolicy = extractPolicy('profiles_update_self_safe');
check(
  'Update RLS is scoped to the caller row',
  /USING \(auth\.uid\(\) = id\)/.test(updatePolicy) &&
    /WITH CHECK \(auth\.uid\(\) = id\)/.test(updatePolicy)
);
check('Update RLS has no profile subquery', !/\bSELECT\b/i.test(updatePolicy));
check('Update RLS does not call the admin helper', !/is_vv_super_admin/i.test(updatePolicy));
check('Legacy escalation-prone update policy is dropped', /DROP POLICY IF EXISTS "profiles_update_self_no_escalation"/.test(sql));

const guardFunction = extractFunction('public.enforce_vv_profile_server_fields');
check(
  'Server-side guard recognizes service_role',
  /auth\.role\(\) = 'service_role'/.test(guardFunction)
);
check('Server-side guard blocks role changes', /NEW\.role IS DISTINCT FROM OLD\.role/.test(guardFunction));
check('Server-side guard blocks status changes', /NEW\.is_active IS DISTINCT FROM OLD\.is_active/.test(guardFunction));
check('Server-side guard blocks id changes', /NEW\.id IS DISTINCT FROM OLD\.id/.test(guardFunction));
check('Server-side guard raises permission denied', /RAISE EXCEPTION/.test(guardFunction) && /42501/.test(guardFunction));
check(
  'Server-side guard is a BEFORE UPDATE trigger',
  /CREATE TRIGGER profiles_server_fields_guard\s+BEFORE UPDATE ON public\.profiles/i.test(sql)
);

check(
  'Schema usage is explicitly granted to authenticated and service_role',
  /GRANT USAGE ON SCHEMA public TO authenticated, service_role;/i.test(sql)
);
check(
  'Public/anon table privileges are explicitly revoked',
  /REVOKE ALL ON TABLE public\.profiles FROM PUBLIC, anon;/i.test(sql)
);
check(
  'Authenticated has SELECT/INSERT/UPDATE on profiles',
  /GRANT SELECT, INSERT, UPDATE ON TABLE public\.profiles TO authenticated;/i.test(sql)
);
check(
  'service_role has SELECT/INSERT/UPDATE/DELETE on profiles',
  /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.profiles TO service_role;/i.test(sql)
);
check(
  'Admin helper execute is limited to authenticated/service_role',
  /REVOKE ALL ON FUNCTION public\.is_vv_super_admin\(\) FROM PUBLIC, anon;/i.test(sql) &&
    /GRANT EXECUTE ON FUNCTION public\.is_vv_super_admin\(\) TO authenticated, service_role;/i.test(sql)
);
check(
  'Signup trigger function execute is revoked from public/anon/authenticated',
  /REVOKE ALL ON FUNCTION public\.handle_new_vv_user\(\) FROM PUBLIC, anon, authenticated;/i.test(sql)
);
check(
  'Signup trigger function execute is granted to service_role',
  /GRANT EXECUTE ON FUNCTION public\.handle_new_vv_user\(\) TO service_role;/i.test(sql)
);
check(
  'Update guard execute is revoked from public/anon',
  /REVOKE ALL ON FUNCTION public\.enforce_vv_profile_server_fields\(\) FROM PUBLIC, anon;/i.test(sql)
);
check(
  'Update guard execute is granted to authenticated/service_role',
  /GRANT EXECUTE ON FUNCTION public\.enforce_vv_profile_server_fields\(\) TO authenticated, service_role;/i.test(sql)
);

const activeProfileAccessSources = [
  'functions/api/_auth.ts',
  'functions/api/marketplace/_auth.ts',
  'src/hooks/useAuth.tsx',
  'src/components/auth/AuthModal.tsx',
].map(readSource);
check(
  'Active application profile access is SELECT-only',
  activeProfileAccessSources.every((source) =>
    /\/rest\/v1\/profiles\?[^\n]*select=|\.from\(['"]profiles['"]\)[\s\S]{0,160}\.select\(/.test(source)
  ) &&
    activeProfileAccessSources.every(
      (source) => !/\.from\(['"]profiles['"]\)[\s\S]{0,160}\.(insert|upsert|update|delete)\(/.test(source)
    )
);

check(
  'No secret values are present in the migration',
  !/(?:SUPABASE_SERVICE_ROLE_KEY|CASHFREE_CLIENT_SECRET|RESEND_API_KEY)\s*=\s*\S+/i.test(sql)
);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
