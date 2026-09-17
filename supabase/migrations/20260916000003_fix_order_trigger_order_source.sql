-- ==============================================================================
-- RESTROZ MIGRATION: FIX ORDER TRIGGER AND RPC ORDER_SOURCE DEPENDENCY
-- File: 20260916000003_fix_order_trigger_order_source.sql
-- Description:
--   1. Removes dependency on non-existent `NEW.order_source` column from `validate_order_tenant_and_table` trigger.
--   2. Enforces table occupancy and supplementary order rules using authoritative DB membership (`is_restaurant_member`, `is_super_admin`).
--   3. Updates `create_guest_qr_order` RPC to remove `order_source` from INSERT statement while retaining row-level locking occupancy check.
-- ==============================================================================

-- 1. Ensure is_supplementary column and partial active orders index exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_supplementary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_active 
ON public.orders(restaurant_id, table_id)
WHERE status NOT IN ('completed', 'cancelled') AND COALESCE(payment_status, 'unpaid') <> 'paid';

-- 2. Update validate_order_tenant_and_table trigger to remove NEW.order_source
CREATE OR REPLACE FUNCTION public.validate_order_tenant_and_table()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    target_rest_status TEXT;
    target_table_rest UUID;
    target_table_active BOOLEAN;
    active_unsettled_order_id TEXT;
    is_staff_member BOOLEAN;
BEGIN
    -- 1. Validate Restaurant Exists and is ACTIVE
    SELECT status INTO target_rest_status
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    IF target_rest_status IS NULL THEN
        RAISE EXCEPTION 'Invalid restaurant_id: Restaurant does not exist.';
    END IF;

    IF target_rest_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Restaurant is currently inactive or suspended.';
    END IF;

    -- Authoritative membership verification: Must be active STAFF/ADMIN for THIS restaurant, or SUPER_ADMIN
    is_staff_member := public.is_restaurant_member(NEW.restaurant_id, 'STAFF') OR public.is_super_admin();

    -- 2. Validate Supplementary Order permissions (Cannot be authorized by boolean alone)
    IF (TG_OP = 'INSERT' AND NEW.is_supplementary IS TRUE) THEN
        IF NOT is_staff_member THEN
            RAISE EXCEPTION 'Only authorized restaurant staff can create supplementary orders.';
        END IF;
    END IF;

    -- 3. Validate Anonymous Guest Creation Requirements (Only on INSERT for unauthenticated guest orders without customer_id)
    IF (TG_OP = 'INSERT' AND auth.uid() IS NULL AND NEW.customer_id IS NULL AND NOT is_staff_member) THEN
        IF (NEW.table_id IS NULL) THEN
            RAISE EXCEPTION 'Anonymous guest orders must specify an active dining table.';
        END IF;
        IF (NEW.order_type <> 'dine_in') THEN
            RAISE EXCEPTION 'Anonymous guest orders are restricted to dine-in QR orders only.';
        END IF;
    END IF;

    -- 4. Validate Table with FOR UPDATE Lock to prevent concurrent double-booking (only if table_id is set)
    IF (NEW.table_id IS NOT NULL) THEN
        SELECT restaurant_id, is_active INTO target_table_rest, target_table_active
        FROM public.tables
        WHERE id = NEW.table_id
        FOR UPDATE;

        IF target_table_rest IS NULL THEN
            RAISE EXCEPTION 'Invalid table_id: Table does not exist.';
        END IF;

        IF target_table_rest <> NEW.restaurant_id THEN
            RAISE EXCEPTION 'Tenant violation: Table (%) belongs to restaurant %, but order is for restaurant %.',
                NEW.table_id, target_table_rest, NEW.restaurant_id;
        END IF;

        IF target_table_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Table % is currently inactive.', NEW.table_id;
        END IF;

        -- 5. Table Occupancy Check for new orders
        IF (TG_OP = 'INSERT') THEN
            IF NOT is_staff_member THEN
                -- Customers / Anon guests are NEVER allowed to place an order on an occupied table
                SELECT id INTO active_unsettled_order_id
                FROM public.orders
                WHERE restaurant_id = NEW.restaurant_id
                  AND table_id = NEW.table_id
                  AND status NOT IN ('completed', 'cancelled')
                  AND COALESCE(payment_status, 'unpaid') <> 'paid'
                LIMIT 1;

                IF active_unsettled_order_id IS NOT NULL THEN
                    RAISE EXCEPTION 'This table currently has an active order. New Digital QR orders are not allowed while the table is occupied.';
                END IF;
            ELSIF (NEW.is_supplementary IS NOT TRUE) THEN
                -- If staff is inserting a regular (non-supplementary) order, check if table is occupied
                SELECT id INTO active_unsettled_order_id
                FROM public.orders
                WHERE restaurant_id = NEW.restaurant_id
                  AND table_id = NEW.table_id
                  AND status NOT IN ('completed', 'cancelled')
                  AND COALESCE(payment_status, 'unpaid') <> 'paid'
                LIMIT 1;

                IF active_unsettled_order_id IS NOT NULL THEN
                    RAISE EXCEPTION 'Table % already has an active unsettled order (%). Please use Supplementary Order or manage the existing order.',
                        NEW.table_id, active_unsettled_order_id;
                END IF;
            END IF;
            -- If is_staff_member AND NEW.is_supplementary IS TRUE, it is explicitly allowed!
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_tenant_and_table ON public.orders;
CREATE TRIGGER trg_validate_order_tenant_and_table
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_tenant_and_table();

-- 2. Update create_guest_qr_order RPC to remove order_source column and preserve occupancy lock
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

    -- 7. Generate IDs
    v_order_id := 'ord-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 5);
    v_order_number := 'QR-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 6);

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
        SELECT id, name, price, discounted_price, tax_rate, food_type
        INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::TEXT;

        v_item_subtotal := COALESCE(v_product.discounted_price, v_product.price) * (v_item->>'quantity')::NUMERIC;
        IF v_is_gst_enabled THEN
            v_item_tax_rate := COALESCE(v_product.tax_rate, v_tax_rate, 5.0);
            v_item_tax := (v_item_subtotal * v_item_tax_rate) / 100.0;
        ELSE
            v_item_tax_rate := 0.0;
            v_item_tax := 0.0;
        END IF;

        INSERT INTO public.order_items (
            id,
            order_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            tax_rate,
            tax_amount,
            food_type,
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
            v_item_tax_rate,
            v_item_tax,
            COALESCE(v_product.food_type, 'VEG'),
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

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
