-- ============================================================================
-- Migration: 20260919000007_separate_payment_verification_from_settlement.sql
-- Description: 
--   1. Separate Payment Verification from Settlement in mark_order_payment_verified:
--      - Validates auth & permissions (SUPER_ADMIN, restaurant ADMIN, restaurant STAFF, service_role).
--      - Locks target order FOR UPDATE.
--      - Rejects cancelled orders.
--      - Rejects if already verified (payment_verified_at IS NOT NULL) or completed.
--      - Records payment_verified_at = NOW() and payment_verified_by = auth.uid().
--      - Keeps order ACTIVE (does NOT change status to completed, does NOT mark paid).
--      - Does NOT update day_registers totals (sales/orders).
--      - Does NOT release dining table.
--      - Writes PAYMENT_VERIFIED audit log.
--      - Returns updated verification payload.
--   2. Settle Order RPC:
--      - Finalizes pending/verified QR & Online payments upon staff clicking Settle.
--      - Increments day register sales & order count exactly once at Settle.
--      - Transitions order to completed, paid, sets paid_amount.
--      - Releases table safely.
--      - Logs ORDER_SETTLED audit event.
-- ============================================================================

-- 1. DROP & RECREATE mark_order_payment_verified RPC
DROP FUNCTION IF EXISTS public.mark_order_payment_verified(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.mark_order_payment_verified(
    p_order_id TEXT,
    p_restaurant_id UUID DEFAULT NULL::UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
    v_auth_uid UUID := auth.uid();
    v_is_service BOOLEAN;
    v_is_authorized BOOLEAN := FALSE;
    v_order RECORD;
BEGIN
    v_is_service := (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR COALESCE(auth.role(), '') = 'service_role'
        OR current_user = 'postgres'
    );

    -- 1. Authentication Check
    IF NOT v_is_service AND v_auth_uid IS NULL AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Authentication required: User is not logged in.';
    END IF;

    -- 2. Fetch Order FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- 3. Tenant Validation
    IF p_restaurant_id IS NOT NULL AND v_order.restaurant_id != p_restaurant_id THEN
        RAISE EXCEPTION 'Tenant mismatch: Order does not belong to specified restaurant.';
    END IF;

    -- 4. Role-Based Authorization (service_role, SUPER_ADMIN, or restaurant STAFF/ADMIN)
    IF NOT v_is_service THEN
        v_is_authorized := public.is_super_admin()
                           OR public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::TEXT)
                           OR public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::TEXT);
        IF NOT v_is_authorized THEN
            RAISE EXCEPTION 'Permission Denied: Not authorized to verify payment for this restaurant.';
        END IF;
    END IF;

    -- 5. Cancelled Order Guard
    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot verify payment for a cancelled order.';
    END IF;

    -- 6. Idempotency Guard (Double verification check)
    IF v_order.payment_verified_at IS NOT NULL OR (v_order.status = 'completed' AND v_order.payment_status = 'paid') THEN
        RAISE EXCEPTION 'Payment has already been verified.';
    END IF;

    -- 7. Update Order: Record verification metadata ONLY, KEEP STATUS ACTIVE & PAYMENT_STATUS UNPAID/NON-FINAL
    UPDATE public.orders
    SET payment_verified_at = NOW(),
        payment_verified_by = v_auth_uid,
        updated_at = NOW()
    WHERE id = v_order.id;

    -- 8. Write Audit Log
    INSERT INTO public.audit_logs (
        restaurant_id,
        user_id,
        action,
        entity_type,
        entity_id,
        new_values,
        created_at
    ) VALUES (
        v_order.restaurant_id,
        v_auth_uid,
        'PAYMENT_VERIFIED',
        'order',
        v_order.id,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'payment_method', v_order.payment_method,
            'payable_amount', COALESCE(v_order.payable_amount, v_order.grand_total, 0.00),
            'verified_at', NOW()
        ),
        NOW()
    );

    -- 9. Return updated verification state (order status & payment_status unchanged)
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'status', v_order.status,
        'payment_status', v_order.payment_status,
        'already_verified', false,
        'payment_verified_at', NOW(),
        'payment_verified_by', v_auth_uid
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_verified(TEXT, UUID) TO authenticated, service_role;


