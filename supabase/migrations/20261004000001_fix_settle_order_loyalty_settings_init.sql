-- Migration: 20261004000001_fix_settle_order_loyalty_settings_init.sql
-- Description: Fix settle_order RPC loyalty settings unassigned record error (55000)
-- Target: DEV ONLY (ymonclyfwtdyjagrnvpo)

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
  p_split_payments jsonb DEFAULT NULL::jsonb,
  p_wallet_redeem_amount numeric DEFAULT 0
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
  v_norm_mobile TEXT;
  v_loyalty_enabled BOOLEAN := false;
  v_spend_amount NUMERIC := 0;
  v_reward_amount NUMERIC := 0;
  v_min_redeem_balance NUMERIC := 0;
  v_wallet RECORD;
  v_wallet_redeemed NUMERIC := 0;
  v_new_wallet_balance NUMERIC := 0;
  v_eligible_spend NUMERIC := 0;
  v_earned_reward NUMERIC := 0;
  v_already_earned BOOLEAN := false;
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

  -- Normalize customer mobile
  v_norm_mobile := public.normalize_phone(v_order.customer_phone);

  -- Safe retrieval of restaurant loyalty reward settings with fallback defaults
  SELECT
    COALESCE(is_enabled, false),
    COALESCE(spend_amount, 0),
    COALESCE(reward_amount, 0),
    COALESCE(min_redeem_balance, 0)
  INTO
    v_loyalty_enabled,
    v_spend_amount,
    v_reward_amount,
    v_min_redeem_balance
  FROM public.loyalty_reward_settings
  WHERE restaurant_id = v_order.restaurant_id;

  IF NOT FOUND THEN
    v_loyalty_enabled := false;
    v_spend_amount := 0;
    v_reward_amount := 0;
    v_min_redeem_balance := 0;
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

  -- Also check for any pending payments to finalize
  SELECT * INTO v_pending_pay
  FROM public.payments
  WHERE order_id = v_order.id AND LOWER(status) = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 8. ATOMIC WALLET REDEMPTION (if requested)
  IF p_wallet_redeem_amount IS NOT NULL AND p_wallet_redeem_amount > 0 THEN
    IF v_norm_mobile IS NULL THEN
      RAISE EXCEPTION 'Cannot redeem wallet balance: Customer mobile number is missing or invalid.';
    END IF;

    IF NOT v_loyalty_enabled THEN
      RAISE EXCEPTION 'Loyalty rewards program is disabled for this restaurant.';
    END IF;

    -- Lock customer wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE restaurant_id = v_order.restaurant_id
      AND customer_mobile = v_norm_mobile
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer wallet not found for mobile %.', v_norm_mobile;
    END IF;

    -- Validate minimum redeem balance
    IF v_wallet.balance < v_min_redeem_balance THEN
      RAISE EXCEPTION 'Minimum ₹% wallet balance required to redeem. Current balance is ₹%.',
        v_min_redeem_balance, v_wallet.balance;
    END IF;

    -- Cap redemption at order due balance and wallet balance
    v_wallet_redeemed := LEAST(p_wallet_redeem_amount, v_wallet.balance, v_balance);

    IF v_wallet_redeemed <= 0 THEN
      RAISE EXCEPTION 'Invalid wallet redemption amount.';
    END IF;

    -- Deduct from wallet
    v_new_wallet_balance := v_wallet.balance - v_wallet_redeemed;
    UPDATE public.customer_wallets
    SET balance = v_new_wallet_balance,
        total_redeemed = total_redeemed + v_wallet_redeemed,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Record wallet transaction ledger
    INSERT INTO public.customer_wallet_transactions (
      restaurant_id,
      customer_mobile,
      order_id,
      transaction_type,
      amount,
      balance_after,
      notes
    ) VALUES (
      v_order.restaurant_id,
      v_norm_mobile,
      v_order.id,
      'redeem',
      v_wallet_redeemed,
      v_new_wallet_balance,
      'Redeemed on Order #' || v_order.order_number
    );

    -- Insert wallet payment record (Day Register NOT incremented since wallet is non-cash store credit)
    INSERT INTO public.payments (
      id,
      order_id,
      restaurant_id,
      payment_method,
      amount,
      status,
      notes,
      created_at
    ) VALUES (
      'pay-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6),
      v_order.id,
      v_order.restaurant_id,
      'wallet',
      v_wallet_redeemed,
      'completed',
      'Loyalty Wallet Redemption',
      NOW()
    );

    -- Update order due balance
    v_existing_payments_total := v_existing_payments_total + v_wallet_redeemed;
    v_balance := GREATEST(0.00, v_final_payable - v_existing_payments_total);
  END IF;

  -- 9. Handle External Payment Insertion(s) and Register Totals
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
    -- Single external payment mode: check if already fully paid (e.g. by prior partials or wallet)
    IF v_balance <= 0 AND v_final_payable > 0 THEN
      v_final_paid := v_existing_payments_total;
      v_pay_status := 'paid';
      v_norm_method := CASE WHEN v_wallet_redeemed > 0 AND v_existing_payments_total = v_wallet_redeemed THEN 'wallet' ELSE COALESCE(NULLIF(v_norm_method, ''), v_order.payment_method, 'cash') END;
      v_total_pay_amt := 0;
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

  -- 10. Update Day Register with external money received
  IF v_cash_inc > 0 OR v_upi_inc > 0 OR v_card_inc > 0 OR v_other_inc > 0 THEN
    UPDATE public.day_registers
    SET cash_sales = cash_sales + v_cash_inc,
        upi_sales = upi_sales + v_upi_inc,
        card_sales = card_sales + v_card_inc,
        total_sales = total_sales + v_cash_inc + v_upi_inc + v_card_inc + v_other_inc,
        total_orders = total_orders + 1,
        updated_at = NOW()
    WHERE id = v_register.id;
  END IF;

  -- 11. Notes formatting
  v_notes_with_gstin := v_order.notes;
  IF p_customer_gstin IS NOT NULL AND TRIM(p_customer_gstin) <> '' THEN
    IF v_notes_with_gstin IS NULL OR TRIM(v_notes_with_gstin) = '' THEN
      v_notes_with_gstin := '[GSTIN: ' || TRIM(UPPER(p_customer_gstin)) || ']';
    ELSIF v_notes_with_gstin NOT LIKE '%[GSTIN:%' THEN
      v_notes_with_gstin := v_notes_with_gstin || ' [GSTIN: ' || TRIM(UPPER(p_customer_gstin)) || ']';
    END IF;
  END IF;

  -- 12. Update the Order record to completed & settled
  UPDATE public.orders
  SET status = v_order_status,
      payment_status = v_pay_status,
      payment_method = v_norm_method,
      paid_amount = v_final_paid,
      discount_type = COALESCE(NULLIF(p_discount_type, 'none'), v_order.discount_type, 'none'),
      discount_value = COALESCE(p_discount_value, v_order.discount_value, 0),
      discount_amount = COALESCE(p_discount_amount, v_order.discount_amount, 0),
      cgst_amount = COALESCE(p_cgst_amount, v_order.cgst_amount),
      sgst_amount = COALESCE(p_sgst_amount, v_order.sgst_amount),
      grand_total = COALESCE(p_grand_total, v_order.grand_total),
      round_off = COALESCE(p_round_off, v_order.round_off),
      payable_amount = v_final_payable,
      customer_phone = COALESCE(NULLIF(v_norm_mobile, ''), v_order.customer_phone),
      notes = v_notes_with_gstin,
      updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- 13. Free up Table if no other active orders exist on that table
  IF v_order.table_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE table_id = v_order.table_id
        AND id <> v_order.id
        AND status NOT IN ('completed', 'cancelled')
    ) INTO v_other_active_orders;

    IF NOT v_other_active_orders THEN
      UPDATE public.tables
      SET status = 'available',
          updated_at = NOW()
      WHERE id = v_order.table_id;
    END IF;
  END IF;

  -- 14. ATOMIC LOYALTY REWARD EARNING
  -- Earning is strictly based on final eligible order spend AFTER wallet redemption
  IF v_norm_mobile IS NOT NULL AND v_loyalty_enabled AND v_spend_amount > 0 AND v_reward_amount > 0 THEN
    -- Eligible spend base is total payable minus wallet redemption
    v_eligible_spend := GREATEST(0.00, v_final_payable - v_wallet_redeemed);

    -- Check duplicate earning prevention
    SELECT EXISTS (
      SELECT 1 FROM public.customer_wallet_transactions
      WHERE order_id = v_order.id
        AND transaction_type = 'earn'
    ) INTO v_already_earned;

    IF NOT v_already_earned AND v_eligible_spend > 0 THEN
      v_earned_reward := ROUND((v_eligible_spend / v_spend_amount) * v_reward_amount, 2);

      IF v_earned_reward > 0 THEN
        INSERT INTO public.customer_wallets (
          restaurant_id,
          customer_mobile,
          balance,
          total_earned,
          total_redeemed,
          updated_at
        ) VALUES (
          v_order.restaurant_id,
          v_norm_mobile,
          v_earned_reward,
          v_earned_reward,
          0.00,
          NOW()
        )
        ON CONFLICT (restaurant_id, customer_mobile) DO UPDATE SET
          balance = customer_wallets.balance + v_earned_reward,
          total_earned = customer_wallets.total_earned + v_earned_reward,
          updated_at = NOW()
        RETURNING balance INTO v_new_wallet_balance;

        INSERT INTO public.customer_wallet_transactions (
          restaurant_id,
          customer_mobile,
          order_id,
          transaction_type,
          amount,
          balance_after,
          notes
        ) VALUES (
          v_order.restaurant_id,
          v_norm_mobile,
          v_order.id,
          'earn',
          v_earned_reward,
          v_new_wallet_balance,
          'Reward earned from Order #' || v_order.order_number
        );
      END IF;
    END IF;
  END IF;

  -- 15. Audit Log Entry
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
    'SETTLE_ORDER',
    'ORDER',
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'grand_total', v_order.grand_total,
      'payable_amount', v_order.payable_amount,
      'paid_amount', v_order.paid_amount,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'wallet_redeemed', v_wallet_redeemed,
      'reward_earned', v_earned_reward,
      'new_wallet_balance', v_new_wallet_balance
    ),
    NOW()
  );

  -- 16. Return JSON response with settled order, wallet redeemed, and reward earned
  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'wallet_redeemed', v_wallet_redeemed,
    'reward_earned', v_earned_reward,
    'new_wallet_balance', v_new_wallet_balance
  );
END;
$function$;

-- Permissions & PostgREST reload
REVOKE ALL ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
