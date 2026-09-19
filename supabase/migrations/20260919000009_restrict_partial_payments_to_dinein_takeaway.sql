-- ============================================================================
-- Migration: 20260919000009_restrict_partial_payments_to_dinein_takeaway.sql
-- Description:
--   Restricts record_partial_payment RPC strictly to Dine-In and Takeaway orders.
--   Rejects Online Delivery and QR Digital Menu orders with error:
--   "Partial payments are available only for Dine-In and Takeaway orders."
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_partial_payment(
  p_order_id TEXT,
  p_payment_method TEXT,
  p_amount NUMERIC,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_split_payments JSONB DEFAULT NULL,
  p_restaurant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_is_service BOOLEAN;
  v_is_staff BOOLEAN;
  v_order RECORD;
  v_register RECORD;
  v_norm_method TEXT;
  v_payable NUMERIC;
  v_existing_paid NUMERIC := 0;
  v_balance NUMERIC;
  v_pay_amt NUMERIC := 0;
  v_cash_inc NUMERIC := 0;
  v_upi_inc NUMERIC := 0;
  v_card_inc NUMERIC := 0;
  v_other_inc NUMERIC := 0;
  v_split_elem JSONB;
  v_split_method TEXT;
  v_split_amt NUMERIC;
  v_split_ref TEXT;
  v_new_paid NUMERIC;
  v_new_pay_status TEXT := 'partially_paid';
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

  -- 3. Tenant check
  IF p_restaurant_id IS NOT NULL AND v_order.restaurant_id <> p_restaurant_id THEN
    RAISE EXCEPTION 'Tenant mismatch: Order does not belong to specified restaurant.';
  END IF;

  -- 4. Authorization check
  IF NOT v_is_service THEN
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text)
                  OR public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::text)
                  OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to record payments for this restaurant.';
    END IF;
  END IF;

  -- 5. Order state validations
  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'This order has already been settled.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record payment for a cancelled order.';
  END IF;

  -- Strictly restrict partial payments to Dine-In and Takeaway orders only
  IF LOWER(COALESCE(v_order.order_type, '')) NOT IN ('dine_in', 'takeaway')
     OR v_order.notes LIKE '%[ONLINE_DELIVERY]%'
     OR v_order.notes LIKE '%[ONLINE_APP]%'
     OR v_order.notes LIKE '%[DELIVERY]%'
     OR v_order.notes LIKE '%[QR_DINE_IN]%'
     OR v_order.notes LIKE '%[QR_ORDER]%'
     OR v_order.notes LIKE '%[QR]%'
     OR v_order.notes LIKE '%[Marketplace]%'
     OR COALESCE(v_order.created_by, '') IN ('CUSTOMER_APP', 'CUSTOMER') THEN
    RAISE EXCEPTION 'Partial payments are available only for Dine-In and Takeaway orders.';
  END IF;

  -- 6. Calculate payable, existing paid, and balance
  v_payable := COALESCE(v_order.payable_amount, v_order.grand_total, 0.00);

  SELECT COALESCE(SUM(amount), 0) INTO v_existing_paid
  FROM public.payments
  WHERE order_id = v_order.id
    AND LOWER(status) IN ('completed', 'paid', 'success');

  v_existing_paid := GREATEST(v_existing_paid, COALESCE(v_order.paid_amount, 0.00));
  v_balance := GREATEST(0.00, v_payable - v_existing_paid);

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'This order has already been fully paid (₹%). Please click Settle to finalize.', v_existing_paid;
  END IF;

  -- 7. Normalize payment method
  v_norm_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
  IF v_norm_method = 'online' THEN v_norm_method := 'upi'; END IF;
  IF v_norm_method = 'cod' THEN v_norm_method := 'cash'; END IF;

  -- 8. Calculate total amount to record
  IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
    FOR v_split_elem IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      v_split_amt := COALESCE((v_split_elem->>'amount')::NUMERIC, 0);
      IF v_split_amt > 0 THEN
        v_pay_amt := v_pay_amt + v_split_amt;
      END IF;
    END LOOP;
    v_norm_method := 'split';
  ELSE
    v_pay_amt := COALESCE(p_amount, 0);
  END IF;

  IF v_pay_amt <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  -- 9. Overpayment validation
  IF v_pay_amt > v_balance THEN
    RAISE EXCEPTION 'Payment amount (₹%) exceeds remaining balance (₹%).', v_pay_amt, v_balance;
  END IF;

  -- 10. Require active Open Day Register
  SELECT * INTO v_register
  FROM public.day_registers
  WHERE restaurant_id = v_order.restaurant_id
    AND status = 'open'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active register is open. Please open the day register before recording payments.';
  END IF;

  -- 11. Insert Payment Rows & calculate Register sales increments
  IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
    FOR v_split_elem IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      v_split_method := LOWER(TRIM(COALESCE(v_split_elem->>'payment_method', 'cash')));
      IF v_split_method = 'online' THEN v_split_method := 'upi'; END IF;
      IF v_split_method = 'cod' THEN v_split_method := 'cash'; END IF;
      v_split_amt := COALESCE((v_split_elem->>'amount')::NUMERIC, 0);
      v_split_ref := v_split_elem->>'reference_number';

      IF v_split_amt > 0 THEN
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
          COALESCE(v_split_ref, p_reference_number),
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
      v_pay_amt,
      'completed',
      p_reference_number,
      p_notes,
      NOW()
    );

    IF v_norm_method = 'cash' THEN v_cash_inc := v_cash_inc + v_pay_amt;
    ELSIF v_norm_method = 'upi' THEN v_upi_inc := v_upi_inc + v_pay_amt;
    ELSIF v_norm_method = 'card' THEN v_card_inc := v_card_inc + v_pay_amt;
    ELSE v_other_inc := v_other_inc + v_pay_amt;
    END IF;
  END IF;

  -- 12. Update Day Register immediately for sales (DO NOT increment total_orders)
  UPDATE public.day_registers
  SET total_sales = COALESCE(total_sales, 0) + v_pay_amt,
      cash_sales = COALESCE(cash_sales, 0) + v_cash_inc,
      upi_sales = COALESCE(upi_sales, 0) + v_upi_inc,
      card_sales = COALESCE(card_sales, 0) + v_card_inc,
      other_sales = COALESCE(other_sales, 0) + v_other_inc,
      expected_cash = COALESCE(opening_cash_float, opening_cash, 0) + COALESCE(cash_sales, 0) + v_cash_inc,
      updated_at = NOW()
  WHERE id = v_register.id;

  -- 13. Update Order financial metadata (KEEP STATUS ACTIVE, KEEP TABLE OCCUPIED)
  v_new_paid := v_existing_paid + v_pay_amt;

  UPDATE public.orders
  SET paid_amount = v_new_paid,
      payment_status = v_new_pay_status,
      payment_method = CASE WHEN v_order.payment_method IS NULL OR v_order.payment_method = 'cash' THEN v_norm_method ELSE v_order.payment_method END,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 14. Write Audit Log
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
    'PARTIAL_PAYMENT_RECORDED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'amount_recorded', v_pay_amt,
      'total_paid', v_new_paid,
      'remaining_balance', GREATEST(0.00, v_payable - v_new_paid),
      'payment_method', v_norm_method,
      'register_id', v_register.id,
      'recorded_at', NOW()
    ),
    NOW()
  );

  -- 15. Return updated order snapshot
  RETURN jsonb_build_object(
    'success', true,
    'order', (
      SELECT row_to_json(o) FROM (
        SELECT ord.*,
               t.table_number,
               t.section
        FROM public.orders ord
        LEFT JOIN public.tables t ON t.id = ord.table_id
        WHERE ord.id = v_order.id
      ) o
    ),
    'payments', (
      SELECT json_agg(row_to_json(p))
      FROM (
        SELECT *
        FROM public.payments
        WHERE order_id = v_order.id
        ORDER BY created_at ASC
      ) p
    ),
    'items', (
      SELECT json_agg(row_to_json(oi))
      FROM (
        SELECT *
        FROM public.order_items
        WHERE order_id = v_order.id
      ) oi
    ),
    'register', (
      SELECT row_to_json(dr)
      FROM public.day_registers dr
      WHERE dr.id = v_register.id
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_partial_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role, anon;
