-- Vijay Visuals Global AI Business Ecosystem
-- Production Supabase PostgreSQL Row Level Security (RLS) Migration Script
-- Apply this file when deploying the 26-table schema directly on Supabase PostgreSQL.

-- Helper function: resolve current authenticated user's internal ID & role
CREATE OR REPLACE FUNCTION public.vv_current_user_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE uid = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.vv_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE uid = auth.uid()::text AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.vv_owns_tenant(target_tenant_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.vv_is_super_admin() OR EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = target_tenant_id
      AND t.owner_user_id = public.vv_current_user_id()
  );
$$;

-- Enable RLS across all 26 tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

-- Public read policies (published storefronts, active catalog, plans, announcements)
CREATE POLICY "public_read_published_tenants" ON public.tenants
  FOR SELECT USING (published = true OR public.vv_owns_tenant(id));

CREATE POLICY "owner_manage_tenants" ON public.tenants
  FOR ALL USING (public.vv_owns_tenant(id));

CREATE POLICY "public_read_active_products" ON public.products
  FOR SELECT USING (active = true OR public.vv_owns_tenant(tenant_id));

CREATE POLICY "owner_manage_products" ON public.products
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "public_read_plans" ON public.platform_plans
  FOR SELECT USING (active = true OR public.vv_is_super_admin());

CREATE POLICY "admin_manage_plans" ON public.platform_plans
  FOR ALL USING (public.vv_is_super_admin());

CREATE POLICY "public_read_announcements" ON public.platform_announcements
  FOR SELECT USING (active = true OR public.vv_is_super_admin());

CREATE POLICY "admin_manage_announcements" ON public.platform_announcements
  FOR ALL USING (public.vv_is_super_admin());

-- User self-access & Super Admin
CREATE POLICY "users_self_access" ON public.users
  FOR SELECT USING (uid = auth.uid()::text OR public.vv_is_super_admin());

-- Users may update only their own non-privileged fields. WITH CHECK freezes
-- role so an authenticated client cannot self-escalate to super_admin.
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

-- Strict multi-tenant isolation for private business tables
CREATE POLICY "tenant_isolation_orders" ON public.orders
  FOR ALL USING (
    public.vv_owns_tenant(tenant_id)
    OR customer_user_id = public.vv_current_user_id()
  );

CREATE POLICY "tenant_isolation_seller_payouts" ON public.seller_payout_accounts
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_seller_transfers" ON public.seller_transfers
  FOR SELECT USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_crm" ON public.crm_leads
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_finance" ON public.finance_records
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_warehouses" ON public.warehouses
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_suppliers" ON public.suppliers
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_staff" ON public.staff_members
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_attendance" ON public.staff_attendance
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_plugins" ON public.tenant_plugins
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_workflows" ON public.automation_workflows
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_logs" ON public.automation_logs
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "appointments_tenant_or_customer" ON public.appointments
  FOR ALL USING (
    public.vv_owns_tenant(tenant_id)
    OR customer_user_id = public.vv_current_user_id()
  );

CREATE POLICY "wishlist_owner_only" ON public.wishlists
  FOR ALL USING (user_id = public.vv_current_user_id());

CREATE POLICY "platform_payments_owner_or_admin" ON public.platform_payments
  FOR SELECT USING (
    user_id = public.vv_current_user_id()
    OR public.vv_is_super_admin()
  );

-- Audit logs and webhook events: Super Admin read-only (writes performed via service role)
CREATE POLICY "admin_only_audit_logs" ON public.audit_logs
  FOR SELECT USING (public.vv_is_super_admin());

CREATE POLICY "admin_only_webhook_events" ON public.webhook_events
  FOR SELECT USING (public.vv_is_super_admin());

-- Stage 3 Growth Platform tables (5 additional tables -> 31 total)
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_seo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_domains" ON public.tenant_domains
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_versions" ON public.tenant_versions
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "tenant_isolation_seo_settings" ON public.tenant_seo_settings
  FOR ALL USING (public.vv_owns_tenant(tenant_id));

CREATE POLICY "public_read_seo_settings_published" ON public.tenant_seo_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = tenant_id AND t.published = true
    )
  );

CREATE POLICY "tenant_isolation_newsletter" ON public.newsletter_subscribers
  FOR SELECT USING (
    (tenant_id IS NOT NULL AND public.vv_owns_tenant(tenant_id))
    OR public.vv_is_super_admin()
  );

CREATE POLICY "proposals_owner_or_admin" ON public.proposals
  FOR SELECT USING (
    user_id = public.vv_current_user_id()
    OR (tenant_id IS NOT NULL AND public.vv_owns_tenant(tenant_id))
    OR public.vv_is_super_admin()
  );
