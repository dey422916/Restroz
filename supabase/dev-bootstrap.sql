-- ============================================================================
-- RESTROZ SAAS — COMPLETE DEV BOOTSTRAP INITIALIZATION SCRIPT
-- Environment: DEVELOPMENT (restroz-dev)
-- Generated for Safe Single-Run Execution on an Empty Supabase Project
-- ============================================================================
-- Architecture: Multi-Tenant Isolated, Granular RBAC, RLS-Enforced,
-- Realtime-Ready, Zero Production Data / Zero Production Secrets.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. REQUIRED EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. TENANTS TABLE (restaurants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    legal_name TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'India',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. BASELINE USER PROFILES (profiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. RESTAURANT MEMBERSHIP (restaurant_members)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_restaurant_user_member UNIQUE (restaurant_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. RESTAURANT MEMBER PERMISSIONS (restaurant_member_permissions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_member_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_member_id UUID NOT NULL UNIQUE REFERENCES public.restaurant_members(id) ON DELETE CASCADE,
    can_use_pos BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_orders BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit_orders BOOLEAN NOT NULL DEFAULT FALSE,
    can_cancel_orders BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_products BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_categories BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_tables BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_coupons BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_reports BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_register BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_settings BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_settings BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_staff BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. RESTAURANT SETTINGS (restaurant_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    id TEXT PRIMARY KEY DEFAULT 'rest-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'RestroZ Restaurant',
    legal_name TEXT DEFAULT 'RestroZ Foods Pvt Ltd',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    postal_code TEXT DEFAULT '',
    country TEXT DEFAULT 'India',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    gstin TEXT DEFAULT '',
    fssai TEXT DEFAULT '',
    currency TEXT DEFAULT 'INR',
    currency_symbol TEXT DEFAULT '₹',
    default_tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    cgst_rate NUMERIC(5, 2) DEFAULT 2.5,
    sgst_rate NUMERIC(5, 2) DEFAULT 2.5,
    service_charge_rate NUMERIC(5, 2) DEFAULT 0.0,
    packaging_charge_rate NUMERIC(5, 2) DEFAULT 0.0,
    delivery_charge_base NUMERIC(10, 2) DEFAULT 0.0,
    delivery_charge_per_km NUMERIC(10, 2) DEFAULT 0.0,
    delivery_radius_km NUMERIC(5, 2) DEFAULT 10.0,
    free_delivery_above NUMERIC(10, 2) DEFAULT 0.0,
    theme_color TEXT DEFAULT '#1E40AF',
    primary_color TEXT DEFAULT '#1E40AF',
    header_color TEXT DEFAULT '#0F172A',
    kot_auto_print BOOLEAN DEFAULT FALSE,
    kot_item_grouping BOOLEAN DEFAULT TRUE,
    auto_generate_kot BOOLEAN DEFAULT TRUE,
    allow_partial_payment BOOLEAN DEFAULT TRUE,
    allow_credit_orders BOOLEAN DEFAULT FALSE,
    enable_table_qr BOOLEAN DEFAULT TRUE,
    enable_delivery BOOLEAN DEFAULT TRUE,
    enable_takeaway BOOLEAN DEFAULT TRUE,
    receipt_header TEXT DEFAULT 'Thank you for dining with us!',
    receipt_footer TEXT DEFAULT 'Please visit again!',
    is_open BOOLEAN DEFAULT TRUE,
    opening_time TEXT DEFAULT '09:00',
    closing_time TEXT DEFAULT '23:00',
    banner_url TEXT,
    gallery_images JSONB DEFAULT '[]'::JSONB,
    invoice_sequence_prefix TEXT DEFAULT 'INV',
    invoice_next_number INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. RESTAURANT PUBLIC PROFILES (restaurant_public_profiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_public_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'Restaurant',
    marketplace_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    accepts_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    accepts_takeaway BOOLEAN NOT NULL DEFAULT TRUE,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    delivery_radius_km NUMERIC NOT NULL DEFAULT 10.0,
    minimum_order_value NUMERIC NOT NULL DEFAULT 0.0,
    estimated_delivery_minutes INTEGER NOT NULL DEFAULT 35,
    cuisine_tags TEXT[] NOT NULL DEFAULT ARRAY['Multi-Cuisine', 'Indian'],
    banner_url TEXT,
    banner_urls TEXT[] DEFAULT '{}',
    gallery_urls TEXT[] DEFAULT '{}',
    public_description TEXT,
    opening_time TEXT NOT NULL DEFAULT '10:00 AM',
    closing_time TEXT NOT NULL DEFAULT '11:00 PM',
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. MENU CATEGORIES (categories)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY DEFAULT 'cat-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    display_order INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_categories_restaurant_slug UNIQUE (restaurant_id, slug)
);

-- ----------------------------------------------------------------------------
-- 8. MENU PRODUCTS (products)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY DEFAULT 'prod-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    category_name TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discounted_price NUMERIC(10, 2),
    tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    food_type TEXT NOT NULL DEFAULT 'veg' CHECK (food_type IN ('veg', 'non-veg', 'egg')),
    unit TEXT NOT NULL DEFAULT 'portion',
    preparation_time_mins INTEGER NOT NULL DEFAULT 15,
    is_veg BOOLEAN NOT NULL DEFAULT TRUE,
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    preparation_time INTEGER DEFAULT 15,
    hsn_code TEXT DEFAULT '996331',
    barcode TEXT,
    sku TEXT,
    is_inventory_tracked BOOLEAN NOT NULL DEFAULT FALSE,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. DINING TABLES (tables)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tables (
    id TEXT PRIMARY KEY DEFAULT 'tbl-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 4,
    seating_capacity INTEGER NOT NULL DEFAULT 4,
    status TEXT CHECK (status IN ('available', 'occupied', 'billed', 'reserved', 'cleaning')) DEFAULT 'available',
    current_order_id TEXT,
    qr_code_url TEXT,
    qr_code_hash TEXT,
    floor TEXT DEFAULT 'Main Floor',
    section TEXT DEFAULT 'Ground Floor',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_tables_restaurant_table_number UNIQUE (restaurant_id, table_number)
);

-- ----------------------------------------------------------------------------
-- 10. DAY REGISTERS (day_registers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.day_registers (
    id TEXT PRIMARY KEY DEFAULT 'reg-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    opened_by TEXT NOT NULL,
    closed_by TEXT,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    opening_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    closing_cash NUMERIC(10, 2),
    expected_cash NUMERIC(10, 2),
    actual_cash NUMERIC(10, 2),
    difference NUMERIC(10, 2),
    total_sales NUMERIC(10, 2) DEFAULT 0.00,
    total_orders INTEGER DEFAULT 0,
    total_discount NUMERIC(10, 2) DEFAULT 0.00,
    total_tax NUMERIC(10, 2) DEFAULT 0.00,
    cash_sales NUMERIC(10, 2) DEFAULT 0.00,
    card_sales NUMERIC(10, 2) DEFAULT 0.00,
    upi_sales NUMERIC(10, 2) DEFAULT 0.00,
    other_sales NUMERIC(10, 2) DEFAULT 0.00,
    notes TEXT,
    status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. ORDERS TABLE (orders)
-- Includes exact statuses used in the application lifecycle:
-- draft, held, confirmed, kot_generated, preparing, ready, served,
-- out_for_delivery, delivered, completed, cancelled
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY DEFAULT 'ord-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    order_type TEXT CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')) DEFAULT 'dine_in',
    table_id TEXT REFERENCES public.tables(id) ON DELETE SET NULL,
    table_number TEXT,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_name TEXT DEFAULT 'Guest Customer',
    customer_phone TEXT,
    delivery_address TEXT,
    delivery_landmark TEXT,
    delivery_charge NUMERIC(10, 2) DEFAULT 0,
    status TEXT CHECK (status IN ('draft', 'held', 'confirmed', 'kot_generated', 'preparing', 'ready', 'served', 'out_for_delivery', 'delivered', 'completed', 'cancelled')) DEFAULT 'confirmed',
    subtotal NUMERIC(10, 2) DEFAULT 0,
    discount_amount NUMERIC(10, 2) DEFAULT 0,
    coupon_code TEXT,
    coupon_discount NUMERIC(10, 2) DEFAULT 0,
    cgst_amount NUMERIC(10, 2) DEFAULT 0,
    sgst_amount NUMERIC(10, 2) DEFAULT 0,
    igst_amount NUMERIC(10, 2) DEFAULT 0,
    service_charge NUMERIC(10, 2) DEFAULT 0,
    grand_total NUMERIC(10, 2) DEFAULT 0,
    round_off NUMERIC(10, 2) DEFAULT 0,
    payable_amount NUMERIC(10, 2) DEFAULT 0,
    paid_amount NUMERIC(10, 2) DEFAULT 0,
    payment_status TEXT CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded')) DEFAULT 'unpaid',
    notes TEXT,
    created_by TEXT,
    stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_orders_restaurant_order_number UNIQUE (restaurant_id, order_number)
);

-- ----------------------------------------------------------------------------
-- 12. ORDER ITEMS TABLE (order_items)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY DEFAULT 'item-' || uuid_generate_v4(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    tax_amount NUMERIC(10, 2) DEFAULT 0,
    cgst_amount NUMERIC(10, 2) DEFAULT 0,
    sgst_amount NUMERIC(10, 2) DEFAULT 0,
    igst_amount NUMERIC(10, 2) DEFAULT 0,
    discount_amount NUMERIC(10, 2) DEFAULT 0,
    subtotal NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) DEFAULT 0,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    item_notes TEXT,
    image_url TEXT,
    hsn_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 13. ORDER STATUS EVENTS TABLE (order_status_events)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM')),
    changed_by UUID REFERENCES auth.users(id),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 14. CUSTOMER NOTIFICATIONS TABLE (customer_notifications)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ORDER_STATUS',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 15. CUSTOMER ADDRESSES TABLE (customer_addresses)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home',
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    landmark TEXT,
    city TEXT NOT NULL DEFAULT 'Kolkata',
    state TEXT NOT NULL DEFAULT 'West Bengal',
    postal_code TEXT DEFAULT '',
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 16. FAVORITE RESTAURANTS TABLE (favorite_restaurants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorite_restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_favorite_restaurant UNIQUE (user_id, restaurant_id)
);

-- ----------------------------------------------------------------------------
-- 17. PAYMENTS TABLE (payments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT 'pay-' || uuid_generate_v4(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi', 'other', 'wallet', 'cod', 'online')) DEFAULT 'cash',
    amount NUMERIC(10, 2) NOT NULL,
    status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'completed',
    transaction_reference TEXT,
    reference_number TEXT,
    payment_gateway TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 18. KITCHEN ORDER TICKETS (kots)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kots (
    id TEXT PRIMARY KEY DEFAULT 'kot-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    kot_number TEXT NOT NULL,
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number TEXT,
    order_type TEXT CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')) DEFAULT 'dine_in',
    table_number TEXT,
    customer_name TEXT,
    kitchen_notes TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'ready', 'served', 'completed', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 19. KOT ITEMS (kot_items)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kot_items (
    id TEXT PRIMARY KEY DEFAULT 'kitem-' || uuid_generate_v4(),
    kot_id TEXT NOT NULL REFERENCES public.kots(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    notes TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'ready', 'served', 'completed', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 20. PROMOTIONAL COUPONS (coupons)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
    id TEXT PRIMARY KEY DEFAULT 'cpn-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')) NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(10, 2) NOT NULL,
    max_discount NUMERIC(10, 2),
    min_order_amount NUMERIC(10, 2) DEFAULT 0,
    min_order_value NUMERIC(10, 2) DEFAULT 0,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    per_user_limit INTEGER DEFAULT 1,
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_coupons_restaurant_code UNIQUE (restaurant_id, code)
);

-- ----------------------------------------------------------------------------
-- 21. SECURITY AUDIT LOGS (audit_logs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 22. SUBSCRIPTION PLANS (subscription_plans)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'INR',
    max_staff INTEGER NOT NULL DEFAULT 5,
    max_tables INTEGER NOT NULL DEFAULT 10,
    max_products INTEGER NOT NULL DEFAULT 50,
    features JSONB NOT NULL DEFAULT '{"qr_ordering": true, "inventory": false, "reports": true, "analytics": false}'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 23. RESTAURANT SUBSCRIPTIONS (restaurant_subscriptions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete')) DEFAULT 'trialing',
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    trial_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    custom_limits JSONB,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 24. SUBSCRIPTION PAYMENTS (subscription_payments)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.restaurant_subscriptions(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'netbanking', 'card', 'manual_bank_transfer', 'free_tier')) DEFAULT 'upi',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
    transaction_reference TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 25. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_restaurant_members_user ON public.restaurant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_members_rest ON public.restaurant_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_public_profiles_restaurant ON public.restaurant_public_profiles(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_public_profiles_marketplace ON public.restaurant_public_profiles(marketplace_enabled, is_open);
CREATE INDEX IF NOT EXISTS idx_public_profiles_coords ON public.restaurant_public_profiles(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON public.categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_restaurant ON public.products(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON public.tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order ON public.order_status_events(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_user ON public.customer_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_restaurants_user ON public.favorite_restaurants(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_kots_restaurant ON public.kots(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_kots_order ON public.kots(order_id);
CREATE INDEX IF NOT EXISTS idx_kot_items_kot ON public.kot_items(kot_id);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant ON public.coupons(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant ON public.audit_logs(restaurant_id);

-- ----------------------------------------------------------------------------
-- 26. HELPER FUNCTIONS & RBAC SECURITY DEFINERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_restaurant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT restaurant_id FROM public.restaurant_members
    WHERE user_id = auth.uid() AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(target_restaurant_id UUID, min_role TEXT DEFAULT 'STAFF')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.restaurant_members
        WHERE restaurant_id = target_restaurant_id
          AND user_id = auth.uid()
          AND is_active = TRUE
          AND (
              min_role = 'STAFF' OR
              (min_role = 'ADMIN' AND role = 'ADMIN')
          )
    );
$$;

-- ----------------------------------------------------------------------------
-- 27. BUSINESS LOGIC STORED PROCEDURES & RPCS
-- ----------------------------------------------------------------------------

-- Atomic invoice sequence incrementer
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_restaurant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_prefix TEXT;
    v_seq INTEGER;
    v_order_num TEXT;
BEGIN
    INSERT INTO public.restaurant_settings (restaurant_id, invoice_sequence_prefix, invoice_next_number)
    VALUES (p_restaurant_id, 'INV', 2)
    ON CONFLICT (restaurant_id) DO UPDATE
    SET invoice_next_number = public.restaurant_settings.invoice_next_number + 1,
        updated_at = NOW()
    RETURNING
        COALESCE(public.restaurant_settings.invoice_sequence_prefix, 'INV'),
        public.restaurant_settings.invoice_next_number - 1
    INTO v_prefix, v_seq;

    IF v_seq IS NULL THEN
        SELECT
            COALESCE(invoice_sequence_prefix, 'INV'),
            COALESCE(invoice_next_number, 1)
        INTO v_prefix, v_seq
        FROM public.restaurant_settings
        WHERE restaurant_id = p_restaurant_id
        FOR UPDATE;

        IF v_seq IS NULL THEN
            v_prefix := 'INV';
            v_seq := 1;
        END IF;

        UPDATE public.restaurant_settings
        SET invoice_next_number = v_seq + 1,
            updated_at = NOW()
        WHERE restaurant_id = p_restaurant_id;
    END IF;

    v_order_num := v_prefix || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN v_order_num;
END;
$$;

-- Resolve QR Table for guest dine-in
CREATE OR REPLACE FUNCTION public.resolve_qr_table(p_identifier TEXT)
RETURNS TABLE (
    table_id TEXT,
    table_number TEXT,
    restaurant_id UUID,
    restaurant_name TEXT,
    restaurant_slug TEXT,
    is_open BOOLEAN,
    table_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id AS table_id,
        t.table_number,
        r.id AS restaurant_id,
        r.name AS restaurant_name,
        r.slug AS restaurant_slug,
        COALESCE(rs.is_open, TRUE) AS is_open,
        t.status AS table_status
    FROM public.tables t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    LEFT JOIN public.restaurant_settings rs ON rs.restaurant_id = r.id
    WHERE (
        t.id = p_identifier
        OR t.qr_code_url = p_identifier
        OR t.table_number = p_identifier
    )
    AND r.status = 'ACTIVE'
    LIMIT 1;
END;
$$;

-- Public restaurant info RPC
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
        'tax_rate', s.tax_rate,
        'cgst_rate', s.cgst_rate,
        'sgst_rate', s.sgst_rate,
        'service_charge_rate', s.service_charge_rate,
        'packaging_charge_rate', s.packaging_charge_rate,
        'delivery_charge_base', s.delivery_charge_base,
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

-- Auto-provision profile trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_role TEXT := 'CUSTOMER';
    v_full_name TEXT := '';
BEGIN
    IF NEW.raw_user_meta_data->>'role' = 'SUPER_ADMIN' THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'SUPER_ADMIN') THEN
            v_role := 'SUPER_ADMIN';
        ELSE
            v_role := 'CUSTOMER';
        END IF;
    ELSIF NEW.raw_user_meta_data->>'role' IN ('ADMIN', 'STAFF') THEN
        v_role := NEW.raw_user_meta_data->>'role';
    END IF;

    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        v_full_name,
        NEW.raw_user_meta_data->>'phone',
        v_role
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Prevent privilege escalation
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
        IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Only SUPER_ADMIN can change profile roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Order tenant and table validation trigger
CREATE OR REPLACE FUNCTION public.validate_order_tenant_and_table()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_table_restaurant_id UUID;
BEGIN
    IF NEW.order_type = 'dine_in' AND NEW.table_id IS NOT NULL THEN
        SELECT restaurant_id INTO v_table_restaurant_id
        FROM public.tables
        WHERE id = NEW.table_id;

        IF v_table_restaurant_id IS NULL THEN
            RAISE EXCEPTION 'Table % does not exist.', NEW.table_id;
        END IF;

        IF v_table_restaurant_id != NEW.restaurant_id THEN
            RAISE EXCEPTION 'Table % does not belong to restaurant %.', NEW.table_id, NEW.restaurant_id;
        END IF;
    ELSIF NEW.order_type IN ('takeaway', 'delivery') THEN
        NEW.table_id := NULL;
        NEW.table_number := NULL;
    END IF;

    IF NEW.order_number IS NULL OR trim(NEW.order_number) = '' THEN
        NEW.order_number := public.get_next_order_number(NEW.restaurant_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_tenant_and_table ON public.orders;
CREATE TRIGGER trg_validate_order_tenant_and_table
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_tenant_and_table();

-- Stock restoration on cancellation trigger
CREATE OR REPLACE FUNCTION public.handle_order_cancellation_stock_restoration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' AND OLD.stock_deducted = TRUE THEN
        FOR v_item IN
            SELECT product_id, quantity
            FROM public.order_items
            WHERE order_id = NEW.id
        LOOP
            UPDATE public.products
            SET stock_quantity = stock_quantity + v_item.quantity,
                is_available = TRUE,
                updated_at = NOW()
            WHERE id = v_item.product_id
              AND is_inventory_tracked = TRUE;
        END LOOP;

        NEW.stock_deducted := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel
    BEFORE UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_order_cancellation_stock_restoration();

-- Atomic Coupon Increment RPC
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(
    p_coupon_id TEXT,
    p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_coupon RECORD;
BEGIN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE (id = p_coupon_id OR code = p_coupon_id)
      AND restaurant_id = p_restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Coupon not found');
    END IF;

    IF NOT v_coupon.is_active THEN
        RETURN jsonb_build_object('success', false, 'message', 'Coupon is inactive');
    END IF;

    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
        RETURN jsonb_build_object('success', false, 'message', 'Coupon usage limit reached');
    END IF;

    UPDATE public.coupons
    SET used_count = COALESCE(used_count, 0) + 1,
        updated_at = NOW()
    WHERE id = v_coupon.id;

    RETURN jsonb_build_object(
        'success', true,
        'coupon_id', v_coupon.id,
        'used_count', v_coupon.used_count + 1
    );
END;
$$;

-- Guest QR Ordering RPC
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

    v_order_id := 'ord-' || uuid_generate_v4();
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

        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, cgst_amount, sgst_amount, total_price, notes
        ) VALUES (
            v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::INTEGER,
            5.0, (v_item_cgst + v_item_sgst), v_item_cgst, v_item_sgst, v_item_subtotal, v_item->>'notes'
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

-- Atomic Customer Delivery Order RPC (8 Parameters - Authoritative Marketplace Signature)
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
    v_discount NUMERIC(10,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_grand_total NUMERIC(10,2) := 0.00;
    v_payable NUMERIC(10,2) := 0.00;
    v_round_off NUMERIC(10,2) := 0.00;
    v_tax_rate NUMERIC(5,2) := 5.00;
    v_unit_price NUMERIC(10,2);
    v_item_subtotal NUMERIC(10,2);
    v_item_tax NUMERIC(10,2);
    v_item_notes TEXT;
    v_addr_text TEXT;
    v_coupon_record RECORD;
    v_res JSONB;
BEGIN
    -- 0. Authentication Guard
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

-- Customer Order Cancellation RPC
CREATE OR REPLACE FUNCTION public.cancel_customer_order(
    p_order_id TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.customer_id != v_user_id AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You can only cancel your own orders.';
    END IF;

    IF v_order.status NOT IN ('draft', 'confirmed', 'held') THEN
        RAISE EXCEPTION 'Order cannot be cancelled as kitchen preparation has already begun (status: %).', v_order.status;
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        notes = COALESCE(notes || ' | ', '') || 'Cancelled by customer: ' || p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    INSERT INTO public.order_status_events (
        order_id, restaurant_id, old_status, new_status, actor_type, changed_by, note
    ) VALUES (
        p_order_id, v_order.restaurant_id, v_order.status, 'cancelled', 'CUSTOMER', v_user_id, p_reason
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- Delivery Order Status Update RPC (4 Parameters)
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

-- Super Admin: Atomic Restaurant Onboarding RPC
CREATE OR REPLACE FUNCTION public.create_new_restaurant(
    p_name TEXT,
    p_slug TEXT,
    p_legal_name TEXT DEFAULT NULL,
    p_logo_url TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_postal_code TEXT DEFAULT NULL,
    p_country TEXT DEFAULT 'India',
    p_timezone TEXT DEFAULT 'Asia/Kolkata',
    p_plan_id TEXT DEFAULT 'plan-starter'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_restaurant_id UUID;
    v_plan RECORD;
    v_sub_id UUID;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only SUPER_ADMIN can create restaurants.';
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan % does not exist.', p_plan_id;
    END IF;

    INSERT INTO public.restaurants (
        name, slug, legal_name, logo_url, phone, email, address, city, state, postal_code, country, timezone, status
    ) VALUES (
        p_name, LOWER(TRIM(p_slug)), p_legal_name, p_logo_url, p_phone, p_email, p_address, p_city, p_state, p_postal_code, p_country, p_timezone, 'ACTIVE'
    )
    RETURNING id INTO v_restaurant_id;

    INSERT INTO public.restaurant_settings (
        restaurant_id, name, legal_name, address, city, state, postal_code, country, phone, email
    ) VALUES (
        v_restaurant_id, p_name, COALESCE(p_legal_name, p_name), COALESCE(p_address, ''), COALESCE(p_city, ''), COALESCE(p_state, ''), COALESCE(p_postal_code, ''), p_country, COALESCE(p_phone, ''), COALESCE(p_email, '')
    );

    INSERT INTO public.restaurant_public_profiles (
        restaurant_id, display_name, marketplace_enabled, accepts_delivery, accepts_takeaway, is_open, delivery_radius_km, minimum_order_value, estimated_delivery_minutes, cuisine_tags, banner_url, public_description, opening_time, closing_time
    ) VALUES (
        v_restaurant_id, p_name, TRUE, TRUE, TRUE, TRUE, 10.0, 0.0, 35, ARRAY['Multi-Cuisine', 'Indian'], p_logo_url, p_name || ' - Delicious food served fresh.', '10:00 AM', '11:00 PM'
    );

    IF v_plan.billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '30 days';
    END IF;

    INSERT INTO public.restaurant_subscriptions (
        restaurant_id, plan_id, status, start_date, end_date, trial_end
    ) VALUES (
        v_restaurant_id, p_plan_id, 'active', NOW(), v_end_date, NOW() + INTERVAL '14 days'
    )
    RETURNING id INTO v_sub_id;

    INSERT INTO public.subscription_payments (
        subscription_id, restaurant_id, plan_id, amount, currency, payment_method, payment_status, paid_at, notes
    ) VALUES (
        v_sub_id, v_restaurant_id, p_plan_id, v_plan.price, v_plan.currency, 'manual_bank_transfer', 'paid', NOW(), 'Initial subscription activation on onboarding'
    );

    RETURN jsonb_build_object(
        'success', true,
        'restaurant_id', v_restaurant_id,
        'subscription_id', v_sub_id,
        'plan_id', p_plan_id
    );
END;
$$;

-- Subscription Assignment RPC
CREATE OR REPLACE FUNCTION public.assign_restaurant_subscription(
    p_restaurant_id UUID,
    p_plan_id TEXT,
    p_payment_method TEXT DEFAULT 'manual_bank_transfer',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_plan RECORD;
    v_sub_id UUID;
    v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only SUPER_ADMIN can assign subscriptions.';
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan % does not exist.', p_plan_id;
    END IF;

    IF v_plan.billing_cycle = 'yearly' THEN
        v_end_date := NOW() + INTERVAL '1 year';
    ELSE
        v_end_date := NOW() + INTERVAL '30 days';
    END IF;

    INSERT INTO public.restaurant_subscriptions (
        restaurant_id, plan_id, status, start_date, end_date, notes
    ) VALUES (
        p_restaurant_id, p_plan_id, 'active', NOW(), v_end_date, p_notes
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        start_date = NOW(),
        end_date = v_end_date,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING id INTO v_sub_id;

    INSERT INTO public.subscription_payments (
        subscription_id, restaurant_id, plan_id, amount, currency, payment_method, payment_status, paid_at, notes
    ) VALUES (
        v_sub_id, p_restaurant_id, p_plan_id, v_plan.price, v_plan.currency, p_payment_method, 'paid', NOW(), COALESCE(p_notes, 'Subscription plan upgrade/assigned by Super Admin')
    );

    RETURN jsonb_build_object(
        'success', true,
        'subscription_id', v_sub_id,
        'restaurant_id', p_restaurant_id,
        'plan_id', p_plan_id,
        'end_date', v_end_date
    );
END;
$$;

-- Subscription Status RPC
CREATE OR REPLACE FUNCTION public.get_restaurant_subscription_status(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_is_active BOOLEAN := FALSE;
    v_is_expired BOOLEAN := FALSE;
    v_days_left INTEGER := 0;
BEGIN
    SELECT * INTO v_sub FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'has_subscription', false,
            'status', 'none',
            'is_active', false,
            'is_expired', true,
            'days_left', 0
        );
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;

    IF v_sub.status IN ('active', 'trialing') AND v_sub.end_date > NOW() THEN
        v_is_active := TRUE;
        v_days_left := EXTRACT(DAY FROM (v_sub.end_date - NOW()))::INTEGER;
    ELSE
        v_is_expired := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'has_subscription', true,
        'subscription_id', v_sub.id,
        'plan_id', v_sub.plan_id,
        'plan_name', COALESCE(v_plan.name, 'Unknown Plan'),
        'plan_code', COALESCE(v_plan.code, 'STARTER'),
        'status', v_sub.status,
        'is_active', v_is_active,
        'is_expired', v_is_expired,
        'start_date', v_sub.start_date,
        'end_date', v_sub.end_date,
        'days_left', GREATEST(v_days_left, 0),
        'max_staff', COALESCE((v_sub.custom_limits->>'max_staff')::INTEGER, v_plan.max_staff, 5),
        'max_tables', COALESCE((v_sub.custom_limits->>'max_tables')::INTEGER, v_plan.max_tables, 10),
        'max_products', COALESCE((v_sub.custom_limits->>'max_products')::INTEGER, v_plan.max_products, 50),
        'features', COALESCE(v_plan.features, '{}'::jsonb)
    );
END;
$$;

-- Resource Usage and Limit RPCs
CREATE OR REPLACE FUNCTION public.get_restaurant_resource_usage(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_staff_count INTEGER := 0;
    v_tables_count INTEGER := 0;
    v_products_count INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO v_staff_count FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id AND is_active = TRUE;
    SELECT COUNT(*) INTO v_tables_count FROM public.tables WHERE restaurant_id = p_restaurant_id;
    SELECT COUNT(*) INTO v_products_count FROM public.products WHERE restaurant_id = p_restaurant_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'staff_count', v_staff_count,
        'tables_count', v_tables_count,
        'products_count', v_products_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_restaurant_plan_limit(
    p_restaurant_id UUID,
    p_resource_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_status JSONB;
    v_usage JSONB;
    v_current_count INTEGER := 0;
    v_max_limit INTEGER := 0;
BEGIN
    v_status := public.get_restaurant_subscription_status(p_restaurant_id);
    v_usage := public.get_restaurant_resource_usage(p_restaurant_id);

    IF p_resource_type = 'staff' THEN
        v_current_count := (v_usage->>'staff_count')::INTEGER;
        v_max_limit := (v_status->>'max_staff')::INTEGER;
    ELSIF p_resource_type = 'tables' THEN
        v_current_count := (v_usage->>'tables_count')::INTEGER;
        v_max_limit := (v_status->>'max_tables')::INTEGER;
    ELSIF p_resource_type = 'products' THEN
        v_current_count := (v_usage->>'products_count')::INTEGER;
        v_max_limit := (v_status->>'max_products')::INTEGER;
    ELSE
        RAISE EXCEPTION 'Unknown resource type: %', p_resource_type;
    END IF;

    RETURN jsonb_build_object(
        'resource', p_resource_type,
        'current_count', v_current_count,
        'max_limit', v_max_limit,
        'is_allowed', (v_current_count < v_max_limit)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_restaurant_feature_access(
    p_restaurant_id UUID,
    p_feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_status JSONB;
    v_features JSONB;
BEGIN
    v_status := public.get_restaurant_subscription_status(p_restaurant_id);
    IF NOT (v_status->>'is_active')::BOOLEAN THEN
        RETURN FALSE;
    END IF;

    v_features := v_status->'features';
    RETURN COALESCE((v_features->>p_feature_key)::BOOLEAN, FALSE);
END;
$$;

-- Staff Permissions Management RPC
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
    p_member_id UUID,
    p_permissions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_member RECORD;
BEGIN
    SELECT * INTO v_member FROM public.restaurant_members WHERE id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found.';
    END IF;

    IF NOT public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Restaurant Admin can update permissions.';
    END IF;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id,
        can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
        can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
    ) VALUES (
        p_member_id,
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
        COALESCE((p_permissions->>'can_manage_staff')::BOOLEAN, FALSE)
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

    RETURN jsonb_build_object('success', true, 'member_id', p_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_staff_membership_status(
    p_member_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_member RECORD;
BEGIN
    SELECT * INTO v_member FROM public.restaurant_members WHERE id = p_member_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found.';
    END IF;

    IF NOT public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Restaurant Admin can alter member status.';
    END IF;

    UPDATE public.restaurant_members
    SET is_active = p_is_active,
        updated_at = NOW()
    WHERE id = p_member_id;

    RETURN jsonb_build_object('success', true, 'member_id', p_member_id, 'is_active', p_is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_restaurant_member_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.role = 'ADMIN' THEN
        INSERT INTO public.restaurant_member_permissions (
            restaurant_member_id,
            can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
            can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
            can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
        ) VALUES (
            NEW.id,
            TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE, TRUE, TRUE
        )
        ON CONFLICT (restaurant_member_id) DO NOTHING;
    ELSE
        INSERT INTO public.restaurant_member_permissions (
            restaurant_member_id,
            can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
            can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
            can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
        ) VALUES (
            NEW.id,
            TRUE, TRUE, FALSE, FALSE,
            FALSE, FALSE, FALSE, FALSE,
            FALSE, FALSE, FALSE, FALSE, FALSE
        )
        ON CONFLICT (restaurant_member_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_member_permissions ON public.restaurant_members;
CREATE TRIGGER trg_init_member_permissions
    AFTER INSERT ON public.restaurant_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_restaurant_member_permissions();

-- Gallery Image Persistence RPC
CREATE OR REPLACE FUNCTION public.save_restaurant_gallery_images(
    p_restaurant_id UUID,
    p_banner_urls TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_first_banner TEXT := NULL;
BEGIN
    IF NOT public.is_restaurant_member(p_restaurant_id, 'ADMIN') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only Restaurant Admin or Super Admin can manage restaurant gallery.';
    END IF;

    IF array_length(p_banner_urls, 1) > 0 THEN
        v_first_banner := p_banner_urls[1];
    END IF;

    UPDATE public.restaurants
    SET banner_url = COALESCE(v_first_banner, banner_url),
        banner_urls = p_banner_urls,
        gallery_urls = p_banner_urls,
        updated_at = NOW()
    WHERE id = p_restaurant_id;

    UPDATE public.restaurant_public_profiles
    SET banner_url = COALESCE(v_first_banner, banner_url),
        banner_urls = p_banner_urls,
        gallery_urls = p_banner_urls,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    UPDATE public.restaurant_settings
    SET banner_url = COALESCE(v_first_banner, banner_url),
        banner_urls = p_banner_urls,
        gallery_urls = p_banner_urls,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    RETURN jsonb_build_object(
        'success', true,
        'restaurant_id', p_restaurant_id,
        'banner_urls', p_banner_urls
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 28. PRIVILEGED USER PROVISIONING & AUTH MANAGEMENT RPCS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_privileged_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_role TEXT,
    p_restaurant_id UUID DEFAULT NULL,
    p_permissions JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_catalog, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
    v_encrypted_pw TEXT;
    v_member_id UUID;
    v_normalized_email TEXT;
BEGIN
    v_caller_role := public.get_user_role();
    IF v_caller_role IS DISTINCT FROM 'SUPER_ADMIN' AND NOT public.is_super_admin() THEN
        IF p_role = 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'Unauthorized: Only existing Super Admin can provision new Super Admins.';
        END IF;

        IF p_restaurant_id IS NULL OR NOT public.is_restaurant_member(p_restaurant_id, 'ADMIN') THEN
            RAISE EXCEPTION 'Unauthorized: You can only provision staff for your own restaurant.';
        END IF;
    END IF;

    v_normalized_email := LOWER(TRIM(p_email));
    IF v_normalized_email = '' OR p_password = '' THEN
        RAISE EXCEPTION 'Email and password are required.';
    END IF;

    v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

    SELECT id INTO v_user_id FROM auth.users WHERE email = v_normalized_email;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, is_super_admin,
            created_at, updated_at, phone, phone_confirmed_at,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_normalized_email,
            v_encrypted_pw,
            NOW(),
            NOW(),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object('full_name', p_full_name, 'phone', p_phone, 'role', p_role),
            FALSE,
            NOW(),
            NOW(),
            p_phone,
            CASE WHEN p_phone IS NOT NULL THEN NOW() ELSE NULL END,
            '', '', '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_normalized_email),
            'email',
            v_user_id::text,
            NOW(),
            NOW(),
            NOW()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = v_encrypted_pw,
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', p_full_name, 'phone', p_phone, 'role', p_role),
            phone = COALESCE(p_phone, phone),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (v_user_id, v_normalized_email, p_full_name, p_phone, p_role)
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        updated_at = NOW();

    IF p_restaurant_id IS NOT NULL THEN
        INSERT INTO public.restaurant_members (restaurant_id, user_id, role, is_active)
        VALUES (p_restaurant_id, v_user_id, CASE WHEN p_role = 'ADMIN' THEN 'ADMIN' ELSE 'STAFF' END, TRUE)
        ON CONFLICT (restaurant_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW()
        RETURNING id INTO v_member_id;

        IF v_member_id IS NULL THEN
            SELECT id INTO v_member_id FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id;
        END IF;

        IF p_permissions IS NOT NULL THEN
            PERFORM public.update_staff_permissions(v_member_id, p_permissions);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'email', v_normalized_email,
        'role', p_role,
        'restaurant_id', p_restaurant_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_catalog, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_target_user RECORD;
    v_encrypted_pw TEXT;
BEGIN
    v_caller_role := public.get_user_role();
    IF v_caller_role IS DISTINCT FROM 'SUPER_ADMIN' AND NOT public.is_super_admin() THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.restaurant_members admin_rm
            JOIN public.restaurant_members target_rm ON admin_rm.restaurant_id = target_rm.restaurant_id
            WHERE admin_rm.user_id = auth.uid()
              AND admin_rm.role = 'ADMIN'
              AND admin_rm.is_active = TRUE
              AND target_rm.user_id = p_user_id
        ) THEN
            RAISE EXCEPTION 'Unauthorized: You can only reset passwords for staff in your managed restaurant.';
        END IF;
    END IF;

    IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters long.';
    END IF;

    SELECT id, email INTO v_target_user FROM auth.users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_user_id,
        'email', v_target_user.email,
        'message', 'Password updated successfully'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 29. GRANT PERMISSIONS FOR STORED PROCEDURES
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_restaurant_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_restaurant_ids() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_restaurant_member(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_restaurant_member(UUID, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_next_order_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_order_number(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_qr_table(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_qr_table(TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_restaurant_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(TEXT, UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_delivery_order(UUID, JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_customer_order(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_new_restaurant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_new_restaurant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_restaurant_subscription(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_restaurant_subscription(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_restaurant_subscription_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_subscription_status(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_restaurant_resource_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_resource_usage(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_restaurant_plan_limit(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_restaurant_plan_limit(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_restaurant_feature_access(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_restaurant_feature_access(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_staff_permissions(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_staff_permissions(UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_staff_membership_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_membership_status(UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_restaurant_gallery_images(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_restaurant_gallery_images(UUID, TEXT[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provision_privileged_user(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_privileged_user(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 30. POSTGREST SCHEMA & TABLE PRIVILEGES
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Full table privileges for Authenticated Users & Service Role (RLS strictly enforces row access)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Minimal read privileges for Unauthenticated Guests (Marketplace & Menu Discovery)
GRANT SELECT ON public.restaurants TO anon;
GRANT SELECT ON public.restaurant_public_profiles TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.tables TO anon;
GRANT SELECT ON public.subscription_plans TO anon;

-- ----------------------------------------------------------------------------
-- 31. ENABLE ROW LEVEL SECURITY ACROSS ALL 24 TABLES
-- ----------------------------------------------------------------------------

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 32. COMPLETE ROW LEVEL SECURITY POLICIES FOR ALL 24 TABLES
-- ----------------------------------------------------------------------------

-- 1. Restaurants Policies
DROP POLICY IF EXISTS "Public can view active restaurants" ON public.restaurants;
CREATE POLICY "Public can view active restaurants" ON public.restaurants
    FOR SELECT USING (status = 'ACTIVE' OR public.is_super_admin() OR id IN (SELECT public.get_user_restaurant_ids()));

DROP POLICY IF EXISTS "Admins can update their restaurant" ON public.restaurants;
CREATE POLICY "Admins can update their restaurant" ON public.restaurants
    FOR UPDATE USING (public.is_restaurant_member(id, 'ADMIN') OR public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can insert restaurants" ON public.restaurants;
CREATE POLICY "Super Admins can insert restaurants" ON public.restaurants
    FOR INSERT WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super Admins can delete restaurants" ON public.restaurants;
CREATE POLICY "Super Admins can delete restaurants" ON public.restaurants
    FOR DELETE USING (public.is_super_admin());

-- 2. Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR public.is_super_admin() OR EXISTS (SELECT 1 FROM public.restaurant_members rm1 JOIN public.restaurant_members rm2 ON rm1.restaurant_id = rm2.restaurant_id WHERE rm1.user_id = auth.uid() AND rm2.user_id = profiles.id AND rm1.is_active = TRUE));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR public.is_super_admin()) WITH CHECK (auth.uid() = id OR public.is_super_admin());

DROP POLICY IF EXISTS "Super admin can manage profiles" ON public.profiles;
CREATE POLICY "Super admin can manage profiles" ON public.profiles
    FOR ALL USING (public.is_super_admin());

-- 3. Restaurant Members Policies
DROP POLICY IF EXISTS "Tenant members read own memberships" ON public.restaurant_members;
CREATE POLICY "Tenant members read own memberships" ON public.restaurant_members
    FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

DROP POLICY IF EXISTS "Tenant admin manage members" ON public.restaurant_members;
CREATE POLICY "Tenant admin manage members" ON public.restaurant_members
    FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

DROP POLICY IF EXISTS "Tenant admin update members" ON public.restaurant_members;
CREATE POLICY "Tenant admin update members" ON public.restaurant_members
    FOR UPDATE USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

DROP POLICY IF EXISTS "Tenant admin delete members" ON public.restaurant_members;
CREATE POLICY "Tenant admin delete members" ON public.restaurant_members
    FOR DELETE USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- 4. Restaurant Member Permissions Policies
DROP POLICY IF EXISTS "Super Admin can manage all member permissions" ON public.restaurant_member_permissions;
CREATE POLICY "Super Admin can manage all member permissions" ON public.restaurant_member_permissions
    FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Restaurant Admin can manage member permissions in own restaurant" ON public.restaurant_member_permissions;
CREATE POLICY "Restaurant Admin can manage member permissions in own restaurant" ON public.restaurant_member_permissions
    FOR ALL USING (EXISTS (SELECT 1 FROM public.restaurant_members rm WHERE rm.id = restaurant_member_permissions.restaurant_member_id AND (public.is_restaurant_member(rm.restaurant_id, 'ADMIN') OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.restaurant_members rm WHERE rm.id = restaurant_member_permissions.restaurant_member_id AND (public.is_restaurant_member(rm.restaurant_id, 'ADMIN') OR public.is_super_admin())));

DROP POLICY IF EXISTS "Staff can view own permissions" ON public.restaurant_member_permissions;
CREATE POLICY "Staff can view own permissions" ON public.restaurant_member_permissions
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.restaurant_members rm WHERE rm.id = restaurant_member_permissions.restaurant_member_id AND rm.user_id = auth.uid()));

-- 5. Restaurant Settings Policies
DROP POLICY IF EXISTS "Tenant settings select" ON public.restaurant_settings;
CREATE POLICY "Tenant settings select" ON public.restaurant_settings
    FOR SELECT USING (public.is_super_admin() OR restaurant_id IN (SELECT public.get_user_restaurant_ids()));

DROP POLICY IF EXISTS "Tenant admin manage settings" ON public.restaurant_settings;
CREATE POLICY "Tenant admin manage settings" ON public.restaurant_settings
    FOR ALL USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN')) WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- 6. Restaurant Public Profiles Policies
DROP POLICY IF EXISTS "Public read restaurant public profiles" ON public.restaurant_public_profiles;
CREATE POLICY "Public read restaurant public profiles" ON public.restaurant_public_profiles
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Tenant admins can manage public profiles" ON public.restaurant_public_profiles;
CREATE POLICY "Tenant admins can manage public profiles" ON public.restaurant_public_profiles
    FOR ALL USING (public.is_restaurant_member(restaurant_id, 'ADMIN') OR public.is_super_admin()) WITH CHECK (public.is_restaurant_member(restaurant_id, 'ADMIN') OR public.is_super_admin());

-- 7. Categories Policies
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories" ON public.categories
    FOR SELECT USING (is_active = TRUE OR public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

DROP POLICY IF EXISTS "Staff can manage categories" ON public.categories;
CREATE POLICY "Staff can manage categories" ON public.categories
    FOR ALL USING (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin()) WITH CHECK (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

-- 8. Products Policies
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
    FOR SELECT USING (is_active = TRUE OR public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
CREATE POLICY "Staff can manage products" ON public.products
    FOR ALL USING (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin()) WITH CHECK (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

-- 9. Tables Policies
DROP POLICY IF EXISTS "Public can view dining tables" ON public.tables;
CREATE POLICY "Public can view dining tables" ON public.tables
    FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Staff can manage dining tables" ON public.tables;
CREATE POLICY "Staff can manage dining tables" ON public.tables
    FOR ALL USING (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin()) WITH CHECK (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

-- 10. Day Registers Policies
DROP POLICY IF EXISTS "Tenant staff read day registers" ON public.day_registers;
CREATE POLICY "Tenant staff read day registers" ON public.day_registers
    FOR SELECT USING (public.is_super_admin() OR restaurant_id IN (SELECT public.get_user_restaurant_ids()));

DROP POLICY IF EXISTS "Tenant staff manage day registers" ON public.day_registers;
CREATE POLICY "Tenant staff manage day registers" ON public.day_registers
    FOR ALL USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF')) WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'));

-- 11. Orders Policies
-- Hardened: Removed dangerous 'auth.uid() IS NULL' bypass. Guest orders use create_guest_qr_order RPC.
DROP POLICY IF EXISTS "Tenant staff and customers can view orders" ON public.orders;
CREATE POLICY "Tenant staff and customers can view orders" ON public.orders
    FOR SELECT USING (public.is_restaurant_member(restaurant_id, 'STAFF') OR customer_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "Customers and staff can insert orders" ON public.orders;
CREATE POLICY "Customers and staff can insert orders" ON public.orders
    FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR (auth.uid() IS NOT NULL AND customer_id = auth.uid()));

DROP POLICY IF EXISTS "Staff and customers can update orders" ON public.orders;
CREATE POLICY "Staff and customers can update orders" ON public.orders
    FOR UPDATE USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR (auth.uid() IS NOT NULL AND customer_id = auth.uid()));

DROP POLICY IF EXISTS "Super admin and tenant admin can delete orders" ON public.orders;
CREATE POLICY "Super admin and tenant admin can delete orders" ON public.orders
    FOR DELETE USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- 12. Order Items Policies
DROP POLICY IF EXISTS "Order items select policy" ON public.order_items;
CREATE POLICY "Order items select policy" ON public.order_items
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (public.is_restaurant_member(o.restaurant_id, 'STAFF') OR o.customer_id = auth.uid() OR public.is_super_admin())));

DROP POLICY IF EXISTS "Order items manage policy" ON public.order_items;
CREATE POLICY "Order items manage policy" ON public.order_items
    FOR ALL USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (public.is_restaurant_member(o.restaurant_id, 'STAFF') OR o.customer_id = auth.uid() OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (public.is_restaurant_member(o.restaurant_id, 'STAFF') OR o.customer_id = auth.uid() OR public.is_super_admin())));

-- 13. Order Status Events Policies
DROP POLICY IF EXISTS "Order status events select policy" ON public.order_status_events;
CREATE POLICY "Order status events select policy" ON public.order_status_events
    FOR SELECT USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_events.order_id AND o.customer_id = auth.uid()));

DROP POLICY IF EXISTS "Order status events insert policy" ON public.order_status_events;
CREATE POLICY "Order status events insert policy" ON public.order_status_events
    FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF') OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_events.order_id AND o.customer_id = auth.uid())));

-- 14. Customer Notifications Policies
DROP POLICY IF EXISTS "Customer notifications user policy" ON public.customer_notifications;
CREATE POLICY "Customer notifications user policy" ON public.customer_notifications
    FOR ALL USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- 15. Customer Addresses Policies
DROP POLICY IF EXISTS "Users can manage own addresses" ON public.customer_addresses;
CREATE POLICY "Users can manage own addresses" ON public.customer_addresses
    FOR ALL USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- 16. Favorite Restaurants Policies
DROP POLICY IF EXISTS "Customer manage favorites" ON public.favorite_restaurants;
CREATE POLICY "Customer manage favorites" ON public.favorite_restaurants
    FOR ALL USING (user_id = auth.uid() OR public.is_super_admin()) WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

-- 17. Payments Policies
DROP POLICY IF EXISTS "Payments select policy" ON public.payments;
CREATE POLICY "Payments select policy" ON public.payments
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (public.is_super_admin() OR o.restaurant_id IN (SELECT public.get_user_restaurant_ids()) OR (auth.uid() IS NOT NULL AND o.customer_id = auth.uid()))));

DROP POLICY IF EXISTS "Payments manage policy" ON public.payments;
CREATE POLICY "Payments manage policy" ON public.payments
    FOR ALL USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (public.is_super_admin() OR public.is_restaurant_member(o.restaurant_id, 'STAFF')))) WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND (public.is_super_admin() OR public.is_restaurant_member(o.restaurant_id, 'STAFF'))));

-- 18. KOTs Policies
DROP POLICY IF EXISTS "Staff can read KOTs" ON public.kots;
CREATE POLICY "Staff can read KOTs" ON public.kots
    FOR SELECT USING (public.is_super_admin() OR restaurant_id IN (SELECT public.get_user_restaurant_ids()));

DROP POLICY IF EXISTS "Staff can manage KOTs" ON public.kots;
CREATE POLICY "Staff can manage KOTs" ON public.kots
    FOR ALL USING (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin()) WITH CHECK (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin());

-- 19. KOT Items Policies
DROP POLICY IF EXISTS "Staff can read KOT items" ON public.kot_items;
CREATE POLICY "Staff can read KOT items" ON public.kot_items
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.kots k WHERE k.id = kot_items.kot_id AND (public.is_super_admin() OR k.restaurant_id IN (SELECT public.get_user_restaurant_ids()))));

DROP POLICY IF EXISTS "Staff can manage KOT items" ON public.kot_items;
CREATE POLICY "Staff can manage KOT items" ON public.kot_items
    FOR ALL USING (EXISTS (SELECT 1 FROM public.kots k WHERE k.id = kot_items.kot_id AND (public.is_restaurant_member(k.restaurant_id, 'STAFF') OR public.is_super_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.kots k WHERE k.id = kot_items.kot_id AND (public.is_restaurant_member(k.restaurant_id, 'STAFF') OR public.is_super_admin())));

-- 20. Coupons Policies
DROP POLICY IF EXISTS "Tenant members read coupons" ON public.coupons;
CREATE POLICY "Tenant members read coupons" ON public.coupons
    FOR SELECT USING (public.is_super_admin() OR restaurant_id IN (SELECT public.get_user_restaurant_ids()));

DROP POLICY IF EXISTS "Tenant admin manage coupons" ON public.coupons;
CREATE POLICY "Tenant admin manage coupons" ON public.coupons
    FOR ALL USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN')) WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- 21. Audit Logs Policies
DROP POLICY IF EXISTS "Tenant admin read audit logs" ON public.audit_logs;
CREATE POLICY "Tenant admin read audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_super_admin() OR (restaurant_id IS NOT NULL AND public.is_restaurant_member(restaurant_id, 'ADMIN')));

DROP POLICY IF EXISTS "Tenant insert audit logs" ON public.audit_logs;
CREATE POLICY "Tenant insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (public.is_super_admin() OR (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR (restaurant_id IS NOT NULL AND public.is_restaurant_member(restaurant_id, 'STAFF')));

-- 22. Subscription Plans Policies
DROP POLICY IF EXISTS "Subscription plans select all" ON public.subscription_plans;
CREATE POLICY "Subscription plans select all" ON public.subscription_plans
    FOR SELECT USING (is_active = TRUE OR public.is_super_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Subscription plans superadmin modify" ON public.subscription_plans;
CREATE POLICY "Subscription plans superadmin modify" ON public.subscription_plans
    FOR ALL USING (public.is_super_admin() OR auth.role() = 'service_role') WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- 23. Restaurant Subscriptions Policies
DROP POLICY IF EXISTS "Restaurant subscriptions select" ON public.restaurant_subscriptions;
CREATE POLICY "Restaurant subscriptions select" ON public.restaurant_subscriptions
    FOR SELECT USING (public.is_super_admin() OR auth.role() = 'service_role' OR public.is_restaurant_member(restaurant_id, 'STAFF'));

DROP POLICY IF EXISTS "Restaurant subscriptions superadmin all" ON public.restaurant_subscriptions;
CREATE POLICY "Restaurant subscriptions superadmin all" ON public.restaurant_subscriptions
    FOR ALL USING (public.is_super_admin() OR auth.role() = 'service_role') WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- 24. Subscription Payments Policies
DROP POLICY IF EXISTS "Subscription payments select" ON public.subscription_payments;
CREATE POLICY "Subscription payments select" ON public.subscription_payments
    FOR SELECT USING (public.is_super_admin() OR auth.role() = 'service_role' OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

DROP POLICY IF EXISTS "Subscription payments superadmin all" ON public.subscription_payments;
CREATE POLICY "Subscription payments superadmin all" ON public.subscription_payments
    FOR ALL USING (public.is_super_admin() OR auth.role() = 'service_role') WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 33. DEV INITIAL SEED DATA (SUBSCRIPTION PLANS)
-- ----------------------------------------------------------------------------

INSERT INTO public.subscription_plans (id, name, code, billing_cycle, price, currency, max_staff, max_tables, max_products, features, is_active)
VALUES
    ('plan-starter', 'Starter Plan', 'STARTER_MONTHLY', 'monthly', 999.00, 'INR', 5, 10, 50, '{"qr_ordering": true, "inventory": false, "reports": true, "analytics": false}'::JSONB, TRUE),
    ('plan-pro', 'Pro Business', 'PRO_MONTHLY', 'monthly', 2499.00, 'INR', 15, 30, 200, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true}'::JSONB, TRUE),
    ('plan-enterprise', 'Enterprise Yearly', 'ENTERPRISE_YEARLY', 'yearly', 19999.00, 'INR', 999, 999, 9999, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true, "custom_domain": true}'::JSONB, TRUE)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 34. STORAGE BUCKETS INITIALIZATION
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('product-images', 'product-images', TRUE),
    ('restaurant-assets', 'restaurant-assets', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public Access to product-images" ON storage.objects;
CREATE POLICY "Public Access to product-images" ON storage.objects
    FOR SELECT USING (bucket_id IN ('product-images', 'restaurant-assets'));

DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload assets" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id IN ('product-images', 'restaurant-assets') AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
CREATE POLICY "Authenticated users can update assets" ON storage.objects
    FOR UPDATE USING (bucket_id IN ('product-images', 'restaurant-assets') AND auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 35. REALTIME PUBLICATION CONFIGURATION (GENUINELY IDEMPOTENT)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    tbl TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOR tbl IN SELECT unnest(ARRAY['orders', 'tables', 'restaurant_settings', 'profiles', 'order_status_events', 'kots'])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- END OF RESTROZ DEV BOOTSTRAP SCRIPT
-- ============================================================================
