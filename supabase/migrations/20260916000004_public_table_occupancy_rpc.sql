-- ==============================================================================
-- RESTROZ MIGRATION: PUBLIC TABLE OCCUPANCY RPC & DYNAMIC STATUS RESOLUTION
-- File: 20260916000004_public_table_occupancy_rpc.sql
-- Description:
--   1. Drops old resolve_qr_table(TEXT) signature before recreating to resolve PostgreSQL 42P13 return-type mismatch.
--   2. Creates get_public_table_occupancy(UUID, TEXT) RPC for safe unauthenticated occupancy checks.
--   3. Recreates resolve_qr_table(TEXT) to dynamically compute occupancy and return accurate status without exposing orders table to anon.
--   4. Strictly enforces privacy: No order IDs, customer details, financial totals, or notes are returned.
-- ==============================================================================

-- 1. Create get_public_table_occupancy RPC
DROP FUNCTION IF EXISTS public.get_public_table_occupancy(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_public_table_occupancy(
    p_restaurant_id UUID,
    p_table_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_active_count INTEGER := 0;
    v_is_occupied BOOLEAN := FALSE;
BEGIN
    -- Canonical occupancy check: status not in ('completed', 'cancelled') AND COALESCE(payment_status, 'unpaid') <> 'paid'
    SELECT COUNT(*)
    INTO v_active_count
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND table_id = p_table_id
      AND status NOT IN ('completed', 'cancelled')
      AND COALESCE(payment_status, 'unpaid') <> 'paid';

    v_is_occupied := (v_active_count > 0);

    RETURN jsonb_build_object(
        'table_id', p_table_id,
        'occupied', v_is_occupied,
        'active_order_count', v_active_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_table_occupancy(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_table_occupancy(UUID, TEXT) TO anon, authenticated, service_role;

-- 2. Drop existing resolve_qr_table function to allow changing return type from TABLE(...) to JSONB
DROP FUNCTION IF EXISTS public.resolve_qr_table(TEXT);

-- 3. Recreate resolve_qr_table to dynamically calculate table status based on active orders
CREATE OR REPLACE FUNCTION public.resolve_qr_table(p_identifier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_table RECORD;
    v_active_count INTEGER := 0;
    v_dynamic_status TEXT;
BEGIN
    -- Strict Resolution: Matches ONLY the opaque qr_code_hash or specific table UUID/ID
    SELECT t.id, t.restaurant_id, t.table_number, t.seating_capacity, t.section, t.is_active, t.status, r.name as restaurant_name, r.slug as restaurant_slug
    INTO v_table
    FROM public.tables t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    WHERE (t.qr_code_hash = p_identifier OR t.id = p_identifier OR t.table_number = p_identifier)
      AND t.is_active = TRUE
      AND r.status = 'ACTIVE'
    LIMIT 1;

    IF v_table.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Dynamic occupancy computation using canonical definition
    SELECT COUNT(*) INTO v_active_count
    FROM public.orders
    WHERE restaurant_id = v_table.restaurant_id
      AND table_id = v_table.id
      AND status NOT IN ('completed', 'cancelled')
      AND COALESCE(payment_status, 'unpaid') <> 'paid';

    IF v_active_count > 0 THEN
        v_dynamic_status := 'occupied';
    ELSIF v_table.status = 'reserved' THEN
        v_dynamic_status := 'reserved';
    ELSE
        v_dynamic_status := 'available';
    END IF;

    -- Return only customer-facing safe metadata
    RETURN jsonb_build_object(
        'id', v_table.id,
        'table_id', v_table.id,
        'restaurant_id', v_table.restaurant_id,
        'table_number', v_table.table_number,
        'seating_capacity', v_table.seating_capacity,
        'section', v_table.section,
        'is_active', v_table.is_active,
        'status', v_dynamic_status,
        'table_status', v_dynamic_status,
        'occupied', (v_active_count > 0),
        'active_order_count', v_active_count,
        'restaurant_name', v_table.restaurant_name,
        'restaurant_slug', v_table.restaurant_slug
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_qr_table(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_qr_table(TEXT) TO anon, authenticated, service_role;
