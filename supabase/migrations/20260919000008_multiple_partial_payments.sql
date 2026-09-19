-- ============================================================================
-- Migration: 20260919000008_multiple_partial_payments.sql
-- Description:
--   1. Implements public.record_partial_payment RPC:
--      - Allows recording multiple partial/full payments for Dine-In & Takeaway orders.
--      - Validates auth, locks order FOR UPDATE, validates amount <= remaining balance.
--      - Inserts payment rows (single or split) with status 'completed'.
--      - Immediately updates Day Register financial totals (cash, upi, card, total_sales, expected_cash).
--      - Does NOT increment Day Register total_orders (only increments at final Settle).
--      - Updates orders.paid_amount and orders.payment_status = 'partially_paid'.
--      - Keeps order status ACTIVE (does NOT complete order, does NOT release table).
--      - Writes PARTIAL_PAYMENT_RECORDED audit log.
--   2. Updates public.settle_order RPC:
--      - Calculates remaining balance (payable_amount - existing completed payments).
--      - If balance = 0, settles order with 0 register financial increment, increments total_orders += 1.
--      - If balance > 0, collects remaining balance, increments register for balance amount and total_orders += 1.
--      - Sets order status = 'completed', payment_status = 'paid', paid_amount.
--      - Releases table safely and writes ORDER_SETTLED audit log.
--   3. Updates public.edit_order RPC:
--      - Blocks editing if new payable total < already received paid_amount.
--      - Preserves paid_amount and payment_status.
--   4. Updates public.cancel_order RPC:
--      - Strictly blocks cancellation if paid_amount > 0 with clear message:
--        "₹xxx has already been received. Refund/Void payment before cancelling."
-- ============================================================================

-- 1. CREATE ATOMIC RPC: record_partial_payment
DROP FUNCTION IF EXISTS public.record_partial_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID);

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

  -- 15. Return updated order & payments
  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'order', to_jsonb(o),
      'payments', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC) FROM public.payments p WHERE p.order_id = o.id),
        '[]'::jsonb
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at ASC) FROM public.order_items i WHERE i.order_id = o.id),
        '[]'::jsonb
      )
    )
    FROM public.orders o
    WHERE o.id = v_order.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_partial_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_partial_payment(TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;


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
  v_balance NUMERIC := 0;
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
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text)
                  OR public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::text)
                  OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
    END IF;
  END IF;

  -- 4. Idempotency & state validations
  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'This order has already been settled.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot settle a cancelled order.';
  END IF;

  -- 5. Normalize payment method
  v_norm_method := LOWER(TRIM(COALESCE(p_payment_method, 'cash')));
  IF v_norm_method = 'online' THEN v_norm_method := 'upi'; END IF;
  IF v_norm_method = 'cod' THEN v_norm_method := 'cash'; END IF;

  v_final_payable := COALESCE(p_payable_amount, v_order.payable_amount, v_order.grand_total, 0.00);

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

  -- 7. Check for completed payment records for this order
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_payments_total
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) IN ('completed', 'paid', 'success');

  v_existing_payments_total := GREATEST(v_existing_payments_total, COALESCE(v_order.paid_amount, 0.00));
  v_balance := GREATEST(0.00, v_final_payable - v_existing_payments_total);

  -- Also check for any pending payments (e.g. from QR / Online orders) to finalize
  SELECT * INTO v_pending_pay
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 8. Handle Payment Insertion(s) and Register Totals
  IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
    IF v_pending_pay.id IS NOT NULL THEN
      DELETE FROM public.payments WHERE id = v_pending_pay.id;
    END IF;

    FOR v_split_elem IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      v_split_method := LOWER(TRIM(COALESCE(v_split_elem->>'payment_method', 'cash')));
      IF v_split_method = 'online' THEN v_split_method := 'upi'; END IF;
      IF v_split_method = 'cod' THEN v_split_method := 'cash'; END IF;
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
    -- Single payment mode: check if already fully paid
    IF v_balance <= 0 AND v_final_payable > 0 THEN
      v_final_paid := v_existing_payments_total;
      v_pay_status := 'paid';
      v_norm_method := COALESCE(NULLIF(v_norm_method, ''), v_order.payment_method, 'cash');
      v_total_pay_amt := 0; -- Zero incremental sales; already recorded in register!
      IF v_pending_pay.id IS NOT NULL THEN
        UPDATE public.payments SET status = 'completed' WHERE id = v_pending_pay.id;
      END IF;
    ELSE
      IF p_payment_received THEN
        v_amount_to_pay := v_balance;
        IF p_amount IS NOT NULL AND p_amount > 0 AND p_amount < v_balance THEN
          v_amount_to_pay := p_amount;
        END IF;

        v_final_paid := v_existing_payments_total + v_amount_to_pay;
        v_pay_status := CASE WHEN v_final_paid >= v_final_payable THEN 'paid' ELSE 'partially_paid' END;
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
        v_pay_status := CASE WHEN v_final_paid >= v_final_payable AND v_final_payable > 0 THEN 'paid' WHEN v_final_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END;
        v_total_pay_amt := 0;
      END IF;
    END IF;
  END IF;

  -- 9. Prepare Notes with GSTIN if present
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

  -- 11. Update Active Day Register: Always increment total_orders += 1, and add incremental sales
  UPDATE public.day_registers
  SET total_orders = COALESCE(total_orders, 0) + 1,
      total_sales = COALESCE(total_sales, 0) + v_total_pay_amt,
      cash_sales = COALESCE(cash_sales, 0) + v_cash_inc,
      upi_sales = COALESCE(upi_sales, 0) + v_upi_inc,
      card_sales = COALESCE(card_sales, 0) + v_card_inc,
      other_sales = COALESCE(other_sales, 0) + v_other_inc,
      expected_cash = COALESCE(opening_cash_float, opening_cash, 0) + COALESCE(cash_sales, 0) + v_cash_inc,
      updated_at = NOW()
  WHERE id = v_register.id;

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
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC) FROM public.payments p WHERE p.order_id = o.id),
        '[]'::jsonb
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at ASC) FROM public.order_items i WHERE i.order_id = o.id),
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


