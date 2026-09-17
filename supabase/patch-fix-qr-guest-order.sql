-- ============================================================================
-- RESTROZ FIX: Fix create_guest_qr_order RPC (gen_random_uuid)
-- Run this in Supabase SQL Editor to resolve the QR Digital Menu ordering error
-- ============================================================================

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
    v_table_num TEXT;
BEGIN
    SELECT table_number INTO v_table_num
    FROM public.tables
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id;

    IF v_table_num IS NULL THEN
        RAISE EXCEPTION 'Invalid table or restaurant mismatch';
    END IF;

    -- Use built-in gen_random_uuid() instead of uuid_generate_v4()
    v_order_id := 'ord-' || gen_random_uuid();
    v_order_number := public.get_next_order_number(p_restaurant_id);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id') AND restaurant_id = p_restaurant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in this restaurant', (v_item->>'product_id');
        END IF;

        IF NOT v_product.is_available OR NOT v_product.is_active THEN
            RAISE EXCEPTION 'Product % is currently unavailable', v_product.name;
        END IF;

        v_item_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
        v_item_cgst := ROUND(v_item_subtotal * 0.025, 2);
        v_item_sgst := ROUND(v_item_subtotal * 0.025, 2);
        v_item_tax := v_item_cgst + v_item_sgst;

        v_subtotal := v_subtotal + v_item_subtotal;
        v_cgst := v_cgst + v_item_cgst;
        v_sgst := v_sgst + v_item_sgst;
    END LOOP;

    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) != '' THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE code = UPPER(TRIM(p_coupon_code))
          AND restaurant_id = p_restaurant_id
          AND is_active = TRUE;

        IF FOUND THEN
            IF v_coupon.discount_type = 'percentage' THEN
                v_coupon_discount := ROUND((v_subtotal * v_coupon.discount_value) / 100.0, 2);
                IF v_coupon.max_discount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount THEN
                    v_coupon_discount := v_coupon.max_discount;
                END IF;
            ELSE
                v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
            END IF;

            PERFORM public.increment_coupon_usage(v_coupon.id, p_restaurant_id);
        END IF;
    END IF;

    v_grand_total := v_subtotal + v_cgst + v_sgst - v_coupon_discount;
    v_payable := ROUND(v_grand_total);

    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_name, customer_phone, status,
        subtotal, discount_amount, coupon_code, coupon_discount,
        cgst_amount, sgst_amount, grand_total, payable_amount, paid_amount,
        payment_status, notes, created_by
    ) VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'dine_in', p_table_id, v_table_num,
        COALESCE(p_customer_name, 'Guest Customer'), p_customer_phone, 'confirmed',
        v_subtotal, v_discount, p_coupon_code, v_coupon_discount,
        v_cgst, v_sgst, v_grand_total, v_payable, 0,
        'unpaid', p_notes, 'QR_GUEST'
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id');
        v_item_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
        v_item_cgst := ROUND(v_item_subtotal * 0.025, 2);
        v_item_sgst := ROUND(v_item_subtotal * 0.025, 2);
        v_item_tax := v_item_cgst + v_item_sgst;

        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, cgst_amount, sgst_amount, subtotal, total, total_price, notes
        ) VALUES (
            v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::INTEGER,
            5.0, v_item_tax, v_item_cgst, v_item_sgst, v_item_subtotal, (v_item_subtotal + v_item_tax), v_item_subtotal, v_item->>'notes'
        );
    END LOOP;

    UPDATE public.tables
    SET status = 'occupied', current_order_id = v_order_id, updated_at = NOW()
    WHERE id = p_table_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'payable_amount', v_payable
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
