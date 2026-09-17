-- ============================================================================
-- RESTROZ DEV ENVIRONMENT — AUTH USERS REPAIR & PROVISIONING PATCH
-- Environment: DEVELOPMENT (restroz-dev ONLY)
-- Target Database: restroz-dev Supabase Project
-- ============================================================================
-- Purpose:
-- Fixes login failure by completely repairing and provisioning the 5 DEV accounts
-- in auth.users, auth.identities, profiles, restaurant_members, and
-- restaurant_member_permissions with verified credentials (Password: Password123!).
--
-- Safety Guarantees:
-- 1. Strictly non-destructive to business data (orders, menu, settings).
-- 2. Fully compatible with Supabase GoTrue Auth schema.
-- 3. Idempotent — safe to execute multiple times.
-- ============================================================================

-- 0. SCHEMA COMPATIBILITY PREPARATION
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
DECLARE
    v_pw_hash TEXT;
    v_rest_id UUID := 'e0000000-0000-0000-0000-000000000001'::uuid;

    -- User Record Variables
    v_u RECORD;
    v_user_id UUID;
    v_existing_id UUID;
    v_mem_id UUID;
BEGIN
    RAISE NOTICE 'Starting RestroZ DEV Auth Users Repair Patch...';

    -- Generate standard bcrypt password hash for 'Password123!'
    v_pw_hash := extensions.crypt('Password123!', extensions.gen_salt('bf', 10));

    -- Loop through the 5 DEV Users
    FOR v_u IN 
        SELECT * FROM (VALUES
            ('a0000000-0000-0000-0000-000000000001'::uuid, 'rdsa@yopmail.com', 'Ratnadeep Dey', 'SUPER_ADMIN', '+91 99999 00001', NULL),
            ('a0000000-0000-0000-0000-000000000002'::uuid, 'ppad@yopmail.com', 'Panch Phoron Admin', 'ADMIN', '+91 98765 43210', 'b0000000-0000-0000-0000-000000000002'::uuid),
            ('a0000000-0000-0000-0000-000000000003'::uuid, 'ppst@yopmail.com', 'Panch Phoron Staff', 'STAFF', '+91 98765 43211', 'b0000000-0000-0000-0000-000000000003'::uuid),
            ('a0000000-0000-0000-0000-000000000004'::uuid, 'ppkt@yopmail.com', 'Panch Phoron Kitchen', 'STAFF', '+91 98765 43212', 'b0000000-0000-0000-0000-000000000004'::uuid),
            ('a0000000-0000-0000-0000-000000000005'::uuid, 'ppcu@yopmail.com', 'Panch Phoron Customer', 'CUSTOMER', '+91 98765 43213', NULL)
        ) AS t(target_id, email, full_name, role, phone, member_id)
    LOOP
        -- Check if user already exists by email in auth.users
        SELECT id INTO v_existing_id FROM auth.users WHERE LOWER(email) = LOWER(v_u.email);

        IF v_existing_id IS NOT NULL THEN
            v_user_id := v_existing_id;

            -- Update existing auth.users record with full GoTrue fields
            UPDATE auth.users
            SET encrypted_password = v_pw_hash,
                email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
                last_sign_in_at = NOW(),
                raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
                raw_user_meta_data = jsonb_build_object('full_name', v_u.full_name, 'role', v_u.role, 'phone', v_u.phone),
                is_super_admin = FALSE,
                is_sso_user = FALSE,
                banned_until = NULL,
                deleted_at = NULL,
                aud = 'authenticated',
                role = 'authenticated',
                updated_at = NOW()
            WHERE id = v_user_id;

            RAISE NOTICE 'Updated existing auth.user for % (%)', v_u.email, v_user_id;
        ELSE
            v_user_id := v_u.target_id;

            -- Insert clean new auth.users record
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
                created_at, updated_at, confirmation_token, email_change, email_change_token_new,
                recovery_token, is_sso_user
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                v_user_id,
                'authenticated',
                'authenticated',
                v_u.email,
                v_pw_hash,
                NOW(),
                NOW(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('full_name', v_u.full_name, 'role', v_u.role, 'phone', v_u.phone),
                FALSE,
                NOW(),
                NOW(),
                '',
                '',
                '',
                '',
                FALSE
            );

            RAISE NOTICE 'Created new auth.user for % (%)', v_u.email, v_user_id;
        END IF;

        -- Ensure clean, matching auth.identities record
        DELETE FROM auth.identities 
        WHERE user_id = v_user_id 
           OR (provider = 'email' AND provider_id = v_user_id::text)
           OR (provider = 'email' AND provider_id = v_u.email);

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_u.email, 'email_verified', true, 'phone_verified', false),
            'email',
            v_user_id::text,
            NOW(),
            NOW(),
            NOW()
        );

        -- Upsert public.profiles record
        INSERT INTO public.profiles (
            id, email, full_name, phone, role, created_at, updated_at
        ) VALUES (
            v_user_id, v_u.email, v_u.full_name, v_u.phone, v_u.role, NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            role = EXCLUDED.role,
            updated_at = NOW();

        -- Upsert Restaurant Membership and Member Permissions if restaurant staff/admin
        IF v_u.member_id IS NOT NULL THEN
            INSERT INTO public.restaurant_members (
                id, restaurant_id, user_id, role, is_active, created_at, updated_at
            ) VALUES (
                v_u.member_id,
                v_rest_id,
                v_user_id,
                v_u.role,
                TRUE,
                NOW(),
                NOW()
            )
            ON CONFLICT (restaurant_id, user_id) DO UPDATE SET
                role = EXCLUDED.role,
                is_active = TRUE,
                updated_at = NOW();

            SELECT id INTO v_mem_id 
            FROM public.restaurant_members 
            WHERE restaurant_id = v_rest_id AND user_id = v_user_id;

            IF v_mem_id IS NOT NULL THEN
                INSERT INTO public.restaurant_member_permissions (
                    restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
                    can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
                    can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
                ) VALUES (
                    v_mem_id,
                    TRUE,
                    TRUE,
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN' OR v_u.email = 'ppst@yopmail.com'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN'),
                    (v_u.role = 'ADMIN')
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
                    can_manage_staff = EXCLUDED.can_manage_staff;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE '✅ All 5 DEV users successfully repaired with password "Password123!".';
END $$;
