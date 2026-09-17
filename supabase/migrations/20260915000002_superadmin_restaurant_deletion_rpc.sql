-- ==============================================================================
-- RESTROZ MIGRATION: SUPER_ADMIN RESTAURANT DELETION RPCs
-- File: 20260915000002_superadmin_restaurant_deletion_rpc.sql
-- Description:
--   1. Adds public.preview_restaurant_deletion (Read-only, preview counts)
--   2. Adds public.delete_restaurant_completely (Atomic, strict dependency-ordered purge)
--   3. Strictly restricted to SUPER_ADMIN / service_role
--   4. Preserves auth.users and public.profiles globally
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

    -- 3. Gather Exact Row Counts
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
        'subscriptions', (SELECT count(*) FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id),
        'subscription_payments', (SELECT count(*) FROM public.subscription_payments WHERE restaurant_id = p_restaurant_id),
        'favorite_restaurants', (SELECT count(*) FROM public.favorite_restaurants WHERE restaurant_id = p_restaurant_id),
        'audit_logs', (SELECT count(*) FROM public.audit_logs WHERE restaurant_id = p_restaurant_id)
    ) INTO v_counts;

    RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_restaurant_deletion(UUID) FROM PUBLIC;
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

    -- 3. Verify Restaurant Exists
    SELECT * INTO v_rest FROM public.restaurants WHERE id = p_restaurant_id;
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
    -- A. KOTs & KOT Items (Delete items before products to avoid FK restrict)
    DELETE FROM public.kot_items WHERE kot_id IN (SELECT id FROM public.kots WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.kots WHERE restaurant_id = p_restaurant_id;

    -- B. Orders, Payments, Items & Lifecycle Events
    DELETE FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.order_status_events WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.customer_notifications WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.orders WHERE restaurant_id = p_restaurant_id;

    -- C. Operations, Tables, Menu Products & Categories
    DELETE FROM public.day_registers WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.coupons WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.tables WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.products WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.categories WHERE restaurant_id = p_restaurant_id;

    -- D. Restaurant Memberships & Permissions (Preserves global auth.users and profiles)
    DELETE FROM public.restaurant_member_permissions WHERE restaurant_member_id IN (SELECT id FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id);
    DELETE FROM public.restaurant_members WHERE restaurant_id = p_restaurant_id;

    -- E. Subscriptions, Settings & Profiles
    DELETE FROM public.favorite_restaurants WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.subscription_payments WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_subscriptions WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_public_profiles WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.restaurant_settings WHERE restaurant_id = p_restaurant_id;
    DELETE FROM public.audit_logs WHERE restaurant_id = p_restaurant_id;

    -- F. Primary Restaurant Record
    DELETE FROM public.restaurants WHERE id = p_restaurant_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_restaurant_id', p_restaurant_id,
        'deleted_restaurant_name', v_rest.name,
        'deleted_counts', v_preview
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_restaurant_completely(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_restaurant_completely(UUID, TEXT) TO authenticated, service_role;
