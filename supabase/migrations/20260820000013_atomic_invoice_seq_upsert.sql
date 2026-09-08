-- MIGRATION 20260820000013: ATOMIC INVOICE SEQUENCE UPSERT & RESILIENCE
-- Ensures restaurant_settings row is safely upserted if missing prior to sequence generation
-- Eliminates repeated INV-YYYY-00001 or missing settings errors under concurrent execution

-- 1. Shared Atomic Order Number Generator RPC
CREATE OR REPLACE FUNCTION public.get_next_order_number(p_restaurant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_invoice_prefix TEXT;
    v_assigned_seq INTEGER;
    v_cur_year TEXT;
    v_is_authorized BOOLEAN;
BEGIN
    -- Authorization Check: Only service_role, SUPER_ADMIN, or restaurant STAFF/ADMIN can call
    v_is_authorized := (auth.jwt() ->> 'role' = 'service_role' OR auth.role() = 'service_role')
                       OR public.is_super_admin()
                       OR public.is_restaurant_member(p_restaurant_id, 'STAFF');

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: You are not authorized to generate order numbers for restaurant %.', p_restaurant_id;
    END IF;

    -- Ensure restaurant_settings exists (Upsert / initialize if missing)
    INSERT INTO public.restaurant_settings (restaurant_id, invoice_prefix, next_order_seq, created_at, updated_at)
    VALUES (p_restaurant_id, 'INV-', 1, NOW(), NOW())
    ON CONFLICT (restaurant_id) DO NOTHING;

    -- Lock row and read current NEXT AVAILABLE sequence
    SELECT COALESCE(invoice_prefix, 'INV-'), COALESCE(next_order_seq, 1)
    INTO v_invoice_prefix, v_assigned_seq
    FROM public.restaurant_settings
    WHERE restaurant_id = p_restaurant_id
    FOR UPDATE;

    -- Increment counter for the subsequent order
    UPDATE public.restaurant_settings
    SET next_order_seq = v_assigned_seq + 1,
        updated_at = NOW()
    WHERE restaurant_id = p_restaurant_id;

    v_cur_year := to_char(NOW(), 'YYYY');

    -- Returns exact assigned sequence (e.g. 1 when next_order_seq was 1, now advanced to 2)
    RETURN v_invoice_prefix || v_cur_year || '-' || LPAD(v_assigned_seq::TEXT, GREATEST(5, length(v_assigned_seq::TEXT)), '0');
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_order_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_next_order_number(UUID) TO authenticated, service_role;
