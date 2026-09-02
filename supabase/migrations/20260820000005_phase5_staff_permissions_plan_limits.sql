-- ============================================================================
-- RATNADEEP POS SAAS — PHASE 5 MIGRATION
-- RESTAURANT STAFF MANAGEMENT, ROLE PERMISSIONS, PLAN LIMITS & UPGRADE ENFORCEMENT
-- Migration Version: 20260820000005_phase5_staff_permissions_plan_limits.sql
-- Strictly Additive — Phase 1, Phase 2, Phase 3, and Phase 4 schema & data preserved 100%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RESTAURANT MEMBER PERMISSIONS TABLE
-- Granular permissions per restaurant membership
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_member_perms_member ON public.restaurant_member_permissions (restaurant_member_id);

-- Enable RLS
ALTER TABLE public.restaurant_member_permissions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. RLS POLICIES FOR RESTAURANT MEMBER PERMISSIONS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Super Admin can manage all member permissions" ON public.restaurant_member_permissions;
CREATE POLICY "Super Admin can manage all member permissions"
    ON public.restaurant_member_permissions
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Restaurant Admin can manage member permissions in own restaurant" ON public.restaurant_member_permissions;
CREATE POLICY "Restaurant Admin can manage member permissions in own restaurant"
    ON public.restaurant_member_permissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.restaurant_members rm
            WHERE rm.id = restaurant_member_permissions.restaurant_member_id
            AND public.is_restaurant_member(rm.restaurant_id, 'ADMIN')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.restaurant_members rm
            WHERE rm.id = restaurant_member_permissions.restaurant_member_id
            AND public.is_restaurant_member(rm.restaurant_id, 'ADMIN')
        )
    );

DROP POLICY IF EXISTS "Staff can view own permissions" ON public.restaurant_member_permissions;
CREATE POLICY "Staff can view own permissions"
    ON public.restaurant_member_permissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.restaurant_members rm
            WHERE rm.id = restaurant_member_permissions.restaurant_member_id
            AND rm.user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- 3. PLAN LIMIT HELPER FUNCTION
-- Checks active subscription limits (max_staff, max_tables, max_products)
-- NULL = unlimited
-- ----------------------------------------------------------------------------
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
    -- 1. Fetch active subscription & plan
    SELECT p.id, p.name, p.max_staff, p.max_tables, p.max_products, s.status, s.end_date
    INTO v_plan
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
      AND LOWER(s.status) IN ('active', 'trial')
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    LIMIT 1;

    -- If no active subscription is found, allow default or raise exception
    IF v_plan.id IS NULL THEN
        -- Fallback: check if subscription exists at all
        IF NOT EXISTS (SELECT 1 FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id) THEN
            -- Free/trial fallback
            RETURN TRUE;
        ELSE
            RAISE EXCEPTION 'Subscription inactive or expired. Please renew your subscription to perform this action.';
        END IF;
    END IF;

    -- 2. Check resource specific limit
    IF p_resource_type = 'STAFF' THEN
        v_max_allowed := v_plan.max_staff;
        v_resource_label := 'staff members';
        IF v_max_allowed IS NOT NULL THEN
            SELECT COUNT(*) INTO v_current_count
            FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id
              AND is_active = TRUE;
            
            IF (v_current_count + p_requested_count) > v_max_allowed THEN
                RAISE EXCEPTION 'Plan limit exceeded: Your % plan allows up to % %, and you currently have %. Please upgrade your subscription to add more.',
                    v_plan.name, v_max_allowed, v_resource_label, v_current_count;
            END IF;
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

