-- Migration: 20260927000003_loyalty_rewards_and_customer_wallet.sql
-- Description: Implement Loyalty Rewards + Customer Wallet system (DEV ONLY)
-- Tables: loyalty_reward_settings, customer_wallets, customer_wallet_transactions
-- Functions/RPCs: normalize_phone, get_customer_wallet, save_loyalty_settings, get_customer_marketplace_wallets, settle_order

-- 1. Helper function to normalize Indian mobile numbers
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN NULL;
  END IF;
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_digits) = 12 AND v_digits LIKE '91%' THEN
    v_digits := substr(v_digits, 3);
  ELSIF length(v_digits) = 11 AND v_digits LIKE '0%' THEN
    v_digits := substr(v_digits, 2);
  END IF;
  
  IF length(v_digits) = 10 AND v_digits ~ '^[6-9][0-9]{9}$' THEN
    RETURN v_digits;
  END IF;
  
  RETURN NULL;
END;
$$;

-- 2. Create loyalty_reward_settings table
CREATE TABLE IF NOT EXISTS public.loyalty_reward_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  spend_amount NUMERIC(10,2) NOT NULL DEFAULT 100.00 CHECK (spend_amount > 0),
  reward_amount NUMERIC(10,2) NOT NULL DEFAULT 1.00 CHECK (reward_amount >= 0),
  min_redeem_balance NUMERIC(10,2) NOT NULL DEFAULT 50.00 CHECK (min_redeem_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loyalty_reward_settings_restaurant_unique UNIQUE (restaurant_id)
);

-- 3. Create customer_wallets table
CREATE TABLE IF NOT EXISTS public.customer_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_mobile TEXT NOT NULL,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  total_earned NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_earned >= 0),
  total_redeemed NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_redeemed >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_wallets_restaurant_mobile_unique UNIQUE (restaurant_id, customer_mobile)
);

-- 4. Create customer_wallet_transactions table
CREATE TABLE IF NOT EXISTS public.customer_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_mobile TEXT NOT NULL,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'refund', 'adjustment')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_settings_rest ON public.loyalty_reward_settings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customer_wallets_rest_mobile ON public.customer_wallets(restaurant_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_txns_rest_mobile ON public.customer_wallet_transactions(restaurant_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_txns_order ON public.customer_wallet_transactions(order_id);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.loyalty_reward_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Strict Tenant Isolation, No USING (true))

-- loyalty_reward_settings RLS
DROP POLICY IF EXISTS "loyalty_settings_select" ON public.loyalty_reward_settings;
CREATE POLICY "loyalty_settings_select"
ON public.loyalty_reward_settings
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR is_enabled = true
);

DROP POLICY IF EXISTS "loyalty_settings_insert_update" ON public.loyalty_reward_settings;
CREATE POLICY "loyalty_settings_insert_update"
ON public.loyalty_reward_settings
FOR ALL
TO authenticated
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

-- customer_wallets RLS
DROP POLICY IF EXISTS "customer_wallets_select" ON public.customer_wallets;
CREATE POLICY "customer_wallets_select"
ON public.customer_wallets
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR customer_mobile = public.normalize_phone(COALESCE(auth.jwt() ->> 'phone', ''))
  OR customer_mobile = public.normalize_phone((SELECT phone FROM public.profiles WHERE id = auth.uid()))
);

-- customer_wallet_transactions RLS
DROP POLICY IF EXISTS "customer_wallet_txns_select" ON public.customer_wallet_transactions;
CREATE POLICY "customer_wallet_txns_select"
ON public.customer_wallet_transactions
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR customer_mobile = public.normalize_phone(COALESCE(auth.jwt() ->> 'phone', ''))
  OR customer_mobile = public.normalize_phone((SELECT phone FROM public.profiles WHERE id = auth.uid()))
);

