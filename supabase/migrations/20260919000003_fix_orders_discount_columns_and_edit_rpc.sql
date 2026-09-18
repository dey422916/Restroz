-- ============================================================================
-- MIGRATION: 20260919000003_fix_orders_discount_columns_and_edit_rpc.sql
-- Description: Add missing discount_type and discount_value columns to orders,
-- sanitize product_id foreign key in order_items, and update edit_order RPC.
-- ============================================================================

-- 1. Add missing columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0;

-- 2. Drop and Recreate edit_order RPC with full column support and foreign key safety
DROP FUNCTION IF EXISTS public.edit_order(TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.edit_order(TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC);

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
  p_reason TEXT DEFAULT NULL,
  p_discount_type TEXT DEFAULT NULL,
  p_discount_value NUMERIC DEFAULT NULL
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
  v_prod_id TEXT;
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

  -- 3. Authorization check (admin or staff for this restaurant or superadmin)
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

    -- Sanitize product_id against products table to prevent foreign key violation
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
      payable_amount = COALESCE(p_payable_amount, payable_amount, v_subtotal),
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

REVOKE ALL ON FUNCTION public.edit_order(TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_order(TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, NUMERIC) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
