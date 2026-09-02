-- ============================================================================
-- RATNADEEP POS SAAS — PHASE 1: MULTI-RESTAURANT DATABASE FOUNDATION & TENANT SECURITY
-- Hardened Security, Complete Privacy, Exact Monotonic Numbers & Multi-Table Integrity Diagnostics.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. CREATE RESTAURANTS TABLE (Tenants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    legal_name TEXT,
    logo_url TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'India',
    timezone TEXT DEFAULT 'Asia/Kolkata',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. SEED INITIAL RATNADEEP TENANT (Idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO public.restaurants (
    id, name, slug, legal_name, phone, email, address, city, state, country, timezone, status
)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Ratnadeep Restaurant',
    'ratnadeep',
    'Ratnadeep Foods Pvt Ltd',
    '+91 9876543210',
    'info@ratnadeep.com',
    '123 Main Road, Jubilee Hills',
    'Hyderabad',
    'Telangana',
    'India',
    'Asia/Kolkata',
    'ACTIVE'
)
ON CONFLICT (slug) DO UPDATE
SET 
    name = EXCLUDED.name,
    legal_name = EXCLUDED.legal_name,
    status = 'ACTIVE',
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 3. PROFILES TABLE & ROLE CHECK
-- Architecture Note: profiles.role stores Platform baseline roles (SUPER_ADMIN, CUSTOMER).
-- Tenant ADMIN and STAFF authorization is 100% derived from restaurant_members.
-- Legacy values ('ADMIN', 'STAFF') in profiles.role are tolerated purely for backward
-- compatibility during Phase 1 migration and will be deprecated in Phase 2.
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

-- Update profiles constraint if table already existed with older constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER'));

-- ----------------------------------------------------------------------------
-- 4. RESTAURANT MEMBERSHIP TABLE (restaurant_members)
-- Authoritative source for all tenant ADMIN and STAFF authorization.
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
-- 5. MIGRATE EXISTING ADMIN & STAFF INTO RESTAURANT MEMBERS
-- ----------------------------------------------------------------------------
INSERT INTO public.restaurant_members (restaurant_id, user_id, role, is_active)
SELECT 
    'a0000000-0000-0000-0000-000000000001'::UUID,
    p.id,
    CASE 
        WHEN p.role = 'ADMIN' THEN 'ADMIN'
        WHEN p.role = 'STAFF' THEN 'STAFF'
        ELSE 'STAFF'
    END,
    TRUE
FROM public.profiles p
WHERE p.role IN ('ADMIN', 'STAFF')
ON CONFLICT (restaurant_id, user_id) DO UPDATE
SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 6. RESTAURANT SETTINGS TABLE (Ensured Existence before ALTER)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    id TEXT PRIMARY KEY DEFAULT 'rest-' || uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'Ratnadeep Restaurant',
    legal_name TEXT DEFAULT 'Ratnadeep Foods Pvt Ltd',
    address TEXT DEFAULT '123 Main Road, Jubilee Hills, Hyderabad',
    phone TEXT DEFAULT '+91 9876543210',
    email TEXT DEFAULT 'info@ratnadeep.com',
    gstin TEXT DEFAULT '36AAAAA0000A1Z5',
    state TEXT DEFAULT 'Telangana',
    logo_url TEXT,
    invoice_prefix TEXT DEFAULT 'INV-',
    kot_prefix TEXT DEFAULT 'KOT-',
    default_tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    currency TEXT DEFAULT 'INR',
    currency_symbol TEXT DEFAULT '₹',
    service_charge_rate NUMERIC(5, 2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. DAY REGISTERS TABLE (day_registers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.day_registers (
    id TEXT PRIMARY KEY DEFAULT 'reg-' || uuid_generate_v4(),
    register_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    opening_cash_float NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    cash_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    upi_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    card_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    total_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    expected_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    actual_cash_counted NUMERIC(10, 2),
    cash_difference NUMERIC(10, 2),
    notes TEXT,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    opened_by TEXT NOT NULL DEFAULT 'Admin',
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. KOTS TABLE (Kitchen Order Tickets)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kots (
    id TEXT PRIMARY KEY DEFAULT 'kot-' || uuid_generate_v4(),
    kot_number TEXT NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number TEXT,
    order_type TEXT CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')) DEFAULT 'dine_in',
    table_number TEXT,
    customer_name TEXT,
    kitchen_notes TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'ready', 'served')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kot_items (
    id TEXT PRIMARY KEY DEFAULT 'kitem-' || uuid_generate_v4(),
    kot_id TEXT NOT NULL REFERENCES public.kots(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. ADD restaurant_id, next_order_seq AND stock_deducted COLUMNS
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS next_order_seq INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.kots ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.day_registers ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS usage_limit INTEGER;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 10. BACKFILL EXISTING RECORDS WITH RATNADEEP TENANT ID
-- ----------------------------------------------------------------------------
UPDATE public.restaurant_settings SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.categories SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.products SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.tables SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.orders SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.kots SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.day_registers SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.coupons SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.audit_logs SET restaurant_id = 'a0000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL AND user_name <> 'SUPER_ADMIN';

-- Ensure exactly one restaurant_settings row exists for Ratnadeep (creates ONLY if missing, preserving existing live configuration)
INSERT INTO public.restaurant_settings (
    restaurant_id, name, legal_name, address, phone, email, gstin, state,
    invoice_prefix, default_tax_rate, currency, currency_symbol, next_order_seq
)
SELECT 
    'a0000000-0000-0000-0000-000000000001',
    'Ratnadeep Restaurant',
    'Ratnadeep Foods Pvt Ltd',
    '123 Main Road, Jubilee Hills, Hyderabad',
    '+91 9876543210',
    'info@ratnadeep.com',
    '36AAAAA0000A1Z5',
    'Telangana',
    'INV-',
    5.0,
    'INR',
    '₹',
    1
WHERE NOT EXISTS (
    SELECT 1 FROM public.restaurant_settings WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001'
);

-- ----------------------------------------------------------------------------
-- 11. INITIALIZE next_order_seq FROM HIGHEST HISTORICAL ORDER SEQUENCE
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    max_seq INTEGER := 0;
    v_parsed_seq INTEGER;
    unparseable_cnt INTEGER := 0;
    unparseable_samples TEXT;
    ord_rec RECORD;
BEGIN
    -- Inspect every non-null/non-empty historical order_number for Ratnadeep
    FOR ord_rec IN 
        SELECT order_number 
        FROM public.orders 
        WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001'
          AND order_number IS NOT NULL
          AND trim(order_number) <> ''
    LOOP
        -- Check if order_number matches recognized sequence patterns (e.g. INV-2026-00073, INV-00073, 2026-00073, or trailing digits)
        IF ord_rec.order_number ~ '(\d{1,8})$' THEN
            v_parsed_seq := (substring(ord_rec.order_number from '(\d{1,8})$'))::INTEGER;
            IF v_parsed_seq > max_seq THEN
                max_seq := v_parsed_seq;
            END IF;
        ELSE
            -- Collect unparseable historical order numbers
            unparseable_cnt := unparseable_cnt + 1;
            IF unparseable_samples IS NULL THEN
                unparseable_samples := ord_rec.order_number;
            ELSIF unparseable_cnt <= 10 THEN
                unparseable_samples := unparseable_samples || ', ' || ord_rec.order_number;
            END IF;
        END IF;
    END LOOP;

    -- If any historical order numbers could not be safely interpreted, abort migration with diagnostics
    IF unparseable_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % unparseable historical order numbers in public.orders (samples: %). Historical records must be inspected before initializing next_order_seq.',
            unparseable_cnt, unparseable_samples;
    END IF;

    -- next_order_seq represents the NEXT AVAILABLE sequence to be assigned (max + 1)
    UPDATE public.restaurant_settings
    SET next_order_seq = GREATEST(next_order_seq, max_seq + 1)
    WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001';
END $$;

-- ----------------------------------------------------------------------------
-- 12. PRE-MIGRATION INTEGRITY DIAGNOSTICS & ABORT ON INCONSISTENCIES
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    null_settings_cnt INTEGER;
    null_orders_cnt INTEGER;
    dup_settings_cnt INTEGER;
    dup_products_cnt INTEGER;
    dup_categories_cnt INTEGER;
    dup_tables_cnt INTEGER;
    dup_coupons_cnt INTEGER;
    dup_kots_cnt INTEGER;
    dup_orders_cnt INTEGER;
    dup_details TEXT;
BEGIN
    -- 1. Check for unassigned settings rows
    SELECT COUNT(*) INTO null_settings_cnt FROM public.restaurant_settings WHERE restaurant_id IS NULL;
    IF null_settings_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % restaurant_settings records with NULL restaurant_id.', null_settings_cnt;
    END IF;

    -- 2. Check for unassigned orders rows
    SELECT COUNT(*) INTO null_orders_cnt FROM public.orders WHERE restaurant_id IS NULL;
    IF null_orders_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % orders with NULL restaurant_id.', null_orders_cnt;
    END IF;

    -- 3. Check for duplicate restaurant_settings per restaurant
    SELECT COUNT(*) INTO dup_settings_cnt
    FROM (SELECT restaurant_id FROM public.restaurant_settings GROUP BY restaurant_id HAVING COUNT(*) > 1) s;
    IF dup_settings_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate restaurant_settings for the same restaurant.', dup_settings_cnt;
    END IF;

    -- 4. Check for duplicate product SKUs per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || sku || ')', ', ')
    INTO dup_products_cnt, dup_details
    FROM (SELECT restaurant_id, sku FROM public.products WHERE sku IS NOT NULL GROUP BY restaurant_id, sku HAVING COUNT(*) > 1) p;
    IF dup_products_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate product SKUs per restaurant: %', dup_products_cnt, dup_details;
    END IF;

    -- 5. Check for duplicate category slugs per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || slug || ')', ', ')
    INTO dup_categories_cnt, dup_details
    FROM (SELECT restaurant_id, slug FROM public.categories WHERE slug IS NOT NULL GROUP BY restaurant_id, slug HAVING COUNT(*) > 1) c;
    IF dup_categories_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate category slugs per restaurant: %', dup_categories_cnt, dup_details;
    END IF;

    -- 6. Check for duplicate table numbers per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || table_number || ')', ', ')
    INTO dup_tables_cnt, dup_details
    FROM (SELECT restaurant_id, table_number FROM public.tables WHERE table_number IS NOT NULL GROUP BY restaurant_id, table_number HAVING COUNT(*) > 1) t;
    IF dup_tables_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate table numbers per restaurant: %', dup_tables_cnt, dup_details;
    END IF;

    -- 7. Check for duplicate coupon codes per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || code || ')', ', ')
    INTO dup_coupons_cnt, dup_details
    FROM (SELECT restaurant_id, code FROM public.coupons WHERE code IS NOT NULL GROUP BY restaurant_id, code HAVING COUNT(*) > 1) cp;
    IF dup_coupons_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate coupon codes per restaurant: %', dup_coupons_cnt, dup_details;
    END IF;

    -- 8. Check for duplicate KOT numbers per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || kot_number || ')', ', ')
    INTO dup_kots_cnt, dup_details
    FROM (SELECT restaurant_id, kot_number FROM public.kots WHERE kot_number IS NOT NULL GROUP BY restaurant_id, kot_number HAVING COUNT(*) > 1) k;
    IF dup_kots_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate KOT numbers per restaurant: %', dup_kots_cnt, dup_details;
    END IF;

    -- 9. Check for duplicate order numbers per restaurant
    SELECT COUNT(*), string_agg('(' || restaurant_id::TEXT || ', ' || order_number || ' : ' || cnt::TEXT || ' occurrences)', ', ')
    INTO dup_orders_cnt, dup_details
    FROM (
        SELECT restaurant_id, order_number, COUNT(*) as cnt
        FROM public.orders
        WHERE order_number IS NOT NULL
        GROUP BY restaurant_id, order_number
        HAVING COUNT(*) > 1
    ) dups;

    IF dup_orders_cnt > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Found % duplicate (restaurant_id, order_number) records in public.orders: %', dup_orders_cnt, dup_details;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 13. ENFORCE NOT NULL CONSTRAINT ON TENANT-OWNED TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_settings ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.tables ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.kots ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.day_registers ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.coupons ALTER COLUMN restaurant_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 14. TENANT-SCOPED UNIQUENESS CONSTRAINTS
-- ----------------------------------------------------------------------------
-- Drop legacy global uniqueness constraints
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_table_number_key;
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_code_key;
ALTER TABLE public.kots DROP CONSTRAINT IF EXISTS kots_kot_number_key;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_number_key;

-- Add tenant-scoped uniqueness constraints
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS uq_products_restaurant_sku;
ALTER TABLE public.products ADD CONSTRAINT uq_products_restaurant_sku UNIQUE (restaurant_id, sku);

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS uq_categories_restaurant_slug;
ALTER TABLE public.categories ADD CONSTRAINT uq_categories_restaurant_slug UNIQUE (restaurant_id, slug);

ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS uq_tables_restaurant_table_number;
ALTER TABLE public.tables ADD CONSTRAINT uq_tables_restaurant_table_number UNIQUE (restaurant_id, table_number);

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS uq_coupons_restaurant_code;
ALTER TABLE public.coupons ADD CONSTRAINT uq_coupons_restaurant_code UNIQUE (restaurant_id, code);

ALTER TABLE public.restaurant_settings DROP CONSTRAINT IF EXISTS uq_settings_restaurant;
ALTER TABLE public.restaurant_settings ADD CONSTRAINT uq_settings_restaurant UNIQUE (restaurant_id);

ALTER TABLE public.kots DROP CONSTRAINT IF EXISTS uq_kots_restaurant_kot_number;
ALTER TABLE public.kots ADD CONSTRAINT uq_kots_restaurant_kot_number UNIQUE (restaurant_id, kot_number);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS uq_orders_restaurant_order_number;
ALTER TABLE public.orders ADD CONSTRAINT uq_orders_restaurant_order_number UNIQUE (restaurant_id, order_number);

-- ----------------------------------------------------------------------------
-- 15. DATABASE INDEXES FOR TENANT QUERY PERFORMANCE
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_user_rest ON public.restaurant_members (user_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_members_restaurant ON public.restaurant_members (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_settings_restaurant ON public.restaurant_settings (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON public.categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_restaurant ON public.products (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON public.tables (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_kots_restaurant ON public.kots (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_registers_restaurant ON public.day_registers (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant ON public.coupons (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant ON public.audit_logs (restaurant_id);

-- ----------------------------------------------------------------------------
-- 16. SECURITY DEFINER HELPER FUNCTIONS (Hardened Search Path)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_user_restaurant_ids()
RETURNS TABLE(restaurant_id UUID) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT restaurant_id 
    FROM public.restaurant_members 
    WHERE user_id = auth.uid() AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.is_restaurant_member(target_restaurant_id UUID, min_role TEXT DEFAULT 'STAFF')
RETURNS BOOLEAN 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.restaurant_members
        WHERE user_id = auth.uid() 
          AND restaurant_id = target_restaurant_id
          AND is_active = TRUE
          AND (
              min_role = 'STAFF' OR 
              (min_role = 'ADMIN' AND role = 'ADMIN')
          )
    );
$$;

-- ----------------------------------------------------------------------------
-- 17. SHARED ATOMIC ORDER NUMBER GENERATOR RPC (Strictly Authorized & Exact Sequence)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_restaurant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_invoice_prefix TEXT;
    v_assigned_seq INTEGER;
    v_cur_year TEXT;
    v_is_authorized BOOLEAN;
BEGIN
    -- Authorization Check: Only service_role, SUPER_ADMIN, or restaurant STAFF/ADMIN can call
    v_is_authorized := (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role')
                       OR public.is_super_admin()
                       OR public.is_restaurant_member(p_restaurant_id, 'STAFF');

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: You are not authorized to generate order numbers for restaurant %.', p_restaurant_id;
    END IF;

    -- Lock row and read current NEXT AVAILABLE sequence
    SELECT invoice_prefix, next_order_seq INTO v_invoice_prefix, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    IF v_assigned_seq IS NULL THEN
        RAISE EXCEPTION 'Restaurant settings are missing for restaurant %.', p_restaurant_id;
    END IF;

    -- Increment counter for the subsequent order
    UPDATE public.restaurant_settings
    SET next_order_seq = next_order_seq + 1,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    v_invoice_prefix := COALESCE(v_invoice_prefix, 'INV-');
    v_cur_year := to_char(NOW(), 'YYYY');

    -- Returns exact assigned sequence (e.g. 74 when next_order_seq was 74, now advanced to 75)
    RETURN v_invoice_prefix || v_cur_year || '-' || LPAD(v_assigned_seq::TEXT, GREATEST(5, length(v_assigned_seq::TEXT)), '0');
END;
$$;

-- ----------------------------------------------------------------------------
-- 18. PUBLIC SAFE RESOLUTION RPCS (Opaque Hash Resolution, No Number Enumeration)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_qr_table(p_identifier TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_table RECORD;
BEGIN
    -- Strict Resolution: Matches ONLY the opaque qr_code_hash or specific table UUID/ID
    SELECT t.id, t.restaurant_id, t.table_number, t.seating_capacity, t.section, t.is_active, t.status, r.name as restaurant_name, r.slug as restaurant_slug
    INTO v_table
    FROM public.tables t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    WHERE (t.qr_code_hash = p_identifier OR t.id = p_identifier)
      AND t.is_active = TRUE
      AND r.status = 'ACTIVE'
    LIMIT 1;

    IF v_table.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Return only customer-facing safe metadata
    RETURN jsonb_build_object(
        'id', v_table.id,
        'restaurant_id', v_table.restaurant_id,
        'table_number', v_table.table_number,
        'seating_capacity', v_table.seating_capacity,
        'section', v_table.section,
        'is_active', v_table.is_active,
        'status', v_table.status,
        'restaurant_name', v_table.restaurant_name,
        'restaurant_slug', v_table.restaurant_slug
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_restaurant_info(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_info RECORD;
BEGIN
    SELECT r.id, r.name, r.slug, r.legal_name, r.logo_url, r.phone, r.email,
           r.address, r.city, r.state, r.country, r.timezone, r.status,
           s.currency, s.currency_symbol, s.default_tax_rate, s.service_charge_rate, s.invoice_prefix
    INTO v_info
    FROM public.restaurants r
    LEFT JOIN public.restaurant_settings s ON s.restaurant_id = r.id
    WHERE r.id = p_restaurant_id AND r.status = 'ACTIVE'
    LIMIT 1;

    IF v_info.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_info.id,
        'name', v_info.name,
        'slug', v_info.slug,
        'legal_name', v_info.legal_name,
        'logo_url', v_info.logo_url,
        'phone', v_info.phone,
        'email', v_info.email,
        'address', v_info.address,
        'city', v_info.city,
        'state', v_info.state,
        'country', v_info.country,
        'timezone', v_info.timezone,
        'currency', COALESCE(v_info.currency, 'INR'),
        'currency_symbol', COALESCE(v_info.currency_symbol, '₹'),
        'default_tax_rate', COALESCE(v_info.default_tax_rate, 5.0),
        'service_charge_rate', COALESCE(v_info.service_charge_rate, 0.0),
        'invoice_prefix', COALESCE(v_info.invoice_prefix, 'INV-')
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 19. PRIVILEGE ESCALATION BLOCKER & PROFILE ROLE MANAGEMENT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    assigned_role TEXT;
BEGIN
    IF (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role' OR public.is_super_admin()) THEN
        assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'CUSTOMER');
        IF assigned_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER') THEN
            assigned_role := 'CUSTOMER';
        END IF;
    ELSE
        assigned_role := 'CUSTOMER';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        assigned_role,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role) THEN
        IF NOT (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role' OR public.is_super_admin()) THEN
            RAISE EXCEPTION 'Access denied: Only SUPER_ADMIN or service role can modify platform profile roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ----------------------------------------------------------------------------
-- 20. GUEST QR ORDERING & TENANT ORDER VALIDATION TRIGGER
-- ----------------------------------------------------------------------------
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

    is_staff_member := public.is_restaurant_member(NEW.restaurant_id, 'STAFF') OR public.is_super_admin();

    -- 2. Validate Anonymous vs Authenticated Creation Requirements
    IF (auth.uid() IS NULL AND NOT is_staff_member) THEN
        IF (NEW.table_id IS NULL) THEN
            RAISE EXCEPTION 'Anonymous guest orders must specify an active dining table.';
        END IF;
        IF (NEW.order_type <> 'dine_in') THEN
            RAISE EXCEPTION 'Anonymous guest orders are restricted to dine-in QR orders only.';
        END IF;
    END IF;

    -- 3. Validate Table with FOR UPDATE Lock to prevent concurrent double-booking
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

        -- 4. One-active-unsettled-order-per-table rule for new orders
        IF (TG_OP = 'INSERT') THEN
            SELECT id INTO active_unsettled_order_id
            FROM public.orders
            WHERE restaurant_id = NEW.restaurant_id
              AND table_id = NEW.table_id
              AND status NOT IN ('completed', 'cancelled')
              AND payment_status <> 'paid'
            LIMIT 1;

            IF active_unsettled_order_id IS NOT NULL THEN
                RAISE EXCEPTION 'Table % already has an active unsettled order (%).',
                    NEW.table_id, active_unsettled_order_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_tenant_and_table ON public.orders;
CREATE TRIGGER trg_validate_order_tenant_and_table
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_tenant_and_table();

-- ----------------------------------------------------------------------------
-- 21. CUSTOMER SENSITIVE FIELD PROTECTION TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_order_sensitive_fields()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    is_staff_or_admin BOOLEAN;
BEGIN
    is_staff_or_admin := public.is_restaurant_member(OLD.restaurant_id, 'STAFF') 
                         OR public.is_super_admin()
                         OR (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role');

    IF NOT is_staff_or_admin THEN
        IF (NEW.restaurant_id <> OLD.restaurant_id) THEN
            RAISE EXCEPTION 'Access denied: You cannot alter the restaurant of an existing order.';
        END IF;
        IF (NEW.table_id IS DISTINCT FROM OLD.table_id) THEN
            RAISE EXCEPTION 'Access denied: You cannot alter the dining table of an existing order.';
        END IF;
        IF (NEW.payment_status <> OLD.payment_status OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) THEN
            RAISE EXCEPTION 'Access denied: Payment settlement fields can only be modified by restaurant staff.';
        END IF;
        IF (NEW.subtotal <> OLD.subtotal OR NEW.grand_total <> OLD.grand_total OR NEW.payable_amount <> OLD.payable_amount) THEN
            RAISE EXCEPTION 'Access denied: Financial amounts and totals can only be recalculated by restaurant staff.';
        END IF;
        IF (NEW.cgst_amount <> OLD.cgst_amount OR NEW.sgst_amount <> OLD.sgst_amount OR NEW.service_charge <> OLD.service_charge) THEN
            RAISE EXCEPTION 'Access denied: Tax and surcharge breakdown cannot be altered by customers.';
        END IF;
        IF (NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
            RAISE EXCEPTION 'Access denied: Order origin field is immutable.';
        END IF;

        IF (NEW.status <> OLD.status) THEN
            IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('draft', 'confirmed')) THEN
                RAISE EXCEPTION 'Access denied: Customers can only cancel unstarted orders. Status progression is managed by staff.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_order_sensitive_fields ON public.orders;
CREATE TRIGGER trg_protect_order_sensitive_fields
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.protect_order_sensitive_fields();

-- ----------------------------------------------------------------------------
-- 22. CROSS-TENANT ORDER ITEM PROTECTION TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_order_item_tenant()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    order_rest_id UUID;
    prod_rest_id UUID;
BEGIN
    SELECT restaurant_id INTO order_rest_id
    FROM public.orders
    WHERE id = NEW.order_id;

    IF order_rest_id IS NULL THEN
        RAISE EXCEPTION 'Invalid order_id: Parent order does not exist.';
    END IF;

    IF (NEW.product_id IS NOT NULL) THEN
        SELECT restaurant_id INTO prod_rest_id
        FROM public.products
        WHERE id = NEW.product_id;

        IF prod_rest_id IS NOT NULL AND prod_rest_id <> order_rest_id THEN
            RAISE EXCEPTION 'Cross-tenant violation: Product % (Restaurant %) does not belong to Order % (Restaurant %).',
                NEW.product_id, prod_rest_id, NEW.order_id, order_rest_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_item_tenant ON public.order_items;
CREATE TRIGGER trg_validate_order_item_tenant
    BEFORE INSERT OR UPDATE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_tenant();

-- ----------------------------------------------------------------------------
-- 23. ATOMIC ORDER CANCELLATION & SAFE STOCK RESTORATION TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_cancellation_stock_restoration()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
    -- Safe restoration: Aggregates total quantities per product in the order and restores exactly once
    IF (OLD.status <> 'cancelled' AND NEW.status = 'cancelled' AND OLD.stock_deducted = TRUE) THEN
        UPDATE public.products p
        SET stock_quantity = p.stock_quantity + sub.total_qty,
            is_available = TRUE,
            updated_at = NOW()
        FROM (
            SELECT product_id, SUM(quantity)::INTEGER AS total_qty
            FROM public.order_items
            WHERE order_id = OLD.id AND product_id IS NOT NULL
            GROUP BY product_id
        ) sub
        WHERE p.id = sub.product_id;

        -- Flip state so it can never be restored again
        NEW.stock_deducted := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_cancellation_stock_restoration ON public.orders;
CREATE TRIGGER trg_order_cancellation_stock_restoration
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_order_cancellation_stock_restoration();

-- ----------------------------------------------------------------------------
-- 24. ATOMIC GUEST/CUSTOMER QR ORDER CREATION RPC (Collision-Safe Order Counter)
-- ----------------------------------------------------------------------------
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_order_id TEXT;
    v_order_number TEXT;
    v_invoice_prefix TEXT;
    v_tax_rate NUMERIC;
    v_assigned_seq INTEGER;
    v_table_num TEXT;
    v_table_rest UUID;
    v_table_active BOOLEAN;
    v_rest_status TEXT;
    v_item JSONB;
    v_prod_id TEXT;
    v_prod_name TEXT;
    v_prod_price NUMERIC;
    v_prod_rest UUID;
    v_prod_active BOOLEAN;
    v_prod_available BOOLEAN;
    v_prod_stock INTEGER;
    v_prod_tax_rate NUMERIC;
    v_qty INTEGER;
    v_item_notes TEXT;
    v_item_subtotal NUMERIC;
    v_item_tax NUMERIC;
    v_item_total NUMERIC;
    v_subtotal NUMERIC := 0;
    v_cgst NUMERIC := 0;
    v_sgst NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    v_round_off NUMERIC := 0;
    v_payable NUMERIC := 0;
    v_cur_year TEXT;
    v_unsettled_id TEXT;
    v_item_id TEXT;
    v_clean_coupon TEXT;
    v_coupon_discount NUMERIC := 0;
    v_coupon_disc_type TEXT;
    v_coupon_disc_val NUMERIC;
    v_coupon_min_val NUMERIC;
    v_coupon_max_disc NUMERIC;
    v_coupon_active BOOLEAN;
    v_coupon_start TIMESTAMP WITH TIME ZONE;
    v_coupon_expiry TIMESTAMP WITH TIME ZONE;
    v_coupon_usage_limit INTEGER;
    v_coupon_used_count INTEGER;
    v_customer_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    -- 1. Validate Restaurant Exists & is ACTIVE
    SELECT status INTO v_rest_status
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    IF v_rest_status IS NULL OR v_rest_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Restaurant is not active or does not exist.';
    END IF;

    -- 2. Lock Table Row FOR UPDATE and Validate Belongs to Restaurant & ACTIVE
    SELECT table_number, restaurant_id, is_active INTO v_table_num, v_table_rest, v_table_active
    FROM public.tables
    WHERE id = p_table_id
    FOR UPDATE;

    IF v_table_rest IS NULL THEN
        RAISE EXCEPTION 'Table does not exist.';
    END IF;

    IF v_table_rest <> p_restaurant_id THEN
        RAISE EXCEPTION 'Table % does not belong to the specified restaurant.', p_table_id;
    END IF;

    IF v_table_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Table % is currently inactive.', v_table_num;
    END IF;

    -- 3. One active unsettled order rule (Evaluated under Table Row Lock)
    SELECT id INTO v_unsettled_id
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND table_id = p_table_id
      AND status NOT IN ('completed', 'cancelled')
      AND payment_status <> 'paid'
    LIMIT 1;

    IF v_unsettled_id IS NOT NULL THEN
        RAISE EXCEPTION 'Table % already has an active unsettled order (%).', v_table_num, v_unsettled_id;
    END IF;

    -- 4. Validate Items Payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must contain at least one item.';
    END IF;

    -- 5. Lock settings row, read exact NEXT AVAILABLE sequence, and advance counter by 1
    SELECT invoice_prefix, default_tax_rate, next_order_seq 
    INTO v_invoice_prefix, v_tax_rate, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    IF v_assigned_seq IS NULL THEN
        RAISE EXCEPTION 'Restaurant settings are missing for restaurant %.', p_restaurant_id;
    END IF;

    UPDATE public.restaurant_settings
    SET next_order_seq = next_order_seq + 1,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    v_invoice_prefix := COALESCE(v_invoice_prefix, 'INV-');
    v_tax_rate := COALESCE(v_tax_rate, 5.0);
    v_cur_year := to_char(NOW(), 'YYYY');

    -- Collision-safe Monotonic Order Number per Restaurant (e.g. 74 when next_order_seq was 74)
    v_order_id := 'ord-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);
    v_order_number := v_invoice_prefix || v_cur_year || '-' || LPAD(v_assigned_seq::TEXT, 5, '0');

    -- 6. Calculate line items, lock inventory rows, validate stock & deduct atomic stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        
        -- Explicit strict positive integer quantity validation
        IF v_item->>'quantity' IS NULL OR (v_item->>'quantity')::TEXT !~ '^\d+$' OR (v_item->>'quantity')::INTEGER <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity for item %: quantity must be a positive integer.', COALESCE(v_prod_id, 'unknown');
        END IF;
        v_qty := (v_item->>'quantity')::INTEGER;

        -- Row-level locking on product row
        SELECT name, price, restaurant_id, is_active, is_available, stock_quantity, tax_rate 
        INTO v_prod_name, v_prod_price, v_prod_rest, v_prod_active, v_prod_available, v_prod_stock, v_prod_tax_rate
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF v_prod_rest IS NULL OR v_prod_rest <> p_restaurant_id THEN
            RAISE EXCEPTION 'Product % does not belong to this restaurant.', v_prod_id;
        END IF;

        IF v_prod_active IS NOT TRUE OR v_prod_available IS NOT TRUE THEN
            RAISE EXCEPTION 'Product "%" is currently unavailable.', v_prod_name;
        END IF;

        IF v_prod_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product "%" (Requested: %, Available: %).', v_prod_name, v_qty, v_prod_stock;
        END IF;

        -- Atomically deduct stock
        UPDATE public.products
        SET stock_quantity = stock_quantity - v_qty,
            is_available = CASE WHEN (stock_quantity - v_qty) > 0 THEN is_available ELSE FALSE END,
            updated_at = NOW()
        WHERE id = v_prod_id;

        v_item_subtotal := v_prod_price * v_qty;
        v_item_tax := round(v_item_subtotal * (COALESCE(v_prod_tax_rate, v_tax_rate) / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;

        v_subtotal := v_subtotal + v_item_subtotal;
        v_cgst := v_cgst + round(v_item_tax / 2.0, 2);
        v_sgst := v_sgst + round(v_item_tax / 2.0, 2);
    END LOOP;

    -- 7. Server-Side Coupon Validation & Atomic Usage Check
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        v_clean_coupon := upper(trim(p_coupon_code));
        
        -- Lock coupon row FOR UPDATE to prevent race conditions exceeding usage limits
        SELECT discount_type, discount_value, min_order_value, max_discount, is_active, start_date, expiry_date, usage_limit, used_count
        INTO v_coupon_disc_type, v_coupon_disc_val, v_coupon_min_val, v_coupon_max_disc, v_coupon_active, v_coupon_start, v_coupon_expiry, v_coupon_usage_limit, v_coupon_used_count
        FROM public.coupons
        WHERE restaurant_id = p_restaurant_id AND code = v_clean_coupon
        FOR UPDATE;

        IF v_coupon_active IS NULL THEN
            RAISE EXCEPTION 'Coupon code % is invalid for this restaurant.', p_coupon_code;
        END IF;

        IF v_coupon_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Coupon code % is inactive.', p_coupon_code;
        END IF;

        IF v_coupon_start IS NOT NULL AND v_coupon_start > NOW() THEN
            RAISE EXCEPTION 'Coupon code % is not yet active.', p_coupon_code;
        END IF;

        IF v_coupon_expiry IS NOT NULL AND v_coupon_expiry < NOW() THEN
            RAISE EXCEPTION 'Coupon code % has expired.', p_coupon_code;
        END IF;

        -- Enforce usage limit if defined
        IF v_coupon_usage_limit IS NOT NULL AND COALESCE(v_coupon_used_count, 0) >= v_coupon_usage_limit THEN
            RAISE EXCEPTION 'Coupon code % has reached its maximum total usage limit.', p_coupon_code;
        END IF;

        IF v_coupon_min_val > 0 AND v_subtotal < v_coupon_min_val THEN
            RAISE EXCEPTION 'Minimum order amount for coupon % is ₹%.', p_coupon_code, v_coupon_min_val;
        END IF;

        IF v_coupon_disc_type = 'percentage' THEN
            v_coupon_discount := round(v_subtotal * (v_coupon_disc_val / 100.0), 2);
            IF v_coupon_max_disc IS NOT NULL AND v_coupon_discount > v_coupon_max_disc THEN
                v_coupon_discount := v_coupon_max_disc;
            END IF;
        ELSE
            v_coupon_discount := LEAST(v_subtotal, v_coupon_disc_val);
        END IF;

        -- Atomically increment coupon usage
        UPDATE public.coupons
        SET used_count = COALESCE(used_count, 0) + 1, updated_at = NOW()
        WHERE restaurant_id = p_restaurant_id AND code = v_clean_coupon;
    END IF;

    v_grand_total := GREATEST(0, (v_subtotal - v_coupon_discount) + v_cgst + v_sgst);
    v_payable := round(v_grand_total);
    v_round_off := v_payable - v_grand_total;

    -- 8. Insert Order Record with stock_deducted = TRUE and customer_id if authenticated
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_id, customer_name, customer_phone, status, subtotal, discount_amount,
        coupon_code, coupon_discount, cgst_amount, sgst_amount, igst_amount,
        service_charge, grand_total, round_off, payable_amount, paid_amount,
        payment_status, notes, created_by, stock_deducted, created_at, updated_at
    )
    VALUES (
        v_order_id, p_restaurant_id, v_order_number, 'dine_in', p_table_id, v_table_num,
        v_customer_id, COALESCE(NULLIF(trim(p_customer_name), ''), v_table_num || ' Guest'),
        NULLIF(trim(p_customer_phone), ''), 'confirmed', v_subtotal, v_coupon_discount,
        p_coupon_code, v_coupon_discount, v_cgst, v_sgst, 0, 0,
        v_grand_total, v_round_off, v_payable, 0, 'unpaid',
        CASE WHEN p_notes IS NOT NULL THEN '[QR_DINE_IN] ' || p_notes ELSE '[QR_DINE_IN]' END,
        'CUSTOMER_QR', TRUE, NOW(), NOW()
    );

    -- 9. Insert Order Items Records
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'product_id';
        v_qty := (v_item->>'quantity')::INTEGER;

        SELECT name, price, tax_rate INTO v_prod_name, v_prod_price, v_prod_tax_rate
        FROM public.products WHERE id = v_prod_id;

        v_item_subtotal := v_prod_price * v_qty;
        v_item_tax := round(v_item_subtotal * (COALESCE(v_prod_tax_rate, v_tax_rate) / 100.0), 2);
        v_item_total := v_item_subtotal + v_item_tax;
        v_item_id := 'item-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4);

        INSERT INTO public.order_items (
            id, order_id, product_id, product_name, unit_price, quantity,
            tax_rate, tax_amount, item_notes, subtotal, total, created_at
        )
        VALUES (
            v_item_id, v_order_id, v_prod_id, v_prod_name, v_prod_price, v_qty,
            COALESCE(v_prod_tax_rate, v_tax_rate), v_item_tax, v_item->>'item_notes',
            v_item_subtotal, v_item_total, NOW()
        );
    END LOOP;

    -- Return JSON payload of the created order with items (safe customer-facing projection)
    SELECT row_to_json(ord)::JSONB INTO v_result
    FROM (
        SELECT o.id, o.restaurant_id, o.order_number, o.order_type, o.table_id, o.table_number,
               o.customer_name, o.customer_phone, o.status, o.subtotal, o.discount_amount,
               o.coupon_code, o.coupon_discount, o.cgst_amount, o.sgst_amount, o.grand_total,
               o.round_off, o.payable_amount, o.paid_amount, o.payment_status, o.notes,
               o.created_at,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', oi.id,
                        'order_id', oi.order_id,
                        'product_id', oi.product_id,
                        'product_name', oi.product_name,
                        'unit_price', oi.unit_price,
                        'quantity', oi.quantity,
                        'tax_rate', oi.tax_rate,
                        'tax_amount', oi.tax_amount,
                        'item_notes', oi.item_notes,
                        'subtotal', oi.subtotal,
                        'total', oi.total
                    )
                )
                FROM public.order_items oi
                WHERE oi.order_id = o.id
            ), '[]'::JSONB) AS items
        FROM public.orders o
        WHERE o.id = v_order_id
    ) ord;

    RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 25. LOCK DOWN SECURITY DEFINER EXECUTION PERMISSIONS
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_next_order_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_order_number(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_qr_order(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_qr_table(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_qr_table(TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_restaurant_info(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 26. ROW LEVEL SECURITY (RLS) ENABLEMENT
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 27. HARDENED RLS POLICIES (COMPLETE PRIVACY FOR SETTINGS, TABLES & COUPONS)
-- ----------------------------------------------------------------------------

-- PROFILES POLICIES (Privacy Hardened: No Public Enumeration)
DROP POLICY IF EXISTS "Public Profiles Select" ON public.profiles;
DROP POLICY IF EXISTS "Users Read Own Profile" ON public.profiles;
CREATE POLICY "Users Read Own Profile" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id OR
        public.is_super_admin() OR
        EXISTS (
            SELECT 1 FROM public.restaurant_members rm_target
            JOIN public.restaurant_members rm_admin ON rm_target.restaurant_id = rm_admin.restaurant_id
            WHERE rm_target.user_id = profiles.id
              AND rm_admin.user_id = auth.uid()
              AND rm_admin.role = 'ADMIN'
              AND rm_admin.is_active = TRUE
        )
    );

DROP POLICY IF EXISTS "User Update Own Profile" ON public.profiles;
CREATE POLICY "User Update Own Profile" ON public.profiles
    FOR UPDATE 
    USING (auth.uid() = id OR public.is_super_admin())
    WITH CHECK (auth.uid() = id OR public.is_super_admin());

DROP POLICY IF EXISTS "Super Admin Manage Profiles" ON public.profiles;
CREATE POLICY "Super Admin Manage Profiles" ON public.profiles
    FOR ALL 
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- RESTAURANTS POLICIES
DROP POLICY IF EXISTS "Public Read Active Restaurants" ON public.restaurants;
CREATE POLICY "Public Read Active Restaurants" ON public.restaurants
    FOR SELECT USING (
        status = 'ACTIVE' OR 
        public.is_super_admin() OR 
        id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Admin Update Restaurant" ON public.restaurants;
CREATE POLICY "Tenant Admin Update Restaurant" ON public.restaurants
    FOR UPDATE
    USING (public.is_super_admin() OR public.is_restaurant_member(id, 'ADMIN'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(id, 'ADMIN'));

DROP POLICY IF EXISTS "Super Admin Insert Restaurant" ON public.restaurants;
CREATE POLICY "Super Admin Insert Restaurant" ON public.restaurants
    FOR INSERT
    WITH CHECK (public.is_super_admin());

-- RESTAURANT MEMBERS POLICIES
DROP POLICY IF EXISTS "Tenant Members Read Own Memberships" ON public.restaurant_members;
CREATE POLICY "Tenant Members Read Own Memberships" ON public.restaurant_members
    FOR SELECT USING (
        user_id = auth.uid() OR
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN')
    );

DROP POLICY IF EXISTS "Tenant Admin Manage Members" ON public.restaurant_members;
CREATE POLICY "Tenant Admin Manage Members" ON public.restaurant_members
    FOR INSERT
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'ADMIN')
    );

DROP POLICY IF EXISTS "Tenant Admin Update Members" ON public.restaurant_members;
CREATE POLICY "Tenant Admin Update Members" ON public.restaurant_members
    FOR UPDATE
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

DROP POLICY IF EXISTS "Tenant Admin Delete Members" ON public.restaurant_members;
CREATE POLICY "Tenant Admin Delete Members" ON public.restaurant_members
    FOR DELETE
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- RESTAURANT SETTINGS POLICIES (Tenant Members & Super Admin ONLY - No Public Base Table Access)
DROP POLICY IF EXISTS "Tenant Settings Select" ON public.restaurant_settings;
CREATE POLICY "Tenant Settings Select" ON public.restaurant_settings
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Admin Save Settings" ON public.restaurant_settings;
CREATE POLICY "Tenant Admin Save Settings" ON public.restaurant_settings
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- CATEGORIES POLICIES
DROP POLICY IF EXISTS "Public Read Categories" ON public.categories;
CREATE POLICY "Public Read Categories" ON public.categories
    FOR SELECT USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Admin Manage Categories" ON public.categories;
CREATE POLICY "Tenant Admin Manage Categories" ON public.categories
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- PRODUCTS POLICIES
DROP POLICY IF EXISTS "Public Read Products" ON public.products;
CREATE POLICY "Public Read Products" ON public.products
    FOR SELECT USING (
        (is_active = TRUE AND restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')) OR
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Staff Manage Products" ON public.products;
CREATE POLICY "Tenant Staff Manage Products" ON public.products
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'));

-- TABLES POLICIES (Tenant Members & Super Admin ONLY - No Public Table Enumeration)
DROP POLICY IF EXISTS "Public Read Tables" ON public.tables;
DROP POLICY IF EXISTS "Tenant Members Read Tables" ON public.tables;
CREATE POLICY "Tenant Members Read Tables" ON public.tables
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Staff Manage Tables" ON public.tables;
CREATE POLICY "Tenant Staff Manage Tables" ON public.tables
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'));

-- ORDERS POLICIES (AUTHENTICATED STAFF & SERVICE ROLE INSERT ONLY)
DROP POLICY IF EXISTS "Orders Select Policy" ON public.orders;
CREATE POLICY "Orders Select Policy" ON public.orders
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids()) OR
        (auth.uid() IS NOT NULL AND customer_id = auth.uid())
    );

DROP POLICY IF EXISTS "Orders Insert Policy" ON public.orders;
CREATE POLICY "Orders Insert Policy" ON public.orders
    FOR INSERT
    WITH CHECK (
        restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
        AND (
            -- 1. Server-side security definer RPC / Service Role
            (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
            -- 2. Restaurant staff/admin POS
            public.is_restaurant_member(restaurant_id, 'STAFF')
        )
    );

DROP POLICY IF EXISTS "Orders Update Policy" ON public.orders;
CREATE POLICY "Orders Update Policy" ON public.orders
    FOR UPDATE
    USING (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        (auth.uid() IS NOT NULL AND customer_id = auth.uid())
    )
    WITH CHECK (
        public.is_super_admin() OR
        public.is_restaurant_member(restaurant_id, 'STAFF') OR
        (auth.uid() IS NOT NULL AND customer_id = auth.uid())
    );

-- ORDER ITEMS POLICIES (AUTHENTICATED STAFF & SERVICE ROLE INSERT ONLY)
DROP POLICY IF EXISTS "Order Items Select Policy" ON public.order_items;
CREATE POLICY "Order Items Select Policy" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  public.is_super_admin() OR
                  o.restaurant_id IN (SELECT public.get_user_restaurant_ids()) OR
                  (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "Order Items Insert Policy" ON public.order_items;
CREATE POLICY "Order Items Insert Policy" ON public.order_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.restaurant_id IN (SELECT id FROM public.restaurants WHERE status = 'ACTIVE')
              AND (
                  public.is_super_admin() OR
                  (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
                  public.is_restaurant_member(o.restaurant_id, 'STAFF')
              )
        )
    );

DROP POLICY IF EXISTS "Order Items Update Policy" ON public.order_items;
CREATE POLICY "Order Items Update Policy" ON public.order_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  public.is_super_admin() OR
                  (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
                  public.is_restaurant_member(o.restaurant_id, 'STAFF')
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  public.is_super_admin() OR
                  (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
                  public.is_restaurant_member(o.restaurant_id, 'STAFF')
              )
        )
    );

DROP POLICY IF EXISTS "Order Items Delete Policy" ON public.order_items;
CREATE POLICY "Order Items Delete Policy" ON public.order_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  public.is_super_admin() OR
                  (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
                  public.is_restaurant_member(o.restaurant_id, 'STAFF')
              )
        )
    );

-- PAYMENTS POLICIES
DROP POLICY IF EXISTS "Payments Select Policy" ON public.payments;
CREATE POLICY "Payments Select Policy" ON public.payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = payments.order_id
              AND (
                  public.is_super_admin() OR
                  o.restaurant_id IN (SELECT public.get_user_restaurant_ids()) OR
                  (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
              )
        )
    );

DROP POLICY IF EXISTS "Payments Manage Policy" ON public.payments;
CREATE POLICY "Payments Manage Policy" ON public.payments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = payments.order_id
              AND (public.is_super_admin() OR public.is_restaurant_member(o.restaurant_id, 'STAFF'))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = payments.order_id
              AND (public.is_super_admin() OR public.is_restaurant_member(o.restaurant_id, 'STAFF'))
        )
    );

-- KOTS POLICIES
DROP POLICY IF EXISTS "Tenant Staff Read KOTs" ON public.kots;
CREATE POLICY "Tenant Staff Read KOTs" ON public.kots
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Staff Manage KOTs" ON public.kots;
CREATE POLICY "Tenant Staff Manage KOTs" ON public.kots
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'));

-- KOT ITEMS POLICIES
DROP POLICY IF EXISTS "Tenant Staff Read KOT Items" ON public.kot_items;
CREATE POLICY "Tenant Staff Read KOT Items" ON public.kot_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.kots k
            WHERE k.id = kot_items.kot_id
              AND (public.is_super_admin() OR k.restaurant_id IN (SELECT public.get_user_restaurant_ids()))
        )
    );

DROP POLICY IF EXISTS "Tenant Staff Manage KOT Items" ON public.kot_items;
CREATE POLICY "Tenant Staff Manage KOT Items" ON public.kot_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.kots k
            WHERE k.id = kot_items.kot_id
              AND (public.is_super_admin() OR public.is_restaurant_member(k.restaurant_id, 'STAFF'))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.kots k
            WHERE k.id = kot_items.kot_id
              AND (public.is_super_admin() OR public.is_restaurant_member(k.restaurant_id, 'STAFF'))
        )
    );

-- DAY REGISTERS POLICIES
DROP POLICY IF EXISTS "Tenant Staff Read Day Registers" ON public.day_registers;
CREATE POLICY "Tenant Staff Read Day Registers" ON public.day_registers
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Staff Manage Day Registers" ON public.day_registers;
CREATE POLICY "Tenant Staff Manage Day Registers" ON public.day_registers
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'STAFF'));

-- COUPONS POLICIES (Staff/Admin Protected: No Public Coupon Enumeration)
DROP POLICY IF EXISTS "Public Read Active Coupons" ON public.coupons;
DROP POLICY IF EXISTS "Tenant Members Read Coupons" ON public.coupons;
CREATE POLICY "Tenant Members Read Coupons" ON public.coupons
    FOR SELECT USING (
        public.is_super_admin() OR
        restaurant_id IN (SELECT public.get_user_restaurant_ids())
    );

DROP POLICY IF EXISTS "Tenant Admin Manage Coupons" ON public.coupons;
CREATE POLICY "Tenant Admin Manage Coupons" ON public.coupons
    FOR ALL
    USING (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'))
    WITH CHECK (public.is_super_admin() OR public.is_restaurant_member(restaurant_id, 'ADMIN'));

-- AUDIT LOGS POLICIES (Hardened Insert & Scoped Read)
DROP POLICY IF EXISTS "Tenant Admin Read Audit Logs" ON public.audit_logs;
CREATE POLICY "Tenant Admin Read Audit Logs" ON public.audit_logs
    FOR SELECT
    USING (
        public.is_super_admin() OR 
        (restaurant_id IS NOT NULL AND public.is_restaurant_member(restaurant_id, 'ADMIN'))
    );

DROP POLICY IF EXISTS "Tenant Insert Audit Logs" ON public.audit_logs;
CREATE POLICY "Tenant Insert Audit Logs" ON public.audit_logs
    FOR INSERT
    WITH CHECK (
        public.is_super_admin() OR
        (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role') OR
        (restaurant_id IS NOT NULL AND public.is_restaurant_member(restaurant_id, 'STAFF'))
    );

-- ----------------------------------------------------------------------------
-- 28. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
