-- ============================================================================
-- RESTROZ SAAS — DEV PUBLIC & CUSTOMER COUPONS ACCESS PATCH
-- Target: restroz-dev (PostgreSQL / Supabase)
-- Purpose: Ensures customer app, marketplace, and guest users can view and apply
--          active coupons for restaurant orders.
-- ============================================================================

-- 1. Ensure Table Permissions
GRANT SELECT ON public.coupons TO anon, authenticated, service_role;

-- 2. Establish Public & Customer Read Policy for Active Coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and Customer Read Active Coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Customers can view active coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public Read Coupons" ON public.coupons;
DROP POLICY IF EXISTS "Tenant Members Read Coupons" ON public.coupons;

CREATE POLICY "Public Read Coupons" ON public.coupons
    FOR SELECT TO anon, authenticated, service_role
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
        OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 3. Preserve Tenant Admin Management Policy
DROP POLICY IF EXISTS "Tenant Admin Manage Coupons" ON public.coupons;
CREATE POLICY "Tenant Admin Manage Coupons" ON public.coupons
    FOR ALL TO authenticated, service_role
    USING (
        public.is_super_admin() 
        OR auth.role() = 'service_role'
        OR public.is_restaurant_member(restaurant_id, 'ADMIN')
    )
    WITH CHECK (
        public.is_super_admin() 
        OR auth.role() = 'service_role'
        OR public.is_restaurant_member(restaurant_id, 'ADMIN')
    );
