-- ============================================================================
-- RESTROZ SAAS — DEV QR DIGITAL MENU PUBLIC ACCESS & SECURITY PATCH
-- Target: restroz-dev (PostgreSQL / Supabase)
-- Purpose: Ensures least-privilege, secure public access for the QR Digital Menu flow:
--          1. Public RPC resolution (resolve_qr_table, get_public_restaurant_info)
--          2. Grant EXECUTE on SECURITY DEFINER helper functions used in RLS policies
--          3. Public read policies on active categories, products, and restaurants
--          4. Secure guest ordering via create_guest_qr_order RPC
--          5. Zero leakage of private tables (tables, orders, restaurant_settings, profiles, restaurant_members)
-- ============================================================================

-- 1. Helper function grants required for RLS evaluation
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated, service_role;

-- 2. Ensure Public Execution Grants for QR Digital Menu RPCs
GRANT EXECUTE ON FUNCTION public.resolve_qr_table(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

-- 3. Public Table SELECT Grants
GRANT SELECT ON public.restaurants TO anon, authenticated, service_role;
GRANT SELECT ON public.restaurant_public_profiles TO anon, authenticated, service_role;
GRANT SELECT ON public.categories TO anon, authenticated, service_role;
GRANT SELECT ON public.products TO anon, authenticated, service_role;

-- 4. Verify and Re-assert Public Read Policies for Menu Catalog
-- 4a. Active Restaurants
DROP POLICY IF EXISTS "Public Read Active Restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public read restaurants" ON public.restaurants;
CREATE POLICY "Public Read Active Restaurants" ON public.restaurants
    FOR SELECT USING (
        status = 'ACTIVE' OR 
        public.is_super_admin() OR 
        id IN (SELECT public.get_user_restaurant_ids())
    );

-- 4b. Active Categories for Active Restaurants
DROP POLICY IF EXISTS "Public Read Categories" ON public.categories;
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public Read Categories" ON public.categories
    FOR SELECT USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 4c. Active & Available Products for Active Restaurants
DROP POLICY IF EXISTS "Public Read Products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public Read Products" ON public.products
    FOR SELECT USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 4d. Restaurant Public Profiles
DROP POLICY IF EXISTS "Public read restaurant public profiles" ON public.restaurant_public_profiles;
DROP POLICY IF EXISTS "Public Read Restaurant Profiles" ON public.restaurant_public_profiles;
CREATE POLICY "Public read restaurant public profiles" ON public.restaurant_public_profiles
    FOR SELECT USING (TRUE);

-- 5. Confirm Strict Tenant Isolation for Internal Tables (Zero Anon Direct Access)
-- Tables table remains private to authenticated staff and super admins
DROP POLICY IF EXISTS "Tenant Members Read Tables" ON public.tables;
DROP POLICY IF EXISTS "Public can view dining tables" ON public.tables;
CREATE POLICY "Tenant Members Read Tables" ON public.tables
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- Restaurant Settings table remains private to authenticated staff and super admins
DROP POLICY IF EXISTS "Tenant Settings Select" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Tenant settings select" ON public.restaurant_settings;
CREATE POLICY "Tenant Settings Select" ON public.restaurant_settings
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- Orders table remains private to authenticated staff, super admins, and authenticated order owners
DROP POLICY IF EXISTS "Orders Select Policy" ON public.orders;
DROP POLICY IF EXISTS "Tenant staff and customers can view orders" ON public.orders;
CREATE POLICY "Orders Select Policy" ON public.orders
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids()) OR
        (auth.uid() IS NOT NULL AND customer_id = auth.uid())
    );

-- ============================================================================
-- END OF DEV QR PUBLIC ACCESS & SECURITY PATCH
-- ============================================================================
