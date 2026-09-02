-- ============================================================================
-- Supabase Database Schema for RestroZ SaaS (Multi-Tenant Architecture)
-- Hardened Security, Privacy & Tenant Isolation (Canonical Schema)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. RESTAURANTS TABLE (Tenants)
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

-- 2. PROFILES TABLE (Platform Baseline Roles)
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

-- 3. RESTAURANT MEMBERS TABLE (Tenant Staff & Admin Authorization)
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

-- 4. RESTAURANT SETTINGS TABLE (Tenant Configuration & Atomic Order Counter)
CREATE TABLE IF NOT EXISTS public.restaurant_settings (
    id TEXT PRIMARY KEY DEFAULT 'rest-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
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
    next_order_seq INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_settings_restaurant UNIQUE (restaurant_id)
);

-- 5. CATEGORIES TABLE (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY DEFAULT 'cat-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_categories_restaurant_slug UNIQUE (restaurant_id, slug)
);

-- 6. PRODUCTS TABLE (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY DEFAULT 'prod-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT NOT NULL,
    barcode TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(10, 2) DEFAULT 0,
    mrp NUMERIC(10, 2),
    tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    is_veg BOOLEAN DEFAULT TRUE,
    is_spicy BOOLEAN DEFAULT FALSE,
    preparation_time INTEGER DEFAULT 15,
    calories INTEGER,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    stock_quantity INTEGER DEFAULT 100,
    low_stock_threshold INTEGER DEFAULT 10,
    track_inventory BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_products_restaurant_sku UNIQUE (restaurant_id, sku)
);

-- 7. DINING TABLES TABLE (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS public.tables (
    id TEXT PRIMARY KEY DEFAULT 'tbl-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    seating_capacity INTEGER NOT NULL DEFAULT 4,
    section TEXT DEFAULT 'Ground Floor',
    status TEXT CHECK (status IN ('available', 'occupied', 'reserved')) DEFAULT 'available',
    is_active BOOLEAN DEFAULT TRUE,
    qr_code_hash TEXT UNIQUE,
    current_order_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_tables_restaurant_table_number UNIQUE (restaurant_id, table_number)
);

-- 8. DAY REGISTERS TABLE (Tenant-Scoped Cash Register)
CREATE TABLE IF NOT EXISTS public.day_registers (
    id TEXT PRIMARY KEY DEFAULT 'reg-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
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

-- 9. ORDERS TABLE (Tenant-Scoped)
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
    status TEXT CHECK (status IN ('draft', 'confirmed', 'kot_generated', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled', 'held')) DEFAULT 'confirmed',
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

-- 10. ORDER ITEMS TABLE (Child of Orders)
CREATE TABLE IF NOT EXISTS public.order_items (
    id TEXT PRIMARY KEY DEFAULT 'item-' || uuid_generate_v4(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    tax_rate NUMERIC(5, 2) DEFAULT 5.0,
    tax_amount NUMERIC(10, 2) DEFAULT 0,
    item_notes TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. PAYMENTS TABLE (Child of Orders)
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT 'pay-' || uuid_generate_v4(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'split', 'online', 'wallet')),
    status TEXT CHECK (status IN ('success', 'pending', 'failed', 'refunded')) DEFAULT 'success',
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. KOTS TABLE (Tenant-Scoped Kitchen Order Tickets)
CREATE TABLE IF NOT EXISTS public.kots (
    id TEXT PRIMARY KEY DEFAULT 'kot-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    kot_number TEXT NOT NULL,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number TEXT,
    order_type TEXT CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')) DEFAULT 'dine_in',
    table_number TEXT,
    customer_name TEXT,
    kitchen_notes TEXT,
    status TEXT CHECK (status IN ('pending', 'in_progress', 'ready', 'served')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_kots_restaurant_kot_number UNIQUE (restaurant_id, kot_number)
);

CREATE TABLE IF NOT EXISTS public.kot_items (
    id TEXT PRIMARY KEY DEFAULT 'kitem-' || uuid_generate_v4(),
    kot_id TEXT NOT NULL REFERENCES public.kots(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. COUPONS TABLE (Tenant-Scoped)
CREATE TABLE IF NOT EXISTS public.coupons (
    id TEXT PRIMARY KEY DEFAULT 'cpn-' || uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    description TEXT,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
    discount_value NUMERIC(10, 2) NOT NULL,
    min_order_value NUMERIC(10, 2) DEFAULT 0,
    max_discount NUMERIC(10, 2),
    usage_limit INTEGER,
    used_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    expiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_coupons_restaurant_code UNIQUE (restaurant_id, code)
);

-- 14. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT 'log-' || uuid_generate_v4(),
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
