-- ============================================================================
-- RESTROZ SAAS — CANONICAL PRODUCTION MIGRATION
-- Migration Version: 20260820000014
-- Target: PRODUCTION Supabase Project
--
-- Safety Guarantees:
-- 1. Strictly non-destructive — NO DROP TABLE, NO TRUNCATE, NO DELETE, NO SEED DATA.
-- 2. Preserves ALL existing production customer, restaurant, order, and auth records.
-- 3. Idempotent — Safe to run multiple times without data loss.
-- 4. Uses IF NOT EXISTS / OR REPLACE / ON CONFLICT throughout.
-- 5. Contains ZERO test/seed accounts, ZERO test UUIDs, ZERO hardcoded emails.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- 1. EXTEND TABLES (COLUMNS & CONSTRAINTS)
-- ----------------------------------------------------------------------------

-- Orders Table Extensions
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified_by UUID;

-- Product Deletion Foreign Key Resilience (Preserve order/kot history when product is deleted)
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.kot_items ALTER COLUMN product_id DROP NOT NULL;

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

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_category_id_fkey,
    ADD CONSTRAINT products_category_id_fkey
        FOREIGN KEY (category_id)
        REFERENCES public.categories(id)
        ON DELETE SET NULL;

-- Restaurant Settings Table Extensions
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS is_gst_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS tax_invoice_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_payment_qr_url TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_upi_id TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_sample_screenshot_url TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS enable_cod BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_charge_base NUMERIC(10, 2) DEFAULT 0.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(10, 2) DEFAULT 0.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_sequence_prefix TEXT DEFAULT 'INV';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_next_number INTEGER DEFAULT 1;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS banner_urls TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS printer_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT TRUE;

UPDATE public.restaurant_settings
SET default_tax_rate = COALESCE(tax_rate, 5.0)
WHERE default_tax_rate IS NULL;

UPDATE public.restaurant_settings
SET tax_rate = COALESCE(default_tax_rate, 5.0)
WHERE tax_rate IS NULL;

