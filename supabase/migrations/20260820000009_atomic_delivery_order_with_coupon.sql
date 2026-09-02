-- ============================================================================
-- ATOMIC DELIVERY ORDER CREATION & COUPON REDEMPTION FUNCTION
-- Guarantees atomic coupon validation + used_count increment + order creation
-- If order creation or item insertion fails, used_count automatically rolls back.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.place_delivery_order_atomic(
    p_order_id TEXT,
    p_restaurant_id UUID,
    p_customer_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_order_number TEXT,
    p_items JSONB,
    p_coupon_code TEXT,
    p_payment_method TEXT,
    p_delivery_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_prod RECORD;
    v_subtotal NUMERIC(10,2) := 0;
    v_line_sub NUMERIC(10,2);
    v_tax_rate NUMERIC(10,2);
    v_tax_amount NUMERIC(10,2);
    v_line_total NUMERIC(10,2);
    
    v_coupon RECORD;
    v_coupon_discount NUMERIC(10,2) := 0;
    v_discounted_subtotal NUMERIC(10,2);
    v_tax_total NUMERIC(10,2);
    v_cgst NUMERIC(10,2);
    v_sgst NUMERIC(10,2);
    v_grand_total NUMERIC(10,2);
    v_payable_amount NUMERIC(10,2);
    v_round_off NUMERIC(10,2);
    
    v_order RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Validate and compute items subtotal & stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_prod
        FROM public.products
        WHERE id = (v_item->>'product_id') AND restaurant_id = p_restaurant_id
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % does not belong to this restaurant', (v_item->>'product_id');
        END IF;
        
        IF NOT v_prod.is_available OR NOT v_prod.is_active THEN
            RAISE EXCEPTION 'Product % is currently unavailable', v_prod.name;
        END IF;
        
        IF v_prod.stock_quantity IS NOT NULL AND v_prod.stock_quantity < (v_item->>'quantity')::INTEGER THEN
            RAISE EXCEPTION 'Insufficient stock for %. Available: %, requested: %', 
                v_prod.name, v_prod.stock_quantity, (v_item->>'quantity')::INTEGER;
        END IF;
        
        v_line_sub := COALESCE(v_prod.discounted_price, v_prod.price) * (v_item->>'quantity')::INTEGER;
        v_subtotal := v_subtotal + v_line_sub;
    END LOOP;
    
    -- 2. Validate and apply coupon ATOMICALLY with row lock
    IF p_coupon_code IS NOT NULL AND TRIM(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.coupons
        WHERE restaurant_id = p_restaurant_id
          AND UPPER(code) = UPPER(TRIM(p_coupon_code))
        FOR UPDATE;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid coupon code for this restaurant';
        END IF;
        
        IF NOT v_coupon.is_active THEN
            RAISE EXCEPTION 'This coupon code is inactive';
        END IF;
        
        IF v_coupon.start_date IS NOT NULL AND v_coupon.start_date > v_now THEN
            RAISE EXCEPTION 'This coupon has not started yet';
        END IF;
        
        IF v_coupon.expiry_date IS NOT NULL AND v_coupon.expiry_date < v_now THEN
            RAISE EXCEPTION 'This coupon code has expired';
        END IF;
        
        IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
            RAISE EXCEPTION 'This coupon code has reached its maximum usage limit';
        END IF;
        
        IF v_coupon.min_order_value IS NOT NULL AND v_subtotal < v_coupon.min_order_value THEN
            RAISE EXCEPTION 'Minimum order value for % is ₹%', v_coupon.code, v_coupon.min_order_value;
        END IF;
        
        IF v_coupon.discount_type = 'percentage' THEN
            v_coupon_discount := (v_subtotal * v_coupon.discount_value) / 100.0;
            IF v_coupon.max_discount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount THEN
                v_coupon_discount := v_coupon.max_discount;
            END IF;
        ELSE
            v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
        END IF;
        
        v_coupon_discount := ROUND(v_coupon_discount, 2);
        
        -- Atomically increment usage within transaction
        UPDATE public.coupons
        SET used_count = used_count + 1, updated_at = v_now
        WHERE id = v_coupon.id;
    END IF;
    
    -- 3. Calculate tax and totals
    v_discounted_subtotal := GREATEST(0, v_subtotal - v_coupon_discount);
    v_tax_total := (v_discounted_subtotal * 5.0) / 100.0;
    v_cgst := v_tax_total / 2.0;
    v_sgst := v_tax_total / 2.0;
    v_grand_total := v_discounted_subtotal + v_tax_total;
    v_payable_amount := ROUND(v_grand_total);
    v_round_off := v_payable_amount - v_grand_total;
    
    -- 4. Insert order record
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
        stock_deducted,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        p_restaurant_id,
        p_order_number,
        'delivery',
        'confirmed',
        p_customer_name,
        p_customer_phone,
        p_delivery_address,
        p_customer_id,
        v_subtotal,
        v_cgst,
        v_sgst,
        0,
        0,
        CASE WHEN v_coupon.id IS NOT NULL THEN v_coupon.code ELSE NULL END,
        v_coupon_discount,
        0,
        0,
        v_round_off,
        v_grand_total,
        v_payable_amount,
        'unpaid',
        COALESCE(p_delivery_notes, 'Customer Online Order [MARKETPLACE] (' || UPPER(p_payment_method) || ')'),
        p_customer_id,
        TRUE,
        v_now,
        v_now
    ) RETURNING * INTO v_order;
    
    -- 5. Insert order items & deduct stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_prod FROM public.products WHERE id = (v_item->>'product_id');
        
        IF v_prod.stock_quantity IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = GREATEST(0, stock_quantity - (v_item->>'quantity')::INTEGER)
            WHERE id = v_prod.id;
        END IF;
        
        v_line_sub := COALESCE(v_prod.discounted_price, v_prod.price) * (v_item->>'quantity')::INTEGER;
        v_tax_rate := COALESCE(v_prod.tax_rate, 5.0);
        v_tax_amount := (v_line_sub * v_tax_rate) / 100.0;
        v_line_total := v_line_sub + v_tax_amount;
        
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
            total,
            created_at
        ) VALUES (
            'item-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(md5(random()::text) FROM 1 FOR 6),
            p_order_id,
            v_prod.id,
            v_prod.name,
            COALESCE(v_prod.discounted_price, v_prod.price),
            (v_item->>'quantity')::INTEGER,
            v_tax_rate,
            v_tax_amount,
            v_item->>'notes',
            v_line_sub,
            v_line_total,
            v_now
        );
    END LOOP;
    
    RETURN row_to_json(v_order)::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_delivery_order_atomic TO authenticated, anon, service_role;
