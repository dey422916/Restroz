-- ============================================================================
-- MIGRATION 20260820000009: FIX ORDER VALIDATION TRIGGER FOR DELIVERY & UPDATES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_order_tenant_and_table()
RETURNS TRIGGER 
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    target_rest_status TEXT;
    target_table_rest UUID;
    target_table_active BOOLEAN;
    active_unsettled_order_id TEXT;
    is_staff_member BOOLEAN;
BEGIN
    -- 1. Validate Restaurant Exists and is ACTIVE
    SELECT status INTO target_rest_status
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    IF target_rest_status IS NULL THEN
        RAISE EXCEPTION 'Invalid restaurant_id: Restaurant does not exist.';
    END IF;

    IF target_rest_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Restaurant is currently inactive or suspended.';
    END IF;

    is_staff_member := public.is_restaurant_member(NEW.restaurant_id, 'STAFF') OR public.is_super_admin();

    -- 2. Validate Anonymous Guest Creation Requirements (Only on INSERT for unauthenticated guest orders without customer_id)
    IF (TG_OP = 'INSERT' AND auth.uid() IS NULL AND NEW.customer_id IS NULL AND NOT is_staff_member) THEN
        IF (NEW.table_id IS NULL) THEN
            RAISE EXCEPTION 'Anonymous guest orders must specify an active dining table.';
        END IF;
        IF (NEW.order_type <> 'dine_in') THEN
            RAISE EXCEPTION 'Anonymous guest orders are restricted to dine-in QR orders only.';
        END IF;
    END IF;

    -- 3. Validate Table with FOR UPDATE Lock to prevent concurrent double-booking (only if table_id is set)
    IF (NEW.table_id IS NOT NULL) THEN
        SELECT restaurant_id, is_active INTO target_table_rest, target_table_active
        FROM public.tables
        WHERE id = NEW.table_id
        FOR UPDATE;

        IF target_table_rest IS NULL THEN
            RAISE EXCEPTION 'Invalid table_id: Table does not exist.';
        END IF;

        IF target_table_rest <> NEW.restaurant_id THEN
            RAISE EXCEPTION 'Tenant violation: Table (%) belongs to restaurant %, but order is for restaurant %.',
                NEW.table_id, target_table_rest, NEW.restaurant_id;
        END IF;

        IF target_table_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Table % is currently inactive.', NEW.table_id;
        END IF;

        -- 4. One-active-unsettled-order-per-table rule for new orders
        IF (TG_OP = 'INSERT') THEN
            SELECT id INTO active_unsettled_order_id
            FROM public.orders
            WHERE restaurant_id = NEW.restaurant_id
              AND table_id = NEW.table_id
              AND status NOT IN ('completed', 'cancelled')
              AND payment_status <> 'paid'
            LIMIT 1;

            IF active_unsettled_order_id IS NOT NULL THEN
                RAISE EXCEPTION 'Table % already has an active unsettled order (%).',
                    NEW.table_id, active_unsettled_order_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_tenant_and_table ON public.orders;
CREATE TRIGGER trg_validate_order_tenant_and_table
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_tenant_and_table();
