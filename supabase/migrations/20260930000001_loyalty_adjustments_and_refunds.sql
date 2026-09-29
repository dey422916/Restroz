-- Migration: 20260930000001_loyalty_adjustments_and_refunds.sql
-- Description: Add Manual Wallet Adjustment and Refund/Reversal RPCs for DEV Supabase
-- Target: DEV ONLY (ymonclyfwtdyjagrnvpo)

-- 1. RPC: adjust_customer_wallet
-- Allows Restaurant Admin or Super Admin to manually credit/debit customer store credit with mandatory notes and ledger entry
CREATE OR REPLACE FUNCTION public.adjust_customer_wallet(
  p_restaurant_id uuid,
  p_customer_mobile text,
  p_amount numeric,
  p_notes text,
  p_type text DEFAULT 'adjustment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_norm_mobile TEXT;
  v_wallet RECORD;
  v_new_balance NUMERIC;
  v_txn_id UUID;
  v_trimmed_notes TEXT;
  v_txn_type TEXT;
BEGIN
  -- Authentication & Authorization check
  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
    END IF;
    v_is_admin := public.is_restaurant_member(p_restaurant_id, 'ADMIN'::text) OR public.is_super_admin();
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only restaurant admin or super admin can adjust customer wallet balances.';
    END IF;
  END IF;

  v_norm_mobile := public.normalize_phone(p_customer_mobile);
  IF v_norm_mobile IS NULL THEN
    RAISE EXCEPTION 'Invalid customer mobile number.';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Adjustment amount cannot be zero.';
  END IF;

  v_trimmed_notes := TRIM(COALESCE(p_notes, ''));
  IF v_trimmed_notes = '' THEN
    RAISE EXCEPTION 'An adjustment reason / note is required.';
  END IF;

  v_txn_type := LOWER(TRIM(COALESCE(p_type, 'adjustment')));
  IF v_txn_type NOT IN ('adjustment', 'earn', 'redeem', 'refund') THEN
    v_txn_type := 'adjustment';
  END IF;

  -- Lock customer wallet row
  SELECT * INTO v_wallet
  FROM public.customer_wallets
  WHERE restaurant_id = p_restaurant_id
    AND customer_mobile = v_norm_mobile
  FOR UPDATE;

  IF NOT FOUND THEN
    -- If wallet does not exist and amount is negative, error out
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'Cannot deduct balance: Customer has no existing wallet in this restaurant.';
    END IF;

    -- Create initial wallet record
    INSERT INTO public.customer_wallets (
      restaurant_id,
      customer_mobile,
      balance,
      total_earned,
      total_redeemed,
      updated_at
    ) VALUES (
      p_restaurant_id,
      v_norm_mobile,
      p_amount,
      p_amount,
      0.00,
      NOW()
    )
    RETURNING * INTO v_wallet;

    v_new_balance := p_amount;
  ELSE
    v_new_balance := v_wallet.balance + p_amount;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Cannot deduct ₹%: Current wallet balance is only ₹%. Negative balance is not allowed.',
        ABS(p_amount), v_wallet.balance;
    END IF;

    UPDATE public.customer_wallets
    SET balance = v_new_balance,
        total_earned = CASE WHEN p_amount > 0 THEN total_earned + p_amount ELSE total_earned END,
        updated_at = NOW()
    WHERE id = v_wallet.id;
  END IF;

  -- Insert immutable ledger record
  INSERT INTO public.customer_wallet_transactions (
    restaurant_id,
    customer_mobile,
    transaction_type,
    amount,
    balance_after,
    notes,
    created_at
  ) VALUES (
    p_restaurant_id,
    v_norm_mobile,
    v_txn_type,
    ABS(p_amount),
    v_new_balance,
    v_trimmed_notes
  )
  RETURNING id INTO v_txn_id;

  -- Record audit log entry
  INSERT INTO public.audit_logs (
    restaurant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    new_values,
    created_at
  ) VALUES (
    p_restaurant_id,
    v_uid,
    'WALLET_ADJUSTMENT',
    'CUSTOMER_WALLET',
    v_wallet.id::text,
    jsonb_build_object(
      'customer_mobile', v_norm_mobile,
      'adjustment_amount', p_amount,
      'new_balance', v_new_balance,
      'reason', v_trimmed_notes,
      'transaction_id', v_txn_id
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'customer_mobile', v_norm_mobile,
    'adjustment_amount', p_amount,
    'new_balance', v_new_balance,
    'transaction_id', v_txn_id,
    'notes', v_trimmed_notes
  );
END;
$$;

-- 2. RPC: refund_order_settlement
-- Restores redeemed wallet store credit and reverses earned loyalty rewards when a settled order is cancelled / refunded
CREATE OR REPLACE FUNCTION public.refund_order_settlement(
  p_order_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order RECORD;
  v_is_staff BOOLEAN;
  v_trimmed_reason TEXT;
  v_norm_mobile TEXT;
  v_wallet RECORD;
  v_wallet_redeem_txn RECORD;
  v_wallet_earn_txn RECORD;
  v_redeemed_restored NUMERIC := 0;
  v_reward_reversed NUMERIC := 0;
  v_new_balance NUMERIC := 0;
  v_already_refunded BOOLEAN := false;
BEGIN
  -- Authentication & Authorization check
  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    IF v_uid IS NULL AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
    END IF;
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'A refund reason is required.';
  END IF;

  -- Lock target order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found.', p_order_id;
  END IF;

  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'ADMIN'::text)
                  OR public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text)
                  OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to refund orders for this restaurant.';
    END IF;
  END IF;

  v_norm_mobile := public.normalize_phone(v_order.customer_phone);

  -- Check if already refunded / reversed
  SELECT EXISTS (
    SELECT 1 FROM public.customer_wallet_transactions
    WHERE order_id = v_order.id
      AND transaction_type = 'refund'
  ) INTO v_already_refunded;

  IF v_already_refunded THEN
    RAISE EXCEPTION 'Order % has already been refunded in wallet ledger.', p_order_id;
  END IF;

  -- Handle Wallet Reversal if customer phone is present
  IF v_norm_mobile IS NOT NULL THEN
    -- Lock customer wallet
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE restaurant_id = v_order.restaurant_id
      AND customer_mobile = v_norm_mobile
    FOR UPDATE;

    -- 1. Restore Redeemed Wallet (if any)
    SELECT * INTO v_wallet_redeem_txn
    FROM public.customer_wallet_transactions
    WHERE order_id = v_order.id
      AND transaction_type = 'redeem'
    LIMIT 1;

    IF v_wallet_redeem_txn.id IS NOT NULL AND v_wallet_redeem_txn.amount > 0 THEN
      v_redeemed_restored := v_wallet_redeem_txn.amount;
      
      IF v_wallet.id IS NOT NULL THEN
        v_new_balance := v_wallet.balance + v_redeemed_restored;
        UPDATE public.customer_wallets
        SET balance = v_new_balance,
            total_redeemed = GREATEST(0.00, total_redeemed - v_redeemed_restored),
            updated_at = NOW()
        WHERE id = v_wallet.id;
      ELSE
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
          v_redeemed_restored,
          v_redeemed_restored,
          0.00,
          NOW()
        )
        RETURNING * INTO v_wallet;
        v_new_balance := v_redeemed_restored;
      END IF;

      INSERT INTO public.customer_wallet_transactions (
        restaurant_id,
        customer_mobile,
        order_id,
        transaction_type,
        amount,
        balance_after,
        notes,
        created_at
      ) VALUES (
        v_order.restaurant_id,
        v_norm_mobile,
        v_order.id,
        'refund',
        v_redeemed_restored,
        v_new_balance,
        'Restored wallet credit from refunded Order #' || v_order.order_number || ' (Reason: ' || v_trimmed_reason || ')',
        NOW()
      );
    END IF;

    -- 2. Reverse Loyalty Reward (if any was earned)
    SELECT * INTO v_wallet_earn_txn
    FROM public.customer_wallet_transactions
    WHERE order_id = v_order.id
      AND transaction_type = 'earn'
    LIMIT 1;

    IF v_wallet_earn_txn.id IS NOT NULL AND v_wallet_earn_txn.amount > 0 THEN
      v_reward_reversed := v_wallet_earn_txn.amount;

      IF v_wallet.id IS NOT NULL THEN
        v_new_balance := GREATEST(0.00, v_new_balance - v_reward_reversed);
        UPDATE public.customer_wallets
        SET balance = v_new_balance,
            total_earned = GREATEST(0.00, total_earned - v_reward_reversed),
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.customer_wallet_transactions (
          restaurant_id,
          customer_mobile,
          order_id,
          transaction_type,
          amount,
          balance_after,
          notes,
          created_at
        ) VALUES (
          v_order.restaurant_id,
          v_norm_mobile,
          v_order.id,
          'adjustment',
          v_reward_reversed,
          v_new_balance,
          'Reversed reward earned from refunded Order #' || v_order.order_number,
          NOW()
        );
      END IF;
    END IF;
  END IF;

  -- 3. Update Order Status
  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'refunded',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[REFUNDED: ' || v_trimmed_reason || ']'
        ELSE notes || ' [REFUNDED: ' || v_trimmed_reason || ']'
      END,
      updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- 4. Free Table if occupied
  IF v_order.table_id IS NOT NULL THEN
    UPDATE public.tables
    SET status = 'available',
        updated_at = NOW()
    WHERE id = v_order.table_id;
  END IF;

  -- 5. Audit log
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
    'REFUND_ORDER',
    'ORDER',
    v_order.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'reason', v_trimmed_reason,
      'wallet_restored', v_redeemed_restored,
      'reward_reversed', v_reward_reversed,
      'new_wallet_balance', v_new_balance
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'wallet_restored', v_redeemed_restored,
    'reward_reversed', v_reward_reversed,
    'new_wallet_balance', v_new_balance
  );
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.adjust_customer_wallet(uuid, text, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_wallet(uuid, text, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.refund_order_settlement(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_order_settlement(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
