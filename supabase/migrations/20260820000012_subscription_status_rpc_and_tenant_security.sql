-- ============================================================================
-- MIGRATION 20260820000012: SUBSCRIPTION STATUS RPC, QR ORDER FIX & COUPON RLS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PUBLIC/ANON SUBSCRIPTION STATUS CHECK RPC (SECURITY DEFINER)
-- Allows QR diners, marketplace customers, and admins to safely verify
-- active SaaS subscription status without exposing billing details.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_restaurant_subscription_status(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_rest RECORD;
BEGIN
    -- 1. Validate restaurant exists
    SELECT id, name, status INTO v_rest
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    IF v_rest.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_allowed', FALSE,
            'status', 'none',
            'restaurant_status', 'NOT_FOUND',
            'plan_name', 'No Plan',
            'days_remaining', 0,
            'end_date', NULL,
            'message', 'Restaurant not found.'
        );
    END IF;

    -- 2. Check if restaurant is suspended by platform admins
    IF v_rest.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object(
            'is_allowed', FALSE,
            'status', 'suspended',
            'restaurant_status', 'SUSPENDED',
            'plan_name', 'Suspended',
            'days_remaining', 0,
            'end_date', NULL,
            'message', format('The restaurant account for "%s" has been suspended by platform administration.', v_rest.name)
        );
    END IF;

    -- 3. Fetch latest active/trial subscription with plan details
    SELECT s.id, s.status, s.start_date, s.end_date, p.name AS plan_name, p.code AS plan_code, p.features
    INTO v_sub
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
      AND LOWER(s.status) IN ('active', 'trial')
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- 4. If no active subscription found
    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'is_allowed', FALSE,
            'status', 'none',
            'restaurant_status', v_rest.status,
            'plan_name', 'No Plan',
            'days_remaining', 0,
            'end_date', NULL,
            'message', format('No active subscription plan found for "%s". Please subscribe to a SaaS plan to take orders.', v_rest.name)
        );
    END IF;

    -- 5. Active subscription verified
    RETURN jsonb_build_object(
        'is_allowed', TRUE,
        'status', v_sub.status,
        'restaurant_status', v_rest.status,
        'plan_name', v_sub.plan_name,
        'plan_code', v_sub.plan_code,
        'days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_sub.end_date - NOW())) / 86400)::INT),
        'end_date', v_sub.end_date,
        'message', 'Active subscription verified'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_subscription_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_subscription_status(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. FIX CREATE_GUEST_QR_ORDER RPC (REPLACE 'CUSTOMER_QR' STRING WITH NULL/CUSTOMER UUID)
-- Fixes PostgreSQL error 22P02: invalid input syntax for type uuid: "CUSTOMER_QR"
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_guest_qr_order(
    p_restaurant_id UUID,
    p_table_id TEXT,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_order_id TEXT;
    v_order_number TEXT;
    v_invoice_prefix TEXT;
    v_tax_rate NUMERIC;
    v_assigned_seq INTEGER;
    v_table_num TEXT;
    v_table_rest UUID;
    v_table_active BOOLEAN;
    v_rest_status TEXT;
    v_item JSONB;
    v_prod_id TEXT;
    v_prod_name TEXT;
    v_prod_price NUMERIC;
    v_prod_rest UUID;
    v_prod_active BOOLEAN;
    v_prod_available BOOLEAN;
    v_prod_stock INTEGER;
    v_prod_tax_rate NUMERIC;
    v_qty INTEGER;
    v_item_notes TEXT;
    v_item_subtotal NUMERIC;
    v_item_tax NUMERIC;
    v_item_total NUMERIC;
    v_subtotal NUMERIC := 0;
    v_cgst NUMERIC := 0;
    v_sgst NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    v_round_off NUMERIC := 0;
    v_payable NUMERIC := 0;
    v_cur_year TEXT;
    v_unsettled_id TEXT;
    v_item_id TEXT;
    v_clean_coupon TEXT;
    v_coupon_discount NUMERIC := 0;
    v_coupon_disc_type TEXT;
    v_coupon_disc_val NUMERIC;
    v_coupon_min_val NUMERIC;
    v_coupon_max_disc NUMERIC;
    v_coupon_active BOOLEAN;
    v_coupon_start TIMESTAMP WITH TIME ZONE;
    v_coupon_expiry TIMESTAMP WITH TIME ZONE;
    v_coupon_usage_limit INTEGER;
    v_coupon_used_count INTEGER;
    v_customer_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    -- 1. Validate Restaurant Exists & is ACTIVE
    SELECT status INTO v_rest_status
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    IF v_rest_status IS NULL OR v_rest_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Restaurant is not active or does not exist.';
    END IF;

    -- 2. Lock Table Row FOR UPDATE and Validate Belongs to Restaurant & ACTIVE
    SELECT table_number, restaurant_id, is_active INTO v_table_num, v_table_rest, v_table_active
    FROM public.tables
    WHERE id = p_table_id
    FOR UPDATE;

    IF v_table_rest IS NULL THEN
        RAISE EXCEPTION 'Table does not exist.';
    END IF;

    IF v_table_rest <> p_restaurant_id THEN
        RAISE EXCEPTION 'Table % does not belong to the specified restaurant.', p_table_id;
    END IF;

    IF v_table_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Table % is currently inactive.', v_table_num;
    END IF;

    -- 3. One active unsettled order rule (Evaluated under Table Row Lock)
    SELECT id INTO v_unsettled_id
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND table_id = p_table_id
      AND status NOT IN ('completed', 'cancelled')
      AND payment_status <> 'paid'
    LIMIT 1;

    IF v_unsettled_id IS NOT NULL THEN
        RAISE EXCEPTION 'Table % already has an active unsettled order (%).', v_table_num, v_unsettled_id;
    END IF;

    -- 4. Validate Items Payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- 5. Lock settings row, read exact NEXT AVAILABLE sequence, and advance counter by 1
    SELECT invoice_prefix, default_tax_rate, next_order_seq 
    INTO v_invoice_prefix, v_tax_rate, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    IF v_assigned_seq IS NULL THEN
        RAISE EXCEPTION 'Restaurant settings are missing for restaurant %.', p_restaurant_id;
    END IF;

    v_invoice_prefix := COALESCE(v_invoice_prefix, 'INV-');
    v_tax_rate := COALESCE(v_tax_rate, 5.0);

    UPDATE public.restaurant_settings
    SET next_order_seq = v_assigned_seq + 1,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    v_cur_year := to_char(NOW(), 'YYYY');
    v_order_number := v_invoice_prefix || v_cur_year || '-' || LPAD(v_assigned_seq::TEXT, 5, '0');
    v_order_id := 'ord-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);

    -- 6. Validate each item, lock product rows FOR UPDATE, verify stock & calculate subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := (v_item->>'quantity')::INTEGER;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity % for item %.', v_qty, v_prod_id;
        END IF;

        SELECT name, price, restaurant_id, is_active, is_available, stock_quantity, tax_rate
        INTO v_prod_name, v_prod_price, v_prod_rest, v_prod_active, v_prod_available, v_prod_stock, v_prod_tax_rate
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF v_prod_name IS NULL THEN
            RAISE EXCEPTION 'Product % not found.', v_prod_id;
        END IF;

        IF v_prod_rest <> p_restaurant_id THEN
            RAISE EXCEPTION 'Product % (%) belongs to another restaurant.', v_prod_name, v_prod_id;
        END IF;

        IF v_prod_active IS NOT TRUE OR v_prod_available IS NOT TRUE THEN
            RAISE EXCEPTION 'Product % is currently unavailable.', v_prod_name;
        END IF;

        IF v_prod_stock IS NOT NULL AND v_prod_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %.', 
                v_prod_name, v_prod_stock, v_qty;
        END IF;

        v_item_subtotal := v_prod_price * v_qty;
        v_item_tax := round(v_item_subtotal * (COALESCE(v_prod_tax_rate, v_tax_rate) / 100.0), 2);
        v_subtotal := v_subtotal + v_item_subtotal;
        v_cgst := v_cgst + round(v_item_tax / 2.0, 2);
        v_sgst := v_sgst + round(v_item_tax / 2.0, 2);

        IF v_prod_stock IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - v_qty,
                updated_at = NOW()
            WHERE id = v_prod_id;
        END IF;
    END LOOP;

    -- 7. Process Coupon if provided
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        v_clean_coupon := upper(trim(p_coupon_code));

        SELECT discount_type, discount_value, min_order_value, max_discount,
               is_active, start_date, expiry_date, usage_limit, used_count
        INTO v_coupon_disc_type, v_coupon_disc_val, v_coupon_min_val, v_coupon_max_disc,
             v_coupon_active, v_coupon_start, v_coupon_expiry, v_coupon_usage_limit, v_coupon_used_count
        FROM public.coupons
        WHERE restaurant_id = p_restaurant_id
          AND code = v_clean_coupon
        FOR UPDATE;

        IF v_coupon_disc_val IS NOT NULL THEN
            IF v_coupon_active IS TRUE
               AND (v_coupon_start IS NULL OR v_coupon_start <= NOW())
               AND (v_coupon_expiry IS NULL OR v_coupon_expiry >= NOW())
               AND (v_coupon_usage_limit IS NULL OR v_coupon_used_count < v_coupon_usage_limit)
               AND (v_subtotal >= COALESCE(v_coupon_min_val, 0)) THEN

                IF v_coupon_disc_type = 'percentage' THEN
                    v_coupon_discount := round((v_subtotal * v_coupon_disc_val) / 100.0, 2);
                    IF v_coupon_max_disc IS NOT NULL AND v_coupon_discount > v_coupon_max_disc THEN
                        v_coupon_discount := v_coupon_max_disc;
                    END IF;
                ELSE
                    v_coupon_discount := LEAST(v_subtotal, v_coupon_disc_val);
                END IF;

                UPDATE public.coupons
                SET used_count = used_count + 1,
                    updated_at = NOW()
                WHERE restaurant_id = p_restaurant_id
                  AND code = v_clean_coupon;
            ELSE
                v_coupon_discount := 0;
            END IF;
        END IF;
    END IF;

    v_grand_total := GREATEST(0, (v_subtotal - v_coupon_discount) + v_cgst + v_sgst);
    v_payable := round(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    -- 8. Insert Order Record (created_by uses valid customer_id UUID or NULL)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_id, customer_name, customer_phone, status, subtotal, discount_amount,
        coupon_code, coupon_discount, cgst_amount, sgst_amount, igst_amount,
        service_charge, grand_total, round_off, payable_amount, paid_amount,
        payment_status, notes, created_by, stock_deducted, created_at, updated_at
    )
    VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'dine_in', p_table_id, v_table_num,
        v_customer_id, COALESCE(NULLIF(trim(p_customer_name), ''), v_table_num || ' Guest'),
        NULLIF(trim(p_customer_phone), ''), 'confirmed', v_subtotal, v_coupon_discount,
        p_coupon_code, v_coupon_discount, v_cgst, v_sgst, 0, 0,
        v_grand_total, v_round_off, v_payable, 0, 'unpaid',
        CASE WHEN p_notes IS NOT NULL THEN '[QR_DINE_IN] ' || p_notes ELSE '[QR_DINE_IN]' END,
        v_customer_id, TRUE, NOW(), NOW()
    );

    -- 9. Insert Order Items Records
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := (v_item->>'quantity')::INTEGER;

        SELECT name, price, tax_rate INTO v_prod_name, v_prod_price, v_prod_tax_rate
        FROM public.products WHERE id = v_prod_id;

        v_item_subtotal := v_prod_price * v_qty;
        v_item_tax := round(v_item_subtotal * (COALESCE(v_prod_tax_rate, v_tax_rate) / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);

        INSERT INTO public.order_items (
            id, order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, item_notes, subtotal, total, created_at
        )
        VALUES (
            v_item_id, v_order_id, v_prod_id, v_prod_name, v_prod_price, v_qty,
            COALESCE(v_prod_tax_rate, v_tax_rate), v_item_tax, v_item->>'item_notes',
            v_item_subtotal, v_item_total, NOW()
        );
    END LOOP;

    -- Return JSON payload of the created order with items
    SELECT row_to_json(ord)::JSONB INTO v_result
    FROM (
        SELECT o.id, o.restaurant_id, o.order_number, o.order_type, o.table_id, o.table_number,
               o.customer_name, o.customer_phone, o.status, o.subtotal, o.discount_amount,
               o.coupon_code, o.coupon_discount, o.cgst_amount, o.sgst_amount, o.grand_total,
               o.round_off, o.payable_amount, o.paid_amount, o.payment_status, o.notes,
               o.created_at,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'order_id', oi.order_id,
                        'product_id', oi.product_id,
                        'product_name', oi.product_name,
                        'unit_price', oi.unit_price,
                        'quantity', oi.quantity,
                        'tax_rate', oi.tax_rate,
                        'tax_amount', oi.tax_amount,
                        'item_notes', oi.item_notes,
                        'subtotal', oi.subtotal,
                        'total', oi.total
                    )
                )
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            ), '[]'::JSONB) AS items
        FROM public.orders o
        WHERE o.id = v_order_id
    ) ord;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. ENFORCE ROW LEVEL SECURITY ON PUBLIC.COUPONS & TENANT ISOLATION
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Tenant Members Read Coupons" ON public.coupons;
CREATE POLICY "Tenant Members Read Coupons" ON public.coupons
    FOR SELECT TO authenticated, service_role
    USING (
        public.is_super_admin()
        OR auth.role() = 'service_role'
        OR public.is_restaurant_member(restaurant_id, 'STAFF')
    );

