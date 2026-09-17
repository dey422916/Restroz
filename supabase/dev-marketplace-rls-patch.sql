-- ============================================================================
-- RESTROZ SAAS — COMPLETE MARKETPLACE & PUBLIC ACCESS RLS FIX PATCH
-- Target: restroz-dev (PostgreSQL / Supabase)
-- Purpose: 
-- 1. Grants EXECUTE on helper functions to anon/authenticated/service_role to prevent 42501 errors.
-- 2. Separates public/anon SELECT policies from authenticated tenant policies on:
--    - public.restaurants
--    - public.categories
--    - public.products
--    - public.coupons
--    - public.restaurant_public_profiles
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Applying RestroZ Marketplace & Public Access RLS Fix...';
END $$;

-- ----------------------------------------------------------------------------
-- 1. HELPER FUNCTION EXECUTION PRIVILEGES (Prevents 42501 when policies are evaluated)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. RESTAURANTS TABLE (Public Read for Active Restaurants)
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'restaurants' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.restaurants', pol.policyname);
    END LOOP;
END $$;

-- Anonymous: Pure column check (no helper evaluation required)
CREATE POLICY "Restaurants Public Anon Select" ON public.restaurants
    FOR SELECT TO anon
    USING (status = 'ACTIVE');

-- Authenticated: Active restaurants OR user is tenant member OR user is super admin
CREATE POLICY "Restaurants Authenticated Select" ON public.restaurants
    FOR SELECT TO authenticated
    USING (
        status = 'ACTIVE'
        OR public.is_super_admin()
        OR id IN (SELECT public.get_user_restaurant_ids())
    );

-- Service Role: Full access
CREATE POLICY "Restaurants Service Role Select" ON public.restaurants
    FOR SELECT TO service_role
    USING (TRUE);

GRANT SELECT ON public.restaurants TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. CATEGORIES TABLE (Public Read for Active Categories)
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'categories' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.categories', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Categories Public Anon Select" ON public.categories
    FOR SELECT TO anon
    USING (
        is_active = TRUE 
        AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
    );

CREATE POLICY "Categories Authenticated Select" ON public.categories
    FOR SELECT TO authenticated
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
        OR public.is_super_admin()
        OR public.is_restaurant_member(restaurant_id, 'STAFF')
        OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Categories Service Role Select" ON public.categories
    FOR SELECT TO service_role
    USING (TRUE);

GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;


-- ----------------------------------------------------------------------------
-- 4. PRODUCTS TABLE (Public Read for Active Products)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'products' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Products Public Anon Select" ON public.products
    FOR SELECT TO anon
    USING (
        is_active = TRUE 
        AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
    );

CREATE POLICY "Products Authenticated Select" ON public.products
    FOR SELECT TO authenticated
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
        OR public.is_super_admin()
        OR public.is_restaurant_member(restaurant_id, 'STAFF')
        OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Products Service Role Select" ON public.products
    FOR SELECT TO service_role
    USING (TRUE);

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;


-- ----------------------------------------------------------------------------
-- 5. COUPONS TABLE (Public Read for Active Coupons)
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'coupons' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupons', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Coupons Public Anon Select" ON public.coupons
    FOR SELECT TO anon
    USING (
        is_active = TRUE 
        AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
    );

CREATE POLICY "Coupons Authenticated Select" ON public.coupons
    FOR SELECT TO authenticated
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
        OR public.is_super_admin()
        OR public.is_restaurant_member(restaurant_id, 'STAFF')
        OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Coupons Service Role Select" ON public.coupons
    FOR SELECT TO service_role
    USING (TRUE);

GRANT SELECT ON public.coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;


-- ----------------------------------------------------------------------------
-- 6. RESTAURANT PUBLIC PROFILES TABLE (Public Read)
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_public_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'restaurant_public_profiles' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.restaurant_public_profiles', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Public Profiles Select Policy" ON public.restaurant_public_profiles
    FOR SELECT TO anon, authenticated, service_role
    USING (TRUE);

GRANT SELECT ON public.restaurant_public_profiles TO anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 7. RELOAD SCHEMA CACHE
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE 'RestroZ Marketplace & Public Access RLS Fix applied successfully!';
END $$;