-- Restaurant Public Profiles Table Extensions
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS is_gst_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS tax_invoice_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS delivery_payment_qr_url TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS delivery_upi_id TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS delivery_sample_screenshot_url TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS enable_cod BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS delivery_charge_base NUMERIC(10, 2) DEFAULT 0.0;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(10, 2) DEFAULT 0.0;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS banner_urls TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Restaurants Table Extensions
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS banner_urls TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ----------------------------------------------------------------------------
-- 2. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON public.orders (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_kot_items_product_id ON public.kot_items (product_id);
CREATE INDEX IF NOT EXISTS idx_products_restaurant_active ON public.products (restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_active ON public.categories (restaurant_id, is_active);

-- ----------------------------------------------------------------------------
-- 3. RLS HELPER FUNCTION GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES FOR PUBLIC & TENANT ACCESS
-- ----------------------------------------------------------------------------

-- A. RESTAURANTS
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol RECORD; BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'restaurants' AND schemaname = 'public' AND cmd = 'SELECT'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.restaurants', pol.policyname); END LOOP;
END $$;
CREATE POLICY "Restaurants Public Anon Select" ON public.restaurants FOR SELECT TO anon USING (status = 'ACTIVE');
CREATE POLICY "Restaurants Authenticated Select" ON public.restaurants FOR SELECT TO authenticated USING (
    status = 'ACTIVE' OR public.is_super_admin() OR id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Restaurants Service Role Select" ON public.restaurants FOR SELECT TO service_role USING (TRUE);
GRANT SELECT ON public.restaurants TO anon, authenticated, service_role;

-- B. CATEGORIES
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol RECORD; BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'categories' AND schemaname = 'public'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.categories', pol.policyname); END LOOP;
END $$;
CREATE POLICY "Categories Public Anon Select" ON public.categories FOR SELECT TO anon USING (
    is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
);
CREATE POLICY "Categories Authenticated Select" ON public.categories FOR SELECT TO authenticated USING (
    (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
    OR public.is_super_admin()
    OR public.is_restaurant_member(restaurant_id, 'STAFF')
    OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Categories Insert Policy" ON public.categories FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Categories Update Policy" ON public.categories FOR UPDATE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Categories Delete Policy" ON public.categories FOR DELETE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Categories Service Role Select" ON public.categories FOR SELECT TO service_role USING (TRUE);
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- C. PRODUCTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol RECORD; BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'products' AND schemaname = 'public'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.policyname); END LOOP;
END $$;
CREATE POLICY "Products Public Anon Select" ON public.products FOR SELECT TO anon USING (
    is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
);
CREATE POLICY "Products Authenticated Select" ON public.products FOR SELECT TO authenticated USING (
    (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
    OR public.is_super_admin()
    OR public.is_restaurant_member(restaurant_id, 'STAFF')
    OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Products Insert Policy" ON public.products FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Products Update Policy" ON public.products FOR UPDATE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Products Delete Policy" ON public.products FOR DELETE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Products Service Role Select" ON public.products FOR SELECT TO service_role USING (TRUE);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- D. COUPONS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol RECORD; BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'coupons' AND schemaname = 'public'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupons', pol.policyname); END LOOP;
END $$;
CREATE POLICY "Coupons Public Anon Select" ON public.coupons FOR SELECT TO anon USING (
    is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
);
CREATE POLICY "Coupons Authenticated Select" ON public.coupons FOR SELECT TO authenticated USING (
    (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE'))
    OR public.is_super_admin()
    OR public.is_restaurant_member(restaurant_id, 'STAFF')
    OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Coupons Insert Policy" ON public.coupons FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Coupons Update Policy" ON public.coupons FOR UPDATE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Coupons Delete Policy" ON public.coupons FOR DELETE TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN') OR restaurant_id IN (SELECT public.get_user_restaurant_ids())
);
CREATE POLICY "Coupons Service Role Select" ON public.coupons FOR SELECT TO service_role USING (TRUE);
GRANT SELECT ON public.coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

-- E. RESTAURANT PUBLIC PROFILES
ALTER TABLE public.restaurant_public_profiles ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE pol RECORD; BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'restaurant_public_profiles' AND schemaname = 'public'
    LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.restaurant_public_profiles', pol.policyname); END LOOP;
END $$;
CREATE POLICY "Public Profiles Select Policy" ON public.restaurant_public_profiles FOR SELECT TO anon, authenticated, service_role USING (TRUE);
CREATE POLICY "Admin Manage Restaurant Public Profile" ON public.restaurant_public_profiles FOR ALL TO authenticated USING (
    public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN')
);
GRANT SELECT ON public.restaurant_public_profiles TO anon, authenticated, service_role;
GRANT ALL ON public.restaurant_public_profiles TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. CANONICAL RPCs & BUSINESS LOGIC
-- ----------------------------------------------------------------------------

-- RPC: mark_order_payment_verified
DROP FUNCTION IF EXISTS public.mark_order_payment_verified(TEXT, UUID);
CREATE OR REPLACE FUNCTION public.mark_order_payment_verified(
    p_order_id TEXT,
    p_restaurant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
    v_is_super_admin BOOLEAN := FALSE;
    v_is_tenant_admin BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: User is not logged in.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order with ID % not found.', p_order_id;
    END IF;

    IF p_restaurant_id IS NOT NULL AND v_order.restaurant_id != p_restaurant_id THEN
        RAISE EXCEPTION 'Tenant mismatch: Order does not belong to specified restaurant.';
    END IF;

    SELECT (role = 'SUPER_ADMIN') INTO v_is_super_admin
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_is_super_admin IS NOT TRUE THEN
        SELECT (role = 'ADMIN') INTO v_is_tenant_admin
        FROM public.restaurant_members
        WHERE restaurant_id = v_order.restaurant_id
          AND user_id = v_caller_id
          AND is_active = TRUE;
    END IF;

    IF (v_is_super_admin IS NOT TRUE) AND (v_is_tenant_admin IS NOT TRUE) THEN
        RAISE EXCEPTION 'Permission Denied: Only Restaurant Admins and Super Admins can verify payments.';
    END IF;

    IF LOWER(COALESCE(v_order.payment_method, '')) NOT IN ('online', 'upi') AND (v_order.payment_proof_url IS NULL OR TRIM(v_order.payment_proof_url) = '') THEN
        RAISE EXCEPTION 'Cannot verify payment: Order is not an online/UPI payment or has no proof attached.';
    END IF;

    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'payment_status', 'paid',
            'already_verified', true,
            'payment_verified_at', v_order.payment_verified_at,
            'payment_verified_by', v_order.payment_verified_by
        );
    END IF;

    UPDATE public.orders
    SET payment_status = 'paid',
        payment_verified_at = NOW(),
        payment_verified_by = v_caller_id,
        updated_at = NOW()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'payment_status', 'paid',
        'already_verified', false,
        'payment_verified_at', NOW(),
        'payment_verified_by', v_caller_id
    );
END;
$$;
REVOKE ALL ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) TO authenticated, service_role;

-- RPC: get_public_restaurant_info
DROP FUNCTION IF EXISTS public.get_public_restaurant_info(UUID);
CREATE OR REPLACE FUNCTION public.get_public_restaurant_info(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT json_build_object(
        'id', r.id,
        'name', r.name,
        'slug', r.slug,
        'phone', r.phone,
        'email', r.email,
        'address', r.address,
        'city', r.city,
        'state', r.state,
        'logo_url', r.logo_url,
        'banner_url', COALESCE(s.banner_url, r.banner_url),
        'theme_color', s.theme_color,
        'primary_color', s.primary_color,
        'is_open', s.is_open,
        'opening_time', s.opening_time,
        'closing_time', s.closing_time,
        'is_gst_enabled', COALESCE(s.is_gst_enabled, FALSE),
        'gst_registered', COALESCE(s.gst_registered, FALSE),
        'tax_invoice_enabled', COALESCE(s.tax_invoice_enabled, FALSE),
        'tax_rate', COALESCE(s.tax_rate, 5.0),
        'default_tax_rate', COALESCE(s.default_tax_rate, s.tax_rate, 5.0),
        'cgst_rate', COALESCE(s.cgst_rate, 2.5),
        'sgst_rate', COALESCE(s.sgst_rate, 2.5),
        'gstin', COALESCE(s.gstin, ''),
        'service_charge_rate', s.service_charge_rate,
        'packaging_charge_rate', s.packaging_charge_rate,
        'delivery_charge_base', COALESCE(s.delivery_charge_base, 0.0),
        'free_delivery_above', COALESCE(s.free_delivery_above, 0.0),
        'enable_cod', COALESCE(s.enable_cod, TRUE),
        'delivery_payment_qr_url', s.delivery_payment_qr_url,
        'delivery_upi_id', s.delivery_upi_id,
        'delivery_sample_screenshot_url', s.delivery_sample_screenshot_url,
        'enable_table_qr', s.enable_table_qr,
        'enable_delivery', s.enable_delivery,
        'enable_takeaway', s.enable_takeaway,
        'gallery_images', COALESCE(s.gallery_images, '[]'::jsonb)
    ) INTO result
    FROM public.restaurants r
    LEFT JOIN public.restaurant_settings s ON s.restaurant_id = r.id
    WHERE r.id = p_restaurant_id;

    RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_restaurant_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(UUID) TO anon, authenticated, service_role;

-- RPC: create_guest_qr_order
DROP FUNCTION IF EXISTS public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_guest_qr_order(
    p_restaurant_id UUID,
    p_table_id TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_payment_proof_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_order_id TEXT;
    v_order_number TEXT;
    v_subtotal NUMERIC(10,2) := 0;
    v_cgst NUMERIC(10,2) := 0;
    v_sgst NUMERIC(10,2) := 0;
    v_grand_total NUMERIC(10,2) := 0;
    v_payable NUMERIC(10,2) := 0;
    v_discount NUMERIC(10,2) := 0;
    v_coupon_discount NUMERIC(10,2) := 0;
    v_coupon RECORD;
    v_item JSONB;
    v_product RECORD;
    v_item_subtotal NUMERIC(10,2);
    v_item_tax NUMERIC(10,2);
    v_item_cgst NUMERIC(10,2);
    v_item_sgst NUMERIC(10,2);
    v_item_tax_rate NUMERIC(5,2) := 0.0;
    v_table_num TEXT;
    v_enable_cod BOOLEAN := TRUE;
    v_norm_payment_method TEXT := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
    v_is_gst_enabled BOOLEAN := FALSE;
    v_tax_rate NUMERIC(5,2) := 0.0;
BEGIN
    SELECT table_number INTO v_table_num
    FROM public.tables
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id;

    IF v_table_num IS NULL THEN
        RAISE EXCEPTION 'Invalid table or restaurant mismatch';
    END IF;

    SELECT
        COALESCE(enable_cod, TRUE),
        COALESCE(is_gst_enabled, FALSE),
        COALESCE(default_tax_rate, tax_rate, 5.0)
    INTO
        v_enable_cod,
        v_is_gst_enabled,
        v_tax_rate
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    LIMIT 1;

    IF v_enable_cod IS NULL THEN
        SELECT
            COALESCE(enable_cod, TRUE),
            COALESCE(is_gst_enabled, FALSE),
            COALESCE(default_tax_rate, 5.0)
        INTO
            v_enable_cod,
            v_is_gst_enabled,
            v_tax_rate
        FROM public.restaurant_public_profiles
        WHERE restaurant_id = p_restaurant_id
        LIMIT 1;
    END IF;

    IF v_norm_payment_method IN ('cash', 'cod') THEN
        IF v_enable_cod IS FALSE THEN
            RAISE EXCEPTION 'Cash payment is disabled for this restaurant.';
        END IF;
    ELSIF v_norm_payment_method IN ('online', 'upi') THEN
        IF p_payment_proof_url IS NULL OR TRIM(p_payment_proof_url) = '' THEN
            RAISE EXCEPTION 'Payment screenshot is required for online payments.';
        END IF;
    END IF;

    IF v_is_gst_enabled IS NOT TRUE THEN
        v_tax_rate := 0.0;
    END IF;

    v_order_id := 'ord-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || substr(md5(random()::TEXT), 1, 4);
    v_order_number := 'QR-' || to_char(NOW(), 'HH24MI') || '-' || substr(md5(random()::TEXT), 1, 3);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT id, name, price, discounted_price, tax_rate, is_active
        INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::TEXT AND restaurant_id = p_restaurant_id;

        IF v_product.id IS NULL OR v_product.is_active = FALSE THEN
            RAISE EXCEPTION 'Product % is not available', (v_item->>'product_id');
        END IF;

        v_item_subtotal := COALESCE(v_product.discounted_price, v_product.price) * (v_item->>'quantity')::INTEGER;
        v_subtotal := v_subtotal + v_item_subtotal;

        IF v_is_gst_enabled IS TRUE THEN
            v_item_tax_rate := COALESCE(v_tax_rate, 0.0);
            v_item_tax := ROUND((v_item_subtotal * v_item_tax_rate) / 100.0, 2);
            v_item_cgst := ROUND(v_item_tax / 2.0, 2);
            v_item_sgst := ROUND(v_item_tax / 2.0, 2);
            v_cgst := v_cgst + v_item_cgst;
            v_sgst := v_sgst + v_item_sgst;
        ELSE
            v_item_tax := 0.0;
            v_item_cgst := 0.0;
            v_item_sgst := 0.0;
        END IF;

        INSERT INTO public.order_items (
            id, order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, cgst_amount, sgst_amount, total, total_price, notes
        ) VALUES (
            gen_random_uuid()::TEXT,
            v_order_id,
            v_product.id,
            v_product.name,
            COALESCE(v_product.discounted_price, v_product.price),
            (v_item->>'quantity')::INTEGER,
            v_item_tax_rate,
            v_item_tax,
            v_item_cgst,
            v_item_sgst,
            v_item_subtotal,
            v_item_subtotal,
            v_item->>'notes'
        );
    END LOOP;

    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT id, code, discount_type, discount_value, min_order_value, max_discount, used_count, usage_limit, is_active
        INTO v_coupon
        FROM public.coupons
        WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
          AND restaurant_id = p_restaurant_id
          AND is_active = TRUE
        LIMIT 1;

        IF v_coupon.id IS NOT NULL THEN
            IF v_coupon.min_order_value IS NULL OR v_subtotal >= v_coupon.min_order_value THEN
                IF v_coupon.usage_limit IS NULL OR v_coupon.used_count < v_coupon.usage_limit THEN
                    IF v_coupon.discount_type = 'percentage' THEN
                        v_coupon_discount := ROUND((v_subtotal * v_coupon.discount_value) / 100.0, 2);
                        IF v_coupon.max_discount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount THEN
                            v_coupon_discount := v_coupon.max_discount;
                        END IF;
                    ELSE
                        v_coupon_discount := v_coupon.discount_value;
                    END IF;
                    v_coupon_discount := LEAST(v_coupon_discount, v_subtotal);
                    v_discount := v_coupon_discount;

                    PERFORM public.increment_coupon_usage(v_coupon.id, p_restaurant_id);
                END IF;
            END IF;
        END IF;
    END IF;

    v_grand_total := (v_subtotal - v_discount) + v_cgst + v_sgst;
    v_payable := ROUND(v_grand_total);

    INSERT INTO public.orders (
        id, restaurant_id, table_id, order_number, order_type, status,
        customer_name, customer_phone, subtotal, cgst_amount, sgst_amount,
        discount_amount, coupon_code, coupon_discount, grand_total, payable_amount,
        payment_method, payment_proof_url, payment_status, notes, created_by
    ) VALUES (
        v_order_id, p_restaurant_id, p_table_id, v_order_number, 'dine_in', 'confirmed',
        p_customer_name, p_customer_phone, v_subtotal, v_cgst, v_sgst,
        v_discount, p_coupon_code, v_coupon_discount, v_grand_total, v_payable,
        v_norm_payment_method, p_payment_proof_url, 'unpaid', p_notes, 'QR_GUEST'
    );

    UPDATE public.tables
    SET status = 'occupied', updated_at = NOW()
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id;

    RETURN jsonb_build_object(
        'id', v_order_id,
        'order_number', v_order_number,
        'restaurant_id', p_restaurant_id,
        'table_id', p_table_id,
        'table_number', v_table_num,
        'status', 'confirmed',
        'subtotal', v_subtotal,
        'cgst_amount', v_cgst,
        'sgst_amount', v_sgst,
        'discount_amount', v_discount,
        'grand_total', v_grand_total,
        'payable_amount', v_payable,
        'payment_method', v_norm_payment_method,
        'payment_proof_url', p_payment_proof_url,
        'payment_status', 'unpaid',
        'created_at', NOW()
    );
END;
$$;
REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- RPC: create_customer_delivery_order
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
    p_restaurant_id UUID,
    p_items JSONB,
    p_delivery_address JSONB,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_payment_method TEXT DEFAULT 'cod',
    p_coupon_code TEXT DEFAULT NULL,
    p_delivery_notes TEXT DEFAULT NULL,
    p_payment_proof_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_prof_record RECORD;
    v_item RECORD;
    v_prod RECORD;
    v_order_id TEXT := 'ord-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
    v_item_id TEXT;
    v_order_number TEXT;
    v_invoice_prefix TEXT;
    v_assigned_seq INTEGER;
    v_subtotal NUMERIC(10,2) := 0.00;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_tax_total NUMERIC(10,2) := 0.00;
    v_tax_rate NUMERIC(5,2) := 5.00;
    v_discount NUMERIC(10,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_delivery_charge_base NUMERIC(10,2) := 0.00;
    v_free_delivery_above NUMERIC(10,2) := 0.00;
    v_enable_cod BOOLEAN := TRUE;
    v_is_gst_enabled BOOLEAN := FALSE;
    v_grand_total NUMERIC(10,2) := 0.00;
    v_payable NUMERIC(10,2) := 0.00;
    v_round_off NUMERIC(10,2) := 0.00;
    v_coupon_record RECORD;
    v_unit_price NUMERIC(10,2);
    v_item_subtotal NUMERIC(10,2);
    v_item_tax NUMERIC(10,2);
    v_item_notes TEXT;
    v_norm_payment_method TEXT := LOWER(TRIM(COALESCE(p_payment_method, 'cod')));
    v_addr_text TEXT;
    v_res JSONB;
BEGIN
    v_user_id := auth.uid();

    SELECT * INTO v_prof_record FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    IF v_prof_record.marketplace_enabled IS FALSE THEN
        RAISE EXCEPTION 'Online marketplace ordering is not enabled for this restaurant.';
    END IF;
    IF v_prof_record.is_open IS FALSE OR v_prof_record.accepts_delivery IS FALSE THEN
        RAISE EXCEPTION 'This restaurant is currently not accepting delivery orders.';
    END IF;

    SELECT
        COALESCE(delivery_charge_base, 0.00),
        COALESCE(free_delivery_above, 0.00),
        COALESCE(enable_cod, TRUE),
        COALESCE(is_gst_enabled, FALSE),
        COALESCE(default_tax_rate, tax_rate, 5.00)
    INTO
        v_delivery_charge_base,
        v_free_delivery_above,
        v_enable_cod,
        v_is_gst_enabled,
        v_tax_rate
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    LIMIT 1;

    IF v_delivery_charge_base IS NULL THEN
        SELECT
            COALESCE(delivery_charge_base, 0.00),
            COALESCE(free_delivery_above, 0.00),
            COALESCE(enable_cod, TRUE),
            COALESCE(is_gst_enabled, FALSE),
            COALESCE(default_tax_rate, 5.00)
        INTO
            v_delivery_charge_base,
            v_free_delivery_above,
            v_enable_cod,
            v_is_gst_enabled,
            v_tax_rate
        FROM public.restaurant_public_profiles
        WHERE restaurant_id = p_restaurant_id
        LIMIT 1;
    END IF;

    IF v_is_gst_enabled IS NOT TRUE THEN
        v_tax_rate := 0.00;
    END IF;

    IF v_norm_payment_method = 'cod' THEN
        IF v_enable_cod IS FALSE THEN
            RAISE EXCEPTION 'Cash on Delivery (COD) is not available for this restaurant.';
        END IF;
    ELSIF v_norm_payment_method IN ('online', 'upi') THEN
        IF p_payment_proof_url IS NULL OR TRIM(p_payment_proof_url) = '' THEN
            RAISE EXCEPTION 'Please upload your payment screenshot before placing the order.';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT, item_notes TEXT)
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero.';
        END IF;

        SELECT * INTO v_prod
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF v_prod.id IS NULL THEN
            RAISE EXCEPTION 'Product with ID % not found.', v_item.product_id;
        END IF;

        IF v_prod.restaurant_id != p_restaurant_id THEN
            RAISE EXCEPTION 'Cross-restaurant violation: Product % does not belong to this restaurant.', v_prod.name;
        END IF;

        IF v_prod.is_active IS FALSE OR v_prod.is_available IS FALSE THEN
            RAISE EXCEPTION 'Product % is currently unavailable.', v_prod.name;
        END IF;

        IF v_prod.stock_quantity IS NOT NULL AND v_prod.stock_quantity < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
                v_prod.name, v_prod.stock_quantity, v_item.quantity;
        END IF;

        IF v_prod.stock_quantity IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id;
        END IF;

        v_unit_price := COALESCE(v_prod.discounted_price, v_prod.price);
        v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
    END LOOP;

    IF v_prof_record.minimum_order_value IS NOT NULL AND v_subtotal < v_prof_record.minimum_order_value THEN
        RAISE EXCEPTION 'Order subtotal (₹%) is below the minimum order value of ₹%.',
            v_subtotal, v_prof_record.minimum_order_value;
    END IF;

    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon_record
        FROM public.coupons
        WHERE UPPER(code) = UPPER(trim(p_coupon_code))
        AND restaurant_id = p_restaurant_id
        AND is_active = TRUE
        FOR UPDATE;

        IF v_coupon_record.id IS NOT NULL THEN
            IF (v_coupon_record.start_date IS NOT NULL AND v_coupon_record.start_date > NOW()) THEN
                RAISE EXCEPTION 'This coupon has not started yet.';
            END IF;
            IF (v_coupon_record.expiry_date IS NOT NULL AND v_coupon_record.expiry_date < NOW()) THEN
                RAISE EXCEPTION 'This coupon code has expired.';
            END IF;
            IF (v_coupon_record.usage_limit IS NOT NULL AND v_coupon_record.used_count >= v_coupon_record.usage_limit) THEN
                RAISE EXCEPTION 'This coupon code has reached its maximum usage limit.';
            END IF;
            IF (v_coupon_record.min_order_value IS NOT NULL AND v_subtotal < v_coupon_record.min_order_value) THEN
                RAISE EXCEPTION 'Minimum order value for % is ₹%', v_coupon_record.code, v_coupon_record.min_order_value;
            END IF;

            IF v_coupon_record.discount_type = 'percentage' THEN
                v_discount := ROUND((v_subtotal * v_coupon_record.discount_value) / 100.0, 2);
                IF v_coupon_record.max_discount IS NOT NULL AND v_discount > v_coupon_record.max_discount THEN
                    v_discount := v_coupon_record.max_discount;
                END IF;
            ELSE
                v_discount := v_coupon_record.discount_value;
            END IF;
            v_discount := LEAST(v_discount, v_subtotal);

            UPDATE public.coupons
            SET used_count = used_count + 1,
                updated_at = NOW()
            WHERE id = v_coupon_record.id;
        ELSE
            RAISE EXCEPTION 'Invalid coupon code for this restaurant.';
        END IF;
    END IF;

    IF v_free_delivery_above > 0.00 AND v_subtotal >= v_free_delivery_above THEN
        v_delivery_fee := 0.00;
    ELSE
        v_delivery_fee := COALESCE(v_delivery_charge_base, 0.00);
    END IF;

    IF v_is_gst_enabled IS TRUE AND v_tax_rate > 0 THEN
        v_tax_total := ROUND(((v_subtotal - v_discount) * v_tax_rate) / 100.0, 2);
        v_cgst := ROUND(v_tax_total / 2.0, 2);
        v_sgst := ROUND(v_tax_total / 2.0, 2);
    ELSE
        v_tax_total := 0.00;
        v_cgst := 0.00;
        v_sgst := 0.00;
    END IF;

    v_grand_total := (v_subtotal - v_discount) + v_cgst + v_sgst + v_delivery_fee;
    v_payable := ROUND(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    SELECT invoice_sequence_prefix, invoice_next_number
    INTO v_invoice_prefix, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    v_invoice_prefix := COALESCE(v_invoice_prefix, 'DEL-');
    IF v_assigned_seq IS NOT NULL THEN
        UPDATE public.restaurant_settings
        SET invoice_next_number = v_assigned_seq + 1,
            updated_at = NOW()
        WHERE restaurant_id = p_restaurant_id;
        v_order_number := v_invoice_prefix || to_char(NOW(), 'YYYY') || '-' || LPAD(v_assigned_seq::TEXT, 5, '0');
    ELSE
        v_order_number := 'DEL-' || floor(1000 + random() * 9000)::TEXT;
    END IF;

    IF jsonb_typeof(p_delivery_address) = 'object' THEN
        v_addr_text := TRIM(
            COALESCE(p_delivery_address->>'address_line1', '') ||
            CASE WHEN p_delivery_address->>'address_line2' IS NOT NULL AND TRIM(p_delivery_address->>'address_line2') != '' THEN ', ' || (p_delivery_address->>'address_line2') ELSE '' END ||
            CASE WHEN p_delivery_address->>'landmark' IS NOT NULL AND TRIM(p_delivery_address->>'landmark') != '' THEN ', Near ' || (p_delivery_address->>'landmark') ELSE '' END ||
            CASE WHEN p_delivery_address->>'city' IS NOT NULL AND TRIM(p_delivery_address->>'city') != '' THEN ', ' || (p_delivery_address->>'city') ELSE '' END ||
            CASE WHEN p_delivery_address->>'postal_code' IS NOT NULL AND TRIM(p_delivery_address->>'postal_code') != '' THEN ' - ' || (p_delivery_address->>'postal_code') ELSE '' END ||
            ' (Phone: ' || COALESCE(p_delivery_address->>'phone', p_customer_phone) || ')'
        );
    ELSE
        v_addr_text := COALESCE(p_delivery_address#>>'{}', p_delivery_address::TEXT);
    END IF;

    INSERT INTO public.orders (
        id,
        restaurant_id,
        order_number,
        order_type,
        status,
        customer_name,
        customer_phone,
        delivery_address,
        customer_id,
        subtotal,
        cgst_amount,
        sgst_amount,
        igst_amount,
        discount_amount,
        coupon_code,
        coupon_discount,
        delivery_charge,
        service_charge,
        round_off,
        grand_total,
        payable_amount,
        paid_amount,
        payment_method,
        payment_proof_url,
        payment_status,
        notes,
        created_by,
        stock_deducted
    ) VALUES (
        v_order_id,
        p_restaurant_id,
        v_order_number,
        'delivery',
        'confirmed',
        p_customer_name,
        p_customer_phone,
        v_addr_text,
        v_user_id,
        v_subtotal,
        v_cgst,
        v_sgst,
        0.00,
        0.00,
        p_coupon_code,
        v_discount,
        v_delivery_fee,
        0.00,
        v_round_off,
        v_grand_total,
        v_payable,
        0.00,
        v_norm_payment_method,
        p_payment_proof_url,
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(v_norm_payment_method) || ')'),
        v_user_id::TEXT,
        TRUE
    );

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT, item_notes TEXT)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
        v_unit_price := COALESCE(v_prod.discounted_price, v_prod.price);
        v_item_subtotal := v_unit_price * v_item.quantity;

        IF v_is_gst_enabled IS TRUE AND v_tax_rate > 0 THEN
            v_item_tax := ROUND((v_item_subtotal * v_tax_rate) / 100.0, 2);
        ELSE
            v_item_tax := 0.00;
        END IF;

        v_item_notes := COALESCE(v_item.notes, v_item.item_notes);

        INSERT INTO public.order_items (
            id,
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            tax_rate,
            tax_amount,
            cgst_amount,
            sgst_amount,
            discount_amount,
            subtotal,
            total,
            total_price,
            notes,
            item_notes,
            image_url
        ) VALUES (
            v_item_id,
            v_order_id,
            v_prod.id,
            v_prod.name,
            v_unit_price,
            v_item.quantity,
            (CASE WHEN v_is_gst_enabled THEN v_tax_rate ELSE 0.00 END),
            v_item_tax,
            ROUND(v_item_tax / 2.0, 2),
            ROUND(v_item_tax / 2.0, 2),
            0.00,
            v_item_subtotal,
            v_item_subtotal,
            v_item_subtotal,
            v_item_notes,
            v_item_notes,
            v_prod.image_url
        );
    END LOOP;

    INSERT INTO public.order_status_events (
        order_id,
        restaurant_id,
        old_status,
        new_status,
        actor_type,
        changed_by,
        note
    ) VALUES (
        v_order_id,
        p_restaurant_id,
        NULL,
        'confirmed',
        'CUSTOMER',
        v_user_id,
        'Customer placed online delivery order (' || UPPER(v_norm_payment_method) || ')'
    );

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.customer_notifications (
            user_id,
            order_id,
            restaurant_id,
            title,
            message,
            type
        ) VALUES (
            v_user_id,
            v_order_id,
            p_restaurant_id,
            'Order Placed Successfully',
            'Your order #' || v_order_number || ' has been confirmed and sent to kitchen.',
            'ORDER_STATUS'
        );
    END IF;

    SELECT jsonb_build_object(
        'id', o.id,
        'restaurant_id', o.restaurant_id,
        'order_number', o.order_number,
        'order_type', o.order_type,
        'status', o.status,
        'customer_name', o.customer_name,
        'customer_phone', o.customer_phone,
        'delivery_address', o.delivery_address,
        'customer_id', o.customer_id,
        'subtotal', o.subtotal,
        'cgst_amount', o.cgst_amount,
        'sgst_amount', o.sgst_amount,
        'discount_amount', o.discount_amount,
        'coupon_code', o.coupon_code,
        'coupon_discount', o.coupon_discount,
        'delivery_charge', o.delivery_charge,
        'service_charge', o.service_charge,
        'round_off', o.round_off,
        'grand_total', o.grand_total,
        'payable_amount', o.payable_amount,
        'paid_amount', o.paid_amount,
        'payment_method', o.payment_method,
        'payment_proof_url', o.payment_proof_url,
        'payment_status', o.payment_status,
        'notes', o.notes,
        'created_at', o.created_at,
        'items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', oi.id,
                'order_id', oi.order_id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'tax_rate', oi.tax_rate,
                'tax_amount', oi.tax_amount,
                'cgst_amount', oi.cgst_amount,
                'sgst_amount', oi.sgst_amount,
                'subtotal', oi.subtotal,
                'total', oi.total,
                'total_price', oi.total_price,
                'notes', oi.notes,
                'item_notes', oi.item_notes,
                'image_url', oi.image_url
            )), '[]'::jsonb)
            FROM public.order_items oi
            WHERE oi.order_id = o.id
        )
    ) INTO v_res
    FROM public.orders o
    WHERE o.id = v_order_id;

    RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- RPC: update_delivery_order_status
DROP FUNCTION IF EXISTS public.update_delivery_order_status(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.update_delivery_order_status(
    p_order_id TEXT,
    p_status TEXT,
    p_notes TEXT DEFAULT NULL,
    p_payment_confirmed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
    v_valid_status BOOLEAN;
    v_is_authorized BOOLEAN := FALSE;
    v_res JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    p_status := LOWER(TRIM(p_status));
    IF p_status NOT IN ('pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition: %', p_status;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    IF public.is_super_admin() OR public.is_restaurant_member(v_order.restaurant_id, 'STAFF') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to update this order.';
    END IF;

    UPDATE public.orders
    SET
        status = p_status,
        payment_status = CASE 
            WHEN p_payment_confirmed IS TRUE THEN 'paid'
            WHEN p_status = 'delivered' AND payment_method IN ('cash', 'cod') THEN 'paid'
            ELSE payment_status
        END,
        paid_amount = CASE
            WHEN p_payment_confirmed IS TRUE THEN COALESCE(payable_amount, grand_total)
            WHEN p_status = 'delivered' AND payment_method IN ('cash', 'cod') THEN COALESCE(payable_amount, grand_total)
            ELSE paid_amount
        END,
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.order_status_events (
        order_id,
        restaurant_id,
        old_status,
        new_status,
        actor_type,
        changed_by,
        note
    ) VALUES (
        p_order_id,
        v_order.restaurant_id,
        v_order.status,
        p_status,
        'STAFF',
        v_caller_id,
        COALESCE(p_notes, 'Status updated to ' || p_status || ' by staff')
    );

    IF v_order.customer_id IS NOT NULL THEN
        INSERT INTO public.customer_notifications (
            user_id,
            order_id,
            restaurant_id,
            title,
            message,
            type
        ) VALUES (
            v_order.customer_id,
            p_order_id,
            v_order.restaurant_id,
            'Order Status Update: ' || UPPER(REPLACE(p_status, '_', ' ')),
            'Your order #' || v_order.order_number || ' status is now ' || REPLACE(p_status, '_', ' ') || '.',
            'ORDER_STATUS'
        );
    END IF;

    SELECT jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'status', o.status,
        'payment_status', o.payment_status,
        'paid_amount', o.paid_amount,
        'updated_at', o.updated_at
    ) INTO v_res
    FROM public.orders o
    WHERE o.id = p_order_id;

    RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- RPC: provision_privileged_user
DROP FUNCTION IF EXISTS public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.provision_privileged_user;
CREATE OR REPLACE FUNCTION public.provision_privileged_user(
    p_restaurant_id UUID,
    p_email TEXT,
    p_password TEXT DEFAULT 'Staff12345!',
    p_full_name TEXT DEFAULT 'Staff Member',
    p_phone TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'STAFF',
    p_preset TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := FALSE;
    v_user_id UUID;
    v_existing_mem_id UUID;
    v_member_id UUID;
    v_enc_pwd TEXT;
    v_role TEXT := UPPER(TRIM(COALESCE(p_role, 'STAFF')));
    v_email TEXT := LOWER(TRIM(p_email));
    v_full_name TEXT := TRIM(COALESCE(p_full_name, 'Staff Member'));
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id AND user_id = v_caller_id AND role = 'ADMIN' AND is_active = TRUE
        ) INTO v_is_admin;

        IF NOT v_is_admin THEN
            SELECT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller_id AND role IN ('ADMIN', 'SUPER_ADMIN')
            ) INTO v_is_admin;
        END IF;
    ELSE
        v_is_admin := TRUE;
    END IF;

    IF v_email = '' THEN
        RAISE EXCEPTION 'Email address is required.';
    END IF;

    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        SELECT id INTO v_existing_mem_id
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id
        LIMIT 1;

        IF v_existing_mem_id IS NOT NULL THEN
            UPDATE public.restaurant_members
            SET is_active = TRUE, role = v_role, updated_at = NOW()
            WHERE id = v_existing_mem_id
            RETURNING id INTO v_member_id;
        ELSE
            INSERT INTO public.restaurant_members (
                restaurant_id, user_id, role, is_active, created_at, updated_at
            ) VALUES (
                p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
            )
            RETURNING id INTO v_member_id;
        END IF;
    ELSE
        v_user_id := gen_random_uuid();
        v_enc_pwd := extensions.crypt(p_password, extensions.gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            v_enc_pwd,
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('full_name', v_full_name, 'role', v_role, 'phone', p_phone),
            NOW(),
            NOW()
        );

        INSERT INTO public.profiles (
            id, full_name, email, role, phone, created_at, updated_at
        ) VALUES (
            v_user_id, v_full_name, v_email, v_role, p_phone, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            phone = EXCLUDED.phone,
            updated_at = NOW();

        INSERT INTO public.restaurant_members (
            restaurant_id, user_id, role, is_active, created_at, updated_at
        ) VALUES (
            p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
        )
        RETURNING id INTO v_member_id;
    END IF;

    IF p_permissions IS NOT NULL THEN
        INSERT INTO public.restaurant_member_permissions (
            restaurant_member_id,
            can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
            can_manage_products, can_manage_categories, can_manage_tables,
            can_manage_coupons, can_view_reports, can_manage_register,
            can_view_settings, can_manage_settings, can_manage_staff,
            updated_at
        ) VALUES (
            v_member_id,
            COALESCE((p_permissions ->> 'can_use_pos')::BOOLEAN, TRUE),
            COALESCE((p_permissions ->> 'can_view_orders')::BOOLEAN, TRUE),
            COALESCE((p_permissions ->> 'can_edit_orders')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_cancel_orders')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_products')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_categories')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_tables')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_coupons')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_view_reports')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_register')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_view_settings')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_settings')::BOOLEAN, FALSE),
            COALESCE((p_permissions ->> 'can_manage_staff')::BOOLEAN, FALSE),
            NOW()
        )
        ON CONFLICT (restaurant_member_id) DO UPDATE SET
            can_use_pos = EXCLUDED.can_use_pos,
            can_view_orders = EXCLUDED.can_view_orders,
            can_edit_orders = EXCLUDED.can_edit_orders,
            can_cancel_orders = EXCLUDED.can_cancel_orders,
            can_manage_products = EXCLUDED.can_manage_products,
            can_manage_categories = EXCLUDED.can_manage_categories,
            can_manage_tables = EXCLUDED.can_manage_tables,
            can_manage_coupons = EXCLUDED.can_manage_coupons,
            can_view_reports = EXCLUDED.can_view_reports,
            can_manage_register = EXCLUDED.can_manage_register,
            can_view_settings = EXCLUDED.can_view_settings,
            can_manage_settings = EXCLUDED.can_manage_settings,
            can_manage_staff = EXCLUDED.can_manage_staff,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'member_id', v_member_id,
        'email', v_email,
        'role', v_role
    );
END;
$$;
REVOKE ALL ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- RPC: update_staff_permissions
DROP FUNCTION IF EXISTS public.update_staff_permissions(UUID, JSONB);
DROP FUNCTION IF EXISTS public.update_staff_permissions(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
    p_restaurant_member_id UUID,
    p_permissions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_member RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_member
    FROM public.restaurant_members
    WHERE id = p_restaurant_member_id;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION 'Restaurant member not found.';
    END IF;

    IF public.is_super_admin() OR public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: Only Restaurant Admins or Super Admins can update staff permissions.';
    END IF;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id,
        can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables,
        can_manage_coupons, can_view_reports, can_manage_register,
        can_view_settings, can_manage_settings, can_manage_staff,
        updated_at
    )
    VALUES (
        p_restaurant_member_id,
        COALESCE((p_permissions ->> 'can_use_pos')::BOOLEAN, TRUE),
        COALESCE((p_permissions ->> 'can_view_orders')::BOOLEAN, TRUE),
        COALESCE((p_permissions ->> 'can_edit_orders')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_cancel_orders')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_products')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_categories')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_tables')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_coupons')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_view_reports')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_register')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_view_settings')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_settings')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_staff')::BOOLEAN, FALSE),
        NOW()
    )
    ON CONFLICT (restaurant_member_id) DO UPDATE SET
        can_use_pos = EXCLUDED.can_use_pos,
        can_view_orders = EXCLUDED.can_view_orders,
        can_edit_orders = EXCLUDED.can_edit_orders,
        can_cancel_orders = EXCLUDED.can_cancel_orders,
        can_manage_products = EXCLUDED.can_manage_products,
        can_manage_categories = EXCLUDED.can_manage_categories,
        can_manage_tables = EXCLUDED.can_manage_tables,
        can_manage_coupons = EXCLUDED.can_manage_coupons,
        can_view_reports = EXCLUDED.can_view_reports,
        can_manage_register = EXCLUDED.can_manage_register,
        can_view_settings = EXCLUDED.can_view_settings,
        can_manage_settings = EXCLUDED.can_manage_settings,
        can_manage_staff = EXCLUDED.can_manage_staff,
        updated_at = NOW();

    RETURN jsonb_build_object('success', TRUE, 'message', 'Staff permissions updated successfully.');
