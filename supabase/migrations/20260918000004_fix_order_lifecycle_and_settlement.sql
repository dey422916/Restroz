-- ============================================================================
-- Migration: 20260918000004_fix_order_lifecycle_and_settlement.sql
-- Description:
--   1. Adds restaurant_id column, index, and foreign key to public.payments.
--   2. Backfills payments.restaurant_id from orders.
--   3. Normalizes payments payment_method CHECK constraint ('cash', 'card', 'upi', 'online', 'split', 'room', 'cod', 'other', 'wallet').
--   4. Updates RLS policies on public.payments and public.order_items.
--   5. Creates atomic transactional RPC: public.settle_order.
--   6. Creates atomic transactional RPC: public.cancel_order.
--   7. Creates atomic transactional RPC: public.edit_order.
-- ============================================================================

-- 1. PAYMENTS TABLE SCHEMA ALIGNMENT
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- Backfill payments.restaurant_id from orders
UPDATE public.payments p
SET restaurant_id = o.restaurant_id
FROM public.orders o
WHERE p.order_id = o.id AND p.restaurant_id IS NULL;

-- Indexes on payments
CREATE INDEX IF NOT EXISTS idx_payments_restaurant ON public.payments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);

-- Payment method check constraint
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check 
  CHECK (payment_method IN ('cash', 'card', 'upi', 'online', 'split', 'room', 'cod', 'other', 'wallet'));

-- 2. PAYMENTS RLS POLICIES
DROP POLICY IF EXISTS "Payments manage policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Manage Policy" ON public.payments;
DROP POLICY IF EXISTS "Payments select policy" ON public.payments;
DROP POLICY IF EXISTS "Payments Select Policy" ON public.payments;

CREATE POLICY "Payments Select Policy" ON public.payments
FOR SELECT TO public
USING (
  is_super_admin()
  OR (restaurant_id IS NOT NULL AND is_restaurant_member(restaurant_id, 'STAFF'::text))
  OR (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND (
        is_restaurant_member(o.restaurant_id, 'STAFF'::text)
        OR (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
      )
  ))
);

CREATE POLICY "Payments Manage Policy" ON public.payments
FOR ALL TO public
USING (
  is_super_admin()
  OR (restaurant_id IS NOT NULL AND is_restaurant_member(restaurant_id, 'STAFF'::text))
  OR (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND is_restaurant_member(o.restaurant_id, 'STAFF'::text)
  ))
)
WITH CHECK (
  is_super_admin()
  OR (restaurant_id IS NOT NULL AND is_restaurant_member(restaurant_id, 'STAFF'::text))
  OR (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = payments.order_id
      AND is_restaurant_member(o.restaurant_id, 'STAFF'::text)
  ))
);

-- 3. ORDER_ITEMS RLS POLICIES & DEFAULTS
ALTER TABLE public.order_items ALTER COLUMN total_price SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN tax_rate SET DEFAULT 5.0;
ALTER TABLE public.order_items ALTER COLUMN tax_amount SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN cgst_amount SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN sgst_amount SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN igst_amount SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN discount_amount SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN total SET DEFAULT 0;

DROP POLICY IF EXISTS "Order items select policy" ON public.order_items;
DROP POLICY IF EXISTS "Order items select policy" ON public.order_items;
DROP POLICY IF EXISTS "Order items manage policy" ON public.order_items;

CREATE POLICY "Order items select policy" ON public.order_items
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        is_restaurant_member(o.restaurant_id, 'STAFF'::text)
        OR (auth.uid() IS NOT NULL AND o.customer_id = auth.uid())
        OR is_super_admin()
      )
  )
);

CREATE POLICY "Order items manage policy" ON public.order_items
FOR ALL TO public
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        is_restaurant_member(o.restaurant_id, 'STAFF'::text)
        OR is_super_admin()
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        is_restaurant_member(o.restaurant_id, 'STAFF'::text)
        OR is_super_admin()
      )
  )
);


