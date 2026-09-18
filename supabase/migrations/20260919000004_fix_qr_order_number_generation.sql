-- ============================================================================
-- Migration: 20260919000004_fix_qr_order_number_generation.sql
-- Description: Fix get_next_order_number and create_guest_qr_order RPCs for 
--              public/anonymous QR menu ordering flow.
-- ============================================================================

-- 1. Ensure restaurant_settings has all needed columns with default values
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS next_order_seq INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invoice_sequence_prefix TEXT DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS invoice_next_number INTEGER DEFAULT 1;

-- 2. Create / Replace atomic get_next_order_number function
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_restaurant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_assigned_seq INTEGER;
    v_invoice_prefix TEXT;
    v_cur_year TEXT;
    v_restaurant_status TEXT;
BEGIN
    IF p_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurant ID is required to generate order number';
    END IF;

    -- Verify restaurant exists and check status
    SELECT status INTO v_restaurant_status
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    IF v_restaurant_status IS NULL THEN
        RAISE EXCEPTION 'Restaurant not found: %', p_restaurant_id;
    END IF;

    IF v_restaurant_status = 'SUSPENDED' THEN
        RAISE EXCEPTION 'Restaurant is suspended: %', p_restaurant_id;
    END IF;

    -- Ensure restaurant_settings row exists
    INSERT INTO public.restaurant_settings (
        restaurant_id,
        invoice_prefix,
        next_order_seq,
        invoice_sequence_prefix,
        invoice_next_number
    )
    VALUES (
        p_restaurant_id,
        'INV-',
        1,
        'INV-',
        1
    )
    ON CONFLICT (restaurant_id) DO NOTHING;

    -- Lock row for update to guarantee concurrency safety
    SELECT 
        COALESCE(invoice_prefix, invoice_sequence_prefix, 'INV-'),
        COALESCE(next_order_seq, invoice_next_number, 1)
    INTO v_invoice_prefix, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    -- Increment sequence counters atomically for both column sets
    UPDATE public.restaurant_settings
    SET 
        next_order_seq = v_assigned_seq + 1,
        invoice_next_number = v_assigned_seq + 1,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    -- Standardize invoice prefix formatting
    IF v_invoice_prefix IS NULL OR TRIM(v_invoice_prefix) = '' THEN
        v_invoice_prefix := 'INV-';
    ELSIF NOT (v_invoice_prefix LIKE '%-') THEN
        v_invoice_prefix := v_invoice_prefix || '-';
    END IF;

    v_cur_year := TO_CHAR(NOW(), 'YYYY');

    RETURN v_invoice_prefix || v_cur_year || '-' || LPAD(v_assigned_seq::TEXT, 5, '0');
END;
$$;

-- Grant execute permissions for get_next_order_number
REVOKE ALL ON FUNCTION public.get_next_order_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_order_number(UUID) TO anon, authenticated, service_role;