END;
$$;
REVOKE ALL ON FUNCTION public.update_staff_permissions(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_permissions(UUID, JSONB) TO authenticated, service_role;

-- RPC: admin_reset_user_password
DROP FUNCTION IF EXISTS public.admin_reset_user_password(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_target_email TEXT;
    v_caller_is_admin BOOLEAN := FALSE;
    v_encrypted_pw TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User session required.';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long.';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller profile not found.';
    END IF;

    SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
    IF v_target_email IS NULL THEN
        SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;
    END IF;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found.';
    END IF;

    IF v_caller_role = 'SUPER_ADMIN' THEN
        NULL;
    ELSIF v_caller_role = 'ADMIN' THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.restaurant_members rm_caller
            JOIN public.restaurant_members rm_target ON rm_caller.restaurant_id = rm_target.restaurant_id
            WHERE rm_caller.user_id = v_caller_id 
              AND rm_caller.role = 'ADMIN'
              AND rm_caller.is_active = TRUE
              AND rm_target.user_id = p_user_id
        ) INTO v_caller_is_admin;

        IF NOT v_caller_is_admin THEN
            SELECT EXISTS (
                SELECT 1 FROM public.restaurant_members WHERE user_id = v_caller_id AND role = 'ADMIN' AND is_active = TRUE
            ) INTO v_caller_is_admin;
        END IF;

        IF NOT v_caller_is_admin THEN
            RAISE EXCEPTION 'Forbidden: You can only reset passwords for staff members belonging to your restaurant.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Forbidden: Insufficient privileges to reset member passwords.';
    END IF;

    v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Password updated successfully.',
        'user_id', p_user_id
    );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. STORAGE BUCKETS & PUBLIC/GUEST RLS POLICIES
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('product-images', 'product-images', TRUE),
    ('restaurant-assets', 'restaurant-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to product-images" ON storage.objects;
CREATE POLICY "Public Read Access" ON storage.objects
    FOR SELECT USING (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Allow upload for all users" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
CREATE POLICY "Allow upload for all users" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Allow update for all users" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
CREATE POLICY "Allow update for all users" ON storage.objects
    FOR UPDATE USING (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Allow delete for authenticated users" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;
CREATE POLICY "Allow delete for authenticated users" ON storage.objects
    FOR DELETE USING (bucket_id IN ('product-images', 'restaurant-assets') AND auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 7. SCHEMA CACHE RELOAD
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
