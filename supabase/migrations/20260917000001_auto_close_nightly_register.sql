-- ==============================================================================
-- RESTROZ MIGRATION: NIGHTLY AUTO REGISTER CLOSE & ORDER REGISTER ASSOCIATION
-- File: 20260917000001_auto_close_nightly_register.sql
-- Description:
--   1. Adds register_id column to public.orders for permanent association with the shift under which it was created.
--   2. Updates validate_order_tenant_and_table trigger to attach register_id on creation and enforce open register for staff orders.
--   3. Creates auto_close_overdue_day_registers RPC to automatically close overdue open registers at 11:59:59 PM restaurant local time.
--   4. Preserves ongoing active/unsettled orders across register close without altering their business date or cancelling them.
--   5. Idempotent execution with pg_cron support.
-- ==============================================================================

-- 1. Add register_id column and index to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS register_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_register_id ON public.orders(register_id);

-- 2. Update validate_order_tenant_and_table trigger
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
    v_open_reg_id TEXT;
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

    -- Authoritative membership verification: Must be active STAFF/ADMIN for THIS restaurant, or SUPER_ADMIN
    is_staff_member := public.is_restaurant_member(NEW.restaurant_id, 'STAFF') OR public.is_super_admin();

    -- 2. Day Register Association and Open Register Enforcement on INSERT
    IF (TG_OP = 'INSERT') THEN
        SELECT id INTO v_open_reg_id
        FROM public.day_registers
        WHERE restaurant_id = NEW.restaurant_id AND status = 'open'
        LIMIT 1;

        IF is_staff_member THEN
            IF v_open_reg_id IS NULL THEN
                RAISE EXCEPTION 'Day register is currently closed for this restaurant. Please open the register before placing new orders.';
            END IF;
            IF NEW.register_id IS NULL THEN
                NEW.register_id := v_open_reg_id;
            END IF;
        ELSE
            IF v_open_reg_id IS NOT NULL AND NEW.register_id IS NULL THEN
                NEW.register_id := v_open_reg_id;
            END IF;
        END IF;
    END IF;

    -- 3. Validate Supplementary Order permissions (Cannot be authorized by boolean alone)
    IF (TG_OP = 'INSERT' AND NEW.is_supplementary IS TRUE) THEN
        IF NOT is_staff_member THEN
            RAISE EXCEPTION 'Only authorized restaurant staff can create supplementary orders.';
        END IF;
    END IF;

    -- 4. Validate Anonymous Guest Creation Requirements (Only on INSERT for unauthenticated guest orders without customer_id)
    IF (TG_OP = 'INSERT' AND auth.uid() IS NULL AND NEW.customer_id IS NULL AND NOT is_staff_member) THEN
        IF (NEW.table_id IS NULL) THEN
            RAISE EXCEPTION 'Anonymous guest orders must specify an active dining table.';
        END IF;
        IF (NEW.order_type <> 'dine_in') THEN
            RAISE EXCEPTION 'Anonymous guest orders are restricted to dine-in QR orders only.';
        END IF;
    END IF;

    -- 5. Validate Table with FOR UPDATE Lock to prevent concurrent double-booking (only if table_id is set)
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

        -- 6. Table Occupancy Check for new orders
        IF (TG_OP = 'INSERT') THEN
            IF NOT is_staff_member THEN
                -- Customers / Anon guests are NEVER allowed to place an order on an occupied table
                SELECT id INTO active_unsettled_order_id
                FROM public.orders
                WHERE restaurant_id = NEW.restaurant_id
                  AND table_id = NEW.table_id
                  AND status NOT IN ('completed', 'cancelled')
                  AND COALESCE(payment_status, 'unpaid') <> 'paid'
                LIMIT 1;

                IF active_unsettled_order_id IS NOT NULL THEN
                    RAISE EXCEPTION 'This table currently has an active order. New Digital QR orders are not allowed while the table is occupied.';
                END IF;
            ELSIF (NEW.is_supplementary IS NOT TRUE) THEN
                -- If staff is inserting a regular (non-supplementary) order, check if table is occupied
                SELECT id INTO active_unsettled_order_id
                FROM public.orders
                WHERE restaurant_id = NEW.restaurant_id
                  AND table_id = NEW.table_id
                  AND status NOT IN ('completed', 'cancelled')
                  AND COALESCE(payment_status, 'unpaid') <> 'paid'
                LIMIT 1;

                IF active_unsettled_order_id IS NOT NULL THEN
                    RAISE EXCEPTION 'Table % already has an active unsettled order (%). Please use Supplementary Order or manage the existing order.',
                        NEW.table_id, active_unsettled_order_id;
                END IF;
            END IF;
            -- If is_staff_member AND NEW.is_supplementary IS TRUE, it is explicitly allowed!
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_tenant_and_table ON public.orders;
CREATE TRIGGER trg_validate_order_tenant_and_table
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_tenant_and_table();

