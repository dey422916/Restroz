-- ==============================================================================
-- RESTROZ MIGRATION: COMPREHENSIVE SAFE RESTAURANT DELETION RPCs
-- File: 20261015000001_safe_restaurant_deletion_and_isolation.sql
-- Description:
--   1. Updates public.preview_restaurant_deletion (Read-only, exhaustive 35-table preview)
--   2. Updates public.delete_restaurant_completely (Atomic, strict dependency-ordered purge)
--   3. Strictly restricted to SUPER_ADMIN / service_role with row-locking
--   4. Preserves auth.users, public.profiles, subscription_plans, customer_addresses,
--      website_banners, website_leads globally
--   5. Logs permanent PLATFORM-LEVEL audit record (restaurant_id = NULL)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PREVIEW RESTAURANT DELETION RPC
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.preview_restaurant_deletion(UUID);

CREATE OR REPLACE FUNCTION public.preview_restaurant_deletion(
    p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rest RECORD;
    v_counts JSONB;
BEGIN
    -- 1. Authorization: Only SUPER_ADMIN or service_role
    IF (auth.jwt() ->> 'role' != 'service_role' AND auth.role() != 'service_role') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only SUPER_ADMIN can preview restaurant deletion.';
    END IF;

    -- 2. Verify Restaurant Exists
    SELECT * INTO v_rest FROM public.restaurants WHERE id = p_restaurant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Restaurant with ID % not found.', p_restaurant_id;
    END IF;

    -- 3. Gather Exact Row Counts across all tenant-scoped tables
    SELECT jsonb_build_object(
        'restaurant_id', v_rest.id,
        'restaurant_name', v_rest.name,
        'restaurant_slug', v_rest.slug,
        'restaurant_status', v_rest.status,
        'members', (SELECT count(*) FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id),
        'member_permissions', (SELECT count(*) FROM public.restaurant_member_permissions WHERE restaurant_member_id IN (SELECT id FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id)),
        'settings', (SELECT count(*) FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id),
        'public_profiles', (SELECT count(*) FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id),
        'categories', (SELECT count(*) FROM public.categories WHERE restaurant_id = p_restaurant_id),
        'products', (SELECT count(*) FROM public.products WHERE restaurant_id = p_restaurant_id),
        'tables', (SELECT count(*) FROM public.tables WHERE restaurant_id = p_restaurant_id),
        'orders', (SELECT count(*) FROM public.orders WHERE restaurant_id = p_restaurant_id),
        'order_items', (SELECT count(*) FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id)),
        'payments', (SELECT count(*) FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id)),
        'kots', (SELECT count(*) FROM public.kots WHERE restaurant_id = p_restaurant_id),
        'kot_items', (SELECT count(*) FROM public.kot_items WHERE kot_id IN (SELECT id FROM public.kots WHERE restaurant_id = p_restaurant_id)),
        'order_status_events', (SELECT count(*) FROM public.order_status_events WHERE restaurant_id = p_restaurant_id),
        'customer_notifications', (SELECT count(*) FROM public.customer_notifications WHERE restaurant_id = p_restaurant_id),
        'coupons', (SELECT count(*) FROM public.coupons WHERE restaurant_id = p_restaurant_id),
        'day_registers', (SELECT count(*) FROM public.day_registers WHERE restaurant_id = p_restaurant_id),
        'register_reminder_logs', (SELECT count(*) FROM public.register_reminder_logs WHERE restaurant_id = p_restaurant_id),
        'staff_push_tokens', (SELECT count(*) FROM public.staff_push_tokens WHERE restaurant_id = p_restaurant_id),
        'loyalty_settings', (SELECT count(*) FROM public.loyalty_reward_settings WHERE restaurant_id = p_restaurant_id),
        'customer_wallets', (SELECT count(*) FROM public.customer_wallets WHERE restaurant_id = p_restaurant_id),
        'wallet_transactions', (SELECT count(*) FROM public.customer_wallet_transactions WHERE restaurant_id = p_restaurant_id),
        'restaurant_printers', (SELECT count(*) FROM public.restaurant_printers WHERE restaurant_id = p_restaurant_id),
        'print_jobs', (SELECT count(*) FROM public.print_jobs WHERE restaurant_id = p_restaurant_id),
        'printer_devices', (SELECT count(*) FROM public.printer_devices WHERE restaurant_id = p_restaurant_id),
        'print_agents', (SELECT count(*) FROM public.print_agents WHERE restaurant_id = p_restaurant_id),
        'subscriptions', (SELECT count(*) FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id),
        'subscription_payments', (SELECT count(*) FROM public.subscription_payments WHERE restaurant_id = p_restaurant_id),
        'favorite_restaurants', (SELECT count(*) FROM public.favorite_restaurants WHERE restaurant_id = p_restaurant_id),
        'audit_logs', (SELECT count(*) FROM public.audit_logs WHERE restaurant_id = p_restaurant_id)
    ) INTO v_counts;

    RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_restaurant_deletion(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_restaurant_deletion(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_restaurant_deletion(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. ATOMIC RESTAURANT PERMANENT PURGE RPC
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_restaurant_completely(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.delete_restaurant_completely(
    p_restaurant_id UUID,
    p_confirmation_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_rest RECORD;
    v_auth_uid UUID := auth.uid();
    v_preview JSONB;
BEGIN
    -- 1. Authentication Check
    IF v_auth_uid IS NULL AND (auth.jwt() ->> 'role' != 'service_role' AND auth.role() != 'service_role') THEN
        RAISE EXCEPTION 'Authentication required: User is not logged in.';
    END IF;

    -- 2. Authorization Check: Strictly SUPER_ADMIN or service_role
    IF (auth.jwt() ->> 'role' != 'service_role' AND auth.role() != 'service_role') AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access Denied: Only SUPER_ADMIN can permanently delete restaurants.';
    END IF;

    -- 3. Lock & Verify Restaurant Exists
    SELECT * INTO v_rest FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Restaurant with ID % not found.', p_restaurant_id;
    END IF;

    -- 4. Verify Exact Name Confirmation (Case-Insensitive Match)
    IF TRIM(LOWER(v_rest.name)) != TRIM(LOWER(COALESCE(p_confirmation_name, ''))) THEN
        RAISE EXCEPTION 'Confirmation name mismatch. Expected: "%", received: "%".', v_rest.name, p_confirmation_name;
    END IF;

    -- Capture preview counts before deletion for audit response
    v_preview := public.preview_restaurant_deletion(p_restaurant_id);

    -- 5. Execute Atomic Deletion in Strict Dependency Order

    -- A. Print Infrastructure & Jobs
    DELETE FROM public.print_jobs WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.printer_devices WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.print_agents WHERE restaurant_id = p_restaurant_id;
    -- Break self-referencing FK on restaurant_printers before delete
    UPDATE public.restaurant_printers SET fallback_printer_id = NULL WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_printers WHERE restaurant_id = p_restaurant_id;

    -- B. Loyalty & Customer Wallets (Strict Tenant Isolation)
    DELETE FROM public.customer_wallet_transactions WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.customer_wallets WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.loyalty_reward_settings WHERE restaurant_id = p_restaurant_id;

    -- C. KOTs & KOT Items
    DELETE FROM public.kot_items WHERE kot_id IN (SELECT id FROM public.kots WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.kots WHERE restaurant_id = p_restaurant_id;

    -- D. Orders, Payments, Items & Lifecycle Events
    DELETE FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.order_status_events WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.customer_notifications WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;

    -- E. Operations, Tables, Registers & Push Tokens
    DELETE FROM public.register_reminder_logs WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.staff_push_tokens WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.day_registers WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.coupons WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.tables WHERE restaurant_id = p_restaurant_id;

    -- F. Catalog: Products & Categories
    DELETE FROM public.products WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.categories WHERE restaurant_id = p_restaurant_id;

    -- G. Memberships & Permissions (Preserves global auth.users and public.profiles)
    DELETE FROM public.restaurant_member_permissions WHERE restaurant_member_id IN (SELECT id FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id;

    -- H. Subscriptions & Billing (Preserves global subscription_plans)
    DELETE FROM public.subscription_payments WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id;

    -- I. Settings, Profiles & Bookmarks
    DELETE FROM public.favorite_restaurants WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.audit_logs WHERE restaurant_id = p_restaurant_id;

    -- J. Target Restaurant Root Record
    DELETE FROM public.restaurants WHERE id = p_restaurant_id;

    -- K. Platform-Level Audit Record (Preserved with restaurant_id = NULL)
    INSERT INTO public.audit_logs (
        restaurant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        NULL,
        v_auth_uid,
        'DELETE_RESTAURANT',
        'restaurant',
        p_restaurant_id::text,
        jsonb_build_object(
            'restaurant_id', p_restaurant_id,
            'name', v_rest.name,
            'slug', v_rest.slug,
            'status', v_rest.status
        ),
        jsonb_build_object(
            'status', 'DELETED',
            'deleted_by', v_auth_uid,
            'deleted_counts', v_preview
        ),
        now()
    );

    -- L. Post-Delete Safety Assertion
    IF EXISTS (SELECT 1 FROM public.restaurants WHERE id = p_restaurant_id) THEN
        RAISE EXCEPTION 'Assertion failed: Restaurant with ID % still exists after deletion sequence.', p_restaurant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_restaurant_id', p_restaurant_id,
        'deleted_restaurant_name', v_rest.name,
        'deleted_counts', v_preview
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_restaurant_completely(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_restaurant_completely(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_restaurant_completely(UUID, TEXT) TO authenticated, service_role;