-- ============================================================================
-- 4. ATOMIC RPC: settle_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.settle_order(
  p_order_id TEXT,
  p_payment_method TEXT,
  p_amount NUMERIC,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_discount_type TEXT DEFAULT 'none',
  p_discount_value NUMERIC DEFAULT 0,
  p_discount_amount NUMERIC DEFAULT 0,
  p_taxable_amount NUMERIC DEFAULT NULL,
  p_cgst_amount NUMERIC DEFAULT NULL,
  p_sgst_amount NUMERIC DEFAULT NULL,
  p_grand_total NUMERIC DEFAULT NULL,
  p_round_off NUMERIC DEFAULT NULL,
  p_payable_amount NUMERIC DEFAULT NULL,
  p_customer_gstin TEXT DEFAULT NULL,
  p_payment_received BOOLEAN DEFAULT TRUE,
  p_split_payments JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_register RECORD;
  v_is_staff BOOLEAN;
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
  v_split_elem JSONB;
  v_split_method TEXT;
  v_split_amt NUMERIC;
  v_split_ref TEXT;
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
  v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
  END IF;

  -- 4. Idempotency & state validations
  IF v_order.status = 'completed' OR v_order.payment_status = 'paid' THEN
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

  -- 7. Handle Payment Insertion(s)
  IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
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

    v_final_paid := v_total_pay_amt;
    v_pay_status := CASE WHEN v_final_paid >= v_final_payable THEN 'paid' ELSE 'partially_paid' END;
    v_norm_method := 'split';
  ELSE
    -- Single payment mode
    IF p_payment_received THEN
      v_final_paid := COALESCE(p_amount, v_final_payable);
      v_pay_status := 'paid';
      v_total_pay_amt := v_final_paid;

      IF v_final_paid > 0 THEN
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
          v_final_paid,
          'completed',
          p_reference_number,
          p_notes,
          NOW()
        );

        IF v_norm_method = 'cash' THEN v_cash_inc := v_cash_inc + v_final_paid;
        ELSIF v_norm_method = 'upi' THEN v_upi_inc := v_upi_inc + v_final_paid;
        ELSIF v_norm_method = 'card' THEN v_card_inc := v_card_inc + v_final_paid;
        ELSE v_other_inc := v_other_inc + v_final_paid;
        END IF;
      END IF;
    ELSE
      v_final_paid := 0;
      v_pay_status := 'unpaid';
      v_total_pay_amt := 0;
    END IF;
  END IF;

  -- 8. Prepare Notes with GSTIN / Discount if present
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

  -- 9. Update the Order
  UPDATE public.orders
  SET status = v_order_status,
      payment_status = v_pay_status,
      payment_method = v_norm_method,
      paid_amount = v_final_paid,
      discount_amount = COALESCE(p_discount_amount, discount_amount),
      cgst_amount = COALESCE(p_cgst_amount, cgst_amount),
      sgst_amount = COALESCE(p_sgst_amount, sgst_amount),
      grand_total = COALESCE(p_grand_total, grand_total),
      round_off = COALESCE(p_round_off, round_off),
      payable_amount = v_final_payable,
      notes = v_notes_with_gstin,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 10. Update Active Day Register totals
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

  -- 11. Release Dining Table if safe
  IF v_order.order_type = 'dine_in' AND v_order.table_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE restaurant_id = v_order.restaurant_id
        AND table_id = v_order.table_id
        AND id <> v_order.id
        AND status NOT IN ('completed', 'cancelled')
        AND COALESCE(payment_status, 'unpaid') <> 'paid'
    ) INTO v_other_active_orders;

    IF NOT v_other_active_orders THEN
      UPDATE public.tables
      SET status = 'available',
          current_order_id = NULL,
          updated_at = NOW()
      WHERE id = v_order.table_id;
    END IF;
  END IF;

  -- 12. Write Audit Log
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

  -- 13. Return full updated order
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
$$;


