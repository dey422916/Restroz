-- ============================================================================
-- RESTROZ DEV ENVIRONMENT: PAYMENT VERIFICATION & TABLE QR PAYMENT FLOW PATCH
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Applying RestroZ Payment Verification & Table QR Payment Patch...';
END $$;

-- 1. Extend Orders Table with payment verification metadata & ensure GST columns in settings
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_verified_by UUID;

ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS is_gst_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS tax_invoice_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS is_gst_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS tax_invoice_enabled BOOLEAN DEFAULT FALSE;

-- 2. Update create_guest_qr_order RPC with payment method & server-side validation
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
    p_payment_method TEXT DEFAULT 'cash', -- 'cash', 'cod', 'online', 'upi'
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
    -- 1. Validate Table & Restaurant match
    SELECT table_number INTO v_table_num
    FROM public.tables
    WHERE id = p_table_id AND restaurant_id = p_restaurant_id;

    IF v_table_num IS NULL THEN
        RAISE EXCEPTION 'Invalid table or restaurant mismatch';
    END IF;

    -- 2. Fetch Restaurant Payment & GST Settings
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

    IF v_enable_cod IS NULL THEN
        v_enable_cod := TRUE;
    END IF;
    IF v_is_gst_enabled IS NULL THEN
        v_is_gst_enabled := FALSE;
    END IF;
    IF v_is_gst_enabled IS NOT TRUE THEN
        v_tax_rate := 0.0;
    END IF;

    -- 3. Validate Payment Method and Proof Server-Side
    IF v_norm_payment_method IN ('online', 'upi') THEN
        IF p_payment_proof_url IS NULL OR TRIM(p_payment_proof_url) = '' THEN
            RAISE EXCEPTION 'Please upload your payment screenshot before placing the order.';
        END IF;
    ELSIF v_norm_payment_method IN ('cash', 'cod') THEN
        IF v_enable_cod IS FALSE THEN
            RAISE EXCEPTION 'Cash / Pay at Counter is not available for this restaurant.';
        END IF;
    END IF;

    v_order_id := 'ord-' || gen_random_uuid();
    v_order_number := public.get_next_order_number(p_restaurant_id);

    -- 4. Validate and calculate item subtotals & taxes
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

        IF v_is_gst_enabled IS TRUE AND v_tax_rate > 0 THEN
            v_item_tax_rate := COALESCE(v_product.tax_rate, v_tax_rate);
            v_item_cgst := ROUND(v_item_subtotal * (v_item_tax_rate / 200.0), 2);
            v_item_sgst := ROUND(v_item_subtotal * (v_item_tax_rate / 200.0), 2);
            v_item_tax := v_item_cgst + v_item_sgst;
        ELSE
            v_item_tax_rate := 0.0;
            v_item_cgst := 0.0;
            v_item_sgst := 0.0;
            v_item_tax := 0.0;
        END IF;

        v_subtotal := v_subtotal + v_item_subtotal;
        v_cgst := v_cgst + v_item_cgst;
        v_sgst := v_sgst + v_item_sgst;
    END LOOP;

    -- 5. Validate Coupon if provided
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

    -- 6. Insert Order Record
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_name, customer_phone, status,
        subtotal, discount_amount, coupon_code, coupon_discount,
        cgst_amount, sgst_amount, grand_total, payable_amount, paid_amount,
        payment_method, payment_proof_url, payment_status, notes, created_by
    ) VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'dine_in', p_table_id, v_table_num,
        COALESCE(p_customer_name, 'Guest Customer'), p_customer_phone, 'confirmed',
        v_subtotal, v_discount, p_coupon_code, v_coupon_discount,
        v_cgst, v_sgst, v_grand_total, v_payable, 0,
        v_norm_payment_method, p_payment_proof_url, 'unpaid', p_notes, 'QR_GUEST'
    );

    -- 7. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id');
        v_item_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;

        IF v_is_gst_enabled IS TRUE AND v_tax_rate > 0 THEN
            v_item_tax_rate := COALESCE(v_product.tax_rate, v_tax_rate);
            v_item_cgst := ROUND(v_item_subtotal * (v_item_tax_rate / 200.0), 2);
            v_item_sgst := ROUND(v_item_subtotal * (v_item_tax_rate / 200.0), 2);
            v_item_tax := v_item_cgst + v_item_sgst;
        ELSE
            v_item_tax_rate := 0.0;
            v_item_cgst := 0.0;
            v_item_sgst := 0.0;
            v_item_tax := 0.0;
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, cgst_amount, sgst_amount, subtotal, total, total_price, notes
        ) VALUES (
            v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::INTEGER,
            v_item_tax_rate, v_item_tax, v_item_cgst, v_item_sgst, v_item_subtotal, (v_item_subtotal + v_item_tax), v_item_subtotal, v_item->>'notes'
        );
    END LOOP;

    -- 8. Update Table Occupancy
    UPDATE public.tables
    SET status = 'occupied', current_order_id = v_order_id, updated_at = NOW()
    WHERE id = p_table_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'payable_amount', v_payable,
        'payment_method', v_norm_payment_method,
        'payment_proof_url', p_payment_proof_url,
        'payment_status', 'unpaid'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- 3. Atomic, Role-Guarded mark_order_payment_verified RPC
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
    v_caller_role TEXT;
    v_is_super_admin BOOLEAN := FALSE;
    v_is_tenant_admin BOOLEAN := FALSE;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: User is not logged in.';
    END IF;

    -- 1. Locate Target Order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order with ID % not found.', p_order_id;
    END IF;

    -- Tenant parameter cross-check if provided
    IF p_restaurant_id IS NOT NULL AND v_order.restaurant_id != p_restaurant_id THEN
        RAISE EXCEPTION 'Tenant mismatch: Order does not belong to specified restaurant.';
    END IF;

    -- 2. Verify Caller Permissions (ADMIN / SUPER_ADMIN only)
    -- Check if user is system SUPER_ADMIN
    SELECT (role = 'SUPER_ADMIN') INTO v_is_super_admin
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_is_super_admin IS NOT TRUE THEN
        -- Check if user is ADMIN in this specific restaurant
        SELECT (role = 'ADMIN') INTO v_is_tenant_admin
        FROM public.restaurant_members
        WHERE restaurant_id = v_order.restaurant_id
          AND user_id = v_caller_id
          AND is_active = TRUE;
    END IF;

    IF (v_is_super_admin IS NOT TRUE) AND (v_is_tenant_admin IS NOT TRUE) THEN
        RAISE EXCEPTION 'Permission Denied: Only Restaurant Admins and Super Admins can verify payments.';
    END IF;

    -- 3. Validate that the order is an ONLINE / UPI or Proof-Attached order
    IF LOWER(COALESCE(v_order.payment_method, '')) NOT IN ('online', 'upi') AND (v_order.payment_proof_url IS NULL OR TRIM(v_order.payment_proof_url) = '') THEN
        RAISE EXCEPTION 'Cannot verify payment: Order is not an online/UPI payment or has no proof attached.';
    END IF;

    -- 4. Idempotency Check: If already verified as paid, return success immediately without modifying
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

    -- 5. Mark Payment Verified
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

