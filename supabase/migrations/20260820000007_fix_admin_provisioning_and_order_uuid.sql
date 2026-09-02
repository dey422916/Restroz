-- ============================================================================
-- MIGRATION 20260820000007: PRIVILEGED ADMIN PROVISIONING & ORDER UUID FIX
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX CUSTOMER DELIVERY ORDER RPC (SUPPORT TEXT/GENUINE PRODUCT IDs)
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
    v_sub_active BOOLEAN;
    v_prof_record RECORD;
    v_item RECORD;
    v_prod RECORD;
    v_order_id TEXT := 'ord-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
    v_item_id TEXT;
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

    -- 5. Lock and Validate Products & Stock Atomically (product_id is TEXT)
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
    v_delivery_fee := 0.0;
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
        payment_status, notes, created_by, stock_deducted,
        created_at, updated_at
    ) VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'delivery', 'confirmed',
        p_customer_name, p_customer_phone, v_addr_text, v_user_id,
        v_subtotal, v_cgst, v_sgst, 0.0,
        v_discount, p_coupon_code, v_discount,
        v_delivery_fee, 0.0, v_round_off, v_payable, v_payable,
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(p_payment_method) || ')'), v_user_id, TRUE,
        NOW(), NOW()
    );

    -- 10. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);

        INSERT INTO public.order_items (
            id, order_id, product_id, product_name,
            unit_price, quantity, tax_rate, tax_amount,
            item_notes, subtotal, total, created_at
        ) VALUES (
            v_item_id, v_order_id, v_prod.id, v_prod.name,
            v_prod.price, v_item.quantity, COALESCE(v_prod.tax_rate, v_tax_rate),
            ((v_prod.price * v_item.quantity) * COALESCE(v_prod.tax_rate, v_tax_rate)) / 100.0,
            v_item.notes,
            v_prod.price * v_item.quantity,
            (v_prod.price * v_item.quantity) * (1 + (COALESCE(v_prod.tax_rate, v_tax_rate) / 100.0)),
            NOW()
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

GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. SECURE PRIVILEGED USER & MEMBER PROVISIONING RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_privileged_user(
    p_restaurant_id UUID,
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
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
    v_is_super BOOLEAN := FALSE;
    v_is_admin BOOLEAN := FALSE;
    v_user_id UUID;
    v_existing_mem_id UUID;
    v_existing_is_active BOOLEAN;
    v_member_id UUID;
    v_enc_pwd TEXT;
    v_role TEXT := UPPER(TRIM(p_role));
    v_email TEXT := LOWER(TRIM(p_email));
    v_full_name TEXT := TRIM(p_full_name);
BEGIN
    v_caller_id := auth.uid();

    -- 1. Verify caller authorization
    v_is_super := public.is_super_admin();
    v_is_admin := public.is_restaurant_member(p_restaurant_id, 'ADMIN');

    IF v_is_super THEN
        -- Super Admin can create ADMIN or STAFF
        IF v_role NOT IN ('ADMIN', 'STAFF') THEN
            RAISE EXCEPTION 'Invalid role: %. Super Admin may only provision ADMIN or STAFF.', v_role;
        END IF;
    ELSIF v_is_admin THEN
        -- Restaurant Admin can ONLY create STAFF for their own restaurant
        IF v_role != 'STAFF' THEN
            RAISE EXCEPTION 'Forbidden: Restaurant Admins can only provision STAFF accounts.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized: Insufficient privileges to provision restaurant members.';
    END IF;

    IF v_email = '' OR v_full_name = '' THEN
        RAISE EXCEPTION 'Full name and email address are required.';
    END IF;

    -- 2. Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- User exists in Auth: check existing restaurant membership
        SELECT id, is_active INTO v_existing_mem_id, v_existing_is_active
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id
        LIMIT 1;

        IF v_existing_mem_id IS NOT NULL THEN
            IF v_existing_is_active IS TRUE THEN
                RAISE EXCEPTION 'This user (%) is already an active member of this restaurant.', v_email;
            ELSE
                -- Reactivate existing membership
                UPDATE public.restaurant_members
                SET is_active = TRUE, role = v_role, updated_at = NOW()
                WHERE id = v_existing_mem_id
                RETURNING id INTO v_member_id;
            END IF;
        ELSE
            -- Attach existing user to new restaurant membership
            INSERT INTO public.restaurant_members (
                restaurant_id, user_id, role, is_active, created_at, updated_at
            ) VALUES (
                p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
            ) RETURNING id INTO v_member_id;
        END IF;

        -- Update profile name/phone if provided
        UPDATE public.profiles
        SET full_name = COALESCE(NULLIF(v_full_name, ''), full_name),
            phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
            updated_at = NOW()
        WHERE id = v_user_id;

    ELSE
        -- 3. User does not exist: Provision new Supabase Auth User with confirmed email
        v_user_id := gen_random_uuid();
        v_enc_pwd := crypt(COALESCE(NULLIF(TRIM(p_password), ''), 'Ratnadeep1@'), gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token,
            is_super_admin
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
            v_email, v_enc_pwd, NOW(), NOW(), NULL,
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', v_full_name, 'role', v_role),
            NOW(), NOW(), '', '', '', '', FALSE
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_user_id,
            jsonb_build_object('sub', v_user_id::TEXT, 'email', v_email),
            'email', v_user_id::TEXT, NOW(), NOW(), NOW()
        );

        -- Create profile
        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_email, v_full_name, NULLIF(TRIM(p_phone), ''), v_role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = COALESCE(EXCLUDED.phone, profiles.phone),
            updated_at = NOW();

        -- Create restaurant member join record
        INSERT INTO public.restaurant_members (
            restaurant_id, user_id, role, is_active, created_at, updated_at
        ) VALUES (
            p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
        ) RETURNING id INTO v_member_id;
    END IF;

    -- 4. Configure permissions for STAFF
    IF v_role = 'STAFF' THEN
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
                COALESCE((p_permissions->>'can_use_pos')::BOOLEAN, TRUE),
                COALESCE((p_permissions->>'can_view_orders')::BOOLEAN, TRUE),
                COALESCE((p_permissions->>'can_edit_orders')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_cancel_orders')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_products')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_categories')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_tables')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_coupons')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_view_reports')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_register')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_view_settings')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_settings')::BOOLEAN, FALSE),
                COALESCE((p_permissions->>'can_manage_staff')::BOOLEAN, FALSE),
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
        ELSIF p_preset IS NOT NULL THEN
            IF UPPER(p_preset) = 'CASHIER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_manage_register, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_manage_register = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'WAITER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_manage_tables, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_manage_tables = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'MANAGER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
                    can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
                    can_view_reports, can_manage_register, can_view_settings, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_cancel_orders = TRUE,
                    can_manage_products = TRUE, can_manage_categories = TRUE, can_manage_tables = TRUE,
                    can_manage_coupons = TRUE, can_view_reports = TRUE, can_manage_register = TRUE,
                    can_view_settings = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'KITCHEN' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, updated_at = NOW();
            END IF;
        END IF;
    END IF;

    -- 5. Audit Log
    INSERT INTO public.audit_logs (
        restaurant_id, user_id, action, details, created_at
    ) VALUES (
        p_restaurant_id, COALESCE(v_caller_id, v_user_id), 'PROVISION_MEMBER',
        jsonb_build_object(
            'target_user_id', v_user_id,
            'target_email', v_email,
            'role', v_role,
            'preset', p_preset
        ), NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'member_id', v_member_id,
        'email', v_email,
        'role', v_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