-- 2. CREATE OR REPLACE settle_order RPC
CREATE OR REPLACE FUNCTION public.settle_order(
  p_order_id text,
  p_payment_method text,
  p_amount numeric,
  p_reference_number text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_discount_type text DEFAULT 'none'::text,
  p_discount_value numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT NULL::numeric,
  p_cgst_amount numeric DEFAULT NULL::numeric,
  p_sgst_amount numeric DEFAULT NULL::numeric,
  p_grand_total numeric DEFAULT NULL::numeric,
  p_round_off numeric DEFAULT NULL::numeric,
  p_payable_amount numeric DEFAULT NULL::numeric,
  p_customer_gstin text DEFAULT NULL::text,
  p_payment_received boolean DEFAULT true,
  p_split_payments jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_register RECORD;
  v_is_staff BOOLEAN;
  v_is_service BOOLEAN;
  v_norm_method TEXT;
  v_final_payable NUMERIC;
  v_final_paid NUMERIC;
  v_pay_status TEXT;
  v_order_status TEXT := 'completed';
  v_notes_with_gstin TEXT;
  v_other_active_orders BOOLEAN;
  v_cash_inc NUMERIC := 0;
  v_upi_inc NUMERIC := 0;
  v_card_inc NUMERIC := 0;
  v_other_inc NUMERIC := 0;
  v_total_pay_amt NUMERIC := 0;
  v_existing_payments_total NUMERIC := 0;
  v_amount_to_pay NUMERIC := 0;
  v_split_elem JSONB;
  v_split_method TEXT;
  v_split_amt NUMERIC;
  v_split_ref TEXT;
  v_pending_pay RECORD;
BEGIN
  v_is_service := (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR COALESCE(auth.role(), '') = 'service_role'
    OR current_user = 'postgres'
  );

  -- 1. Authentication check
  IF NOT v_is_service AND v_uid IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
  END IF;

  -- 2. Lock and load target order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found.', p_order_id;
  END IF;

  -- 3. Authorization check
  IF NOT v_is_service THEN
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
    END IF;
  END IF;

  -- 4. Idempotency & state validations: Only completed orders are already settled
  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'This order has already been settled.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot settle a cancelled order.';
  END IF;

  -- 5. Normalize payment method
  v_norm_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
  IF v_norm_method = 'online' THEN v_norm_method := 'upi'; END IF;

  v_final_payable := COALESCE(p_payable_amount, v_order.payable_amount, v_order.grand_total, 0);

  -- 6. Require active Open Day Register
  SELECT * INTO v_register
  FROM public.day_registers
  WHERE restaurant_id = v_order.restaurant_id
    AND status = 'open'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active register is open. Please open the day register before settling orders.';
  END IF;

  -- 7. Check for completed payment records for this order (ignoring pending)
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_payments_total
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) IN ('completed', 'paid', 'success');

  -- Also check for any pending payments to reuse / finalize
  SELECT * INTO v_pending_pay
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 8. Handle Payment Insertion(s) and Register Totals
  IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
    -- If there was a pending payment, remove it to avoid duplication with splits
    IF v_pending_pay.id IS NOT NULL THEN
      DELETE FROM public.payments WHERE id = v_pending_pay.id;
    END IF;

    -- Process split payments
    FOR v_split_elem IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      v_split_method := LOWER(TRIM(COALESCE(v_split_elem->>'payment_method', 'cash')));
      IF v_split_method = 'online' THEN v_split_method := 'upi'; END IF;
      v_split_amt := COALESCE((v_split_elem->>'amount')::NUMERIC, 0);
      v_split_ref := v_split_elem->>'reference_number';

      IF v_split_amt > 0 THEN
        v_total_pay_amt := v_total_pay_amt + v_split_amt;

        INSERT INTO public.payments (
          id,
          order_id,
          restaurant_id,
          payment_method,
          amount,
          status,
          reference_number,
          notes,
          created_at
        ) VALUES (
          'pay-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6),
          v_order.id,
          v_order.restaurant_id,
          v_split_method,
          v_split_amt,
          'completed',
          v_split_ref,
          p_notes,
          NOW()
        );

        IF v_split_method = 'cash' THEN v_cash_inc := v_cash_inc + v_split_amt;
        ELSIF v_split_method = 'upi' THEN v_upi_inc := v_upi_inc + v_split_amt;
        ELSIF v_split_method = 'card' THEN v_card_inc := v_card_inc + v_split_amt;
        ELSE v_other_inc := v_other_inc + v_split_amt;
        END IF;
      END IF;
    END LOOP;

    v_final_paid := v_existing_payments_total + v_total_pay_amt;
    v_pay_status := CASE WHEN v_final_paid >= v_final_payable THEN 'paid' ELSE 'partially_paid' END;
    v_norm_method := 'split';
  ELSE
    -- Single payment mode: check if payment was already recorded in full
    IF v_existing_payments_total >= v_final_payable AND v_final_payable > 0 THEN
      v_final_paid := v_existing_payments_total;
      v_pay_status := 'paid';
      v_norm_method := COALESCE(NULLIF(v_norm_method, ''), v_order.payment_method, 'cash');
      v_total_pay_amt := 0; -- Payment already recorded; no duplicate register increment
      IF v_pending_pay.id IS NOT NULL THEN
        UPDATE public.payments SET status = 'completed' WHERE id = v_pending_pay.id;
      END IF;
    ELSE
      IF p_payment_received THEN
        v_amount_to_pay := GREATEST(0, v_final_payable - v_existing_payments_total);
        IF p_amount IS NOT NULL AND p_amount > 0 THEN
          v_amount_to_pay := p_amount;
        END IF;

        v_final_paid := v_existing_payments_total + v_amount_to_pay;
        v_pay_status := 'paid';
        v_total_pay_amt := v_amount_to_pay;

        IF v_amount_to_pay > 0 THEN
          IF v_pending_pay.id IS NOT NULL THEN
            UPDATE public.payments
            SET status = 'completed',
                restaurant_id = v_order.restaurant_id,
                payment_method = v_norm_method,
                amount = v_amount_to_pay,
                reference_number = COALESCE(p_reference_number, reference_number),
                notes = COALESCE(p_notes, notes)
            WHERE id = v_pending_pay.id;
          ELSE
            INSERT INTO public.payments (
              id,
              order_id,
              restaurant_id,
              payment_method,
              amount,
              status,
              reference_number,
              notes,
              created_at
            ) VALUES (
              'pay-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6),
              v_order.id,
              v_order.restaurant_id,
              v_norm_method,
              v_amount_to_pay,
              'completed',
              p_reference_number,
              p_notes,
              NOW()
            );
          END IF;

          IF v_norm_method = 'cash' THEN v_cash_inc := v_cash_inc + v_amount_to_pay;
          ELSIF v_norm_method = 'upi' THEN v_upi_inc := v_upi_inc + v_amount_to_pay;
          ELSIF v_norm_method = 'card' THEN v_card_inc := v_card_inc + v_amount_to_pay;
          ELSE v_other_inc := v_other_inc + v_amount_to_pay;
          END IF;
        END IF;
      ELSE
        v_final_paid := v_existing_payments_total;
        v_pay_status := CASE WHEN v_final_paid >= v_final_payable AND v_final_payable > 0 THEN 'paid' ELSE 'unpaid' END;
        v_total_pay_amt := 0;
      END IF;
    END IF;
  END IF;

  -- 9. Prepare Notes with GSTIN / Discount if present
  v_notes_with_gstin := COALESCE(v_order.notes, '');
  IF p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN
    IF v_notes_with_gstin <> '' THEN
      v_notes_with_gstin := v_notes_with_gstin || ' • ' || TRIM(p_notes);
    ELSE
      v_notes_with_gstin := TRIM(p_notes);
    END IF;
  END IF;
  IF p_customer_gstin IS NOT NULL AND TRIM(p_customer_gstin) <> '' THEN
    IF NOT (v_notes_with_gstin LIKE '%[GSTIN:%') THEN
      v_notes_with_gstin := v_notes_with_gstin || ' [GSTIN:' || UPPER(TRIM(p_customer_gstin)) || ']';
    END IF;
  END IF;

  -- 10. Update the Order to COMPLETED
  UPDATE public.orders
  SET status = v_order_status,
      payment_status = v_pay_status,
      payment_method = v_norm_method,
      paid_amount = v_final_paid,
      discount_type = COALESCE(p_discount_type, discount_type),
      discount_value = COALESCE(p_discount_value, discount_value),
      discount_amount = COALESCE(p_discount_amount, discount_amount),
      cgst_amount = COALESCE(p_cgst_amount, cgst_amount),
      sgst_amount = COALESCE(p_sgst_amount, sgst_amount),
      grand_total = COALESCE(p_grand_total, grand_total),
      round_off = COALESCE(p_round_off, round_off),
      payable_amount = v_final_payable,
      notes = v_notes_with_gstin,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 11. Update Active Day Register totals
  IF v_total_pay_amt > 0 THEN
    UPDATE public.day_registers
    SET total_sales = COALESCE(total_sales, 0) + v_total_pay_amt,
        total_orders = COALESCE(total_orders, 0) + 1,
        cash_sales = COALESCE(cash_sales, 0) + v_cash_inc,
        upi_sales = COALESCE(upi_sales, 0) + v_upi_inc,
        card_sales = COALESCE(card_sales, 0) + v_card_inc,
        other_sales = COALESCE(other_sales, 0) + v_other_inc,
        expected_cash = COALESCE(opening_cash_float, opening_cash, 0) + COALESCE(cash_sales, 0) + v_cash_inc,
        updated_at = NOW()
  WHERE id = v_register.id;
  END IF;

  -- 12. Release Dining Table if safe
  IF v_order.order_type = 'dine_in' AND v_order.table_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE restaurant_id = v_order.restaurant_id
        AND table_id = v_order.table_id
        AND id <> v_order.id
        AND status NOT IN ('completed', 'cancelled')
    ) INTO v_other_active_orders;

    IF NOT v_other_active_orders THEN
      UPDATE public.tables
      SET status = 'available',
          current_order_id = NULL,
          updated_at = NOW()
      WHERE id = v_order.table_id;
    END IF;
  END IF;

  -- 13. Write Audit Log
  INSERT INTO public.audit_logs (
    restaurant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    new_values,
    created_at
  ) VALUES (
    v_order.restaurant_id,
    v_uid,
    'ORDER_SETTLED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'payment_method', v_norm_method,
      'payment_received', p_payment_received,
      'paid_amount', v_final_paid,
      'payable_amount', v_final_payable,
      'register_id', v_register.id,
      'settled_at', NOW()
    ),
    NOW()
  );

  -- 14. Return full updated order
  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'order', to_jsonb(o),
      'payments', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p)) FROM public.payments p WHERE p.order_id = o.id),
        '[]'::jsonb
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i)) FROM public.order_items i WHERE i.order_id = o.id),
        '[]'::jsonb
      )
    )
    FROM public.orders o
    WHERE o.id = v_order.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
