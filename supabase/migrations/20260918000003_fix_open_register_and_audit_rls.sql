-- ============================================================================
-- MIGRATION: 20260918000003_fix_open_register_and_audit_rls.sql
-- DESCRIPTION:
--   1. Ensures register_date has DEFAULT CURRENT_DATE on public.day_registers.
--   2. Ensures column parity (opening_cash, opening_cash_float, etc.) with safe defaults.
--   3. Safely auto-closes duplicate legacy open registers (if any) and creates partial
--      unique index idx_single_open_day_register_per_restaurant.
--   4. Creates atomic RPC public.open_day_register(...) for one-transaction execution
--      (validation, open register insertion, and audit logging with server-derived identity).
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

-- 2. SAFE PRE-INDEX REMEDIATION & PREVENT DUPLICATE OPEN REGISTERS
-- If any restaurant has multiple 'open' registers from past crashes, auto-close older ones cleanly.
DO $$
DECLARE
    r_dup RECORD;
BEGIN
    FOR r_dup IN
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY opened_at DESC, created_at DESC) AS rn
            FROM public.day_registers
            WHERE status = 'open'
        ) sub
        WHERE sub.rn > 1
    LOOP
        UPDATE public.day_registers
        SET status = 'closed',
            closed_at = COALESCE(closed_at, NOW()),
            notes = CASE
                WHEN notes IS NULL OR notes = '' THEN 'Auto-closed legacy duplicate open register during index creation'
                ELSE notes || ' | Auto-closed legacy duplicate open register'
            END,
            updated_at = NOW()
        WHERE id = r_dup.id;
    END LOOP;
END $$;

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
-- Strictly validates auth.uid(), role, subscription, locks for existing open shifts,
-- assigns server-verified opened_by identity, and logs the audit event in one transaction.
DROP FUNCTION IF EXISTS public.open_day_register(UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.open_day_register(UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.open_day_register(
    p_restaurant_id UUID,
    p_opening_cash NUMERIC DEFAULT 0.0,
    p_notes TEXT DEFAULT NULL
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
    v_tz TEXT;
    v_local_date DATE;
    v_existing_id TEXT;
    v_new_register public.day_registers;
    v_clean_cash NUMERIC(10, 2);
    v_open_by_final TEXT;
BEGIN
    -- 1. Strict Authentication Check (Derived securely from JWT)
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
        FROM public.restaurant_subscriptions s
        JOIN public.subscription_plans p ON s.plan_id = p.id
        WHERE s.restaurant_id = p_restaurant_id
          AND LOWER(s.status) IN ('active', 'trial')
          AND s.start_date <= NOW()
          AND (s.end_date IS NULL OR s.end_date >= NOW())
    ) INTO v_has_subscription;

    IF NOT v_has_subscription AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'You don''t have any active subscription';
    END IF;

    -- 4. Determine Restaurant Local Timezone & Date
    SELECT COALESCE(NULLIF(TRIM(timezone), ''), 'Asia/Kolkata') INTO v_tz
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    v_local_date := (NOW() AT TIME ZONE COALESCE(v_tz, 'Asia/Kolkata'))::DATE;

    -- 5. Check for Existing Open Register with Row Lock (FOR UPDATE)
    SELECT id INTO v_existing_id
    FROM public.day_registers
    WHERE restaurant_id = p_restaurant_id
      AND status = 'open'
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'A register is already OPEN for this restaurant. Please close the active shift before opening a new register.';
    END IF;

    -- 6. Prepare Payload & Resolve Server-Side User Identity
    v_clean_cash := GREATEST(0.0, COALESCE(p_opening_cash, 0.0));

    IF v_user_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(email), ''), 'Staff')
        INTO v_user_name
        FROM public.profiles
        WHERE id = v_user_id;
        v_open_by_final := COALESCE(v_user_name, 'Staff');
    ELSE
        v_open_by_final := 'Admin';
    END IF;

    -- 7. Insert New Day Register
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
        v_local_date,
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

    -- 8. Insert Audit Log
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
            RAISE WARNING 'Audit log insertion in open_day_register warning: %', SQLERRM;
    END;

    RETURN v_new_register;
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION public.open_day_register(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_day_register(UUID, NUMERIC, TEXT) TO authenticated, service_role;
