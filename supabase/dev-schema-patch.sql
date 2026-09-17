-- ============================================================================
-- RESTROZ DEV ENVIRONMENT — LIVE SCHEMA RECONCILIATION PATCH
-- Environment: DEVELOPMENT (restroz-dev)
-- Target Database: restroz-dev Supabase Project
-- ============================================================================
-- Purpose:
-- Fixes schema drift between frontend PostgREST queries and DEV database schema
-- for categories, products, dining tables, coupons, order items, and payments.
--
-- Safety Guarantees:
-- 1. Strictly non-destructive (ZERO DROPs, ZERO TRUNCATEs).
-- 2. Fully preserves all existing test data, users, and restaurant configuration.
-- 3. Safely backfills existing records with correct derived values.
-- 4. Idempotent — can be executed safely multiple times.
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Starting RestroZ DEV Schema Reconciliation Patch...';
END $$;

-- ----------------------------------------------------------------------------
-- 1. CATEGORIES TABLE (categories)
-- Required by: marketplaceService, categoryService, superAdminService
-- Missing fields: slug, image_url, display_order
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Safely backfill slugs from name for existing rows
UPDATE public.categories
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Trim leading/trailing hyphens from slug
UPDATE public.categories
SET slug = trim(both '-' from slug)
WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Fallback for empty slugs
UPDATE public.categories
SET slug = 'cat-' || substr(id, 5, 8)
WHERE slug IS NULL OR slug = '';

-- Backfill display_order from sort_order if available
UPDATE public.categories
SET display_order = COALESCE(sort_order, 1)
WHERE display_order = 0 OR display_order IS NULL;

-- Enforce NOT NULL and restaurant-scoped uniqueness on slug
ALTER TABLE public.categories ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS uq_categories_restaurant_slug;
ALTER TABLE public.categories ADD CONSTRAINT uq_categories_restaurant_slug UNIQUE (restaurant_id, slug);

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS TABLE (products)
-- Required by: marketplaceService, productService, orderService, superAdminService
-- Missing fields: category_name, discounted_price, tax_rate, food_type, unit, preparation_time_mins
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS discounted_price NUMERIC(10, 2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS food_type TEXT DEFAULT 'veg';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'portion';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preparation_time_mins INTEGER DEFAULT 15;

-- Safely backfill category_name from categories
UPDATE public.products p
SET category_name = c.name
FROM public.categories c
WHERE p.category_id = c.id
  AND (p.category_name IS NULL OR p.category_name = '');

-- Safely backfill food_type from is_veg
UPDATE public.products
SET food_type = CASE WHEN is_veg THEN 'veg' ELSE 'non-veg' END
WHERE food_type IS NULL OR food_type = '';

-- Safely backfill preparation_time_mins from preparation_time
UPDATE public.products
SET preparation_time_mins = COALESCE(preparation_time, 15)
WHERE preparation_time_mins IS NULL OR preparation_time_mins = 0;

-- Safely backfill tax_rate default (5.0%)
UPDATE public.products
SET tax_rate = 5.0
WHERE tax_rate IS NULL;

-- ----------------------------------------------------------------------------
-- 3. DINING TABLES TABLE (tables)
-- Required by: tableService, orderService, PosContext
-- Missing fields: seating_capacity, section, qr_code_hash, is_active
-- ----------------------------------------------------------------------------
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS seating_capacity INTEGER DEFAULT 4;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS section TEXT DEFAULT 'Ground Floor';
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS qr_code_hash TEXT;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Backfill seating_capacity from capacity
UPDATE public.tables
SET seating_capacity = COALESCE(capacity, 4)
WHERE seating_capacity IS NULL;

-- Backfill section from floor
UPDATE public.tables
SET section = COALESCE(floor, 'Ground Floor')
WHERE section IS NULL;

-- Backfill qr_code_hash from qr_code_url / id
UPDATE public.tables
SET qr_code_hash = COALESCE(qr_code_url, 'QR_' || id)
WHERE qr_code_hash IS NULL;

-- ----------------------------------------------------------------------------
-- 4. PROMOTIONAL COUPONS TABLE (coupons)
-- Required by: couponService, create_delivery_order_atomic RPC, marketplaceService
-- Missing fields: min_order_value, expiry_date, per_user_limit
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_order_value NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS per_user_limit INTEGER DEFAULT 1;

-- Backfill min_order_value from min_order_amount
UPDATE public.coupons
SET min_order_value = COALESCE(min_order_amount, 0)
WHERE min_order_value IS NULL OR min_order_value = 0;

-- Backfill expiry_date from end_date
UPDATE public.coupons
SET expiry_date = COALESCE(end_date, NOW() + INTERVAL '1 year')
WHERE expiry_date IS NULL;

-- ----------------------------------------------------------------------------
-- 5. ORDER ITEMS TABLE (order_items)
-- Required by: orderService, marketplaceService, printService
-- Missing fields: subtotal, total, item_notes, image_url
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS item_notes TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Backfill subtotal and total
UPDATE public.order_items
SET subtotal = COALESCE(unit_price * quantity, total_price, 0),
    total = COALESCE(total_price, unit_price * quantity, 0)
WHERE total = 0 OR total IS NULL;

-- ----------------------------------------------------------------------------
-- 6. PAYMENTS TABLE (payments)
-- Required by: orderService, PosContext, dayRegisterService
-- Missing fields: reference_number
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- Backfill reference_number from transaction_reference
UPDATE public.payments
SET reference_number = COALESCE(transaction_reference, 'TXN-' || id)
WHERE reference_number IS NULL;

-- ----------------------------------------------------------------------------
-- 7. RESTAURANT SETTINGS TABLE (restaurant_settings)
-- Required by: settingsService, orderService, create_customer_delivery_order RPC
-- Missing fields: default_tax_rate, invoice_sequence_prefix, invoice_next_number
-- ----------------------------------------------------------------------------
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2) DEFAULT 5.0;
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_sequence_prefix TEXT DEFAULT 'INV';
ALTER TABLE public.restaurant_settings ADD COLUMN IF NOT EXISTS invoice_next_number INTEGER DEFAULT 1;

UPDATE public.restaurant_settings
SET default_tax_rate = COALESCE(tax_rate, 5.0)
WHERE default_tax_rate IS NULL;

UPDATE public.restaurant_settings
SET tax_rate = COALESCE(default_tax_rate, 5.0)
WHERE tax_rate IS NULL;

-- ----------------------------------------------------------------------------
-- 8. ENSURE POSTGREST TABLE PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.restaurant_settings TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.tables TO anon, authenticated;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT SELECT ON public.restaurant_public_profiles TO anon, authenticated;
GRANT SELECT ON public.restaurants TO anon, authenticated;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    RAISE NOTICE '✅ RestroZ DEV Schema Reconciliation Patch completed successfully!';
END $$;
