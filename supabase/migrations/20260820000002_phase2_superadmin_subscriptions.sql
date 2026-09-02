-- ============================================================================
-- RATNADEEP POS SAAS — PHASE 2 MIGRATION
-- SUPER ADMIN PLATFORM CONTROL, ONBOARDING & SUBSCRIPTION MANAGEMENT
-- Migration Version: 20260820000002_phase2_superadmin_subscriptions.sql
-- Strictly Additive — Phase 1 schema & data preserved 100%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SUBSCRIPTION PLANS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly', 'custom')),
    price NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    max_staff INTEGER NOT NULL DEFAULT 5,
    max_tables INTEGER NOT NULL DEFAULT 20,
    max_products INTEGER NOT NULL DEFAULT 100,
    features JSONB NOT NULL DEFAULT '{"qr_ordering": true, "inventory": false, "reports": true, "analytics": true}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. RESTAURANT SUBSCRIPTIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.restaurant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'suspended', 'cancelled')),
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ NOT NULL,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by tenant and active status
CREATE INDEX IF NOT EXISTS idx_rest_sub_rest_id ON public.restaurant_subscriptions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_rest_sub_status ON public.restaurant_subscriptions(status);

-- ----------------------------------------------------------------------------
-- 3. SUBSCRIPTION PAYMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES public.restaurant_subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'INR',
    payment_method TEXT NOT NULL DEFAULT 'upi' CHECK (payment_method IN ('cash', 'bank_transfer', 'upi', 'card', 'online', 'other')),
    payment_reference TEXT,
    payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_pay_rest_id ON public.subscription_payments(restaurant_id);

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) FOR PHASE 2 TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- 4.1 subscription_plans Policies
DROP POLICY IF EXISTS "subscription_plans_select_all" ON public.subscription_plans;
CREATE POLICY "subscription_plans_select_all" ON public.subscription_plans
    FOR SELECT TO authenticated, service_role, anon
    USING (is_active = TRUE OR public.is_super_admin() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "subscription_plans_superadmin_modify" ON public.subscription_plans;
CREATE POLICY "subscription_plans_superadmin_modify" ON public.subscription_plans
    FOR ALL TO authenticated, service_role
    USING (public.is_super_admin() OR auth.role() = 'service_role')
    WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- 4.2 restaurant_subscriptions Policies
DROP POLICY IF EXISTS "restaurant_subscriptions_select" ON public.restaurant_subscriptions;
CREATE POLICY "restaurant_subscriptions_select" ON public.restaurant_subscriptions
    FOR SELECT TO authenticated, service_role
    USING (
        public.is_super_admin() 
        OR auth.role() = 'service_role' 
        OR public.is_restaurant_member(restaurant_id, 'STAFF')
    );

DROP POLICY IF EXISTS "restaurant_subscriptions_superadmin_all" ON public.restaurant_subscriptions;
CREATE POLICY "restaurant_subscriptions_superadmin_all" ON public.restaurant_subscriptions
    FOR ALL TO authenticated, service_role
    USING (public.is_super_admin() OR auth.role() = 'service_role')
    WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- 4.3 subscription_payments Policies
DROP POLICY IF EXISTS "subscription_payments_select" ON public.subscription_payments;
CREATE POLICY "subscription_payments_select" ON public.subscription_payments
    FOR SELECT TO authenticated, service_role
    USING (
        public.is_super_admin() 
        OR auth.role() = 'service_role' 
        OR public.is_restaurant_member(restaurant_id, 'ADMIN')
    );

DROP POLICY IF EXISTS "subscription_payments_superadmin_all" ON public.subscription_payments;
CREATE POLICY "subscription_payments_superadmin_all" ON public.subscription_payments
    FOR ALL TO authenticated, service_role
    USING (public.is_super_admin() OR auth.role() = 'service_role')
    WITH CHECK (public.is_super_admin() OR auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 5. ATOMIC RESTAURANT ONBOARDING RPC (Super Admin only)
-- ----------------------------------------------------------------------------
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
    p_status TEXT DEFAULT 'ACTIVE'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_clean_slug TEXT;
    v_new_rest_id UUID;
    v_rest JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Access denied: Only Super Admin can create new restaurants.';
    END IF;

    v_clean_slug := lower(trim(p_slug));

    -- Validate slug uniqueness
    IF EXISTS (SELECT 1 FROM public.restaurants WHERE slug = v_clean_slug) THEN
        RAISE EXCEPTION 'A restaurant with slug "%" already exists.', v_clean_slug;
    END IF;

    -- 1. Create Restaurant Row
    INSERT INTO public.restaurants (
        name, slug, legal_name, logo_url, phone, email,
        address, city, state, postal_code, country, timezone, status, created_at, updated_at
    ) VALUES (
        trim(p_name), v_clean_slug, p_legal_name, p_logo_url, p_phone, p_email,
        p_address, p_city, p_state, p_postal_code, p_country, p_timezone, p_status, NOW(), NOW()
    ) RETURNING id INTO v_new_rest_id;

    -- 2. Initialize Exactly One restaurant_settings Row (Isolated, clean counter)
    INSERT INTO public.restaurant_settings (
        id, restaurant_id, name, legal_name, address, phone, email,
        gstin, state, logo_url, invoice_prefix, kot_prefix,
        default_tax_rate, currency, currency_symbol, service_charge_rate,
        next_order_seq, created_at, updated_at
    ) VALUES (
        'set-' || v_new_rest_id::TEXT, v_new_rest_id, trim(p_name), COALESCE(p_legal_name, trim(p_name)),
        COALESCE(p_address, ''), COALESCE(p_phone, ''), COALESCE(p_email, ''),
        '', COALESCE(p_state, ''), p_logo_url, 'INV-', 'KOT-',
        5.0, 'INR', '₹', 0.0,
        1, NOW(), NOW()
    );

    -- 3. Audit Log Entry
    INSERT INTO public.audit_logs (
        restaurant_id, user_id, action, details, created_at
    ) VALUES (
        v_new_rest_id, auth.uid(), 'CREATE_RESTAURANT',
        jsonb_build_object('name', p_name, 'slug', v_clean_slug, 'status', p_status), NOW()
    );

    SELECT to_jsonb(r) INTO v_rest FROM public.restaurants r WHERE r.id = v_new_rest_id;
    RETURN v_rest;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. SUBSCRIPTION ASSIGNMENT & RENEWAL RPC (Super Admin only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_restaurant_subscription(
    p_restaurant_id UUID,
    p_plan_id UUID,
    p_status TEXT DEFAULT 'active',
    p_duration_days INTEGER DEFAULT 30,
    p_amount NUMERIC DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'upi',
    p_payment_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_plan RECORD;
    v_sub_id UUID;
    v_sub_amount NUMERIC;
    v_end_date TIMESTAMPTZ;
    v_res JSONB;
BEGIN
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Access denied: Only Super Admin can assign subscriptions.';
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Subscription plan not found.';
    END IF;

    v_sub_amount := COALESCE(p_amount, v_plan.price);
    v_end_date := NOW() + (p_duration_days || ' days')::INTERVAL;

    -- Deactivate any existing active subscriptions for this restaurant
    UPDATE public.restaurant_subscriptions
    SET status = 'cancelled', updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id AND status IN ('active', 'trial');

    -- Insert new subscription
    INSERT INTO public.restaurant_subscriptions (
        restaurant_id, plan_id, status, start_date, end_date,
        amount, currency, notes, created_at, updated_at
    ) VALUES (
        p_restaurant_id, p_plan_id, p_status, NOW(), v_end_date,
        v_sub_amount, v_plan.currency, p_notes, NOW(), NOW()
    ) RETURNING id INTO v_sub_id;

    -- Record payment if amount > 0 and status is active
    IF v_sub_amount > 0 AND p_status = 'active' THEN
        INSERT INTO public.subscription_payments (
            restaurant_id, subscription_id, amount, currency,
            payment_method, payment_reference, payment_status,
            paid_at, recorded_by, notes, created_at
        ) VALUES (
            p_restaurant_id, v_sub_id, v_sub_amount, v_plan.currency,
            p_payment_method, p_payment_reference, 'paid',
            NOW(), auth.uid(), p_notes, NOW()
        );
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        restaurant_id, user_id, action, details, created_at
    ) VALUES (
        p_restaurant_id, auth.uid(), 'ASSIGN_SUBSCRIPTION',
        jsonb_build_object('plan_id', p_plan_id, 'plan_name', v_plan.name, 'status', p_status, 'amount', v_sub_amount, 'end_date', v_end_date), NOW()
    );

    SELECT to_jsonb(s) INTO v_res FROM public.restaurant_subscriptions s WHERE s.id = v_sub_id;
    RETURN v_res;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. SEED DATA FOR PHASE 2
-- ----------------------------------------------------------------------------

-- 7.1 Seed Subscription Plans
INSERT INTO public.subscription_plans (name, code, description, billing_cycle, price, currency, max_staff, max_tables, max_products, features, is_active)
VALUES
    ('Starter Plan', 'STARTER_MONTHLY', 'Ideal for small cafes and quick takeaway outlets', 'monthly', 999, 'INR', 5, 10, 50, '{"qr_ordering": true, "inventory": false, "reports": true, "analytics": false}'::jsonb, true),
    ('Standard Plan', 'STANDARD_MONTHLY', 'Complete POS solution for full-service restaurants', 'monthly', 1999, 'INR', 15, 30, 200, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true}'::jsonb, true),
    ('Premium Plan', 'PREMIUM_MONTHLY', 'Advanced multi-terminal, live analytics, and priority features', 'monthly', 3499, 'INR', 50, 100, 1000, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true}'::jsonb, true),
    ('Enterprise Plan', 'ENTERPRISE_YEARLY', 'Dedicated support, unlimited scale, and custom integrations', 'yearly', 19999, 'INR', 999, 999, 9999, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true, "custom_branding": true, "api_access": true}'::jsonb, true)
ON CONFLICT (code) DO UPDATE SET
    price = EXCLUDED.price,
    features = EXCLUDED.features,
    updated_at = NOW();

-- 7.2 Seed Active 1-Year Enterprise Subscription for Ratnadeep Tenant
DO $$
DECLARE
    v_ratnadeep_id UUID := 'a0000000-0000-0000-0000-000000000001';
    v_ent_plan_id UUID;
    v_sub_id UUID;
BEGIN
    SELECT id INTO v_ent_plan_id FROM public.subscription_plans WHERE code = 'ENTERPRISE_YEARLY' LIMIT 1;

    IF v_ent_plan_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurants WHERE id = v_ratnadeep_id) THEN
        -- Insert active 1-year subscription if none exists
        IF NOT EXISTS (SELECT 1 FROM public.restaurant_subscriptions WHERE restaurant_id = v_ratnadeep_id AND status = 'active') THEN
            INSERT INTO public.restaurant_subscriptions (
                restaurant_id, plan_id, status, start_date, end_date, amount, currency, notes, created_at, updated_at
            ) VALUES (
                v_ratnadeep_id, v_ent_plan_id, 'active', NOW(), NOW() + INTERVAL '1 year', 19999, 'INR', 'Active 1-Year Enterprise Subscription for Ratnadeep Restaurant', NOW(), NOW()
            ) RETURNING id INTO v_sub_id;

            -- Record seed payment
            INSERT INTO public.subscription_payments (
                restaurant_id, subscription_id, amount, currency, payment_method, payment_reference, payment_status, paid_at, notes, created_at
            ) VALUES (
                v_ratnadeep_id, v_sub_id, 19999, 'INR', 'bank_transfer', 'SEED-RATNADEEP-ENT-2026', 'paid', NOW(), 'Initial 1-Year Enterprise Subscription Payment', NOW()
            );
        END IF;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. GRANT EXECUTE ON PHASE 2 RPCS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_new_restaurant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_restaurant_subscription(UUID, UUID, TEXT, INTEGER, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;
