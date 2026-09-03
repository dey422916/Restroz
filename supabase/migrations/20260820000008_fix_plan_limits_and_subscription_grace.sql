-- ============================================================================
-- MIGRATION: 20260820000008_fix_plan_limits_and_subscription_grace.sql
-- Description:
-- 1. Updates all subscription plans to guarantee at least 2 Admins and 3 Staff/Members.
-- 2. Refactors check_restaurant_plan_limit to provide a graceful base fallback
--    (2 Admins, 3 Staff, 20 Tables, 100 Products) instead of hard-throwing 'Subscription inactive or expired'.
-- ============================================================================

-- 1. Update existing plans with updated minimum limits
UPDATE public.subscription_plans
SET max_staff = GREATEST(COALESCE(max_staff, 3), 3),
    updated_at = NOW()
WHERE max_staff < 3 OR max_staff IS NULL;

-- 2. Update Starter Plan to have max_staff = 3
UPDATE public.subscription_plans
SET max_staff = 3,
    updated_at = NOW()
WHERE code = 'STARTER_MONTHLY';

-- 3. Refactor check_restaurant_plan_limit to be non-blocking and support 2 Admins / 3 Staff
CREATE OR REPLACE FUNCTION public.check_restaurant_plan_limit(
    p_restaurant_id UUID,
    p_resource_type TEXT,
    p_requested_count INT DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan RECORD;
    v_current_count INT := 0;
    v_max_allowed INT;
    v_resource_label TEXT;
BEGIN
    -- 1. Fetch active subscription & plan if exists
    SELECT p.id, p.name, p.max_staff, p.max_tables, p.max_products, s.status, s.end_date
    INTO v_plan
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
      AND LOWER(s.status) IN ('active', 'trial')
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- 2. If no active subscription is found, apply graceful base allowance (2 Admins, 3 Staff, 20 Tables, 100 Products)
    IF v_plan.id IS NULL THEN
        IF p_resource_type = 'STAFF' THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id
              AND role = 'STAFF'
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > 3 THEN
                RAISE EXCEPTION 'Staff limit reached: Your current plan allows up to 3 staff members. Please renew or upgrade your subscription.';
            END IF;
        ELSIF p_resource_type = 'ADMIN' THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id
              AND role = 'ADMIN'
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > 2 THEN
                RAISE EXCEPTION 'Admin limit reached: You can have up to 2 Admin accounts per restaurant.';
            END IF;
        ELSIF p_resource_type = 'TABLES' THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.tables
            WHERE restaurant_id = p_restaurant_id
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > 20 THEN
                RAISE EXCEPTION 'Table limit reached: Base allowance is 20 tables. Please upgrade your subscription.';
            END IF;
        ELSIF p_resource_type = 'PRODUCTS' THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.products
            WHERE restaurant_id = p_restaurant_id
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > 100 THEN
                RAISE EXCEPTION 'Product limit reached: Base allowance is 100 products. Please upgrade your subscription.';
            END IF;
        END IF;

        RETURN TRUE;
    END IF;

    -- 3. Check resource specific limit against active plan
    IF p_resource_type = 'STAFF' THEN
        v_max_allowed := GREATEST(COALESCE(v_plan.max_staff, 3), 3);
        v_resource_label := 'staff members';
        
        SELECT COUNT(*) INTO v_current_count
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id
          AND role = 'STAFF'
          AND is_active = TRUE;
        
        IF (v_current_count + p_requested_count) > v_max_allowed THEN
            RAISE EXCEPTION 'Plan limit exceeded: Your % plan allows up to % %, and you currently have %. Please upgrade your subscription to add more.',
                v_plan.name, v_max_allowed, v_resource_label, v_current_count;
        END IF;

    ELSIF p_resource_type = 'ADMIN' THEN
        -- Allow up to 2 admins across all plans
        SELECT COUNT(*) INTO v_current_count
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id
          AND role = 'ADMIN'
          AND is_active = TRUE;
        
        IF (v_current_count + p_requested_count) > 2 THEN
            RAISE EXCEPTION 'Admin limit reached: Your plan allows up to 2 Admin accounts per restaurant.';
        END IF;

    ELSIF p_resource_type = 'TABLES' THEN
        v_max_allowed := v_plan.max_tables;
        v_resource_label := 'dining tables';
        IF v_max_allowed IS NOT NULL THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.tables
            WHERE restaurant_id = p_restaurant_id
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > v_max_allowed THEN
                RAISE EXCEPTION 'Plan limit exceeded: Your % plan allows up to % %, and you currently have %. Adding % tables would exceed the limit. Please upgrade your subscription.',
                    v_plan.name, v_max_allowed, v_resource_label, v_current_count, p_requested_count;
            END IF;
        END IF;

    ELSIF p_resource_type = 'PRODUCTS' THEN
        v_max_allowed := v_plan.max_products;
        v_resource_label := 'menu products';
        IF v_max_allowed IS NOT NULL THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.products
            WHERE restaurant_id = p_restaurant_id
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > v_max_allowed THEN
                RAISE EXCEPTION 'Plan limit exceeded: Your % plan allows up to % %, and you currently have %. Adding % products would exceed the limit. Please upgrade your subscription.',
                    v_plan.name, v_max_allowed, v_resource_label, v_current_count, p_requested_count;
            END IF;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_restaurant_plan_limit(UUID, TEXT, INTEGER) TO anon, authenticated, service_role;