-- 3. Automatic Nightly Register Close RPC Function
DROP FUNCTION IF EXISTS public.auto_close_overdue_day_registers(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.auto_close_overdue_day_registers(
    p_restaurant_id UUID DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    r_reg RECORD;
    v_tz TEXT;
    v_local_now TIMESTAMP;
    v_local_date DATE;
    v_is_overdue BOOLEAN;
    v_closing_ts TIMESTAMPTZ;
    v_locked_id TEXT;
    v_cash_sales NUMERIC(10,2) := 0.0;
    v_upi_sales NUMERIC(10,2) := 0.0;
    v_card_sales NUMERIC(10,2) := 0.0;
    v_other_sales NUMERIC(10,2) := 0.0;
    v_total_sales NUMERIC(10,2) := 0.0;
    v_total_tax NUMERIC(10,2) := 0.0;
    v_total_discount NUMERIC(10,2) := 0.0;
    v_total_orders INTEGER := 0;
    v_expected_cash NUMERIC(10,2) := 0.0;
    v_closed_list JSONB := '[]'::JSONB;
BEGIN
    FOR r_reg IN
        SELECT dr.*, r.timezone AS rest_timezone
        FROM public.day_registers dr
        JOIN public.restaurants r ON r.id = dr.restaurant_id
        WHERE dr.status = 'open'
          AND (p_restaurant_id IS NULL OR dr.restaurant_id = p_restaurant_id)
        ORDER BY dr.opened_at ASC
    LOOP
        v_tz := COALESCE(NULLIF(TRIM(r_reg.rest_timezone), ''), 'Asia/Kolkata');
        v_local_now := (NOW() AT TIME ZONE v_tz);
        v_local_date := v_local_now::DATE;

        -- Overdue if the register date is strictly before the restaurant's current local calendar date, or if forced
        v_is_overdue := (r_reg.register_date < v_local_date) OR (p_force IS TRUE);

        IF v_is_overdue THEN
            -- Row-level lock to prevent concurrent race conditions
            SELECT id INTO v_locked_id
            FROM public.day_registers
            WHERE id = r_reg.id AND status = 'open'
            FOR UPDATE SKIP LOCKED;

            IF v_locked_id IS NOT NULL THEN
                -- Compute precise closing timestamp at 11:59:59 PM local time of the register date
                IF r_reg.register_date < v_local_date THEN
                    v_closing_ts := ((r_reg.register_date || ' 23:59:59')::TIMESTAMP AT TIME ZONE v_tz);
                ELSE
                    v_closing_ts := NOW();
                END IF;

                -- Backfill register_id on any orders created during this shift that missed register_id
                UPDATE public.orders
                SET register_id = r_reg.id
                WHERE restaurant_id = r_reg.restaurant_id
                  AND register_id IS NULL
                  AND created_at >= r_reg.opened_at
                  AND created_at <= v_closing_ts;

                -- Calculate Z-Report reconciliation metrics from shift orders (excluding cancelled)
                SELECT 
                    COALESCE(COUNT(*), 0),
                    COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0),
                    COALESCE(SUM(discount_amount + coupon_discount), 0),
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' AND (payment_method = 'cash' OR payment_method IS NULL) THEN payable_amount ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' AND payment_method IN ('upi', 'online') THEN payable_amount ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' AND payment_method = 'card' THEN payable_amount ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN payment_status = 'paid' AND payment_method NOT IN ('cash', 'upi', 'online', 'card') AND payment_method IS NOT NULL THEN payable_amount ELSE 0 END), 0)
                INTO
                    v_total_orders,
                    v_total_tax,
                    v_total_discount,
                    v_cash_sales,
                    v_upi_sales,
                    v_card_sales,
                    v_other_sales
                FROM public.orders
                WHERE (register_id = r_reg.id OR (register_id IS NULL AND restaurant_id = r_reg.restaurant_id AND created_at >= r_reg.opened_at AND created_at <= v_closing_ts))
                  AND status <> 'cancelled';

                v_total_sales := v_cash_sales + v_upi_sales + v_card_sales + v_other_sales;
                v_expected_cash := COALESCE(r_reg.opening_cash_float, r_reg.opening_cash, 0.0) + v_cash_sales;

                -- Perform register close and store Z-report numbers
                UPDATE public.day_registers
                SET status = 'closed',
                    cash_sales = v_cash_sales,
                    upi_sales = v_upi_sales,
                    card_sales = v_card_sales,
                    other_sales = v_other_sales,
                    total_sales = v_total_sales,
                    total_tax = v_total_tax,
                    total_discount = v_total_discount,
                    total_orders = v_total_orders,
                    expected_cash = v_expected_cash,
                    actual_cash = v_expected_cash,
                    actual_cash_counted = v_expected_cash,
                    difference = 0.00,
                    cash_difference = 0.00,
                    closed_at = v_closing_ts,
                    closed_by = 'SYSTEM_AUTO_CLOSE',
                    notes = CASE 
                        WHEN notes IS NULL OR notes = '' THEN '[AUTO_CLOSE] Automatically closed at 11:59:59 PM (' || v_tz || ')'
                        ELSE notes || ' | [AUTO_CLOSE] Automatically closed at 11:59:59 PM (' || v_tz || ')'
                    END,
                    updated_at = NOW()
                WHERE id = r_reg.id;

                v_closed_list := v_closed_list || jsonb_build_object(
                    'register_id', r_reg.id,
                    'restaurant_id', r_reg.restaurant_id,
                    'register_date', r_reg.register_date,
                    'timezone', v_tz,
                    'closed_at', v_closing_ts,
                    'total_sales', v_total_sales,
                    'total_orders', v_total_orders,
                    'expected_cash', v_expected_cash
                );
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'closed_count', jsonb_array_length(v_closed_list),
        'closed_registers', v_closed_list
    );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_overdue_day_registers(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_close_overdue_day_registers(UUID, BOOLEAN) TO anon, authenticated, service_role;

-- 4. Enable pg_cron schedule if extension exists in Supabase environment
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.unschedule('auto-close-day-registers');
        PERFORM cron.schedule('auto-close-day-registers', '*/5 * * * *', 'SELECT public.auto_close_overdue_day_registers()');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