-- ----------------------------------------------------------------------------
-- 4. ADD EXPLICIT FOREIGN KEY FOR POSTGREST EMBEDDED QUERIES (IF MISSING)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_restaurant_members_profile'
    ) THEN
        ALTER TABLE public.restaurant_members
            ADD CONSTRAINT fk_restaurant_members_profile
            FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If profiles constraint already exists or cannot be created, keep graceful
    NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC COUPON USAGE INCREMENT FUNCTION (SECURITY DEFINER)
-- Atomically increments used_count if usage limit has not been reached.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id TEXT, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.coupons
    SET used_count = used_count + 1,
        updated_at = NOW()
    WHERE id = p_coupon_id
      AND restaurant_id = p_restaurant_id
      AND (usage_limit IS NULL OR used_count < usage_limit)
      AND is_active = TRUE;
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(TEXT, UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. ATOMIC CUSTOMER DELIVERY ORDER WITH COUPON VALIDATION (SECURITY DEFINER)
-- Accepts product_id TEXT (not UUID) and atomically validates stock and coupons.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
    p_restaurant_id UUID,
    p_items JSONB,                    -- Array of {product_id: TEXT, quantity: INT, notes: TEXT}
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
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_rest_status TEXT;
    v_prof_record RECORD;
    v_item RECORD;
    v_prod RECORD;
    v_order_id TEXT := 'ord-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
    v_item_id TEXT;
    v_order_number TEXT;
    v_invoice_prefix TEXT;
    v_assigned_seq INTEGER;
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

    -- 3. Validate Items Array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- Fetch Restaurant Default Tax Rate if configured
    SELECT COALESCE(default_tax_rate, 5.0) INTO v_tax_rate 
    FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 5.0; END IF;

    -- 4. Lock and Validate Products & Stock Atomically (product_id is TEXT)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT)
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
        v_subtotal := v_subtotal + (COALESCE(v_prod.discounted_price, v_prod.price) * v_item.quantity);
    END LOOP;

    -- Minimum order value validation
    IF v_prof_record.minimum_order_value IS NOT NULL AND v_subtotal < v_prof_record.minimum_order_value THEN
        RAISE EXCEPTION 'Order subtotal (₹%) is below the minimum order value of ₹%.', 
            v_subtotal, v_prof_record.minimum_order_value;
    END IF;

    -- 5. Validate Coupon Server-Side and atomically increment usage if provided
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
                v_discount := (v_subtotal * v_coupon_record.discount_value) / 100.0;
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

    -- 6. Taxes & Delivery Fee Calculation
    v_tax_total := ((v_subtotal - v_discount) * v_tax_rate) / 100.0;
    v_cgst := v_tax_total / 2.0;
    v_sgst := v_tax_total / 2.0;
    v_delivery_fee := 0.0;
    v_grand_total := (v_subtotal - v_discount) + v_tax_total + v_delivery_fee;
    v_payable := ROUND(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    -- 7. Sequential Order Number
    SELECT invoice_prefix, next_order_seq 
    INTO v_invoice_prefix, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    v_invoice_prefix := COALESCE(v_invoice_prefix, 'DEL-');
    IF v_assigned_seq IS NOT NULL THEN
        UPDATE public.restaurant_settings
        SET next_order_seq = v_assigned_seq + 1,
            updated_at = NOW()
        WHERE restaurant_id = p_restaurant_id;
        v_order_number := v_invoice_prefix || to_char(NOW(), 'YYYY') || '-' || LPAD(v_assigned_seq::TEXT, 5, '0');
    ELSE
        v_order_number := 'DEL-' || floor(1000 + random() * 9000)::TEXT;
    END IF;

    -- Format delivery address snapshot
    IF jsonb_typeof(p_delivery_address) = 'object' THEN
        v_addr_text := COALESCE(p_delivery_address->>'address_line1', '') || ', ' ||
                       COALESCE(p_delivery_address->>'landmark', '') || ', ' ||
                       COALESCE(p_delivery_address->>'city', '') || ', ' ||
                       COALESCE(p_delivery_address->>'postal_code', '') || ' (Phone: ' ||
                       COALESCE(p_delivery_address->>'phone', p_customer_phone) || ')';
    ELSE
        v_addr_text := COALESCE(p_delivery_address#>>'{}', p_delivery_address::TEXT);
    END IF;

    -- 8. Insert Order Record
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
        0,
        0,
        p_coupon_code,
        v_discount,
        v_delivery_fee,
        0,
        v_round_off,
        v_grand_total,
        v_payable,
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(p_payment_method) || ')'),
        v_user_id,
        TRUE
    );

    -- 9. Insert Order Items Records
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);

        INSERT INTO public.order_items (
            id,
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            tax_rate,
            tax_amount,
            item_notes,
            subtotal,
            total
        ) VALUES (
            v_item_id,
            v_order_id,
            v_prod.id,
            v_prod.name,
            COALESCE(v_prod.discounted_price, v_prod.price),
            v_item.quantity,
            v_tax_rate,
            (COALESCE(v_prod.discounted_price, v_prod.price) * v_item.quantity * v_tax_rate) / 100.0,
            v_item.notes,
            COALESCE(v_prod.discounted_price, v_prod.price) * v_item.quantity,
            (COALESCE(v_prod.discounted_price, v_prod.price) * v_item.quantity) + ((COALESCE(v_prod.discounted_price, v_prod.price) * v_item.quantity * v_tax_rate) / 100.0)
        );
    END LOOP;

    -- Return JSON payload of the created order
    SELECT row_to_json(o)::JSONB INTO v_res 
    FROM public.orders o 
    WHERE o.id = v_order_id;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

