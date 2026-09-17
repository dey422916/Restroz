-- ==============================================================================
-- RESTROZ FORWARD MIGRATION: FIX DAY REGISTER REMINDER & SCHEMA PARITY
-- File: 20260918000001_fix_day_register_reminder_opened_at.sql
-- Description:
--   1. Ensures register is KEPT OPEN after midnight for 15-minute reminders.
--   2. Unschedules auto-close cron job so registers are never closed automatically.
--   3. Removes all dependency on nonexistent columns (register_date, opening_cash_float, actual_cash_counted, cash_difference).
--   4. Calculates local business date using (opened_at AT TIME ZONE restaurant_tz)::DATE.
--   5. Corrects GET DIAGNOSTICS ROW_COUNT variable type to INTEGER in check_and_send_register_reminders.
--   6. Restricts push tokens strictly to active ADMIN / STAFF roles in restaurant_members.
--   7. Replaces:
--      - public.get_overdue_register_reminder(UUID)
--      - public.check_and_send_register_reminders(UUID)
--      - public.auto_close_overdue_day_registers(UUID, BOOLEAN)
-- ==============================================================================

-- 1. Unschedule any auto-close cron job so open registers remain open past midnight for reminders
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.unschedule('auto-close-day-registers');
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Replace get_overdue_register_reminder (RPC for Web Modal & Mobile Poll)
CREATE OR REPLACE FUNCTION public.get_overdue_register_reminder(
    p_restaurant_id UUID
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
    v_reg_local_date DATE;
    v_slot_min INT;
    v_slot_key TEXT;
    v_title TEXT := 'Register Still Open';
    v_msg TEXT := 'Yesterday''s register is still open. Please close the register to complete the business day.';
BEGIN
    -- Verify restaurant exists and has an open register with non-null opened_at
    SELECT dr.id, dr.restaurant_id, dr.opened_at, r.timezone
    INTO r_reg
    FROM public.day_registers dr
    JOIN public.restaurants r ON r.id = dr.restaurant_id
    WHERE dr.restaurant_id = p_restaurant_id
      AND dr.status = 'open'
      AND dr.opened_at IS NOT NULL
    ORDER BY dr.opened_at ASC
    LIMIT 1;

    IF r_reg.id IS NULL THEN
        RETURN jsonb_build_object('is_overdue', false);
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(r_reg.timezone), ''), 'Asia/Kolkata');
    v_local_now := (NOW() AT TIME ZONE v_tz);
    v_local_date := v_local_now::DATE;
    v_reg_local_date := ((r_reg.opened_at AT TIME ZONE v_tz))::DATE;

    -- Overdue check: open register opened on a previous calendar day in the restaurant's local timezone
    IF v_reg_local_date < v_local_date THEN
        v_slot_min := (FLOOR(EXTRACT(MINUTE FROM v_local_now) / 15) * 15)::INT;
        v_slot_key := TO_CHAR(v_local_now, 'YYYY-MM-DD_HH24:') || LPAD(v_slot_min::TEXT, 2, '0');

        RETURN jsonb_build_object(
            'is_overdue', true,
            'register_id', r_reg.id,
            'restaurant_id', r_reg.restaurant_id,
            'opened_at', r_reg.opened_at,
            'register_date', v_reg_local_date::TEXT,
            'current_local_time', TO_CHAR(v_local_now, 'YYYY-MM-DD"T"HH24:MI:SS'),
            'slot_key', v_slot_key,
            'title', v_title,
            'message', v_msg
        );
    END IF;

    RETURN jsonb_build_object('is_overdue', false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_overdue_register_reminder(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_overdue_register_reminder(UUID) TO authenticated, service_role;

-- 3. Replace check_and_send_register_reminders (RPC for Edge Function / Scheduled Push Dispatch)
CREATE OR REPLACE FUNCTION public.check_and_send_register_reminders(
    p_restaurant_id UUID DEFAULT NULL
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
    v_reg_local_date DATE;
    v_slot_min INT;
    v_slot_key TEXT;
    v_title TEXT := 'Register Still Open';
    v_msg TEXT := 'Yesterday''s register is still open. Please close the register to complete the business day.';
    v_tokens TEXT[];
    v_token_count INT;
    v_reminders_sent JSONB := '[]'::JSONB;
    v_rows_inserted INTEGER := 0;
BEGIN
    FOR r_reg IN
        SELECT dr.id AS register_id, dr.restaurant_id, dr.opened_at, r.name AS rest_name, r.timezone
        FROM public.day_registers dr
        JOIN public.restaurants r ON r.id = dr.restaurant_id
        WHERE dr.status = 'open'
          AND dr.opened_at IS NOT NULL
          AND (p_restaurant_id IS NULL OR dr.restaurant_id = p_restaurant_id)
        ORDER BY dr.opened_at ASC
    LOOP
        v_tz := COALESCE(NULLIF(TRIM(r_reg.timezone), ''), 'Asia/Kolkata');
        v_local_now := (NOW() AT TIME ZONE v_tz);
        v_local_date := v_local_now::DATE;
        v_reg_local_date := ((r_reg.opened_at AT TIME ZONE v_tz))::DATE;

        -- Check if register is overdue (opened on a past calendar day in restaurant timezone)
        IF v_reg_local_date < v_local_date THEN
            v_slot_min := (FLOOR(EXTRACT(MINUTE FROM v_local_now) / 15) * 15)::INT;
            v_slot_key := TO_CHAR(v_local_now, 'YYYY-MM-DD_HH24:') || LPAD(v_slot_min::TEXT, 2, '0');

            -- Collect active ADMIN and STAFF push tokens only for this restaurant
            SELECT ARRAY_AGG(DISTINCT spt.push_token)
            INTO v_tokens
            FROM public.staff_push_tokens spt
            JOIN public.restaurant_members rm ON rm.user_id = spt.user_id AND rm.restaurant_id = spt.restaurant_id
            WHERE spt.restaurant_id = r_reg.restaurant_id
              AND rm.is_active = TRUE
              AND rm.role IN ('ADMIN', 'STAFF');

            v_token_count := COALESCE(ARRAY_LENGTH(v_tokens, 1), 0);

            -- Attempt atomic insert into register_reminder_logs with ON CONFLICT DO NOTHING for duplicate protection
            INSERT INTO public.register_reminder_logs (
                restaurant_id,
                register_id,
                slot_key,
                reminder_title,
                reminder_message,
                tokens_notified_count,
                created_at
            ) VALUES (
                r_reg.restaurant_id,
                r_reg.register_id,
                v_slot_key,
                v_title,
                v_msg,
                v_token_count,
                NOW()
            )
            ON CONFLICT (restaurant_id, register_id, slot_key) DO NOTHING;

            GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

            -- If this slot had not been notified yet, return reminder job payload to the Edge Function:
            IF v_rows_inserted > 0 THEN
                v_reminders_sent := v_reminders_sent || jsonb_build_object(
                    'restaurant_id', r_reg.restaurant_id,
                    'restaurant_name', r_reg.rest_name,
                    'register_id', r_reg.register_id,
                    'opened_at', r_reg.opened_at,
                    'register_date', v_reg_local_date::TEXT,
                    'slot_key', v_slot_key,
                    'tokens_count', v_token_count,
                    'push_tokens', COALESCE(to_jsonb(v_tokens), '[]'::JSONB),
                    'title', v_title,
                    'message', v_msg
                );
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reminders_dispatched_count', jsonb_array_length(v_reminders_sent),
        'reminders', v_reminders_sent
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_send_register_reminders(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_send_register_reminders(UUID) TO authenticated, service_role;

-- 4. Replace auto_close_overdue_day_registers (Clean schema parity without active cron trigger)
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
    v_reg_local_date DATE;
    v_closing_ts TIMESTAMPTZ;
    v_is_overdue BOOLEAN;
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
          AND dr.opened_at IS NOT NULL
          AND (p_restaurant_id IS NULL OR dr.restaurant_id = p_restaurant_id)
        ORDER BY dr.opened_at ASC
    LOOP
        v_tz := COALESCE(NULLIF(TRIM(r_reg.rest_timezone), ''), 'Asia/Kolkata');
        v_local_now := (NOW() AT TIME ZONE v_tz);
        v_local_date := v_local_now::DATE;
        v_reg_local_date := ((r_reg.opened_at AT TIME ZONE v_tz))::DATE;

        -- Overdue if the register opened on a date strictly before the restaurant's current local date, or if forced
        v_is_overdue := (v_reg_local_date < v_local_date) OR (p_force IS TRUE);

        IF v_is_overdue THEN
            -- Row-level lock to prevent concurrent race conditions
            SELECT id INTO v_locked_id
            FROM public.day_registers
            WHERE id = r_reg.id AND status = 'open'
            FOR UPDATE SKIP LOCKED;

            IF v_locked_id IS NOT NULL THEN
                -- Compute precise closing timestamp at 11:59:59 PM local time of the register date
                IF v_reg_local_date < v_local_date THEN
                    v_closing_ts := ((v_reg_local_date::TEXT || ' 23:59:59')::TIMESTAMP AT TIME ZONE v_tz);
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
                v_expected_cash := COALESCE(r_reg.opening_cash, 0.0) + v_cash_sales;

                -- Perform register close and store Z-report numbers using verified schema columns
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
                    difference = 0.00,
                    closed_at = v_closing_ts,
                    closed_by = 'SYSTEM_MANUAL_OR_RPC',
                    notes = CASE 
                        WHEN notes IS NULL OR notes = '' THEN '[SYSTEM_CLOSE] Closed at 11:59:59 PM (' || v_tz || ')'
                        ELSE notes || ' | [SYSTEM_CLOSE] Closed at 11:59:59 PM (' || v_tz || ')'
                    END,
                    updated_at = NOW()
                WHERE id = r_reg.id;

                v_closed_list := v_closed_list || jsonb_build_object(
                    'register_id', r_reg.id,
                    'restaurant_id', r_reg.restaurant_id,
                    'register_date', v_reg_local_date::TEXT,
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
