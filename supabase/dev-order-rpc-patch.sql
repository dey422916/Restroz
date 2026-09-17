-- ============================================================================
-- RESTROZ DEV ENVIRONMENT — ORDER RPC SIGNATURE RECONCILIATION PATCH
-- Environment: DEVELOPMENT (restroz-dev)
-- Target Database: restroz-dev Supabase Project
-- ============================================================================
-- Purpose:
-- Replaces the obsolete 9-parameter create_customer_delivery_order RPC with the
-- authoritative 8-parameter signature matching frontend marketplaceService and
-- updates update_delivery_order_status to support p_payment_confirmed.
--
-- Safety Guarantees:
-- 1. Strictly non-destructive — preserves all existing test records and DEV data.
-- 2. Uses SECURITY DEFINER with strict search_path and server-side price validation.
-- 3. Drops only the obsolete overloaded function signature.
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Applying RestroZ DEV Order RPC Signature Reconciliation Patch...';
END $$;

-- ----------------------------------------------------------------------------
-- 0. RECONCILE RESTAURANT_SETTINGS SCHEMA
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_sequence_prefix TEXT DEFAULT 'INV';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_next_number INTEGER DEFAULT 1;

UPDATE public.restaurant_settings
SET default_tax_rate = COALESCE(tax_rate, 5.0)
WHERE default_tax_rate IS NULL;

UPDATE public.restaurant_settings
SET tax_rate = COALESCE(default_tax_rate, 5.0)
WHERE tax_rate IS NULL;

-- ----------------------------------------------------------------------------
-- 1. DROP OBSOLETE OVERLOADED SIGNATURES
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_delivery_order_status(TEXT, TEXT, TEXT);

-- ----------------------------------------------------------------------------
-- 2. CREATE AUTHORITATIVE CUSTOMER DELIVERY ORDER RPC (8 PARAMETERS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
    p_restaurant_id UUID,
    p_items JSONB,                    -- Array of {product_id: TEXT, quantity: INT, notes/item_notes: TEXT}
    p_delivery_address JSONB,         -- Address snapshot object or string
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_payment_method TEXT DEFAULT 'cod', -- 'cod', 'cash', 'upi', 'card', 'online'
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
    v_subtotal NUMERIC(10,2) := 0.00;
    v_cgst NUMERIC(10,2) := 0.00;
    v_sgst NUMERIC(10,2) := 0.00;
    v_tax_total NUMERIC(10,2) := 0.00;
    v_tax_rate NUMERIC(5,2) := 5.00;
    v_discount NUMERIC(10,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_grand_total NUMERIC(10,2) := 0.00;
    v_payable NUMERIC(10,2) := 0.00;
    v_round_off NUMERIC(10,2) := 0.00;
    v_unit_price NUMERIC(10,2);
    v_item_subtotal NUMERIC(10,2);
    v_item_tax NUMERIC(10,2);
    v_item_notes TEXT;
    v_coupon_record RECORD;
    v_addr_text TEXT;
    v_res JSONB;
BEGIN
    -- Determine placing user (supports authenticated customer or fallback to Panch Phoron test customer)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM auth.users WHERE email = 'ppcu@yopmail.com' LIMIT 1;
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
    SELECT COALESCE(default_tax_rate, tax_rate, 5.0) INTO v_tax_rate 
    FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id LIMIT 1;
    IF v_tax_rate IS NULL THEN v_tax_rate := 5.00; END IF;

    -- 4. Lock and Validate Products & Stock Atomically (product_id is TEXT)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT, item_notes TEXT)
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
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

        -- Server-side line calculations using actual database prices
        v_unit_price := COALESCE(v_prod.discounted_price, v_prod.price);
        v_subtotal := v_subtotal + (v_unit_price * v_item.quantity);
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

    -- 6. Taxes & Delivery Fee Calculation
    v_tax_total := ROUND(((v_subtotal - v_discount) * v_tax_rate) / 100.0, 2);
    v_cgst := ROUND(v_tax_total / 2.0, 2);
    v_sgst := ROUND(v_tax_total / 2.0, 2);
    v_delivery_fee := 0.00;
    v_grand_total := (v_subtotal - v_discount) + v_cgst + v_sgst + v_delivery_fee;
    v_payable := ROUND(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    -- 7. Sequential Order Number
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

    -- Format delivery address snapshot
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
        paid_amount,
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
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(p_payment_method) || ')'),
        v_user_id::TEXT,
        TRUE
    );

    -- 9. Insert Order Items Records
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id TEXT, quantity INT, notes TEXT, item_notes TEXT)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
        v_unit_price := COALESCE(v_prod.discounted_price, v_prod.price);
        v_item_subtotal := v_unit_price * v_item.quantity;
        v_item_tax := ROUND((v_item_subtotal * v_tax_rate) / 100.0, 2);
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
            v_tax_rate,
            v_item_tax,
            ROUND(v_item_tax / 2.0, 2),
            ROUND(v_item_tax / 2.0, 2),
            0.00,
            v_item_subtotal,
            v_item_subtotal + v_item_tax,
            v_item_subtotal + v_item_tax,
            v_item_notes,
            v_item_notes,
            v_prod.image_url
        );
    END LOOP;

    -- 10. Log initial order status event
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
        'Order placed online via Customer Marketplace'
    );

    -- 11. Create In-App Customer Notification
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
        'Your order #' || v_order_number || ' has been placed and confirmed.',
        'ORDER_STATUS'
    );

    -- Return full JSON payload of created order
    SELECT row_to_json(o)::JSONB INTO v_res 
    FROM public.orders o 
    WHERE o.id = v_order_id;

    RETURN v_res;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. UPDATE DELIVERY ORDER STATUS RPC (4 PARAMETERS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_delivery_order_status(
    p_order_id TEXT,
    p_new_status TEXT,
    p_note TEXT DEFAULT NULL,
    p_payment_confirmed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_user_id UUID := auth.uid();
    v_actor_type TEXT := 'STAFF';
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF NOT public.is_restaurant_member(v_order.restaurant_id, 'STAFF') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized to update order status.';
    END IF;

    IF public.is_super_admin() THEN
        v_actor_type := 'ADMIN';
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        payment_status = CASE WHEN p_payment_confirmed THEN 'paid' ELSE payment_status END,
        paid_amount = CASE WHEN p_payment_confirmed THEN payable_amount ELSE paid_amount END,
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.order_status_events (
        order_id, restaurant_id, old_status, new_status, actor_type, changed_by, note
    ) VALUES (
        p_order_id, v_order.restaurant_id, v_order.status, p_new_status, v_actor_type, v_user_id, p_note
    );

    IF v_order.customer_id IS NOT NULL THEN
        INSERT INTO public.customer_notifications (
            user_id, order_id, restaurant_id, title, message, type
        ) VALUES (
            v_order.customer_id,
            p_order_id,
            v_order.restaurant_id,
            'Order Status Updated',
            'Your order #' || v_order.order_number || ' is now ' || REPLACE(p_new_status, '_', ' ') || '.',
            'ORDER_STATUS'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', p_new_status);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. FUNCTION PERMISSIONS & POSTGREST SCHEMA CACHE RELOAD
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ RestroZ DEV Order RPC Signature Reconciliation Patch completed successfully!';
END $$;
