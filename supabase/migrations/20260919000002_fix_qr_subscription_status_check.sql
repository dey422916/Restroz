-- ============================================================================
-- MIGRATION: 20260919000002_fix_qr_subscription_status_check.sql
-- Description: Standardize get_restaurant_subscription_status RPC to return
-- all canonical fields (is_allowed, is_active, has_subscription, status,
-- days_remaining, etc.) with SECURITY DEFINER for anon QR ordering & staff.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_restaurant_subscription_status(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_rest RECORD;
BEGIN
    -- 1. Validate restaurant exists
    SELECT id, name, status INTO v_rest
    FROM public.restaurants
    WHERE id = p_restaurant_id;

    IF v_rest.id IS NULL THEN
        RETURN jsonb_build_object(
            'has_subscription', FALSE,
            'is_active', FALSE,
            'is_allowed', FALSE,
            'is_expired', TRUE,
            'status', 'none',
            'restaurant_status', 'NOT_FOUND',
            'plan_name', 'No Plan',
            'plan_code', 'NONE',
            'days_remaining', 0,
            'days_left', 0,
            'end_date', NULL,
            'message', 'Restaurant not found.'
        );
    END IF;

    -- 2. Check if restaurant is suspended by platform admins
    IF v_rest.status = 'SUSPENDED' THEN
        RETURN jsonb_build_object(
            'has_subscription', FALSE,
            'is_active', FALSE,
            'is_allowed', FALSE,
            'is_expired', FALSE,
            'status', 'suspended',
            'restaurant_status', 'SUSPENDED',
            'plan_name', 'Suspended',
            'plan_code', 'SUSPENDED',
            'days_remaining', 0,
            'days_left', 0,
            'end_date', NULL,
            'message', format('The restaurant account for "%s" has been suspended by platform administration.', v_rest.name)
        );
    END IF;

    -- 3. Fetch latest active/trial subscription with plan details
    SELECT s.id AS subscription_id, s.status, s.start_date, s.end_date, s.custom_limits,
           p.id AS plan_id, p.name AS plan_name, p.code AS plan_code, 
           p.max_staff, p.max_tables, p.max_products, p.features
    INTO v_sub
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
      AND LOWER(s.status) IN ('active', 'trial', 'trialing')
      AND (s.start_date IS NULL OR s.start_date <= NOW())
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- 4. If no active subscription found
    IF v_sub.subscription_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_subscription', FALSE,
            'is_active', FALSE,
            'is_allowed', FALSE,
            'is_expired', TRUE,
            'status', 'none',
            'restaurant_status', v_rest.status,
            'plan_name', 'No Plan',
            'plan_code', 'NONE',
            'days_remaining', 0,
            'days_left', 0,
            'end_date', NULL,
            'message', format('No active subscription plan found for "%s". Please subscribe to a SaaS plan to take orders.', v_rest.name)
        );
    END IF;

    -- 5. Active subscription verified
    RETURN jsonb_build_object(
        'has_subscription', TRUE,
        'is_active', TRUE,
        'is_allowed', TRUE,
        'is_expired', FALSE,
        'subscription_id', v_sub.subscription_id,
        'plan_id', v_sub.plan_id,
        'status', v_sub.status,
        'restaurant_status', v_rest.status,
        'plan_name', v_sub.plan_name,
        'plan_code', v_sub.plan_code,
        'start_date', v_sub.start_date,
        'end_date', v_sub.end_date,
        'days_remaining', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_sub.end_date, NOW()) - NOW())) / 86400)::INT),
        'days_left', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_sub.end_date, NOW()) - NOW())) / 86400)::INT),
        'max_staff', COALESCE((v_sub.custom_limits->>'max_staff')::INTEGER, v_sub.max_staff, 5),
        'max_tables', COALESCE((v_sub.custom_limits->>'max_tables')::INTEGER, v_sub.max_tables, 10),
        'max_products', COALESCE((v_sub.custom_limits->>'max_products')::INTEGER, v_sub.max_products, 50),
        'features', COALESCE(v_sub.features, '{}'::jsonb),
        'message', 'Active subscription verified'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_subscription_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_restaurant_subscription_status(UUID) TO anon, authenticated, service_role;