-- 3. Create / Replace atomic create_guest_qr_order function
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
    -- 1. Validate Table & Restaurant match with Row-Level Lock (FOR UPDATE)
    SELECT table_number INTO v_table_num
    FROM public.tables
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id
    FOR UPDATE;

    IF v_table_num IS NULL THEN
        RAISE EXCEPTION 'Invalid table or restaurant mismatch';
    END IF;

    -- 2. Race-Safe Table Occupancy Check: Block customer QR order if active unpaid order exists
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE restaurant_id = p_restaurant_id
          AND table_id = p_table_id
          AND status NOT IN ('completed', 'cancelled')
          AND COALESCE(payment_status, 'unpaid') <> 'paid'
    ) THEN
        RAISE EXCEPTION 'This table currently has an active order. New Digital QR orders are not allowed while the table is occupied.';
    END IF;

    -- 3. Fetch Restaurant Payment & GST Settings
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

    -- 4. Payment Method Policy Enforcement
    IF v_norm_payment_method IN ('cash', 'cod') THEN
        IF v_enable_cod = FALSE THEN
            RAISE EXCEPTION 'Pay at Counter / Cash is currently disabled for table QR orders. Please choose Online UPI payment.';
        END IF;
    ELSIF v_norm_payment_method IN ('online', 'upi') THEN
        IF p_payment_proof_url IS NULL OR TRIM(p_payment_proof_url) = '' THEN
            RAISE EXCEPTION 'Please upload your UPI payment screenshot proof before placing the table order.';
        END IF;
    END IF;

    -- 5. Calculate Item Totals and GST
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT id, name, price, discounted_price, tax_rate, is_available, is_active
        INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::TEXT AND restaurant_id = p_restaurant_id;

        IF v_product.id IS NULL THEN
            RAISE EXCEPTION 'Product % not found for this restaurant', (v_item->>'product_id');
        END IF;

        IF v_product.is_active = FALSE OR v_product.is_available = FALSE THEN
            RAISE EXCEPTION 'Product "%" is currently unavailable', v_product.name;
        END IF;

        v_item_subtotal := COALESCE(v_product.discounted_price, v_product.price) * (v_item->>'quantity')::NUMERIC;
        v_subtotal := v_subtotal + v_item_subtotal;

        IF v_is_gst_enabled THEN
            v_item_tax_rate := COALESCE(v_product.tax_rate, v_tax_rate, 5.0);
            v_item_tax := (v_item_subtotal * v_item_tax_rate) / 100.0;
            v_item_cgst := v_item_tax / 2.0;
            v_item_sgst := v_item_tax / 2.0;
            v_cgst := v_cgst + v_item_cgst;
            v_sgst := v_sgst + v_item_sgst;
        END IF;
    END LOOP;

    -- 6. Validate & Apply Coupon if provided
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE restaurant_id = p_restaurant_id
          AND code = UPPER(TRIM(p_coupon_code))
          AND is_active = TRUE
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
        LIMIT 1;

        IF v_coupon.id IS NOT NULL THEN
            IF v_coupon.min_order_amount IS NULL OR v_subtotal >= v_coupon.min_order_amount THEN
                IF v_coupon.discount_type = 'percentage' THEN
                    v_coupon_discount := (v_subtotal * v_coupon.discount_value) / 100.0;
                    IF v_coupon.max_discount_amount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount_amount THEN
                        v_coupon_discount := v_coupon.max_discount_amount;
                    END IF;
                ELSE
                    v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
                END IF;
            END IF;
        END IF;
    END IF;

    v_grand_total := GREATEST(0, v_subtotal - v_coupon_discount + v_cgst + v_sgst);
    v_payable := ROUND(v_grand_total);

    -- 7. Generate IDs and Sequential Order Number
    v_order_id := 'ord-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 5);
    v_order_number := public.get_next_order_number(p_restaurant_id);

    -- 8. Insert Order Record
    INSERT INTO public.orders (
        id,
        restaurant_id,
        order_number,
        order_type,
        table_id,
        table_number,
        customer_name,
        customer_phone,
        status,
        subtotal,
        discount_amount,
        coupon_code,
        coupon_discount,
        cgst_amount,
        sgst_amount,
        grand_total,
        payable_amount,
        payment_method,
        payment_status,
        payment_proof_url,
        notes,
        is_supplementary,
        created_at,
        updated_at
    ) VALUES (
        v_order_id,
        p_restaurant_id,
        v_order_number,
        'dine_in',
        p_table_id,
        v_table_num,
        COALESCE(NULLIF(TRIM(p_customer_name), ''), v_table_num || ' Guest'),
        NULLIF(TRIM(p_customer_phone), ''),
        'confirmed',
        v_subtotal,
        v_coupon_discount,
        p_coupon_code,
        v_coupon_discount,
        v_cgst,
        v_sgst,
        v_grand_total,
        v_payable,
        v_norm_payment_method,
        'unpaid',
        p_payment_proof_url,
        p_notes,
        FALSE,
        NOW(),
        NOW()
    );

    -- 9. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT id, name, price, discounted_price, tax_rate
        INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::TEXT;

        v_item_subtotal := COALESCE(v_product.discounted_price, v_product.price) * (v_item->>'quantity')::NUMERIC;
        IF v_is_gst_enabled THEN
            v_item_tax_rate := COALESCE(v_product.tax_rate, v_tax_rate, 5.0);
            v_item_tax := (v_item_subtotal * v_item_tax_rate) / 100.0;
            v_item_cgst := v_item_tax / 2.0;
            v_item_sgst := v_item_tax / 2.0;
        ELSE
            v_item_tax_rate := 0.0;
            v_item_tax := 0.0;
            v_item_cgst := 0.0;
            v_item_sgst := 0.0;
        END IF;

        INSERT INTO public.order_items (
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            subtotal,
            total,
            tax_rate,
            tax_amount,
            cgst_amount,
            sgst_amount,
            item_notes,
            created_at
        ) VALUES (
            'oi-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 5),
            v_order_id,
            v_product.id,
            v_product.name,
            (v_item->>'quantity')::INT,
            COALESCE(v_product.discounted_price, v_product.price),
            v_item_subtotal,
            v_item_subtotal,
            v_item_subtotal + v_item_tax,
            v_item_tax_rate,
            v_item_tax,
            v_item_cgst,
            v_item_sgst,
            v_item->>'item_notes',
            NOW()
        );
    END LOOP;

    -- 10. Update table status to occupied
    UPDATE public.tables
    SET status = 'occupied', updated_at = NOW()
    WHERE id = p_table_id;

    -- 11. Return created order JSON
    RETURN jsonb_build_object(
        'id', v_order_id,
        'order_number', v_order_number,
        'restaurant_id', p_restaurant_id,
        'table_id', p_table_id,
        'table_number', v_table_num,
        'status', 'confirmed',
        'subtotal', v_subtotal,
        'grand_total', v_grand_total,
        'payable_amount', v_payable,
        'payment_method', v_norm_payment_method,
        'payment_status', 'unpaid',
        'payment_proof_url', p_payment_proof_url,
        'is_supplementary', FALSE,
        'created_at', NOW()
    );
END;
$$;

-- Grant execute permissions for create_guest_qr_order
REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
