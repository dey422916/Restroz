-- ============================================================================
-- RATNADEEP POS SAAS — PHASE 3 MIGRATION
-- MULTI-RESTAURANT CUSTOMER MARKETPLACE & ATOMIC ONLINE ORDERING
-- Migration Version: 20260820000003_phase3_customer_marketplace.sql
-- Strictly Additive — Phase 1 and Phase 2 schema & data preserved 100%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RESTAURANT PUBLIC PROFILES TABLE
-- Customer-facing profile details decoupled from internal POS settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_public_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    marketplace_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    accepts_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    accepts_takeaway BOOLEAN NOT NULL DEFAULT TRUE,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    delivery_radius_km NUMERIC NOT NULL DEFAULT 10.0,
    minimum_order_value NUMERIC NOT NULL DEFAULT 0.0,
    estimated_delivery_minutes INTEGER NOT NULL DEFAULT 35,
    cuisine_tags TEXT[] NOT NULL DEFAULT ARRAY['Multi-Cuisine', 'Indian'],
    banner_url TEXT,
    public_description TEXT,
    opening_time TEXT NOT NULL DEFAULT '10:00 AM',
    closing_time TEXT NOT NULL DEFAULT '11:00 PM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_public_profile_restaurant UNIQUE (restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_public_profiles_restaurant ON public.restaurant_public_profiles (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_public_profiles_marketplace ON public.restaurant_public_profiles (marketplace_enabled, is_open);

-- ----------------------------------------------------------------------------
-- 2. CUSTOMER ADDRESSES TABLE
-- Saved delivery addresses for authenticated customers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home', -- 'Home', 'Work', 'Other'
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    landmark TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    latitude NUMERIC,
    longitude NUMERIC,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON public.customer_addresses (user_id);

