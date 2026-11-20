-- ============================================================================
-- VIJAY VISUALS MULTI-TENANT WEBSITE BUILDER & DELIVERY MANAGEMENT SCHEMA
-- Complete Supabase Schema with Roles, Profiles, Businesses, Orders & RLS
-- ============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom Role Enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'shop_owner', 'delivery_boy', 'customer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'inactive', 'pending_invite');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status_type AS ENUM (
    'placed',
    'confirmed',
    'preparing',
    'assigned',
    'accepted',
    'out_for_delivery',
    'reached_location',
    'delivered',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Profiles Table (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'customer',
  status account_status NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Delivery Boys Table
CREATE TABLE IF NOT EXISTS public.delivery_boys (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT DEFAULT 'Bike',
  vehicle_number TEXT,
  assigned_area TEXT,
  active_status TEXT DEFAULT 'available', -- 'available', 'busy', 'offline'
  invitation_token TEXT,
  invited_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  total_deliveries INT DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.00,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Businesses (Multi-tenant Shops) Table
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  tagline TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'Telangana',
  postal_code TEXT,
  lat NUMERIC(10, 6) DEFAULT 17.385044,
  lng NUMERIC(10, 6) DEFAULT 78.486671,
  logo_url TEXT,
  theme_color TEXT DEFAULT '#DFBA5A',
  font_family TEXT DEFAULT 'Cinzel',
  language TEXT DEFAULT 'en', -- 'en', 'te', 'hi'
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Templates Table (20+ Industry Categories)
CREATE TABLE IF NOT EXISTS public.templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  badge TEXT,
  preview_image TEXT,
  accent_color TEXT DEFAULT '#DFBA5A',
  features JSONB DEFAULT '[]'::jsonb,
  demo_slug TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. Websites Table (Published Multi-Tenant Sites)
CREATE TABLE IF NOT EXISTS public.websites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES public.templates(id),
  subdomain TEXT UNIQUE NOT NULL,
  custom_domain TEXT,
  published BOOLEAN DEFAULT true,
  sections_data JSONB DEFAULT '{}'::jsonb,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. Products / Catalog Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2),
  category TEXT,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.profiles(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  delivery_address TEXT NOT NULL,
  delivery_city TEXT,
  delivery_lat NUMERIC(10, 6),
  delivery_lng NUMERIC(10, 6),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10, 2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cod', -- 'cod', 'upi', 'razorpay'
  payment_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'refunded'
  order_status order_status_type NOT NULL DEFAULT 'placed',
  assigned_delivery_boy_id UUID REFERENCES public.delivery_boys(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_notes TEXT,
  delivery_proof_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. Bookings / Appointments Table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  service_name TEXT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TEXT NOT NULL,
  status TEXT DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. Leads and Enquiries Table
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'closed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_boys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Helper functions for Auth checks
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_delivery_boy()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'delivery_boy' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

-- Delivery Boys Policies
CREATE POLICY "Delivery boy can view own record" ON public.delivery_boys
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Delivery boy can update own availability" ON public.delivery_boys
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage delivery boys" ON public.delivery_boys
  FOR ALL USING (public.is_admin());

-- Orders Policies
-- Delivery boys can only see orders assigned to them!
CREATE POLICY "Delivery boy can view only assigned orders" ON public.orders
  FOR SELECT USING (
    (public.is_delivery_boy() AND assigned_delivery_boy_id = auth.uid())
    OR public.is_admin()
    OR (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = orders.business_id AND b.owner_id = auth.uid()))
    OR (customer_id = auth.uid())
  );

-- Delivery boys can update order status for their own orders
CREATE POLICY "Delivery boy can update assigned order status" ON public.orders
  FOR UPDATE USING (
    public.is_delivery_boy() AND assigned_delivery_boy_id = auth.uid()
  ) WITH CHECK (
    assigned_delivery_boy_id = auth.uid()
  );

CREATE POLICY "Shop owners can manage their own shop orders" ON public.orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = orders.business_id AND b.owner_id = auth.uid())
  );

CREATE POLICY "Admins can manage all orders" ON public.orders
  FOR ALL USING (public.is_admin());
