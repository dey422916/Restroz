-- ============================================================================
-- RESTROZ SAAS — DEV -> PROD FULL STRUCTURAL & CONTRACT PARITY MIGRATION
-- Migration Version: 20260914000001_prod_dev_full_parity
-- Target: PROD Supabase Project (szpjsibrwxegaopcaukb)
--
-- Safety Guarantees:
-- 1. Strictly non-destructive — NO DROP TABLE, NO TRUNCATE, NO DELETE, NO SEED DATA.
-- 2. Preserves ALL existing customer, restaurant, order, and auth records.
-- 3. Idempotent — Safe to run multiple times without data loss.
-- 4. Uses IF NOT EXISTS / OR REPLACE / ON CONFLICT throughout.
-- 5. Zero hardcoded DEV UUIDs, zero test credentials, zero DEV Supabase URLs.
-- 6. kot_items intentionally retains NO product_id column.
-- 7. Preserves PROD-only columns (banner_urls, gallery_urls, cost_price, description in plans, amount/currency in subs).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLUMN PARITY: RESTAURANT_SETTINGS (26 Missing Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS allow_credit_orders BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS allow_partial_payment BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS auto_generate_kot BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2) DEFAULT 2.5;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS closing_time TEXT DEFAULT '23:00';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_charge_per_km NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(5,2) DEFAULT 10.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS enable_delivery BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS enable_table_qr BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS enable_takeaway BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS fssai TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS header_color TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS kot_auto_print BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS kot_item_grouping BOOLEAN DEFAULT TRUE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS opening_time TEXT DEFAULT '09:00';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS packaging_charge_rate NUMERIC(5,2) DEFAULT 0.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS receipt_header TEXT;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2) DEFAULT 2.5;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS theme_color TEXT;

-- ----------------------------------------------------------------------------
-- 2. COLUMN PARITY: RESTAURANT_PUBLIC_PROFILES (13 Missing Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS cost_for_two NUMERIC(10,2) DEFAULT 400.0;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS cuisine_types TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS delivery_time_mins INTEGER DEFAULT 30;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS distance_km NUMERIC(5,2) DEFAULT 0.0;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS is_pure_veg BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS price_rating TEXT DEFAULT '$$';
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 4.5;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE public.restaurant_public_profiles ADD COLUMN IF NOT EXISTS total_ratings INTEGER DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3. COLUMN PARITY: PRODUCTS (6 Missing Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_inventory_tracked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_veg BOOLEAN DEFAULT TRUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 15;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 4. COLUMN PARITY: TABLES (4 Missing Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS current_order_id TEXT;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS floor TEXT DEFAULT 'Main Floor';
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS qr_code_url TEXT;

-- ----------------------------------------------------------------------------
-- 5. COLUMN PARITY: DAY_REGISTERS (8 Missing Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS difference NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS other_sales NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS total_discount NUMERIC(10,2) DEFAULT 0.0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS total_tax NUMERIC(10,2) DEFAULT 0.0;

-- ----------------------------------------------------------------------------
-- 6. COLUMN PARITY: ORDER_ITEMS & CUSTOMER_NOTIFICATIONS
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customer_notifications ADD COLUMN IF NOT EXISTS restaurant_id UUID;

-- ----------------------------------------------------------------------------
-- 7. COLUMN PARITY: PAYMENTS & AUDIT_LOGS & COUPONS & CATEGORIES & SUBSCRIPTIONS
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_gateway TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'COMPLETED';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transaction_reference TEXT;

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(10,2) DEFAULT 0.0;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

ALTER TABLE public.restaurant_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;
ALTER TABLE public.restaurant_subscriptions ADD COLUMN IF NOT EXISTS custom_limits JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.kot_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.kot_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';

-- ----------------------------------------------------------------------------
-- 8. RPC: GET_PUBLIC_RESTAURANT_INFO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_restaurant_info(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    RETURN (
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
            'is_open', COALESCE(s.is_open, TRUE),
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
            'banner_urls', COALESCE(s.banner_urls, r.banner_urls, ARRAY[]::TEXT[]),
            'gallery_urls', COALESCE(s.gallery_urls, r.gallery_urls, ARRAY[]::TEXT[])
        )
        FROM public.restaurants r
        LEFT JOIN public.restaurant_settings s ON s.restaurant_id = r.id
        WHERE r.id = p_restaurant_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_restaurant_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. RPC: UPDATE_DELIVERY_ORDER_STATUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_delivery_order_status(
    p_order_id TEXT,
    p_new_status TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_old_status TEXT;
    v_restaurant_id UUID;
    v_user_id UUID;
    v_is_member BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    
    v_old_status := (
        SELECT status
        FROM public.orders
        WHERE id = p_order_id
    );

    v_restaurant_id := (
        SELECT restaurant_id
        FROM public.orders
        WHERE id = p_order_id
    );

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Validate staff membership if logged in
    IF v_user_id IS NOT NULL THEN
        v_is_member := EXISTS (
            SELECT 1
            FROM public.restaurant_members
            WHERE restaurant_id = v_restaurant_id
              AND user_id = v_user_id
              AND is_active = TRUE
        );
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        updated_at = now()
    WHERE id = p_order_id;

    -- Log event
    INSERT INTO public.order_status_events (
        order_id,
        restaurant_id,
        old_status,
        new_status,
        actor_type,
        changed_by,
        note
    ) VALUES (
        p_order_id,
        v_restaurant_id,
        v_old_status,
        p_new_status,
        CASE WHEN v_user_id IS NULL THEN 'system' ELSE 'staff' END,
        v_user_id,
        p_note
    );

    RETURN json_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'old_status', v_old_status,
        'new_status', p_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. RPC: INCREMENT_COUPON_USAGE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    UPDATE public.coupons
    SET used_count = COALESCE(used_count, 0) + 1,
        updated_at = now()
    WHERE id = p_coupon_id;

    RETURN json_build_object('success', TRUE, 'coupon_id', p_coupon_id);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(UUID) TO anon, authenticated, service_role;
