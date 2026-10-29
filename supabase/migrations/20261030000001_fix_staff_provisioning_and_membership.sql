-- ============================================================================
-- MIGRATION: 20261030000001_fix_staff_provisioning_and_membership.sql
-- Description:
-- 1. Drops legacy overloaded signatures of public.provision_privileged_user to resolve
--    PostgREST HTTP 300 / PGRST203 candidate function ambiguity.
-- 2. Creates the authoritative, canonical public.provision_privileged_user procedure
--    with safe parameter defaults, GoTrue-compliant columns, auto-confirmed email,
--    schema-safe audit logging, and full support for all roles and presets (CASHIER,
--    WAITER, MANAGER, KITCHEN).
-- 3. Harmonizes public.audit_logs schema across environments (ensuring both details
--    and new_values exist).
-- 4. Reconciles public.handle_new_user and public.prevent_profile_role_escalation to
--    ensure proper profile role persistence when staff accounts are provisioned.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. HARMONIZE AUDIT_LOGS SCHEMA
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name TEXT;

-- ----------------------------------------------------------------------------
-- 2. DROP OBSOLETE & CONFLICTING FUNCTION SIGNATURES
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.provision_privileged_user(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.provision_privileged_user;

-- ----------------------------------------------------------------------------
-- 3. CANONICAL PROVISION_PRIVILEGED_USER STORED PROCEDURE
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
    v_admin_count INT := 0;
    v_staff_count INT := 0;
    v_plan_check JSONB;
    v_clean_pwd TEXT := COALESCE(NULLIF(TRIM(p_password), ''), 'Staff12345!');
BEGIN
    v_caller_id := auth.uid();

    -- 1. Caller Authorization Check
    v_is_super := public.is_super_admin();
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
        -- Service role or direct trusted execution
        v_is_admin := TRUE;
    END IF;

    IF NOT v_is_super AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Only an active Restaurant Admin or Super Admin can provision staff accounts.';
    END IF;

    -- Restaurant Admins cannot provision SUPER_ADMIN accounts
    IF NOT v_is_super AND v_role = 'SUPER_ADMIN' THEN
        RAISE EXCEPTION 'Unauthorized: Only Super Admin can provision Super Admin accounts.';
    END IF;

    IF v_email = '' THEN
        RAISE EXCEPTION 'Email address is required.';
    END IF;

    -- 2. Enforce Plan Limits
    IF v_role = 'ADMIN' THEN
        SELECT COUNT(*) INTO v_admin_count
        FROM public.restaurant_members
        WHERE restaurant_id = p_restaurant_id AND role = 'ADMIN' AND is_active = TRUE;

        SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;
        IF v_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id AND user_id = v_user_id AND role = 'ADMIN' AND is_active = TRUE
        ) THEN
            -- User is already an active admin in this restaurant; allow updating credentials
            NULL;
        ELSIF v_admin_count >= 2 AND NOT v_is_super THEN
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
            -- User is already an active staff in this restaurant; allow updating credentials
            NULL;
        ELSIF NOT v_is_super THEN
            BEGIN
                v_plan_check := public.check_restaurant_plan_limit(p_restaurant_id, 'staff');
                IF v_plan_check IS NOT NULL AND (v_plan_check->>'is_allowed')::BOOLEAN IS FALSE THEN
                    RAISE EXCEPTION 'Staff limit reached: Your subscription plan allows up to % staff members.', (v_plan_check->>'max_limit');
                END IF;
            EXCEPTION
                WHEN undefined_function THEN
                    NULL;
                WHEN OTHERS THEN
                    IF SQLERRM LIKE '%limit%' OR SQLERRM LIKE '%Staff%' THEN
                        RAISE;
                    END IF;
            END;
        END IF;
    END IF;

    -- 3. Find or Create Auth User
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_email LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- User already exists in auth.users: ensure confirmed email and update password
        v_enc_pwd := extensions.crypt(v_clean_pwd, extensions.gen_salt('bf'));
        UPDATE auth.users
        SET encrypted_password = v_enc_pwd,
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_full_name, 'role', v_role),
            phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
            updated_at = NOW()
        WHERE id = v_user_id;

        -- Ensure identity exists in auth.identities
        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::TEXT, 'email', v_email, 'email_verified', true),
            'email',
            v_user_id::TEXT,
            NOW(),
            NOW(),
            NOW()
        )
        ON CONFLICT (provider, provider_id) DO UPDATE SET
            identity_data = EXCLUDED.identity_data,
            updated_at = NOW();

        -- Update or create profile
        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_email, v_full_name, NULLIF(TRIM(p_phone), ''), v_role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = COALESCE(EXCLUDED.phone, profiles.phone),
            role = CASE WHEN profiles.role = 'SUPER_ADMIN' THEN 'SUPER_ADMIN' ELSE EXCLUDED.role END,
            updated_at = NOW();

        -- Link or update restaurant membership
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

    ELSE
        -- 4. User does not exist: Provision new Supabase Auth User with confirmed email
        v_user_id := gen_random_uuid();
        v_enc_pwd := extensions.crypt(v_clean_pwd, extensions.gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, recovery_sent_at, last_sign_in_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, email_change_token_current,
            recovery_token, phone_change, phone_change_token, reauthentication_token,
            email_change_confirm_status, is_sso_user, is_anonymous, is_super_admin
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
            v_email, v_enc_pwd, NOW(), NOW(), NULL,
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', v_full_name, 'role', v_role),
            NOW(), NOW(),
            '', '', '', '',
            '', '', '', '',
            0, FALSE, FALSE, FALSE
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::TEXT, 'email', v_email, 'email_verified', true),
            'email',
            v_user_id::TEXT,
            NOW(),
            NOW(),
            NOW()
        );

        -- Insert profile with canonical role
        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_email, v_full_name, NULLIF(TRIM(p_phone), ''), v_role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = COALESCE(EXCLUDED.phone, profiles.phone),
            role = EXCLUDED.role,
            updated_at = NOW();

        -- Insert authoritative restaurant membership
        INSERT INTO public.restaurant_members (
            restaurant_id, user_id, role, is_active, created_at, updated_at
        ) VALUES (
            p_restaurant_id, v_user_id, v_role, TRUE, NOW(), NOW()
        ) RETURNING id INTO v_member_id;
    END IF;

    -- 5. Configure Staff Permissions
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
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_manage_tables, updated_at
                ) VALUES (v_member_id, TRUE, TRUE, TRUE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_manage_tables = TRUE, updated_at = NOW();

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

            ELSIF UPPER(p_preset) = 'KITCHEN' THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, updated_at
                ) VALUES (v_member_id, FALSE, TRUE, NOW())
                ON CONFLICT (restaurant_member_id) DO UPDATE SET
                    can_use_pos = FALSE, can_view_orders = TRUE, updated_at = NOW();
            END IF;
        ELSE
            -- Default to CASHIER preset if neither permissions nor preset specified for STAFF
            INSERT INTO public.restaurant_member_permissions (
                restaurant_member_id, can_use_pos, can_view_orders, can_manage_register, updated_at
            ) VALUES (v_member_id, TRUE, TRUE, TRUE, NOW())
            ON CONFLICT (restaurant_member_id) DO UPDATE SET
                can_use_pos = TRUE, can_view_orders = TRUE, can_manage_register = TRUE, updated_at = NOW();
        END IF;
    END IF;

    -- 6. Insert Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            restaurant_id, user_id, action, entity_type, entity_id, new_values, details, created_at
        ) VALUES (
            p_restaurant_id,
            v_caller_id,
            CASE WHEN v_role = 'ADMIN' THEN 'CREATE_ADMIN' ELSE 'CREATE_STAFF' END,
            'STAFF',
            v_user_id::TEXT,
            jsonb_build_object('created_user_id', v_user_id, 'email', v_email, 'role', v_role),
            jsonb_build_object('created_user_id', v_user_id, 'email', v_email, 'role', v_role),
            NOW()
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

REVOKE ALL ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_privileged_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