-- 3. UPDATE edit_order RPC: Block edit if new total < already received paid_amount
CREATE OR REPLACE FUNCTION public.edit_order(
  p_order_id text,
  p_items jsonb,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_delivery_address text DEFAULT NULL::text,
  p_delivery_landmark text DEFAULT NULL::text,
  p_delivery_charge numeric DEFAULT 0,
  p_table_id text DEFAULT NULL::text,
  p_table_number text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_discount_amount numeric DEFAULT 0,
  p_coupon_code text DEFAULT NULL::text,
  p_coupon_discount numeric DEFAULT 0,
  p_cgst_amount numeric DEFAULT 0,
  p_sgst_amount numeric DEFAULT 0,
  p_igst_amount numeric DEFAULT 0,
  p_service_charge numeric DEFAULT 0,
  p_grand_total numeric DEFAULT NULL::numeric,
  p_round_off numeric DEFAULT 0,
  p_payable_amount numeric DEFAULT NULL::numeric,
  p_reason text DEFAULT 'Order modified from POS'::text,
  p_discount_type text DEFAULT 'none'::text,
  p_discount_value numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_is_staff BOOLEAN;
  v_item_elem JSONB;
  v_item_idx INT := 0;
  v_subtotal NUMERIC := 0;
  v_calculated_tax NUMERIC := 0;
  v_prod_id TEXT;
  v_final_payable NUMERIC;
  v_existing_paid NUMERIC := 0;
  v_effective_paid NUMERIC := 0;
  v_new_pay_status TEXT;
BEGIN
  -- 1. Authentication check
  IF v_uid IS NULL AND NOT public.is_super_admin() THEN
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
  v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text)
                OR public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::text)
                OR public.is_super_admin();
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
  END IF;

  -- 4. Status check
  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot edit an order that is already completed.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled order.';
  END IF;

  -- 5. Items validation
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'An order must contain at least one item.';
  END IF;

  -- 6. Replace order items atomically
  DELETE FROM public.order_items WHERE order_id = v_order.id;

  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_idx := v_item_idx + 1;
    v_subtotal := v_subtotal + COALESCE((v_item_elem->>'subtotal')::NUMERIC, (v_item_elem->>'unit_price')::NUMERIC * COALESCE((v_item_elem->>'quantity')::INT, 1));
    v_calculated_tax := v_calculated_tax + COALESCE((v_item_elem->>'tax_amount')::NUMERIC, 0);

    v_prod_id := NULLIF(TRIM(v_item_elem->>'product_id'), '');
    IF v_prod_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_prod_id) THEN
        v_prod_id := NULL;
      END IF;
    END IF;

    INSERT INTO public.order_items (
      id,
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      tax_rate,
      tax_amount,
      cgst_amount,
      sgst_amount,
      igst_amount,
      discount_amount,
      total_price,
      subtotal,
      total,
      notes,
      item_notes,
      hsn_code,
      image_url,
      created_at
    ) VALUES (
      COALESCE(NULLIF(TRIM(v_item_elem->>'id'), ''), 'item-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || v_item_idx || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4)),
      v_order.id,
      v_prod_id,
      COALESCE(NULLIF(TRIM(v_item_elem->>'product_name'), ''), 'Unnamed Item'),
      COALESCE((v_item_elem->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item_elem->>'quantity')::INT, 1),
      COALESCE((v_item_elem->>'tax_rate')::NUMERIC, 5),
      COALESCE((v_item_elem->>'tax_amount')::NUMERIC, 0),
      COALESCE((v_item_elem->>'cgst_amount')::NUMERIC, 0),
      COALESCE((v_item_elem->>'sgst_amount')::NUMERIC, 0),
      COALESCE((v_item_elem->>'igst_amount')::NUMERIC, 0),
      COALESCE((v_item_elem->>'discount_amount')::NUMERIC, 0),
      COALESCE((v_item_elem->>'total_price')::NUMERIC, (v_item_elem->>'total')::NUMERIC, (v_item_elem->>'unit_price')::NUMERIC * COALESCE((v_item_elem->>'quantity')::INT, 1)),
      COALESCE((v_item_elem->>'subtotal')::NUMERIC, (v_item_elem->>'unit_price')::NUMERIC * COALESCE((v_item_elem->>'quantity')::INT, 1)),
      COALESCE((v_item_elem->>'total')::NUMERIC, (v_item_elem->>'total_price')::NUMERIC, (v_item_elem->>'unit_price')::NUMERIC * COALESCE((v_item_elem->>'quantity')::INT, 1)),
      COALESCE(v_item_elem->>'notes', v_item_elem->>'item_notes'),
      COALESCE(v_item_elem->>'item_notes', v_item_elem->>'notes'),
      v_item_elem->>'hsn_code',
      v_item_elem->>'image_url',
      NOW()
    );
  END LOOP;

  -- 7. Validate Paid Amount vs New Payable Total
  v_final_payable := COALESCE(p_payable_amount, p_grand_total, v_subtotal);

  SELECT COALESCE(SUM(amount), 0) INTO v_existing_paid
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) IN ('completed', 'paid', 'success');

  v_effective_paid := GREATEST(v_existing_paid, COALESCE(v_order.paid_amount, 0.00));

  IF v_effective_paid > 0 AND v_final_payable < v_effective_paid THEN
    RAISE EXCEPTION 'New order total (₹%) cannot be less than already paid amount (₹%).', v_final_payable, v_effective_paid;
  END IF;

  v_new_pay_status := CASE 
    WHEN v_effective_paid >= v_final_payable AND v_final_payable > 0 THEN 'partially_paid' 
    WHEN v_effective_paid > 0 THEN 'partially_paid' 
    ELSE 'unpaid' 
  END;

  -- 8. Update orders record
  UPDATE public.orders
  SET customer_name = COALESCE(p_customer_name, customer_name),
      customer_phone = COALESCE(p_customer_phone, customer_phone),
      delivery_address = COALESCE(p_delivery_address, delivery_address),
      delivery_landmark = COALESCE(p_delivery_landmark, delivery_landmark),
      delivery_charge = COALESCE(p_delivery_charge, delivery_charge),
      table_id = COALESCE(p_table_id, table_id),
      table_number = COALESCE(p_table_number, table_number),
      notes = COALESCE(p_notes, notes),
      subtotal = v_subtotal,
      discount_type = COALESCE(p_discount_type, discount_type, 'none'),
      discount_value = COALESCE(p_discount_value, discount_value, 0),
      discount_amount = COALESCE(p_discount_amount, discount_amount, 0),
      coupon_code = p_coupon_code,
      coupon_discount = COALESCE(p_coupon_discount, coupon_discount, 0),
      cgst_amount = COALESCE(p_cgst_amount, cgst_amount, 0),
      sgst_amount = COALESCE(p_sgst_amount, sgst_amount, 0),
      igst_amount = COALESCE(p_igst_amount, igst_amount, 0),
      service_charge = COALESCE(p_service_charge, service_charge, 0),
      grand_total = COALESCE(p_grand_total, grand_total, v_subtotal),
      round_off = COALESCE(p_round_off, round_off, 0),
      payable_amount = v_final_payable,
      paid_amount = v_effective_paid,
      payment_status = v_new_pay_status,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 9. Write Audit Log
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
    'ORDER_UPDATED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'items_count', jsonb_array_length(p_items),
      'new_payable_amount', v_final_payable,
      'reason', COALESCE(p_reason, 'Order modified from POS'),
      'updated_at', NOW()
    ),
    NOW()
  );

  -- 10. Return updated order
  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'order', to_jsonb(o),
      'payments', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC) FROM public.payments p WHERE p.order_id = o.id),
        '[]'::jsonb
      ),
      'items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at ASC) FROM public.order_items i WHERE i.order_id = o.id),
        '[]'::jsonb
      )
    )
    FROM public.orders o
    WHERE o.id = v_order.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.edit_order(text, jsonb, text, text, text, text, numeric, text, text, text, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_order(text, jsonb, text, text, text, text, numeric, text, text, text, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric) TO authenticated, service_role;


-- 4. UPDATE cancel_order RPC: Strictly block cancel if payment received
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_is_staff BOOLEAN;
  v_trimmed_reason TEXT := TRIM(COALESCE(p_reason, ''));
  v_cancel_note TEXT;
  v_other_active_orders BOOLEAN;
  v_existing_paid NUMERIC := 0;
  v_effective_paid NUMERIC := 0;
BEGIN
  -- 1. Authentication check
  IF v_uid IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
  END IF;

  -- 2. Validate reason
  IF v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'A cancellation reason is required.';
  END IF;

  -- 3. Lock and load target order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found.', p_order_id;
  END IF;

  -- 4. Authorization check
  v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text)
                OR public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::text)
                OR public.is_super_admin();
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
  END IF;

  -- 5. Validate status
  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot cancel an order that is already completed. Please use Refund / Void workflow.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'This order has already been cancelled.';
  END IF;

  -- 6. Check if ANY payment has already been received
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_paid
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) IN ('completed', 'paid', 'success');

  v_effective_paid := GREATEST(v_existing_paid, COALESCE(v_order.paid_amount, 0.00));

  IF v_effective_paid > 0 THEN
    RAISE EXCEPTION '₹% has already been received. Refund/Void payment before cancelling.', v_effective_paid;
  END IF;

  -- 7. Prepare cancellation notes
  v_cancel_note := COALESCE(v_order.notes, '');
  IF v_cancel_note <> '' THEN
    v_cancel_note := v_cancel_note || ' • [CANCELLED: ' || v_trimmed_reason || ']';
  ELSE
    v_cancel_note := '[CANCELLED: ' || v_trimmed_reason || ']';
  END IF;

  -- 8. Cancel Order: Stock restoration handled by database triggers
  UPDATE public.orders
  SET status = 'cancelled',
      notes = v_cancel_note,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 9. Release Dining Table if safe
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

  -- 10. Audit Log
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
    'ORDER_CANCELLED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', v_trimmed_reason,
      'cancelled_at', NOW()
    ),
    NOW()
  );

  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'order', to_jsonb(o)
    )
    FROM public.orders o
    WHERE o.id = v_order.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
