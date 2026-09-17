-- ============================================================================
-- RESTROZ DEV ENVIRONMENT — PRODUCTS, CATEGORIES & MEMBERSHIP RESTORATION PATCH
-- Environment: DEVELOPMENT (restroz-dev)
-- ============================================================================
-- Purpose:
-- 1. Restores active restaurant membership for admin/staff accounts.
-- 2. Fixes 409 / 23503 / 23502 error on product deletion by making order_items / kot_items
--    product_id nullable and setting foreign key ON DELETE SET NULL.
-- 3. Sets clean RLS policies on public.products and public.categories for SELECT, INSERT,
--    UPDATE, and DELETE.
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Applying RestroZ Products, Categories and Membership Patch...';
END $$;

-- ----------------------------------------------------------------------------
-- 0. RESTORE RESTAURANT MEMBERSHIP STATUS
-- ----------------------------------------------------------------------------
UPDATE public.restaurant_members
SET is_active = TRUE
WHERE is_active = FALSE;

-- ----------------------------------------------------------------------------
-- 1. FOREIGN KEY CONSTRAINTS (Allow clean product deletion while preserving order history)
-- ----------------------------------------------------------------------------

-- Step 1a: Allow product_id to be NULL in order_items & kot_items
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.kot_items ALTER COLUMN product_id DROP NOT NULL;

-- Step 1b: Configure foreign keys with ON DELETE SET NULL
ALTER TABLE public.order_items 
    DROP CONSTRAINT IF EXISTS order_items_product_id_fkey,
    ADD CONSTRAINT order_items_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE SET NULL;

ALTER TABLE public.kot_items 
    DROP CONSTRAINT IF EXISTS kot_items_product_id_fkey,
    ADD CONSTRAINT kot_items_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE SET NULL;


-- ----------------------------------------------------------------------------
-- 2. PRODUCTS TABLE RLS POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'products' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.policyname);
    END LOOP;
END $$;

-- 2a. SELECT Policy
CREATE POLICY "Products Select Policy" ON public.products
    FOR SELECT
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 2b. INSERT Policy
CREATE POLICY "Products Insert Policy" ON public.products
    FOR INSERT
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 2c. UPDATE Policy
CREATE POLICY "Products Update Policy" ON public.products
    FOR UPDATE
    USING (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    )
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

-- 2d. DELETE Policy
CREATE POLICY "Products Delete Policy" ON public.products
    FOR DELETE
    USING (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;


-- ----------------------------------------------------------------------------
-- 3. CATEGORIES TABLE RLS POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'categories' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.categories', pol.policyname);
    END LOOP;

    ALTER TABLE public.products
        DROP CONSTRAINT IF EXISTS products_category_id_fkey,
        ADD CONSTRAINT products_category_id_fkey
            FOREIGN KEY (category_id)
            REFERENCES public.categories(id)
            ON DELETE SET NULL;
END $$;

CREATE POLICY "Categories Select Policy" ON public.categories
    FOR SELECT
    USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Categories Insert Policy" ON public.categories
    FOR INSERT
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Categories Update Policy" ON public.categories
    FOR UPDATE
    USING (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    )
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

CREATE POLICY "Categories Delete Policy" ON public.categories
    FOR DELETE
    USING (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN') OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

DO $$
BEGIN
    RAISE NOTICE 'RestroZ Products, Categories & Membership Patch applied successfully!';
END $$;
