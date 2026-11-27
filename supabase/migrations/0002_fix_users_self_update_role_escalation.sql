-- ============================================================================
-- VIJAY VISUALS — SUPABASE RLS HOTFIX: public.users role self-escalation
-- NON-DESTRUCTIVE: drops and recreates only the users_self_update policy.
-- Apply only to a Supabase project where the legacy rls_migration.sql was used.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND to_regprocedure('public.vv_is_super_admin()') IS NOT NULL THEN
    DROP POLICY IF EXISTS "users_self_update" ON public.users;

    CREATE POLICY "users_self_update" ON public.users
      FOR UPDATE
      USING (uid = auth.uid()::text OR public.vv_is_super_admin())
      WITH CHECK (
        public.vv_is_super_admin()
        OR (
          uid = auth.uid()::text
          AND role = (SELECT u.role FROM public.users u WHERE u.uid = auth.uid()::text LIMIT 1)
        )
      );
  END IF;
END $$;