-- 7. RPC: get_customer_wallet
CREATE OR REPLACE FUNCTION public.get_customer_wallet(
  p_restaurant_id uuid,
  p_customer_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_norm_mobile text;
  v_settings RECORD;
  v_wallet RECORD;
BEGIN
  v_norm_mobile := public.normalize_phone(p_customer_mobile);
  
  -- Load settings
  SELECT * INTO v_settings
  FROM public.loyalty_reward_settings
  WHERE restaurant_id = p_restaurant_id;

  IF v_norm_mobile IS NULL THEN
    RETURN jsonb_build_object(
      'is_enabled', COALESCE(v_settings.is_enabled, false),
      'spend_amount', COALESCE(v_settings.spend_amount, 100.00),
      'reward_amount', COALESCE(v_settings.reward_amount, 1.00),
      'min_redeem_balance', COALESCE(v_settings.min_redeem_balance, 50.00),
      'customer_mobile', NULL,
      'balance', 0.00,
      'total_earned', 0.00,
      'total_redeemed', 0.00,
      'can_redeem', false
    );
  END IF;

  SELECT * INTO v_wallet
  FROM public.customer_wallets
  WHERE restaurant_id = p_restaurant_id
    AND customer_mobile = v_norm_mobile;

  RETURN jsonb_build_object(
    'is_enabled', COALESCE(v_settings.is_enabled, false),
    'spend_amount', COALESCE(v_settings.spend_amount, 100.00),
    'reward_amount', COALESCE(v_settings.reward_amount, 1.00),
    'min_redeem_balance', COALESCE(v_settings.min_redeem_balance, 50.00),
    'customer_mobile', v_norm_mobile,
    'balance', COALESCE(v_wallet.balance, 0.00),
    'total_earned', COALESCE(v_wallet.total_earned, 0.00),
    'total_redeemed', COALESCE(v_wallet.total_redeemed, 0.00),
    'can_redeem', (
      COALESCE(v_settings.is_enabled, false) = true
      AND COALESCE(v_wallet.balance, 0.00) >= COALESCE(v_settings.min_redeem_balance, 50.00)
      AND COALESCE(v_wallet.balance, 0.00) > 0
    )
  );
END;
$$;

-- 8. RPC: save_loyalty_settings
CREATE OR REPLACE FUNCTION public.save_loyalty_settings(
  p_restaurant_id uuid,
  p_is_enabled boolean,
  p_spend_amount numeric,
  p_reward_amount numeric,
  p_min_redeem_balance numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_res RECORD;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated.';
    END IF;
    v_is_admin := public.is_restaurant_member(p_restaurant_id, 'ADMIN'::text) OR public.is_super_admin();
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only restaurant admin can configure loyalty reward settings.';
    END IF;
  END IF;

  IF p_spend_amount <= 0 THEN
    RAISE EXCEPTION 'Spend amount must be greater than 0.';
  END IF;
  IF p_reward_amount < 0 THEN
    RAISE EXCEPTION 'Reward amount cannot be negative.';
  END IF;
  IF p_min_redeem_balance < 0 THEN
    RAISE EXCEPTION 'Minimum redeem balance cannot be negative.';
  END IF;

  INSERT INTO public.loyalty_reward_settings (
    restaurant_id,
    is_enabled,
    spend_amount,
    reward_amount,
    min_redeem_balance,
    updated_at
  ) VALUES (
    p_restaurant_id,
    p_is_enabled,
    p_spend_amount,
    p_reward_amount,
    p_min_redeem_balance,
    NOW()
  )
  ON CONFLICT (restaurant_id) DO UPDATE SET
    is_enabled = EXCLUDED.is_enabled,
    spend_amount = EXCLUDED.spend_amount,
    reward_amount = EXCLUDED.reward_amount,
    min_redeem_balance = EXCLUDED.min_redeem_balance,
    updated_at = NOW()
  RETURNING * INTO v_res;

  RETURN to_jsonb(v_res);
END;
$$;

-- 9. RPC: get_customer_marketplace_wallets
CREATE OR REPLACE FUNCTION public.get_customer_marketplace_wallets(
  p_customer_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_norm_mobile text;
  v_wallets jsonb;
  v_txns jsonb;
BEGIN
  v_norm_mobile := public.normalize_phone(p_customer_mobile);
  IF v_norm_mobile IS NULL THEN
    RETURN jsonb_build_object('wallets', '[]'::jsonb, 'transactions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', w.id,
      'restaurant_id', w.restaurant_id,
      'restaurant_name', r.name,
      'customer_mobile', w.customer_mobile,
      'balance', w.balance,
      'total_earned', w.total_earned,
      'total_redeemed', w.total_redeemed,
      'min_redeem_balance', COALESCE(s.min_redeem_balance, 50.00),
      'is_enabled', COALESCE(s.is_enabled, false)
    ) ORDER BY w.balance DESC
  ), '[]'::jsonb) INTO v_wallets
  FROM public.customer_wallets w
  JOIN public.restaurants r ON r.id = w.restaurant_id
  LEFT JOIN public.loyalty_reward_settings s ON s.restaurant_id = w.restaurant_id
  WHERE w.customer_mobile = v_norm_mobile;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'restaurant_id', t.restaurant_id,
      'restaurant_name', r.name,
      'order_id', t.order_id,
      'transaction_type', t.transaction_type,
      'amount', t.amount,
      'balance_after', t.balance_after,
      'created_at', t.created_at,
      'notes', t.notes
    ) ORDER BY t.created_at DESC
  ), '[]'::jsonb) INTO v_txns
  FROM (
    SELECT tx.*
    FROM public.customer_wallet_transactions tx
    WHERE tx.customer_mobile = v_norm_mobile
    ORDER BY tx.created_at DESC
    LIMIT 50
  ) t
  JOIN public.restaurants r ON r.id = t.restaurant_id;

  RETURN jsonb_build_object(
    'wallets', v_wallets,
    'transactions', v_txns
  );