-- ----------------------------------------------------------------------------
-- 4. RESTAURANT RESOURCE USAGE QUERY FUNCTION
-- Returns live counts, plan maximums, usage percentages, and features
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_restaurant_resource_usage(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan RECORD;
    v_staff_current INT := 0;
    v_tables_current INT := 0;
    v_products_current INT := 0;
    v_result JSONB;
BEGIN
    -- 1. Get current active subscription & plan
    SELECT 
        p.id AS plan_id, 
        p.name AS plan_name, 
        p.code AS plan_code,
        p.max_staff, 
        p.max_tables, 
        p.max_products, 
        p.features, 
        s.status AS sub_status, 
        s.start_date,
        s.end_date,
        p.price,
        p.billing_cycle
    INTO v_plan
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- 2. Count live resources
    SELECT COUNT(*) INTO v_staff_current
    FROM public.restaurant_members
    WHERE restaurant_id = p_restaurant_id AND is_active = TRUE;

    SELECT COUNT(*) INTO v_tables_current
    FROM public.tables
    WHERE restaurant_id = p_restaurant_id AND is_active = TRUE;

    SELECT COUNT(*) INTO v_products_current
    FROM public.products
    WHERE restaurant_id = p_restaurant_id AND is_active = TRUE;

    -- 3. Construct JSON
    v_result := jsonb_build_object(
        'restaurant_id', p_restaurant_id,
        'plan', jsonb_build_object(
            'id', COALESCE(v_plan.plan_id::text, 'none'),
            'name', COALESCE(v_plan.plan_name, 'No Active Plan'),
            'code', COALESCE(v_plan.plan_code, 'none'),
            'status', UPPER(COALESCE(v_plan.sub_status, 'INACTIVE')),
            'start_date', v_plan.start_date,
            'end_date', v_plan.end_date,
            'price', COALESCE(v_plan.price, 0),
            'billing_cycle', COALESCE(v_plan.billing_cycle, 'monthly')
        ),
        'staff', jsonb_build_object(
            'current', v_staff_current,
            'max', v_plan.max_staff,
            'is_unlimited', (v_plan.max_staff IS NULL),
            'percentage', CASE 
                WHEN v_plan.max_staff IS NULL OR v_plan.max_staff = 0 THEN 0 
                ELSE ROUND((v_staff_current::numeric / v_plan.max_staff::numeric) * 100, 1) 
            END
        ),
        'tables', jsonb_build_object(
            'current', v_tables_current,
            'max', v_plan.max_tables,
            'is_unlimited', (v_plan.max_tables IS NULL),
            'percentage', CASE 
                WHEN v_plan.max_tables IS NULL OR v_plan.max_tables = 0 THEN 0 
                ELSE ROUND((v_tables_current::numeric / v_plan.max_tables::numeric) * 100, 1) 
            END
        ),
        'products', jsonb_build_object(
            'current', v_products_current,
            'max', v_plan.max_products,
            'is_unlimited', (v_plan.max_products IS NULL),
            'percentage', CASE 
                WHEN v_plan.max_products IS NULL OR v_plan.max_products = 0 THEN 0 
                ELSE ROUND((v_products_current::numeric / v_plan.max_products::numeric) * 100, 1) 
            END
        ),
        'features', COALESCE(v_plan.features, '{}'::jsonb)
    );

    RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FEATURE ACCESS CHECK FUNCTION
-- Centralized function checking if a restaurant plan has a specific feature key
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_restaurant_feature_access(
    p_restaurant_id UUID,
    p_feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_feature BOOLEAN := FALSE;
    v_features JSONB;
BEGIN
    SELECT p.features INTO v_features
    FROM public.restaurant_subscriptions s
    JOIN public.subscription_plans p ON s.plan_id = p.id
    WHERE s.restaurant_id = p_restaurant_id
      AND LOWER(s.status) IN ('active', 'trial')
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date >= NOW())
    LIMIT 1;

    IF v_features IS NOT NULL AND v_features ? p_feature_key THEN
        v_has_feature := (v_features ->> p_feature_key)::BOOLEAN;
    ELSE
        -- Default to true if feature not specified or unlimited
        v_has_feature := FALSE;
    END IF;

    RETURN v_has_feature;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: UPDATE STAFF PERMISSIONS
-- Allows Restaurant Admin or Super Admin to configure member permissions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
    p_restaurant_member_id UUID,
    p_permissions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_member RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Load member
    SELECT * INTO v_member
    FROM public.restaurant_members
    WHERE id = p_restaurant_member_id;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION 'Restaurant member not found.';
    END IF;

    -- Check authorization: must be Super Admin or Admin of the target restaurant
    IF public.is_super_admin() OR public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: Only Restaurant Admins or Super Admins can update staff permissions.';
    END IF;

    -- Upsert permissions
    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id,
        can_use_pos,
        can_view_orders,
        can_edit_orders,
        can_cancel_orders,
        can_manage_products,
        can_manage_categories,
        can_manage_tables,
        can_manage_coupons,
        can_view_reports,
        can_manage_register,
        can_view_settings,
        can_manage_settings,
        can_manage_staff,
        updated_at
    )
    VALUES (
        p_restaurant_member_id,
        COALESCE((p_permissions ->> 'can_use_pos')::BOOLEAN, TRUE),
        COALESCE((p_permissions ->> 'can_view_orders')::BOOLEAN, TRUE),
        COALESCE((p_permissions ->> 'can_edit_orders')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_cancel_orders')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_products')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_categories')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_tables')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_coupons')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_view_reports')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_register')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_view_settings')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_settings')::BOOLEAN, FALSE),
        COALESCE((p_permissions ->> 'can_manage_staff')::BOOLEAN, FALSE),
        NOW()
    )
    ON CONFLICT (restaurant_member_id) DO UPDATE
    SET
        can_use_pos = COALESCE((p_permissions ->> 'can_use_pos')::BOOLEAN, restaurant_member_permissions.can_use_pos),
        can_view_orders = COALESCE((p_permissions ->> 'can_view_orders')::BOOLEAN, restaurant_member_permissions.can_view_orders),
        can_edit_orders = COALESCE((p_permissions ->> 'can_edit_orders')::BOOLEAN, restaurant_member_permissions.can_edit_orders),
        can_cancel_orders = COALESCE((p_permissions ->> 'can_cancel_orders')::BOOLEAN, restaurant_member_permissions.can_cancel_orders),
        can_manage_products = COALESCE((p_permissions ->> 'can_manage_products')::BOOLEAN, restaurant_member_permissions.can_manage_products),
        can_manage_categories = COALESCE((p_permissions ->> 'can_manage_categories')::BOOLEAN, restaurant_member_permissions.can_manage_categories),
        can_manage_tables = COALESCE((p_permissions ->> 'can_manage_tables')::BOOLEAN, restaurant_member_permissions.can_manage_tables),
        can_manage_coupons = COALESCE((p_permissions ->> 'can_manage_coupons')::BOOLEAN, restaurant_member_permissions.can_manage_coupons),
        can_view_reports = COALESCE((p_permissions ->> 'can_view_reports')::BOOLEAN, restaurant_member_permissions.can_view_reports),
        can_manage_register = COALESCE((p_permissions ->> 'can_manage_register')::BOOLEAN, restaurant_member_permissions.can_manage_register),
        can_view_settings = COALESCE((p_permissions ->> 'can_view_settings')::BOOLEAN, restaurant_member_permissions.can_view_settings),
        can_manage_settings = COALESCE((p_permissions ->> 'can_manage_settings')::BOOLEAN, restaurant_member_permissions.can_manage_settings),
        can_manage_staff = COALESCE((p_permissions ->> 'can_manage_staff')::BOOLEAN, restaurant_member_permissions.can_manage_staff),
        updated_at = NOW();

    -- Audit log
    INSERT INTO public.audit_logs (
        restaurant_id,
        action,
        user_id,
        details
    )
    VALUES (
        v_member.restaurant_id,
        'UPDATE_STAFF_PERMISSIONS',
        v_user_id,
        jsonb_build_object(
            'target_member_id', p_restaurant_member_id,
            'target_user_id', v_member.user_id,
            'permissions', p_permissions
        )
    );

    RETURN jsonb_build_object('success', TRUE, 'member_id', p_restaurant_member_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: SET STAFF MEMBERSHIP STATUS (ACTIVATE / DEACTIVATE / REMOVE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_membership_status(
    p_restaurant_member_id UUID,
    p_action TEXT -- 'ACTIVATE', 'DEACTIVATE', 'REMOVE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_member RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Load member
    SELECT * INTO v_member
    FROM public.restaurant_members
    WHERE id = p_restaurant_member_id;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION 'Restaurant member not found.';
    END IF;

    -- Check authorization
    IF public.is_super_admin() OR public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: Only Restaurant Admins or Super Admins can modify staff membership.';
    END IF;

    IF p_action = 'ACTIVATE' THEN
        -- Check plan limit before activating
        PERFORM public.check_restaurant_plan_limit(v_member.restaurant_id, 'STAFF', 1);

        UPDATE public.restaurant_members
        SET is_active = TRUE, updated_at = NOW()
        WHERE id = p_restaurant_member_id;

        INSERT INTO public.audit_logs (restaurant_id, action, user_id, details)
        VALUES (v_member.restaurant_id, 'REACTIVATE_STAFF', v_user_id, jsonb_build_object('target_member_id', p_restaurant_member_id, 'target_user_id', v_member.user_id));

    ELSIF p_action = 'DEACTIVATE' THEN
        UPDATE public.restaurant_members
        SET is_active = FALSE, updated_at = NOW()
        WHERE id = p_restaurant_member_id;

        INSERT INTO public.audit_logs (restaurant_id, action, user_id, details)
        VALUES (v_member.restaurant_id, 'DEACTIVATE_STAFF', v_user_id, jsonb_build_object('target_member_id', p_restaurant_member_id, 'target_user_id', v_member.user_id));

    ELSIF p_action = 'REMOVE' THEN
        -- Delete restaurant membership only (never delete global auth user)
        DELETE FROM public.restaurant_members
        WHERE id = p_restaurant_member_id;

        INSERT INTO public.audit_logs (restaurant_id, action, user_id, details)
        VALUES (v_member.restaurant_id, 'REMOVE_STAFF_MEMBERSHIP', v_user_id, jsonb_build_object('target_member_id', p_restaurant_member_id, 'target_user_id', v_member.user_id));
    ELSE
        RAISE EXCEPTION 'Invalid action: % (must be ACTIVATE, DEACTIVATE, or REMOVE).', p_action;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'action', p_action, 'member_id', p_restaurant_member_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. TRIGGER: AUTO-CREATE DEFAULT PERMISSIONS ON NEW STAFF INSERT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_restaurant_member_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.role = 'ADMIN' THEN
        -- Admins get all permissions true
        INSERT INTO public.restaurant_member_permissions (
            restaurant_member_id,
            can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
            can_manage_products, can_manage_categories, can_manage_tables,
            can_manage_coupons, can_view_reports, can_manage_register,
            can_view_settings, can_manage_settings, can_manage_staff
        )
        VALUES (
            NEW.id,
            TRUE, TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE,
            TRUE, TRUE, TRUE
        )
        ON CONFLICT (restaurant_member_id) DO NOTHING;
    ELSE
        -- Staff get default permissions (POS & View Orders)
        INSERT INTO public.restaurant_member_permissions (
            restaurant_member_id,
            can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
            can_manage_products, can_manage_categories, can_manage_tables,
            can_manage_coupons, can_view_reports, can_manage_register,
            can_view_settings, can_manage_settings, can_manage_staff
        )
        VALUES (
            NEW.id,
            TRUE, TRUE, FALSE, FALSE,
            FALSE, FALSE, FALSE,
            FALSE, FALSE, FALSE,
            FALSE, FALSE, FALSE
        )
        ON CONFLICT (restaurant_member_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_restaurant_member_permissions ON public.restaurant_members;
CREATE TRIGGER trg_new_restaurant_member_permissions
    AFTER INSERT ON public.restaurant_members
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_restaurant_member_permissions();
