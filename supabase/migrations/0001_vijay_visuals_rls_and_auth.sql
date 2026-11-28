-- ============================================================================
-- VIJAY VISUALS — SUPABASE AUTH & ROW LEVEL SECURITY (RLS) HARDENING
-- Target: NEW Preview Supabase project ONLY: nflqxcrgwxoqvqvbvejsa
-- DO NOT APPLY TO PRODUCTION: glfeuwzaaazeqcbcsckm
-- NON-DESTRUCTIVE: Uses CREATE TABLE IF NOT EXISTS & safe DROP/CREATE POLICY
-- SECURITY: Never expose SUPABASE_SERVICE_ROLE_KEY to browser/client code.
-- Public signup ALWAYS creates role 'customer'. Client metadata never grants
-- roles. Privileged roles are assigned only by an authorized server-side
-- process using SUPABASE_SERVICE_ROLE_KEY.
-- ============================================================================

-- 1. Ensure authoritative public.profiles table exists
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer' CHECK (
    role IN ('admin', 'super_admin', 'platform_staff', 'shop_owner', 'business_manager', 'business_staff', 'delivery_boy', 'delivery_partner', 'customer')
  ),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS strictly
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Helper function for admin SELECT visibility only.
-- SECURITY DEFINER keeps this lookup out of the caller's RLS context and
-- avoids recursive policy evaluation. It is NOT used for UPDATE/INSERT role
-- decisions.
CREATE OR REPLACE FUNCTION public.is_vv_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = TRUE
  );
$$;

-- 3. Strict RLS policies on public.profiles
-- Users read their own profile; authorized admins may read all profiles.
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_vv_super_admin());

-- Public self-insert is customer-only. Privileged roles can never be created
-- through this policy.
DROP POLICY IF EXISTS "profiles_insert_self_safe" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self_customer_only" ON public.profiles;
CREATE POLICY "profiles_insert_self_customer_only"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'customer'
  );

-- Users may update only their own row. Role/status/id/created_at immutability
-- is enforced by the BEFORE UPDATE trigger below. This policy has no profile
-- subquery and does not call is_vv_super_admin(), so the write path cannot
-- recurse into profiles RLS.
DROP POLICY IF EXISTS "profiles_update_self_no_escalation" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_safe" ON public.profiles;
CREATE POLICY "profiles_update_self_safe"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Server-side-only field guard.
-- The service_role JWT identifies an authorized server-side process. All
-- client JWTs (anon/authenticated) are blocked from changing role or status.
CREATE OR REPLACE FUNCTION public.enforce_vv_profile_server_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    NEW.updated_at = NOW();
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Profile role, status, id, and created_at are server-side only.'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_server_fields_guard ON public.profiles;
CREATE TRIGGER profiles_server_fields_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vv_profile_server_fields();

-- 5. Automatic profile bootstrap on new Supabase Auth user signup.
-- The role is deliberately hard-coded to 'customer'. User metadata is used
-- only for the display name and is never consulted for authorization.
CREATE OR REPLACE FUNCTION public.handle_new_vv_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_vv ON auth.users;
CREATE TRIGGER on_auth_user_created_vv
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_vv_user();

-- 6. Explicit least-privilege grants.
-- Active application reads profiles as the authenticated user. INSERT/UPDATE
-- grants mirror the RLS policies above. Only service_role bypasses RLS and is
-- permitted by the guard trigger to change privileged role/status fields.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

REVOKE ALL ON FUNCTION public.is_vv_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_vv_super_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_vv_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_vv_user() TO service_role;

REVOKE ALL ON FUNCTION public.enforce_vv_profile_server_fields() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_vv_profile_server_fields() TO authenticated, service_role;
