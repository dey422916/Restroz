-- ============================================================================
-- RESTROZ DEV ENVIRONMENT — STAFF PROVISIONING, PERMISSIONS & PASSWORD RPC PATCH
-- Environment: DEVELOPMENT (restroz-dev)
-- ============================================================================
-- Purpose:
-- Installs the backend RPC functions:
-- 1. public.provision_privileged_user
-- 2. public.update_staff_permissions
-- 3. public.admin_reset_user_password
--
-- This enables direct, secure password changes and staff management
-- via PostgreSQL RPC without requiring Edge Functions or sending emails.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- 0. DROP PREVIOUS FUNCTION SIGNATURES FIRST
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_staff_permissions(UUID, JSONB);
DROP FUNCTION IF EXISTS public.update_staff_permissions(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.update_staff_permissions;

DROP FUNCTION IF EXISTS public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.provision_privileged_user;

DROP FUNCTION IF EXISTS public.admin_reset_user_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_reset_user_password;

-- ----------------------------------------------------------------------------
-- 1. RPC: PROVISION PRIVILEGED USER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_privileged_user(
    p_restaurant_id UUID,
    p_email TEXT,
    p_password TEXT DEFAULT 'Staff12345!',
    p_full_name TEXT DEFAULT 'Staff Member',
    p_phone TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'STAFF',
    p_preset TEXT DEFAULT NULL,
    p_permissions JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_is_super BOOLEAN := FALSE;
    v_is_admin BOOLEAN := FALSE;
    v_user_id UUID;
    v_existing_mem_id UUID;
    v_existing_is_active BOOLEAN;
    v_member_id UUID;
    v_enc_pwd TEXT;
    v_role TEXT := UPPER(TRIM(COALESCE(p_role, 'STAFF')));
    v_email TEXT := LOWER(TRIM(p_email));
    v_full_name TEXT := TRIM(COALESCE(p_full_name, 'Staff Member'));
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id AND user_id = v_caller_id AND role = 'ADMIN' AND is_active = TRUE
        ) INTO v_is_admin;

        IF NOT v_is_admin THEN
            SELECT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller_id AND role IN ('ADMIN', 'SUPER_ADMIN')
            ) INTO v_is_admin;
        END IF;
    ELSE
        v_is_admin := TRUE;
    END IF;

    IF v_email = '' THEN
        RAISE EXCEPTION 'Email address is required.';
    END IF;

    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        SELECT id, is_active INTO v_existing_mem_id, v_existing_is_active
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id
        LIMIT 1;

        IF v_existing_mem_id IS NOT NULL THEN
            UPDATE public.restaurant_members
            SET is_active = TRUE, role = v_role, updated_at = NOW()
            WHERE id = v_existing_mem_id
            RETURNING id INTO v_member_id;
        ELSE
            INSERT INTO public.restaurant_members (
                restaurant_id, user_id, role, is_active, created_at, updated_at
            ) VALUES (
                p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
            ) RETURNING id INTO v_member_id;
        END IF;

        UPDATE public.profiles
        SET full_name = COALESCE(NULLIF(v_full_name, ''), full_name),
            phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
            role = CASE WHEN role = 'SUPER_ADMIN' THEN 'SUPER_ADMIN' ELSE v_role END,
            updated_at = NOW()
        WHERE id = v_user_id;

    ELSE
        v_user_id := gen_random_uuid();
        v_enc_pwd := extensions.crypt(COALESCE(NULLIF(TRIM(p_password), ''), 'Staff12345!'), extensions.gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token,
            is_super_admin
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
            v_email, v_enc_pwd, NOW(), NOW(), NULL,
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', v_full_name, 'role', v_role),
            NOW(), NOW(), '', '', '', '', FALSE
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_user_id,
            jsonb_build_object('sub', v_user_id::TEXT, 'email', v_email),
            'email', v_user_id::TEXT, NOW(), NOW(), NOW()
        );

        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_email, v_full_name, NULLIF(TRIM(p_phone), ''), v_role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = COALESCE(EXCLUDED.phone, profiles.phone),
            updated_at = NOW();

        INSERT INTO public.restaurant_members (
            restaurant_id, user_id, role, is_active, created_at, updated_at
        ) VALUES (
            p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
        ) RETURNING id INTO v_member_id;
    END IF;

    IF v_member_id IS NOT NULL THEN
        IF p_permissions IS NOT NULL THEN
            INSERT INTO public.restaurant_member_permissions (
                restaurant_member_id,
                can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
                can_manage_products, can_manage_categories, can_manage_tables,
                can_manage_coupons, can_view_reports, can_manage_register,
                can_view_settings, can_manage_settings, can_manage_staff,
                updated_at
            ) VALUES (
                v_member_id,
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
                COALESCE((p_permissions->>'can_manage_staff')::BOOLEAN, FALSE),
                NOW()
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
        ELSIF p_preset IS NOT NULL THEN
            IF UPPER(p_preset) = 'WAITER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_manage_tables, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_manage_tables = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'CASHIER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_manage_register, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_manage_register = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'MANAGER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
                    can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
                    can_view_reports, can_manage_register, can_view_settings, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_cancel_orders = TRUE,
                    can_manage_products = TRUE, can_manage_categories = TRUE, can_manage_tables = TRUE,
                    can_manage_coupons = TRUE, can_view_reports = TRUE, can_manage_register = TRUE, can_view_settings = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'KITCHEN' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, updated_at
                ) VALUES (v_member_id, FALSE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = FALSE, can_view_orders = TRUE, updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'member_id', v_member_id,
        'email', v_email,
        'role', v_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role, anon;


-- ----------------------------------------------------------------------------
-- 2. RPC: UPDATE STAFF PERMISSIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_staff_permissions(
    p_restaurant_member_id UUID,
    p_permissions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
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

    SELECT * INTO v_member
    FROM public.restaurant_members
    WHERE id = p_restaurant_member_id;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION 'Restaurant member not found.';
    END IF;

    IF public.is_super_admin() OR public.is_restaurant_member(v_member.restaurant_id, 'ADMIN') THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: Only Restaurant Admins or Super Admins can update staff permissions.';
    END IF;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id,
        can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables,
        can_manage_coupons, can_view_reports, can_manage_register,
        can_view_settings, can_manage_settings, can_manage_staff,
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

    RETURN jsonb_build_object('success', TRUE, 'message', 'Staff permissions updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_permissions(UUID, JSONB) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: ADMIN RESET USER PASSWORD
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_target_role TEXT;
    v_target_email TEXT;
    v_caller_is_admin BOOLEAN := FALSE;
    v_encrypted_pw TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User session required.';
    END IF;

    IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long.';
    END IF;

    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller profile not found.';
    END IF;

    SELECT email, role INTO v_target_email, v_target_role FROM public.profiles WHERE id = p_user_id;
    IF v_target_email IS NULL THEN
        SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;
    END IF;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found.';
    END IF;

    -- Authorization Check
    IF v_caller_role = 'SUPER_ADMIN' THEN
        NULL;
    ELSIF v_caller_role = 'ADMIN' THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.restaurant_members rm_caller
            JOIN public.restaurant_members rm_target ON rm_caller.restaurant_id = rm_target.restaurant_id
            WHERE rm_caller.user_id = v_caller_id 
              AND rm_caller.role = 'ADMIN'
              AND rm_caller.is_active = TRUE
              AND rm_target.user_id = p_user_id
              AND rm_target.role = 'STAFF'
        ) INTO v_caller_is_admin;

        IF NOT v_caller_is_admin THEN
            -- Also allow if caller is member of same restaurant
            SELECT EXISTS (
                SELECT 1 FROM public.restaurant_members WHERE user_id = v_caller_id AND role = 'ADMIN' AND is_active = TRUE
            ) INTO v_caller_is_admin;
        END IF;

        IF NOT v_caller_is_admin THEN
            RAISE EXCEPTION 'Forbidden: You can only reset passwords for staff members belonging to your restaurant.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Forbidden: Insufficient privileges to reset member passwords.';
    END IF;

    v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Password updated successfully.',
        'user_id', p_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated, service_role;
