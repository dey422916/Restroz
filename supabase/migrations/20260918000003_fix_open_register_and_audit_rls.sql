-- ============================================================================
-- MIGRATION: 20260918000003_fix_open_register_and_audit_rls.sql
-- DESCRIPTION:
--   1. Ensures register_date has DEFAULT CURRENT_DATE on public.day_registers.
--   2. Ensures column parity (opening_cash, opening_cash_float, etc.) with safe defaults.
--   3. Adds partial unique index idx_single_open_day_register_per_restaurant
--      to strictly prevent multiple active 'open' registers per restaurant at DB level.
--   4. Creates atomic RPC public.open_day_register(...) for one-transaction execution
--      (validation, open register insertion, and audit logging).
--   5. Hardens RLS policies for day_registers and audit_logs.
-- ============================================================================

-- 1. DAY REGISTERS COLUMN DEFAULTS & PARITY
ALTER TABLE public.day_registers
    ALTER COLUMN register_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.day_registers
    ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS opening_cash_float NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS cash_sales NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS upi_sales NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS card_sales NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS other_sales NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS total_sales NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_discount NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS total_tax NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS actual_cash NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS actual_cash_counted NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS difference NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS cash_difference NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(10, 2) DEFAULT 0.0;

-- Ensure opened_by has a safe fallback default if not provided
ALTER TABLE public.day_registers
    ALTER COLUMN opened_by SET DEFAULT 'Admin';

-- 2. PREVENT DUPLICATE OPEN REGISTERS AT DATABASE LEVEL
-- Note: status in day_registers uses lowercase 'open' / 'closed'
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_open_day_register_per_restaurant
    ON public.day_registers (restaurant_id)
    WHERE status = 'open';

-- 3. AUDIT LOGS COLUMN PARITY
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS new_values JSONB,
    ADD COLUMN IF NOT EXISTS old_values JSONB,
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 4. HARDEN RLS POLICIES FOR DAY REGISTERS
ALTER TABLE public.day_registers ENABLE ROW LEVEL SECURITY;

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

-- 5. HARDEN RLS POLICIES FOR AUDIT LOGS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

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

-- 6. ATOMIC OPEN DAY REGISTER RPC
-- Performs authentication validation, role validation, subscription check,
-- duplicate check, day_register creation, and audit logging in a single transaction.
CREATE OR REPLACE FUNCTION public.open_day_register(
    p_restaurant_id UUID,
    p_opening_cash NUMERIC DEFAULT 0.0,
    p_notes TEXT DEFAULT NULL,
    p_opened_by TEXT DEFAULT NULL
)
RETURNS public.day_registers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
    v_is_authorized BOOLEAN;
    v_has_subscription BOOLEAN;
    v_existing_id TEXT;
    v_new_register public.day_registers;
    v_clean_cash NUMERIC(10, 2);
    v_open_by_final TEXT;
BEGIN
    -- 1. Strict Authentication Check
    v_user_id := auth.uid();
    IF v_user_id IS NULL AND (auth.jwt() ->> 'role' <> 'service_role' AND auth.role() <> 'service_role') THEN
        RAISE EXCEPTION 'Authentication required. Your session has expired. Please login again.';
    END IF;

    -- 2. Authorization Check (Must be SUPER_ADMIN or STAFF/ADMIN of the target restaurant)
    v_is_authorized := (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role')
                       OR public.is_super_admin()
                       OR public.is_restaurant_member(p_restaurant_id, 'STAFF');

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied. You do not have permission to open registers for this restaurant.';
    END IF;

    -- 3. Active Subscription Check
    SELECT EXISTS (
        SELECT 1
        FROM public.restaurant_subscriptions rs
        JOIN public.subscription_plans sp ON sp.id = rs.plan_id
        WHERE rs.restaurant_id = p_restaurant_id
          AND rs.status IN ('ACTIVE', 'TRIAL')
          AND (rs.expires_at IS NULL OR rs.expires_at > NOW())
    ) INTO v_has_subscription;

    IF NOT v_has_subscription AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'You don''t have any active subscription';
    END IF;

    -- 4. Check for Existing Open Register (Row Lock via FOR UPDATE)
    SELECT id INTO v_existing_id
    FROM public.day_registers
    WHERE restaurant_id = p_restaurant_id
      AND status = 'open'
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'A register is already OPEN for this restaurant. Please close the active shift before opening a new register.';
    END IF;

    -- 5. Prepare Payload
    v_clean_cash := GREATEST(0.0, COALESCE(p_opening_cash, 0.0));

    -- Determine user display name for opened_by
    IF p_opened_by IS NOT NULL AND TRIM(p_opened_by) <> '' THEN
        v_open_by_final := TRIM(p_opened_by);
    ELSIF v_user_id IS NOT NULL THEN
        SELECT COALESCE(full_name, email, 'Staff') INTO v_user_name
        FROM public.profiles
        WHERE id = v_user_id;
        v_open_by_final := COALESCE(v_user_name, 'Staff');
    ELSE
        v_open_by_final := 'Admin';
    END IF;

    -- 6. Insert New Day Register
    INSERT INTO public.day_registers (
        id,
        restaurant_id,
        register_date,
        status,
        opening_cash,
        opening_cash_float,
        cash_sales,
        upi_sales,
        card_sales,
        other_sales,
        total_sales,
        total_orders,
        total_discount,
        total_tax,
        expected_cash,
        actual_cash,
        difference,
        notes,
        opened_at,
        opened_by,
        created_at,
        updated_at
    ) VALUES (
        'reg-' || uuid_generate_v4()::TEXT,
        p_restaurant_id,
        CURRENT_DATE,
        'open',
        v_clean_cash,
        v_clean_cash,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0,
        0.0,
        0.0,
        v_clean_cash,
        0.0,
        0.0,
        NULLIF(TRIM(p_notes), ''),
        NOW(),
        v_open_by_final,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_register;

    -- 7. Insert Audit Log
    BEGIN
        INSERT INTO public.audit_logs (
            restaurant_id,
            user_id,
            action,
            entity_type,
            entity_id,
            new_values,
            created_at
        ) VALUES (
            p_restaurant_id,
            v_user_id,
            'REGISTER_OPENED',
            'day_register',
            v_new_register.id,
            jsonb_build_object(
                'restaurant_id', p_restaurant_id,
                'register_date', v_new_register.register_date,
                'opening_cash_float', v_clean_cash,
                'opened_by', v_open_by_final
            ),
            NOW()
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Non-fatal to audit logging failure inside transaction
            RAISE WARNING 'Audit log insertion in open_day_register warning: %', SQLERRM;
    END;

    RETURN v_new_register;
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION public.open_day_register(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_day_register(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
