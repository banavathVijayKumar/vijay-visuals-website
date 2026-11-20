-- ============================================================================
-- VIJAY VISUALS — SUPABASE AUTH & ROW LEVEL SECURITY (RLS) HARDENING MIGRATION
-- Target: Existing Supabase project (Auth + public.profiles)
-- NON-DESTRUCTIVE: Uses CREATE TABLE IF NOT EXISTS & safe DROP/CREATE POLICY
-- SECURITY: Never expose SUPABASE_SERVICE_ROLE_KEY to the browser/frontend.
-- ============================================================================

-- 1. Ensure authoritative public.profiles table exists (reusing existing table if present)
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

-- Enable Row Level Security strictly
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to check Super Admin role without recursive RLS loops
CREATE OR REPLACE FUNCTION public.is_vv_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
      AND is_active = TRUE
  );
$$;

-- 3. Strict RLS Policies on public.profiles
-- Users can read their own profile; Super Admins can read all profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_vv_super_admin());

-- Users can insert ONLY their own profile and ONLY with non-privileged customer/shop_owner role
DROP POLICY IF EXISTS "profiles_insert_self_safe" ON public.profiles;
CREATE POLICY "profiles_insert_self_safe"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role IN ('customer', 'shop_owner')
  );

-- Users can update ONLY their own full_name/phone — CANNOT self-escalate role or is_active!
DROP POLICY IF EXISTS "profiles_update_self_no_escalation" ON public.profiles;
CREATE POLICY "profiles_update_self_no_escalation"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_vv_super_admin())
  WITH CHECK (
    public.is_vv_super_admin()
    OR (
      auth.uid() = id
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      AND is_active = (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- 4. Automatic profile bootstrap trigger on new Supabase Auth user signup
CREATE OR REPLACE FUNCTION public.handle_new_vv_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    CASE
      WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'requested_role', '')) = 'shop_owner' THEN 'shop_owner'
      ELSE 'customer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_vv ON auth.users;
CREATE TRIGGER on_auth_user_created_vv
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_vv_user();