END;
$$;

-- 10. Update settle_order RPC to include atomic wallet redemption and rewards earning
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
  v_loyalty_settings RECORD;
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

    -- Load restaurant loyalty settings
    SELECT * INTO v_loyalty_settings
    FROM public.loyalty_reward_settings
    WHERE restaurant_id = v_order.restaurant_id;

    IF NOT FOUND OR NOT v_loyalty_settings.is_enabled THEN
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
    IF v_wallet.balance < v_loyalty_settings.min_redeem_balance THEN
      RAISE EXCEPTION 'Minimum ₹% wallet balance required to redeem. Current balance is ₹%.',
        v_loyalty_settings.min_redeem_balance, v_wallet.balance;
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
      taxable_amount = COALESCE(p_taxable_amount, v_order.taxable_amount),
      cgst_amount = COALESCE(p_cgst_amount, v_order.cgst_amount),
      sgst_amount = COALESCE(p_sgst_amount, v_order.sgst_amount),
      grand_total = COALESCE(p_grand_total, v_order.grand_total),
      round_off = COALESCE(p_round_off, v_order.round_off),
      payable_amount = v_final_payable,
      customer_gstin = COALESCE(TRIM(UPPER(p_customer_gstin)), v_order.customer_gstin),
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
  IF v_norm_mobile IS NOT NULL THEN
    IF v_loyalty_settings.id IS NULL THEN
      SELECT * INTO v_loyalty_settings
      FROM public.loyalty_reward_settings
      WHERE restaurant_id = v_order.restaurant_id;
    END IF;

    IF v_loyalty_settings.is_enabled AND v_loyalty_settings.spend_amount > 0 AND v_loyalty_settings.reward_amount > 0 THEN
      -- Eligible spend base is total payable minus wallet redemption
      v_eligible_spend := GREATEST(0.00, v_final_payable - v_wallet_redeemed);

      -- Check duplicate earning prevention
      SELECT EXISTS (
        SELECT 1 FROM public.customer_wallet_transactions
        WHERE order_id = v_order.id
          AND transaction_type = 'earn'
      ) INTO v_already_earned;

      IF NOT v_already_earned AND v_eligible_spend > 0 THEN
        v_earned_reward := ROUND((v_eligible_spend / v_loyalty_settings.spend_amount) * v_loyalty_settings.reward_amount, 2);

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

-- 11. Grant execute permissions
REVOKE ALL ON FUNCTION public.get_customer_wallet(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_wallet(uuid, text) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.save_loyalty_settings(uuid, boolean, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_loyalty_settings(uuid, boolean, numeric, numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_customer_marketplace_wallets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_marketplace_wallets(text) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) TO authenticated, service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