-- 4. Update get_public_restaurant_info RPC to expose GST settings
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

-- 5. UPDATE create_customer_delivery_order RPC (AUTHORITATIVE SERVER-SIDE LOGIC & JSONB FIX)
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_customer_delivery_order(
    p_restaurant_id UUID,
    p_items JSONB,
    p_delivery_address JSONB,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_payment_method TEXT DEFAULT 'cod', -- 'cod', 'online', 'upi'
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
    -- 1. Identify Caller (Optional: authenticated customer or anonymous guest)
    v_user_id := auth.uid();

    -- 2. Validate Restaurant Public Profile & Open Ordering Status
    SELECT * INTO v_prof_record FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    IF v_prof_record.marketplace_enabled IS FALSE THEN
        RAISE EXCEPTION 'Online marketplace ordering is not enabled for this restaurant.';
    END IF;
    IF v_prof_record.is_open IS FALSE OR v_prof_record.accepts_delivery IS FALSE THEN
        RAISE EXCEPTION 'This restaurant is currently not accepting delivery orders.';
    END IF;

    -- 3. Fetch Delivery and Payment Settings
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

    -- 7. Validate Coupon Server-Side and atomically increment usage if provided
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

    -- 11. Insert Order Record
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

    -- 13. Create Initial Order Event & Customer Notification
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

-- ----------------------------------------------------------------------------
-- 6. STORAGE BUCKETS & GUEST PAYMENT PROOF UPLOAD POLICIES
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('product-images', 'product-images', TRUE),
    ('restaurant-assets', 'restaurant-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public Access to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access" ON storage.objects
    FOR SELECT USING (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload for all users" ON storage.objects;
CREATE POLICY "Allow upload for all users" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow update for all users" ON storage.objects;
CREATE POLICY "Allow update for all users" ON storage.objects
    FOR UPDATE USING (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON storage.objects;
CREATE POLICY "Allow delete for authenticated users" ON storage.objects
    FOR DELETE USING (bucket_id IN ('product-images', 'restaurant-assets') AND auth.role() = 'authenticated');
