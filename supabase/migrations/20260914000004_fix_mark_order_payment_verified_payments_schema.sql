-- ==============================================================================
-- RESTROZ MIGRATION: FIX mark_order_payment_verified RPC
-- File: 20260914000004_fix_mark_order_payment_verified_payments_schema.sql
-- Description:
--   1. Fixes invalid column reference "restaurant_id" on relation "payments".
--   2. Enforces strict tenant & role-based authorization using is_super_admin()
--      and is_restaurant_member(v_order.restaurant_id, 'STAFF').
--   3. Enforces valid actor_type check constraints ('SUPER_ADMIN', 'RESTAURANT_ADMIN', 'RESTAURANT_STAFF').
--   4. Ensures idempotent execution when payment is already verified.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.mark_order_payment_verified(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.mark_order_payment_verified(
    p_order_id TEXT,
    p_restaurant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_order RECORD;
    v_auth_uid UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_actor_type TEXT;
    v_res JSONB;
BEGIN
    -- 1. Authentication Check
    IF v_auth_uid IS NULL AND (auth.jwt() ->> 'role' != 'service_role' AND auth.role() != 'service_role') THEN
        RAISE EXCEPTION 'Authentication required: User is not logged in.';
    END IF;

    -- 2. Fetch Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 3. Tenant Validation
    IF p_restaurant_id IS NOT NULL AND v_order.restaurant_id != p_restaurant_id THEN
        RAISE EXCEPTION 'Tenant mismatch: Order does not belong to specified restaurant.';
    END IF;

    -- 4. Role-Based Authorization
    -- Allowed: service_role, SUPER_ADMIN, or restaurant ADMIN/STAFF of this specific restaurant
    v_is_authorized := (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role')
                       OR public.is_super_admin()
                       OR public.is_restaurant_member(v_order.restaurant_id, 'STAFF');

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Permission Denied: Not authorized to verify payment for this restaurant.';
    END IF;

    -- Determine actor_type matching order_status_events CHECK constraint
    v_actor_type := CASE 
        WHEN public.is_super_admin() THEN 'SUPER_ADMIN'
        WHEN public.is_restaurant_member(v_order.restaurant_id, 'ADMIN') THEN 'RESTAURANT_ADMIN'
        WHEN public.is_restaurant_member(v_order.restaurant_id, 'STAFF') THEN 'RESTAURANT_STAFF'
        ELSE 'SYSTEM'
    END;

    -- 5. Idempotent Check: If already paid, return existing state
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'payment_status', 'paid',
            'paid_amount', COALESCE(v_order.paid_amount, v_order.payable_amount, v_order.grand_total, 0.00),
            'already_verified', true,
            'payment_verified_at', v_order.payment_verified_at,
            'payment_verified_by', v_order.payment_verified_by
        );
    END IF;

    -- 6. Update Order Payment Status
    UPDATE public.orders
    SET payment_status = 'paid',
        paid_amount = COALESCE(payable_amount, grand_total, paid_amount),
        payment_verified_at = NOW(),
        payment_verified_by = v_auth_uid,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Insert Payment Record (payments table schema: id, order_id, payment_method, amount, status, reference_number, notes, created_at)
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'COMPLETED') THEN
        INSERT INTO public.payments (
            id,
            order_id,
            payment_method,
            amount,
            status,
            reference_number,
            notes,
            created_at
        ) VALUES (
            'pay-' || floor(extract(epoch from now()) * 1000)::TEXT || '-' || substr(md5(random()::TEXT), 1, 4),
            p_order_id,
            COALESCE(v_order.payment_method, 'online'),
            COALESCE(v_order.payable_amount, v_order.grand_total, 0.00),
            'COMPLETED',
            'VERIFIED-STAFF-' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
            'Payment verified by staff',
            NOW()
        );
    END IF;

    -- 8. Log Lifecycle Event
    INSERT INTO public.order_status_events (
        order_id,
        restaurant_id,
        old_status,
        new_status,
        actor_type,
        changed_by,
        note
    ) VALUES (
        p_order_id,
        v_order.restaurant_id,
        v_order.status,
        v_order.status,
        v_actor_type,
        v_auth_uid,
        'Payment marked as verified by staff'
    );

    SELECT jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'payment_status', 'paid',
        'paid_amount', COALESCE(v_order.payable_amount, v_order.grand_total, 0.00),
        'already_verified', false,
        'payment_verified_at', NOW(),
        'payment_verified_by', v_auth_uid
    ) INTO v_res;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) TO authenticated, service_role;
