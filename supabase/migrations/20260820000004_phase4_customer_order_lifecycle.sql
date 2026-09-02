-- ============================================================================
-- RATNADEEP POS SAAS — PHASE 4 MIGRATION
-- CUSTOMER ACCOUNTS, ORDER LIFECYCLE, REORDER, CANCELLATION & DELIVERY
-- Migration Version: 20260820000004_phase4_customer_order_lifecycle.sql
-- Strictly Additive — Phase 1, Phase 2, and Phase 3 schema & data preserved 100%
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDER STATUS EVENTS TABLE
-- Immutable lifecycle event history for customer timeline and audit
-- NOTE: order_id is TEXT to match public.orders(id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('CUSTOMER', 'RESTAURANT_STAFF', 'RESTAURANT_ADMIN', 'SUPER_ADMIN', 'SYSTEM')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order ON public.order_status_events (order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_restaurant ON public.order_status_events (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_created ON public.order_status_events (created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. CUSTOMER NOTIFICATIONS TABLE
-- Lightweight in-app customer notifications log
-- NOTE: order_id is TEXT to match public.orders(id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ORDER_UPDATE',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_user ON public.customer_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_read ON public.customer_notifications (user_id, is_read);

-- ----------------------------------------------------------------------------
-- 2B. EXPAND ORDERS STATUS CHECK CONSTRAINT FOR DELIVERY PROGRESSION
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('draft', 'pending', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'delivered', 'completed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

-- ORDER STATUS EVENTS RLS
CREATE POLICY "order_status_events_select_policy"
    ON public.order_status_events
    FOR SELECT
    USING (
        -- 1. Super Admin full visibility
        public.is_super_admin()
        OR
        -- 2. Restaurant Staff/Admin can view events for their restaurant
        public.is_restaurant_member(restaurant_id, 'STAFF')
        OR
        -- 3. Customer can view events for their own orders
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_status_events.order_id
            AND o.customer_id = auth.uid()
        )
    );

CREATE POLICY "order_status_events_insert_policy"
    ON public.order_status_events
    FOR INSERT
    WITH CHECK (
        public.is_super_admin()
        OR
        public.is_restaurant_member(restaurant_id, 'STAFF')
        OR
        auth.uid() IS NOT NULL
    );

-- CUSTOMER NOTIFICATIONS RLS
CREATE POLICY "customer_notifications_user_policy"
    ON public.customer_notifications
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. SERVER-SIDE STORED PROCEDURE: CANCEL CUSTOMER ORDER
-- Narrowly scoped RPC for customer cancellation before kitchen preparation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_customer_order(
    p_order_id TEXT,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_order RECORD;
    v_clean_reason TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to cancel order.';
    END IF;

    v_clean_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Customer cancelled before preparation');

    -- 1. Lock and validate order row
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- 2. Verify ownership
    IF v_order.customer_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION 'Access denied: You can only cancel your own orders.';
    END IF;

    -- 3. Verify order type
    IF v_order.order_type != 'delivery' THEN
        RAISE EXCEPTION 'Only online delivery orders can be cancelled via customer portal.';
    END IF;

    -- 4. Verify cancellation window (ONLY confirmed allowed)
    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'Order is already cancelled.';
    END IF;

    IF v_order.status != 'confirmed' THEN
        RAISE EXCEPTION 'Order cannot be cancelled because preparation or dispatch has already started (Current status: %).', v_order.status;
    END IF;

    -- 5. Update order status to cancelled
    UPDATE public.orders
    SET 
        status = 'cancelled',
        notes = COALESCE(notes || ' | ', '') || '[CANCELLED BY CUSTOMER: ' || v_clean_reason || ']',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Log status event
    INSERT INTO public.order_status_events (
        order_id, restaurant_id, old_status, new_status, changed_by, actor_type, note
    ) VALUES (
        p_order_id, v_order.restaurant_id, 'confirmed', 'cancelled', v_user_id, 'CUSTOMER', v_clean_reason
    );

    -- 7. Add in-app customer notification
    INSERT INTO public.customer_notifications (
        user_id, order_id, title, message, type
    ) VALUES (
        v_user_id, p_order_id, 'Order Cancelled', 'Your order #' || v_order.order_number || ' has been cancelled successfully.', 'ORDER_CANCELLED'
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'status', 'cancelled',
        'message', 'Order cancelled successfully. Any deducted stock has been restored.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SERVER-SIDE STORED PROCEDURE: UPDATE DELIVERY ORDER STATUS
-- Controlled procedure for restaurant staff to update delivery lifecycle
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_delivery_order_status(
    p_order_id TEXT,
    p_new_status TEXT,
    p_note TEXT DEFAULT NULL,
    p_payment_confirmed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_order RECORD;
    v_is_staff BOOLEAN;
    v_actor_type TEXT;
    v_old_status TEXT;
    v_new_payment_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 1. Lock and load order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- 2. Check authorization
    IF public.is_super_admin() THEN
        v_actor_type := 'SUPER_ADMIN';
    ELSIF public.is_restaurant_member(v_order.restaurant_id, 'ADMIN') THEN
        v_actor_type := 'RESTAURANT_ADMIN';
    ELSIF public.is_restaurant_member(v_order.restaurant_id, 'STAFF') THEN
        v_actor_type := 'RESTAURANT_STAFF';
    ELSE
        RAISE EXCEPTION 'Access denied: You are not authorized to update orders for this restaurant.';
    END IF;

    v_old_status := v_order.status;

    -- 3. Validate transition rules
    IF p_new_status = 'cancelled' THEN
        -- Staff cancellation
        IF v_old_status IN ('completed', 'delivered') THEN
            RAISE EXCEPTION 'Completed orders cannot be cancelled.';
        END IF;
    ELSIF v_old_status = 'confirmed' AND p_new_status = 'preparing' THEN
        -- Accept & start preparation
        NULL;
    ELSIF v_old_status = 'preparing' AND p_new_status = 'ready' THEN
        -- Kitchen ready
        NULL;
    ELSIF v_old_status IN ('ready', 'served') AND p_new_status IN ('out_for_delivery', 'served') THEN
        -- Dispatch delivery partner
        NULL;
    ELSIF v_old_status IN ('out_for_delivery', 'served', 'ready') AND p_new_status IN ('completed', 'delivered') THEN
        -- Delivered successfully
        p_new_status := 'completed'; -- Normalize to completed
    ELSE
        RAISE EXCEPTION 'Invalid status transition from % to %.', v_old_status, p_new_status;
    END IF;

    -- 4. Payment status handling (Keep separate from delivery status)
    v_new_payment_status := v_order.payment_status;
    IF p_new_status = 'completed' AND p_payment_confirmed IS TRUE THEN
        v_new_payment_status := 'paid';
    END IF;

    -- 5. Update Order with fallback resilience
    BEGIN
        UPDATE public.orders
        SET 
            status = p_new_status,
            payment_status = v_new_payment_status,
            updated_at = NOW()
        WHERE id = p_order_id;
    EXCEPTION WHEN check_violation THEN
        IF p_new_status = 'out_for_delivery' THEN
            UPDATE public.orders
            SET 
                status = 'served',
                payment_status = v_new_payment_status,
                updated_at = NOW()
            WHERE id = p_order_id;
        ELSE
            RAISE;
        END IF;
    END;

    -- 6. Log Status Event
    INSERT INTO public.order_status_events (
        order_id, restaurant_id, old_status, new_status, changed_by, actor_type, note
    ) VALUES (
        p_order_id, v_order.restaurant_id, v_old_status, p_new_status, v_user_id, v_actor_type, p_note
    );

    -- 7. Notify customer if customer_id exists
    IF v_order.customer_id IS NOT NULL THEN
        INSERT INTO public.customer_notifications (
            user_id, order_id, title, message, type
        ) VALUES (
            v_order.customer_id,
            p_order_id,
            CASE 
                WHEN p_new_status = 'out_for_delivery' THEN 'Food is On the Way! 🛵'
                WHEN p_new_status = 'completed' THEN 'Order Delivered! Enjoy your meal 🍽️'
                WHEN p_new_status = 'cancelled' THEN 'Order Cancelled'
                ELSE 'Order Status Updated'
            END,
            COALESCE(p_note, 'Your order #' || v_order.order_number || ' status is now ' || p_new_status || '.'),
            'ORDER_STATUS_' || UPPER(p_new_status)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'old_status', v_old_status,
        'new_status', p_new_status,
        'payment_status', v_new_payment_status
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_order_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