-- ============================================================================
-- 5. ATOMIC RPC: cancel_order
-- ============================================================================
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
  v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
  END IF;

  -- 5. Validate status
  IF v_order.status = 'completed' OR v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot cancel an order that is already completed or paid. Please use Refund / Void workflow.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'This order has already been cancelled.';
  END IF;

  v_cancel_note := '[CANCELLED] Reason: ' || v_trimmed_reason || ' | Prev Status: ' || v_order.status || ' | Cancelled At: ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS');

  -- 6. Update order status (Trigger trg_restore_stock_on_cancel will automatically restore stock if stock_deducted=TRUE)
  UPDATE public.orders
  SET status = 'cancelled',
      notes = CASE 
        WHEN notes IS NOT NULL AND notes <> '' 
        THEN notes || ' • ' || v_cancel_note
        ELSE v_cancel_note
      END,
      updated_at = NOW()
  WHERE id = v_order.id;

  -- 7. Release table if dine-in
  IF v_order.order_type = 'dine_in' AND v_order.table_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE restaurant_id = v_order.restaurant_id
        AND table_id = v_order.table_id
        AND id <> v_order.id
        AND status NOT IN ('completed', 'cancelled')
        AND COALESCE(payment_status, 'unpaid') <> 'paid'
    ) INTO v_other_active_orders;

    IF NOT v_other_active_orders THEN
      UPDATE public.tables
      SET status = 'available',
          current_order_id = NULL,
          updated_at = NOW()
      WHERE id = v_order.table_id;
    END IF;
  END IF;

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
    v_uid,
    'ORDER_CANCELLED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', v_trimmed_reason,
      'previous_status', v_order.status,
      'cancelled_at', NOW()
    ),
    NOW()
  );

  -- 9. Return updated order
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
$$;


-- ============================================================================
-- 6. ATOMIC RPC: edit_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.edit_order(
  p_order_id TEXT,
  p_items JSONB,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_landmark TEXT DEFAULT NULL,
  p_delivery_charge NUMERIC DEFAULT NULL,
  p_table_id TEXT DEFAULT NULL,
  p_table_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_discount_amount NUMERIC DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL,
  p_coupon_discount NUMERIC DEFAULT NULL,
  p_cgst_amount NUMERIC DEFAULT NULL,
  p_sgst_amount NUMERIC DEFAULT NULL,
  p_igst_amount NUMERIC DEFAULT NULL,
  p_service_charge NUMERIC DEFAULT NULL,
  p_grand_total NUMERIC DEFAULT NULL,
  p_round_off NUMERIC DEFAULT NULL,
  p_payable_amount NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
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
  v_item_elem JSONB;
  v_subtotal NUMERIC := 0;
  v_calculated_tax NUMERIC := 0;
  v_item_idx INT := 0;
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
  v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to modify orders for this restaurant.';
  END IF;

  -- 4. Status check
  IF v_order.status = 'completed' OR v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Cannot edit an order that is already completed or paid.';
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
      COALESCE(v_item_elem->>'id', 'item-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || v_item_idx || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4)),
      v_order.id,
      v_item_elem->>'product_id',
      COALESCE(v_item_elem->>'product_name', 'Unnamed Item'),
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

  -- 7. Update orders record
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
      discount_amount = COALESCE(p_discount_amount, discount_amount),
      coupon_code = p_coupon_code,
      coupon_discount = COALESCE(p_coupon_discount, coupon_discount),
      cgst_amount = COALESCE(p_cgst_amount, cgst_amount),
      sgst_amount = COALESCE(p_sgst_amount, sgst_amount),
      igst_amount = COALESCE(p_igst_amount, igst_amount),
      service_charge = COALESCE(p_service_charge, service_charge),
      grand_total = COALESCE(p_grand_total, grand_total),
      round_off = COALESCE(p_round_off, round_off),
      payable_amount = COALESCE(p_payable_amount, payable_amount),
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
    v_uid,
    'ORDER_UPDATED',
    'order',
    v_order.id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'items_count', jsonb_array_length(p_items),
      'new_payable_amount', COALESCE(p_payable_amount, v_order.payable_amount),
      'reason', COALESCE(p_reason, 'Order modified from POS'),
      'updated_at', NOW()
    ),
    NOW()
  );

  -- 9. Return updated order
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
$$;
