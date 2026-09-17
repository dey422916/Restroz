-- ==============================================================================
-- RESTROZ MIGRATION: DAILY REGISTER CLOSE REMINDERS & PUSH NOTIFICATIONS
-- File: 20260917000002_day_register_close_reminders.sql
-- Description:
--   1. Creates staff_push_tokens table to securely register mobile/web push tokens per restaurant staff.
--   2. Creates register_reminder_logs table to record 15-minute reminder slots and prevent duplicate notifications.
--   3. Implements get_overdue_register_reminder RPC for instant web & mobile reminder status.
--   4. Implements check_and_send_register_reminders RPC to prepare reminder jobs for the Supabase Edge Function.
--   5. Implements remove_invalid_push_tokens RPC to prune dead/unregistered device tokens.
--   6. Configures pg_cron job to invoke reminder processing every 5 minutes.
-- ==============================================================================

-- 1. Create staff_push_tokens table for push notifications
CREATE TABLE IF NOT EXISTS public.staff_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('ios', 'android', 'web', 'mobile')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_staff_push_tokens_user_rest_token UNIQUE (user_id, restaurant_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_staff_push_tokens_rest_user ON public.staff_push_tokens(restaurant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_staff_push_tokens_token ON public.staff_push_tokens(push_token);

ALTER TABLE public.staff_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff members can view their own tokens" ON public.staff_push_tokens;
CREATE POLICY "Staff members can view their own tokens"
    ON public.staff_push_tokens
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() 
        OR public.is_super_admin()
        OR public.is_restaurant_member(restaurant_id, 'ADMIN')
    );

DROP POLICY IF EXISTS "Staff members can insert their own tokens" ON public.staff_push_tokens;
CREATE POLICY "Staff members can insert their own tokens"
    ON public.staff_push_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() 
        AND (public.is_restaurant_member(restaurant_id, 'STAFF') OR public.is_super_admin())
    );

DROP POLICY IF EXISTS "Staff members can delete their own tokens" ON public.staff_push_tokens;
CREATE POLICY "Staff members can delete their own tokens"
    ON public.staff_push_tokens
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid() 
        OR public.is_super_admin()
        OR public.is_restaurant_member(restaurant_id, 'ADMIN')
    );

