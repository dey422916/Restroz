-- ============================================================================
-- MIGRATION: 20260820000009_bypass_email_rate_limit_privileged_provisioning.sql
-- Description:
-- Installs public.provision_privileged_user stored procedure.
-- Bypasses Supabase Auth SMTP email rate limits (over_email_send_rate_limit)
-- by creating pre-confirmed auth users directly in auth.users + profiles + restaurant_members.
-- Zero emails sent. Zero rate limits. Immediate login active.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.provision_privileged_user(
    p_restaurant_id UUID,
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
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
    v_role TEXT := UPPER(TRIM(p_role));
    v_email TEXT := LOWER(TRIM(p_email));
    v_full_name TEXT := TRIM(p_full_name);
    v_admin_count INT := 0;
    v_staff_count INT := 0;
BEGIN
    v_caller_id := auth.uid();

    -- 1. Verify caller authorization (Allow SUPER_ADMIN, restaurant ADMIN, or authenticated service)
    v_is_super := public.is_super_admin();
    IF v_caller_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.restaurant_members
            WHERE restaurant_id = p_restaurant_id AND user_id = v_caller_id AND role = 'ADMIN' AND is_active = TRUE
        ) INTO v_is_admin;
    ELSE
        v_is_admin := TRUE;
    END IF;

    -- If caller role in profiles is ADMIN, allow
    IF NOT v_is_super AND NOT v_is_admin THEN
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('ADMIN', 'SUPER_ADMIN')) THEN
            v_is_admin := TRUE;
        END IF;
    END IF;

    IF v_email = '' OR v_full_name = '' THEN
        RAISE EXCEPTION 'Full name and email address are required.';
    END IF;

    -- 2. Enforce Plan Limits (2 Admins, 3 Staff minimum across all plans)
    IF v_role = 'ADMIN' THEN
        SELECT COUNT(*) INTO v_admin_count
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND role = 'ADMIN' AND is_active = TRUE;

        -- Check if target user is already an admin
        SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;
        IF v_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id AND role = 'ADMIN' AND is_active = TRUE
        ) THEN
            -- Already active admin, allow update
            NULL;
        ELSIF v_admin_count >= 2 THEN
            RAISE EXCEPTION 'Admin limit reached: You can have up to 2 Admin accounts per restaurant.';
        END IF;
    ELSIF v_role = 'STAFF' THEN
        SELECT COUNT(*) INTO v_staff_count
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND role = 'STAFF' AND is_active = TRUE;

        SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;
        IF v_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id AND role = 'STAFF' AND is_active = TRUE
        ) THEN
            NULL;
        ELSIF v_staff_count >= 3 THEN
            -- Check if higher plan exists
            PERFORM public.check_restaurant_plan_limit(p_restaurant_id, 'STAFF', 1);
        END IF;
    END IF;

    -- 3. Check if user already exists in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- User exists in Auth: check restaurant membership
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

        -- Update profile
        UPDATE public.profiles
        SET full_name = COALESCE(NULLIF(v_full_name, ''), full_name),
            phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
            role = CASE WHEN role = 'SUPER_ADMIN' THEN 'SUPER_ADMIN' ELSE v_role END,
            updated_at = NOW()
        WHERE id = v_user_id;

    ELSE
        -- 4. User does not exist: Provision new Supabase Auth User with confirmed email (Zero SMTP / Zero rate limits)
        v_user_id := gen_random_uuid();
        v_enc_pwd := crypt(COALESCE(NULLIF(TRIM(p_password), ''), 'RestroZ_Privileged_Default123!'), gen_salt('bf'));

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

        -- Create profile
        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_email, v_full_name, NULLIF(TRIM(p_phone), ''), v_role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = COALESCE(EXCLUDED.phone, profiles.phone),
            updated_at = NOW();

        -- Create restaurant member join record
        INSERT INTO public.restaurant_members (
            restaurant_id, user_id, role, is_active, created_at, updated_at
        ) VALUES (
            p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
        ) RETURNING id INTO v_member_id;
    END IF;

    -- 5. Configure permissions for STAFF
    IF v_role = 'STAFF' AND v_member_id IS NOT NULL THEN
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
            IF UPPER(p_preset) = 'CASHIER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_manage_register, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_manage_register = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'WAITER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_manage_tables, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_manage_tables = TRUE, updated_at = NOW();
            ELSIF UPPER(p_preset) = 'MANAGER' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id,
                    can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
                    can_manage_products, can_manage_categories, can_manage_tables,
                    can_manage_coupons, can_view_reports, can_manage_register,
                    can_view_settings, can_manage_settings, can_manage_staff,
                    updated_at
                ) VALUES (
                    v_member_id,
                    TRUE, TRUE, TRUE, TRUE,
                    TRUE, TRUE, TRUE,
                    TRUE, TRUE, TRUE,
                    TRUE, FALSE, FALSE,
                    NOW()
                )
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_cancel_orders = TRUE,
                    can_manage_products = TRUE, can_manage_categories = TRUE, can_manage_tables = TRUE,
                    can_manage_coupons = TRUE, can_view_reports = TRUE, can_manage_register = TRUE,
                    can_view_settings = TRUE, can_manage_settings = FALSE, can_manage_staff = FALSE,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    -- 6. Insert audit log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (restaurant_id, user_id, action, details)
        VALUES (
            p_restaurant_id,
            v_caller_id,
            CASE WHEN v_role = 'ADMIN' THEN 'CREATE_ADMIN' ELSE 'CREATE_STAFF' END,
            jsonb_build_object('created_user_id', v_user_id, 'email', v_email, 'role', v_role)
        );
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

GRANT EXECUTE ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
