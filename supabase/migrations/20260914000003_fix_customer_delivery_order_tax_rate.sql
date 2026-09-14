-- ==============================================================================
-- RESTROZ MIGRATION: FIX create_customer_delivery_order RPC
-- File: 20260914000003_fix_customer_delivery_order_tax_rate.sql
-- Description:
--   1. Fixes column "created_by" UUID type casting (v_user_id UUID instead of TEXT).
--   2. Fixes invalid column reference to default_tax_rate on restaurant_public_profiles.
--   3. Fixes order_status_events column names (old_status, actor_type, note).
--   4. Grants execute permissions to anon, authenticated, service_role.
-- ==============================================================================

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
    -- 1. Identify Caller (authenticated customer or null)
    v_user_id := auth.uid();

    -- 2. Validate Restaurant Public Profile & Open Ordering Status
    SELECT * INTO v_prof_record FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    IF v_prof_record.restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurant public profile not found.';
    END IF;
    IF v_prof_record.marketplace_enabled IS FALSE THEN
        RAISE EXCEPTION 'Online marketplace ordering is not enabled for this restaurant.';
    END IF;
    IF v_prof_record.is_open IS FALSE OR v_prof_record.accepts_delivery IS FALSE THEN
        RAISE EXCEPTION 'This restaurant is currently not accepting delivery orders.';
    END IF;

    -- 3. Fetch Delivery and Payment Settings
    SELECT
        COALESCE(rs.delivery_charge_base, 0.00),
        COALESCE(rs.free_delivery_above, 0.00),
        COALESCE(rs.enable_cod, TRUE),
        COALESCE(rs.is_gst_enabled, FALSE),
        COALESCE(rs.default_tax_rate, rs.tax_rate, 5.00)
    INTO
        v_delivery_charge_base,
        v_free_delivery_above,
        v_enable_cod,
        v_is_gst_enabled,
        v_tax_rate
    FROM public.restaurant_settings rs
    WHERE rs.restaurant_id = p_restaurant_id
    LIMIT 1;

    IF v_delivery_charge_base IS NULL THEN
        SELECT
            COALESCE(rpp.delivery_charge_base, 0.00),
            COALESCE(rpp.free_delivery_above, 0.00),
            COALESCE(rpp.enable_cod, TRUE),
            COALESCE(rpp.is_gst_enabled, FALSE)
        INTO
            v_delivery_charge_base,
            v_free_delivery_above,
            v_enable_cod,
            v_is_gst_enabled
        FROM public.restaurant_public_profiles rpp
        WHERE rpp.restaurant_id = p_restaurant_id
        LIMIT 1;
        
        v_tax_rate := 5.00;
    END IF;

    IF v_is_gst_enabled IS NOT TRUE THEN
        v_tax_rate := 0.00;
    END IF;

    -- 4. Enforce COD vs ONLINE Payment Rules
    IF v_norm_payment_method = 'cod' THEN
        IF v_enable_cod IS FALSE THEN
            RAISE EXCEPTION 'Cash on Delivery (COD) is not available for this restaurant.';
        END IF;
    ELSIF v_norm_payment_method IN ('online', 'upi') THEN
        IF p_payment_proof_url IS NULL OR TRIM(p_payment_proof_url) = '' THEN
            RAISE EXCEPTION 'Please upload your payment screenshot before placing the order.';
        END IF;
    END IF;

    -- 5. Validate Items Array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- 6. Lock and Validate Products & Stock Atomically
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

    -- Minimum order value validation
    IF v_prof_record.minimum_order_value IS NOT NULL AND v_subtotal < v_prof_record.minimum_order_value THEN
        RAISE EXCEPTION 'Order subtotal (₹%) is below the minimum order value of ₹%.',
            v_subtotal, v_prof_record.minimum_order_value;
    END IF;

    -- 7. Validate Coupon Server-Side
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

    -- 8. Authoritative Delivery Charge Calculation
    IF v_free_delivery_above > 0.00 AND v_subtotal >= v_free_delivery_above THEN
        v_delivery_fee := 0.00;
    ELSE
        v_delivery_fee := COALESCE(v_delivery_charge_base, 0.00);
    END IF;

    -- 9. Taxes & Grand Total Calculation
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

    -- 10. Sequential Order Number
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

    -- 11. Insert Order Record (created_by is UUID)
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
        v_user_id,
        TRUE
    );

    -- 12. Insert Order Items Records
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

    -- 13. Audit & Notifications (Exact columns: old_status, actor_type, note)
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

    -- 14. Return Complete Hydrated Order JSON
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
        'round_off', o.round_off,
        'grand_total', o.grand_total,
        'payable_amount', o.payable_amount,
        'payment_method', o.payment_method,
        'payment_proof_url', o.payment_proof_url,
        'payment_status', o.payment_status,
        'notes', o.notes,
        'created_at', o.created_at,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', oi.product_name,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'tax_rate', oi.tax_rate,
                'tax_amount', oi.tax_amount,
                'cgst_amount', oi.cgst_amount,
                'sgst_amount', oi.sgst_amount,
                'subtotal', oi.subtotal,
                'total_price', oi.total_price,
                'notes', oi.notes,
                'image_url', oi.image_url
            ))
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