-- 2. Create register_reminder_logs table for slot duplicate protection
CREATE TABLE IF NOT EXISTS public.register_reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    register_id TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    reminder_title TEXT NOT NULL DEFAULT 'Register Still Open',
    reminder_message TEXT NOT NULL DEFAULT 'Yesterday''s register is still open. Please close the register to complete the business day.',
    tokens_notified_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_register_reminder_slot UNIQUE (restaurant_id, register_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_register_reminder_logs_lookup 
    ON public.register_reminder_logs(restaurant_id, register_id, slot_key);

ALTER TABLE public.register_reminder_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read reminder logs for their restaurant" ON public.register_reminder_logs;
CREATE POLICY "Staff can read reminder logs for their restaurant"
    ON public.register_reminder_logs
    FOR SELECT
    TO authenticated
    USING (
        public.is_restaurant_member(restaurant_id, 'STAFF') 
        OR public.is_super_admin()
    );

-- 3. RPC: Register / Upsert Staff Push Token
DROP FUNCTION IF EXISTS public.register_staff_push_token(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_staff_push_token(
    p_restaurant_id UUID,
    p_push_token TEXT,
    p_platform TEXT DEFAULT 'android'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_norm_token TEXT := TRIM(p_push_token);
    v_norm_platform TEXT := LOWER(TRIM(COALESCE(p_platform, 'android')));
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required to register push token.';
    END IF;

    IF v_norm_token IS NULL OR v_norm_token = '' THEN
        RAISE EXCEPTION 'Push token cannot be empty.';
    END IF;

    -- Verify caller is STAFF or ADMIN for this restaurant
    IF NOT (public.is_restaurant_member(p_restaurant_id, 'STAFF') OR public.is_super_admin()) THEN
        RAISE EXCEPTION 'Access denied: You are not an authorized staff member of this restaurant.';
    END IF;

    IF v_norm_platform NOT IN ('ios', 'android', 'web', 'mobile') THEN
        v_norm_platform := 'android';
    END IF;

    INSERT INTO public.staff_push_tokens (
        restaurant_id,
        user_id,
        push_token,
        platform,
        updated_at
    ) VALUES (
        p_restaurant_id,
        v_uid,
        v_norm_token,
        v_norm_platform,
        NOW()
    )
    ON CONFLICT (user_id, restaurant_id, push_token)
    DO UPDATE SET
        platform = EXCLUDED.platform,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'restaurant_id', p_restaurant_id,
        'push_token', v_norm_token,
        'platform', v_norm_platform
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_staff_push_token(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_staff_push_token(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 4. RPC: Unregister Push Token
DROP FUNCTION IF EXISTS public.unregister_staff_push_token(TEXT);

CREATE OR REPLACE FUNCTION public.unregister_staff_push_token(
    p_push_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
    END IF;

    DELETE FROM public.staff_push_tokens
    WHERE user_id = v_uid AND push_token = TRIM(p_push_token);

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_staff_push_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unregister_staff_push_token(TEXT) TO authenticated, service_role;

-- 5. RPC: Remove Invalid Push Tokens (called by Edge Function on DeviceNotRegistered)
DROP FUNCTION IF EXISTS public.remove_invalid_push_tokens(TEXT[]);

CREATE OR REPLACE FUNCTION public.remove_invalid_push_tokens(
    p_tokens TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    IF p_tokens IS NULL OR ARRAY_LENGTH(p_tokens, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'deleted_count', 0);
    END IF;

    DELETE FROM public.staff_push_tokens
    WHERE push_token = ANY(p_tokens);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_invalid_push_tokens(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_invalid_push_tokens(TEXT[]) TO authenticated, service_role;

-- 6. RPC: Get Overdue Register Reminder Status for Web & Mobile UI
DROP FUNCTION IF EXISTS public.get_overdue_register_reminder(UUID);

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
    v_slot_min INT;
    v_slot_key TEXT;
    v_title TEXT := 'Register Still Open';
    v_msg TEXT := 'Yesterday''s register is still open. Please close the register to complete the business day.';
BEGIN
    -- Verify restaurant exists and has an open register
    SELECT dr.id, dr.restaurant_id, dr.register_date, dr.opened_at, r.timezone
    INTO r_reg
    FROM public.day_registers dr
    JOIN public.restaurants r ON r.id = dr.restaurant_id
    WHERE dr.restaurant_id = p_restaurant_id
      AND dr.status = 'open'
    ORDER BY dr.opened_at ASC
    LIMIT 1;

    IF r_reg.id IS NULL THEN
        RETURN jsonb_build_object('is_overdue', false);
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(r_reg.timezone), ''), 'Asia/Kolkata');
    v_local_now := (NOW() AT TIME ZONE v_tz);
    v_local_date := v_local_now::DATE;

    -- Overdue check: open register date belongs to a previous calendar day in the restaurant's local timezone
    IF r_reg.register_date < v_local_date THEN
        v_slot_min := (FLOOR(EXTRACT(MINUTE FROM v_local_now) / 15) * 15)::INT;
        v_slot_key := TO_CHAR(v_local_now, 'YYYY-MM-DD_HH24:') || LPAD(v_slot_min::TEXT, 2, '0');

        RETURN jsonb_build_object(
            'is_overdue', true,
            'register_id', r_reg.id,
            'restaurant_id', r_reg.restaurant_id,
            'register_date', r_reg.register_date::TEXT,
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

-- 7. RPC: Check Overdue Registers & Prepare Reminders (Pure Database Logic for Edge Function / Cron)
DROP FUNCTION IF EXISTS public.check_and_send_register_reminders(UUID);

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
    v_slot_min INT;
    v_slot_key TEXT;
    v_title TEXT := 'Register Still Open';
    v_msg TEXT := 'Yesterday''s register is still open. Please close the register to complete the business day.';
    v_tokens TEXT[];
    v_token_count INT;
    v_reminders_sent JSONB := '[]'::JSONB;
    v_inserted BOOLEAN;
BEGIN
    FOR r_reg IN
        SELECT dr.id AS register_id, dr.restaurant_id, dr.register_date, dr.opened_at, r.name AS rest_name, r.timezone
        FROM public.day_registers dr
        JOIN public.restaurants r ON r.id = dr.restaurant_id
        WHERE dr.status = 'open'
          AND (p_restaurant_id IS NULL OR dr.restaurant_id = p_restaurant_id)
        ORDER BY dr.opened_at ASC
    LOOP
        v_tz := COALESCE(NULLIF(TRIM(r_reg.timezone), ''), 'Asia/Kolkata');
        v_local_now := (NOW() AT TIME ZONE v_tz);
        v_local_date := v_local_now::DATE;

        -- Check if register is overdue (belongs to past calendar day)
        IF r_reg.register_date < v_local_date THEN
            v_slot_min := (FLOOR(EXTRACT(MINUTE FROM v_local_now) / 15) * 15)::INT;
            v_slot_key := TO_CHAR(v_local_now, 'YYYY-MM-DD_HH24:') || LPAD(v_slot_min::TEXT, 2, '0');

            -- Collect active staff push tokens for this restaurant
            SELECT ARRAY_AGG(DISTINCT spt.push_token)
            INTO v_tokens
            FROM public.staff_push_tokens spt
            JOIN public.restaurant_members rm ON rm.user_id = spt.user_id AND rm.restaurant_id = spt.restaurant_id
            WHERE spt.restaurant_id = r_reg.restaurant_id
              AND rm.is_active = TRUE;

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

            GET DIAGNOSTICS v_inserted = ROW_COUNT;

            -- If this slot had not been notified yet, return reminder job payload to the Edge Function:
            IF v_inserted > 0 THEN
                v_reminders_sent := v_reminders_sent || jsonb_build_object(
                    'restaurant_id', r_reg.restaurant_id,
                    'restaurant_name', r_reg.rest_name,
                    'register_id', r_reg.register_id,
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

-- 8. Cron / Scheduled trigger helper
-- Architecture:
--   pg_cron / Supabase Cron (every 5 mins)
--   -> Invokes Edge Function 'send-register-reminders'
--   -> Edge Function calls public.check_and_send_register_reminders() to calculate overdue slots & get tokens
--   -> Edge Function dispatches push notifications to Expo Push API
--
-- Note: When using Supabase Scheduled Functions or pg_net with pg_cron, schedule the Edge Function invocation:
--   PERFORM cron.schedule('send-register-reminders-job', '*/5 * * * *', ...);
-- This ensures check_and_send_register_reminders() is executed atomically alongside the Expo push dispatch.