-- ----------------------------------------------------------------------------
-- 3. FAVORITE RESTAURANTS TABLE (Foundation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorite_restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_favorite_restaurant UNIQUE (user_id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_restaurants_user ON public.favorite_restaurants (user_id);

-- ----------------------------------------------------------------------------
-- 3B. EXPAND ORDERS STATUS CHECK CONSTRAINT FOR DELIVERY PROGRESSION
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('draft', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'delivered', 'completed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 4. SEED INITIAL PUBLIC PROFILES FOR EXISTING RESTAURANTS
-- ----------------------------------------------------------------------------
INSERT INTO public.restaurant_public_profiles (
    restaurant_id, marketplace_enabled, accepts_delivery, accepts_takeaway,
    is_open, delivery_radius_km, minimum_order_value, estimated_delivery_minutes,
    cuisine_tags, public_description, opening_time, closing_time
)
SELECT 
    r.id, TRUE, TRUE, TRUE,
    TRUE, 12.0, 100.0, 30,
    ARRAY['North Indian', 'Chinese', 'Beverages', 'Chai'],
    'Authentic dining, premium beverages, and fast doorstep delivery from Ratnadeep.',
    '09:00 AM', '11:30 PM'
FROM public.restaurants r
WHERE r.id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (restaurant_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) FOR PHASE 3 TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_restaurants ENABLE ROW LEVEL SECURITY;

-- Public Profiles: Everyone can read active profiles; Super Admin & Restaurant Admin can manage
DROP POLICY IF EXISTS "Public Read Restaurant Profiles" ON public.restaurant_public_profiles;
CREATE POLICY "Public Read Restaurant Profiles" ON public.restaurant_public_profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Manage Restaurant Public Profile" ON public.restaurant_public_profiles;
CREATE POLICY "Admin Manage Restaurant Public Profile" ON public.restaurant_public_profiles
    FOR ALL USING (
        (SELECT (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean = true) OR
        (SELECT role = 'SUPER_ADMIN' FROM public.profiles WHERE id = auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.restaurant_members m
            WHERE m.restaurant_id = public.restaurant_public_profiles.restaurant_id
            AND m.user_id = auth.uid()
            AND m.role = 'ADMIN'
            AND m.is_active = true
        )
    );

-- Customer Addresses: Customer can CRUD only their own addresses
DROP POLICY IF EXISTS "Customer Manage Own Addresses" ON public.customer_addresses;
CREATE POLICY "Customer Manage Own Addresses" ON public.customer_addresses
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Favorite Restaurants: Customer can CRUD only their own favorites
DROP POLICY IF EXISTS "Customer Manage Favorites" ON public.favorite_restaurants;
CREATE POLICY "Customer Manage Favorites" ON public.favorite_restaurants
    FOR ALL USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Ensure public marketplace product read policy allows customers to read active products
DROP POLICY IF EXISTS "Marketplace Public Read Products" ON public.products;
CREATE POLICY "Marketplace Public Read Products" ON public.products
    FOR SELECT USING (is_active = true AND is_available = true);

-- Ensure public marketplace category read policy allows customers to read active categories
DROP POLICY IF EXISTS "Marketplace Public Read Categories" ON public.categories;
CREATE POLICY "Marketplace Public Read Categories" ON public.categories
    FOR SELECT USING (is_active = true);

-- ----------------------------------------------------------------------------
-- 6. ATOMIC CUSTOMER ONLINE DELIVERY ORDER CREATION RPC
-- Server-side pricing, stock lock & atomic deduction, coupon validation,
-- sequential invoice numbering, and strict restaurant isolation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
    p_restaurant_id UUID,
    p_items JSONB,                    -- Array of {product_id: UUID, quantity: INT, notes: TEXT}
    p_delivery_address JSONB,         -- Full address snapshot object or string
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_payment_method TEXT DEFAULT 'cod', -- 'cod' or 'online'
    p_coupon_code TEXT DEFAULT NULL,
    p_delivery_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_rest_status TEXT;
    v_sub_active BOOLEAN;
    v_prof_record RECORD;
    v_item RECORD;
    v_prod RECORD;
    v_order_id UUID := gen_random_uuid();
    v_order_number TEXT;
    v_subtotal NUMERIC := 0.0;
    v_cgst NUMERIC := 0.0;
    v_sgst NUMERIC := 0.0;
    v_tax_total NUMERIC := 0.0;
    v_discount NUMERIC := 0.0;
    v_delivery_fee NUMERIC := 0.0;
    v_grand_total NUMERIC := 0.0;
    v_payable NUMERIC := 0.0;
    v_round_off NUMERIC := 0.0;
    v_tax_rate NUMERIC := 5.0;
    v_addr_text TEXT;
    v_coupon_record RECORD;
    v_res JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to place online delivery orders.';
    END IF;

    -- 1. Validate Restaurant existence and operational status
    SELECT status INTO v_rest_status FROM public.restaurants WHERE id = p_restaurant_id;
    IF v_rest_status IS NULL OR v_rest_status != 'ACTIVE' THEN
        RAISE EXCEPTION 'This restaurant is currently inactive or not found.';
    END IF;

    -- 2. Validate Restaurant Public Profile & Open Ordering Status
    SELECT * INTO v_prof_record FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    IF v_prof_record.marketplace_enabled IS FALSE THEN
        RAISE EXCEPTION 'Online marketplace ordering is not enabled for this restaurant.';
    END IF;
    IF v_prof_record.is_open IS FALSE OR v_prof_record.accepts_delivery IS FALSE THEN
        RAISE EXCEPTION 'This restaurant is currently not accepting delivery orders.';
    END IF;

    -- 3. Validate Restaurant Subscription
    SELECT EXISTS (
        SELECT 1 FROM public.restaurant_subscriptions
        WHERE restaurant_id = p_restaurant_id
        AND status IN ('active', 'trial')
        AND end_date >= NOW()
    ) INTO v_sub_active;

    IF NOT v_sub_active AND p_restaurant_id != 'a0000000-0000-0000-0000-000000000001' THEN
        RAISE EXCEPTION 'Restaurant subscription is currently inactive. Orders cannot be placed.';
    END IF;

    -- 4. Validate Items Array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- Fetch Restaurant Default Tax Rate if configured
    SELECT COALESCE(default_tax_rate, 5.0) INTO v_tax_rate 
    FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 5.0; END IF;

    -- 5. Lock and Validate Products & Stock Atomically
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT, notes TEXT)
    LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Item quantity must be greater than zero.';
        END IF;

        -- Lock product row FOR UPDATE to prevent race conditions
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

        -- Check stock if stock tracking is enabled (stock_quantity > 0)
        IF v_prod.stock_quantity IS NOT NULL AND v_prod.stock_quantity < v_item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %', 
                v_prod.name, v_prod.stock_quantity, v_item.quantity;
        END IF;

        -- Deduct stock atomically
        IF v_prod.stock_quantity IS NOT NULL THEN
            UPDATE public.products 
            SET stock_quantity = stock_quantity - v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.product_id;
        END IF;

        -- Server-side line calculations
        v_subtotal := v_subtotal + (v_prod.price * v_item.quantity);
    END LOOP;

    -- Minimum order value validation
    IF v_prof_record.minimum_order_value IS NOT NULL AND v_subtotal < v_prof_record.minimum_order_value THEN
        RAISE EXCEPTION 'Order subtotal (₹%) is below the minimum order value of ₹%.', 
            v_subtotal, v_prof_record.minimum_order_value;
    END IF;

    -- 6. Validate Coupon Server-Side if provided
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon_record 
        FROM public.coupons
        WHERE UPPER(code) = UPPER(trim(p_coupon_code))
        AND restaurant_id = p_restaurant_id
        AND is_active = TRUE
        AND (valid_from IS NULL OR valid_from <= NOW())
        AND (valid_until IS NULL OR valid_until >= NOW())
        LIMIT 1;

        IF v_coupon_record.id IS NOT NULL THEN
            IF v_coupon_record.discount_type = 'percentage' THEN
                v_discount := (v_subtotal * v_coupon_record.discount_value) / 100.0;
                IF v_coupon_record.max_discount IS NOT NULL AND v_discount > v_coupon_record.max_discount THEN
                    v_discount := v_coupon_record.max_discount;
                END IF;
            ELSE
                v_discount := v_coupon_record.discount_value;
            END IF;
            v_discount := LEAST(v_discount, v_subtotal);
        END IF;
    END IF;

    -- 7. Taxes & Delivery Fee Calculation
    v_tax_total := ((v_subtotal - v_discount) * v_tax_rate) / 100.0;
    v_cgst := v_tax_total / 2.0;
    v_sgst := v_tax_total / 2.0;
    v_delivery_fee := 0.0; -- Delivery fee configuration
    v_grand_total := (v_subtotal - v_discount) + v_tax_total + v_delivery_fee;
    v_payable := ROUND(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    -- 8. Generate Sequential Order Number
    v_order_number := public.get_next_order_number(p_restaurant_id);

    -- Format delivery address snapshot
    IF jsonb_typeof(p_delivery_address) = 'object' THEN
        v_addr_text := COALESCE(p_delivery_address->>'address_line1', '') || ', ' ||
                       COALESCE(p_delivery_address->>'landmark', '') || ', ' ||
                       COALESCE(p_delivery_address->>'city', '') || ', ' ||
                       COALESCE(p_delivery_address->>'postal_code', '') || ' (Phone: ' ||
                       COALESCE(p_delivery_address->>'phone', p_customer_phone) || ')';
    ELSE
        v_addr_text := p_delivery_address #>> '{}';
    END IF;

    -- 9. Insert Order Record
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, status,
        customer_name, customer_phone, delivery_address, customer_id,
        subtotal, cgst_amount, sgst_amount, igst_amount,
        discount_amount, coupon_code, coupon_discount,
        delivery_charge, service_charge, round_off, grand_total, payable_amount,
        payment_status, notes, created_by,
        created_at, updated_at
    ) VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'delivery', 'confirmed',
        p_customer_name, p_customer_phone, v_addr_text, v_user_id,
        v_subtotal, v_cgst, v_sgst, 0.0,
        v_discount, p_coupon_code, v_discount,
        v_delivery_fee, 0.0, v_round_off, v_payable, v_payable,
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(p_payment_method) || ')'), v_user_id,
        NOW(), NOW()
    );

    -- 10. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT, notes TEXT)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;

        INSERT INTO public.order_items (
            id, order_id, product_id, product_name, sku,
            unit_price, tax_rate, quantity,
            subtotal, tax_amount, total, notes, created_at
        ) VALUES (
            gen_random_uuid(), v_order_id, v_prod.id, v_prod.name, v_prod.sku,
            v_prod.price, v_prod.tax_rate, v_item.quantity,
            v_prod.price * v_item.quantity,
            ((v_prod.price * v_item.quantity) * v_prod.tax_rate) / 100.0,
            (v_prod.price * v_item.quantity) * (1 + (v_prod.tax_rate / 100.0)),
            v_item.notes, NOW()
        );
    END LOOP;

    -- 11. Audit Log
    INSERT INTO public.audit_logs (
        restaurant_id, user_id, action, details, created_at
    ) VALUES (
        p_restaurant_id, v_user_id, 'CUSTOMER_ORDER_PLACED',
        jsonb_build_object(
            'order_id', v_order_id,
            'order_number', v_order_number,
            'payable_amount', v_payable,
            'payment_method', p_payment_method
        ), NOW()
    );

    SELECT to_jsonb(o) INTO v_res FROM public.orders o WHERE o.id = v_order_id;
    RETURN v_res;
END;
$$;
