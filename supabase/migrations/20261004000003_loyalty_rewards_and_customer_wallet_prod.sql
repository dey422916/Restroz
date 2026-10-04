-- Migration: 20261004000003_loyalty_rewards_and_customer_wallet_prod.sql
-- Description: Loyalty Rewards + Customer Wallet Subsystem for PROD (Additive & Safe)
-- Target: PRODUCTION Supabase (szpjsibrwxegaopcaukb)

-- 1. Helper function to normalize Indian mobile numbers to standard 10 digits
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

GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon, authenticated, service_role;

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

CREATE INDEX IF NOT EXISTS idx_loyalty_settings_restaurant_id ON public.loyalty_reward_settings(restaurant_id);

ALTER TABLE public.loyalty_reward_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Restaurant members can view their own loyalty settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_reward_settings' AND policyname = 'loyalty_settings_select_policy') THEN
    CREATE POLICY loyalty_settings_select_policy ON public.loyalty_reward_settings
      FOR SELECT
      USING (
        public.is_restaurant_member(restaurant_id, 'STAFF'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
      );
  END IF;
END $$;

-- RLS: Restaurant Admin can manage loyalty settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_reward_settings' AND policyname = 'loyalty_settings_all_admin_policy') THEN
    CREATE POLICY loyalty_settings_all_admin_policy ON public.loyalty_reward_settings
      FOR ALL
      USING (
        public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
      )
      WITH CHECK (
        public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
      );
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_customer_wallets_lookup ON public.customer_wallets(restaurant_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_customer_wallets_mobile ON public.customer_wallets(customer_mobile);

ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;

-- RLS: Staff can view customer wallets for their restaurant
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_wallets' AND policyname = 'customer_wallets_select_staff') THEN
    CREATE POLICY customer_wallets_select_staff ON public.customer_wallets
      FOR SELECT
      USING (
        public.is_restaurant_member(restaurant_id, 'STAFF'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (auth.uid() IS NOT NULL AND customer_mobile = public.normalize_phone((auth.jwt() ->> 'phone')::text))
      );
  END IF;
END $$;

-- RLS: Admin/SuperAdmin/ServiceRole can manage customer wallets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_wallets' AND policyname = 'customer_wallets_all_admin') THEN
    CREATE POLICY customer_wallets_all_admin ON public.customer_wallets
      FOR ALL
      USING (
        public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
      )
      WITH CHECK (
        public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
      );
  END IF;
END $$;

-- 4. Create customer_wallet_transactions table (Ledger)
CREATE TABLE IF NOT EXISTS public.customer_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_mobile TEXT NOT NULL,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'redeem', 'refund', 'adjustment')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(10,2) NOT NULL CHECK (balance_after >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_lookup ON public.customer_wallet_transactions(restaurant_id, customer_mobile);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_order ON public.customer_wallet_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txns_mobile ON public.customer_wallet_transactions(customer_mobile);

ALTER TABLE public.customer_wallet_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_wallet_transactions' AND policyname = 'wallet_txns_select_staff') THEN
    CREATE POLICY wallet_txns_select_staff ON public.customer_wallet_transactions
      FOR SELECT
      USING (
        public.is_restaurant_member(restaurant_id, 'STAFF'::text)
        OR public.is_super_admin()
        OR auth.role() = 'service_role'
        OR (auth.uid() IS NOT NULL AND customer_mobile = public.normalize_phone((auth.jwt() ->> 'phone')::text))
      );
  END IF;
END $$;

-- 5. RPC: get_customer_wallet
CREATE OR REPLACE FUNCTION public.get_customer_wallet(
  p_restaurant_id uuid,
  p_customer_mobile text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_is_enabled BOOLEAN := false;
  v_spend_amount NUMERIC := 100.00;
  v_reward_amount NUMERIC := 1.00;
  v_min_redeem_balance NUMERIC := 50.00;
  v_balance NUMERIC := 0.00;
  v_total_earned NUMERIC := 0.00;
  v_total_redeemed NUMERIC := 0.00;
  v_norm_mobile TEXT;
  v_can_redeem BOOLEAN := false;
BEGIN
  -- 1. Fetch loyalty settings
  SELECT 
    COALESCE(is_enabled, false),
    COALESCE(spend_amount, 100.00),
    COALESCE(reward_amount, 1.00),
    COALESCE(min_redeem_balance, 50.00)
  INTO
    v_is_enabled,
    v_spend_amount,
    v_reward_amount,
    v_min_redeem_balance
  FROM public.loyalty_reward_settings
  WHERE restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    v_is_enabled := false;
    v_spend_amount := 100.00;
    v_reward_amount := 1.00;
    v_min_redeem_balance := 50.00;
  END IF;

  -- 2. Normalize customer phone if provided
  v_norm_mobile := public.normalize_phone(p_customer_mobile);

  IF v_norm_mobile IS NOT NULL THEN
    SELECT 
      COALESCE(balance, 0.00),
      COALESCE(total_earned, 0.00),
      COALESCE(total_redeemed, 0.00)
    INTO 
      v_balance,
      v_total_earned,
      v_total_redeemed
    FROM public.customer_wallets
    WHERE restaurant_id = p_restaurant_id
      AND customer_mobile = v_norm_mobile;

    IF FOUND THEN
      v_can_redeem := (
        v_is_enabled
        AND v_balance >= v_min_redeem_balance
        AND v_balance > 0
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_enabled', v_is_enabled,
    'spend_amount', v_spend_amount,
    'reward_amount', v_reward_amount,
    'min_redeem_balance', v_min_redeem_balance,
    'customer_mobile', v_norm_mobile,
    'balance', v_balance,
    'total_earned', v_total_earned,
    'total_redeemed', v_total_redeemed,
    'can_redeem', v_can_redeem
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_wallet(uuid, text) TO anon, authenticated, service_role;

-- 6. RPC: save_loyalty_settings
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
      RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
    END IF;
    v_is_admin := public.is_restaurant_member(p_restaurant_id, 'ADMIN'::text) OR public.is_super_admin();
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Unauthorized: Only restaurant admin or super admin can save loyalty settings.';
    END IF;
  END IF;

  IF p_spend_amount <= 0 THEN
    RAISE EXCEPTION 'Spend amount must be greater than zero.';
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

GRANT EXECUTE ON FUNCTION public.save_loyalty_settings(uuid, boolean, numeric, numeric, numeric) TO authenticated, service_role;

-- 7. RPC: get_customer_marketplace_wallets
CREATE OR REPLACE FUNCTION public.get_customer_marketplace_wallets(
  p_customer_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_norm_mobile TEXT;
  v_wallets JSONB;
  v_txns JSONB;
BEGIN
  v_norm_mobile := public.normalize_phone(p_customer_mobile);
  IF v_norm_mobile IS NULL THEN
    RETURN jsonb_build_object('wallets', '[]'::jsonb, 'transactions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(w_row), '[]'::jsonb) INTO v_wallets
  FROM (
    SELECT 
      cw.id,
      cw.restaurant_id,
      r.name AS restaurant_name,
      cw.customer_mobile,
      cw.balance,
      cw.total_earned,
      cw.total_redeemed,
      COALESCE(lrs.min_redeem_balance, 50.00) AS min_redeem_balance,
      COALESCE(lrs.is_enabled, false) AS is_enabled
    FROM public.customer_wallets cw
    JOIN public.restaurants r ON r.id = cw.restaurant_id
    LEFT JOIN public.loyalty_reward_settings lrs ON lrs.restaurant_id = cw.restaurant_id
    WHERE cw.customer_mobile = v_norm_mobile
      AND cw.balance > 0
    ORDER BY cw.balance DESC
  ) w_row;

  SELECT COALESCE(jsonb_agg(t_row), '[]'::jsonb) INTO v_txns
  FROM (
    SELECT 
      cwt.id,
      cwt.restaurant_id,
      r.name AS restaurant_name,
      cwt.order_id,
      cwt.transaction_type,
      cwt.amount,
      cwt.balance_after,
      cwt.created_at,
      cwt.notes
    FROM public.customer_wallet_transactions cwt
    JOIN public.restaurants r ON r.id = cwt.restaurant_id
    WHERE cwt.customer_mobile = v_norm_mobile
    ORDER BY cwt.created_at DESC
    LIMIT 20
  ) t_row;

  RETURN jsonb_build_object(
    'wallets', v_wallets,
    'transactions', v_txns
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_marketplace_wallets(text) TO anon, authenticated, service_role;

-- 8. RPC: adjust_customer_wallet (Manual adjustment with ledger by Admin)
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

  SELECT * INTO v_wallet
  FROM public.customer_wallets
  WHERE restaurant_id = p_restaurant_id
    AND customer_mobile = v_norm_mobile
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'Cannot deduct balance: Customer has no existing wallet in this restaurant.';
    END IF;

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
      CASE WHEN p_amount > 0 THEN p_amount ELSE 0 END,
      0,
      NOW()
    )
    RETURNING balance INTO v_new_balance;
  ELSE
    v_new_balance := v_wallet.balance + p_amount;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient balance: Cannot reduce balance below ₹0.00 (Current balance: ₹%).', v_wallet.balance;
    END IF;

    UPDATE public.customer_wallets
    SET balance = v_new_balance,
        total_earned = total_earned + CASE WHEN p_amount > 0 THEN p_amount ELSE 0 END,
        total_redeemed = total_redeemed + CASE WHEN p_amount < 0 THEN ABS(p_amount) ELSE 0 END,
        updated_at = NOW()
    WHERE id = v_wallet.id;
  END IF;

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
    v_trimmed_notes,
    NOW()
  )
  RETURNING id INTO v_txn_id;

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

GRANT EXECUTE ON FUNCTION public.adjust_customer_wallet(uuid, text, numeric, text, text) TO authenticated, service_role;

-- 9. RPC: refund_order_settlement
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
  v_norm_mobile TEXT;
  v_wallet RECORD;
  v_earned_txn RECORD;
  v_redeem_txn RECORD;
  v_wallet_restored NUMERIC := 0;
  v_reward_reversed NUMERIC := 0;
  v_new_wallet_balance NUMERIC := 0;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated: Valid user session required.';
    END IF;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF COALESCE(auth.jwt() ->> 'role', '') != 'service_role' AND current_user != 'postgres' THEN
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to refund orders for this restaurant.';
    END IF;
  END IF;

  v_norm_mobile := public.normalize_phone(v_order.customer_phone);

  IF v_norm_mobile IS NOT NULL THEN
    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE restaurant_id = v_order.restaurant_id
      AND customer_mobile = v_norm_mobile
    FOR UPDATE;

    IF FOUND THEN
      -- Restore redeemed wallet amount if any
      SELECT * INTO v_redeem_txn
      FROM public.customer_wallet_transactions
      WHERE order_id = v_order.id
        AND transaction_type = 'redeem'
      LIMIT 1;

      IF FOUND THEN
        v_wallet_restored := v_redeem_txn.amount;
        v_wallet.balance := v_wallet.balance + v_wallet_restored;
        v_wallet.total_redeemed := GREATEST(0.00, v_wallet.total_redeemed - v_wallet_restored);

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
          v_wallet_restored,
          v_wallet.balance,
          'Wallet balance restored from cancelled Order #' || v_order.order_number,
          NOW()
        );
      END IF;

      -- Reverse earned reward if any
      SELECT * INTO v_earned_txn
      FROM public.customer_wallet_transactions
      WHERE order_id = v_order.id
        AND transaction_type = 'earn'
      LIMIT 1;

      IF FOUND THEN
        v_reward_reversed := v_earned_txn.amount;
        v_wallet.balance := GREATEST(0.00, v_wallet.balance - v_reward_reversed);
        v_wallet.total_earned := GREATEST(0.00, v_wallet.total_earned - v_reward_reversed);

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
          v_wallet.balance,
          'Reward reversed for cancelled Order #' || v_order.order_number,
          NOW()
        );
      END IF;

      UPDATE public.customer_wallets
      SET balance = v_wallet.balance,
          total_earned = v_wallet.total_earned,
          total_redeemed = v_wallet.total_redeemed,
          updated_at = NOW()
      WHERE id = v_wallet.id;

      v_new_wallet_balance := v_wallet.balance;
    END IF;
  END IF;

  -- Update order status
  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'refunded',
      notes = COALESCE(notes, '') || ' [REFUNDED: ' || TRIM(COALESCE(p_reason, 'Order refund issued')) || ']',
      updated_at = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Audit log entry
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
      'wallet_restored', v_wallet_restored,
      'reward_reversed', v_reward_reversed,
      'new_wallet_balance', v_new_wallet_balance,
      'reason', p_reason
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'wallet_restored', v_wallet_restored,
    'reward_reversed', v_reward_reversed,
    'new_wallet_balance', v_new_wallet_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_order_settlement(text, text) TO authenticated, service_role;

-- 10. RPC: settle_order (Updated with 18th argument p_wallet_redeem_amount and safe loyalty initialization)
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
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  IF v_order.status = 'completed' AND v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order', to_jsonb(v_order),
      'wallet_redeemed', 0,
      'reward_earned', 0,
      'new_wallet_balance', 0
    );
  END IF;

  -- 3. Authorization check
  IF NOT v_is_service THEN
    v_is_staff := public.is_restaurant_member(v_order.restaurant_id, 'STAFF'::text) OR public.is_super_admin();
    IF NOT v_is_staff THEN
      RAISE EXCEPTION 'Unauthorized: You do not have permission to settle orders for this restaurant.';
    END IF;
  END IF;

  -- 4. Verify Active Day Register
  SELECT * INTO v_register
  FROM public.day_registers
  WHERE restaurant_id = v_order.restaurant_id
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot settle order: No active Day Register is open for this restaurant.';
  END IF;

  -- 5. Normalize Payment Method
  v_norm_method := LOWER(TRIM(p_payment_method));
  IF v_norm_method = 'online' THEN v_norm_method := 'upi'; END IF;
  IF v_norm_method = 'cod' THEN v_norm_method := 'cash'; END IF;

  -- 6. Calculate Final Payable Amount
  v_final_payable := COALESCE(
    p_payable_amount,
    v_order.payable_amount,
    COALESCE(p_grand_total, v_order.grand_total, 0) - COALESCE(p_discount_amount, v_order.discount_amount, 0)
  );

  -- 7. LOYALTY & CUSTOMER WALLET PROCESSING
  v_norm_mobile := public.normalize_phone(v_order.customer_phone);

  -- Safe retrieval of loyalty settings with explicit scalar variable assignment (no unassigned record error)
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
  END IF;

  -- 8. ATOMIC WALLET REDEMPTION
  IF p_wallet_redeem_amount IS NOT NULL AND p_wallet_redeem_amount > 0 THEN
    IF v_norm_mobile IS NULL THEN
      RAISE EXCEPTION 'Cannot redeem wallet balance without a valid customer mobile number.';
    END IF;

    SELECT * INTO v_wallet
    FROM public.customer_wallets
    WHERE restaurant_id = v_order.restaurant_id
      AND customer_mobile = v_norm_mobile
    FOR UPDATE;

    IF NOT FOUND OR v_wallet.balance < p_wallet_redeem_amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance. Available: ₹%, Requested: ₹%', COALESCE(v_wallet.balance, 0), p_wallet_redeem_amount;
    END IF;

    v_wallet_redeemed := p_wallet_redeem_amount;
    v_new_wallet_balance := v_wallet.balance - v_wallet_redeemed;

    -- Update Customer Wallet row
    UPDATE public.customer_wallets
    SET balance = v_new_wallet_balance,
        total_redeemed = total_redeemed + v_wallet_redeemed,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- Record in Ledger
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

    -- Reduce payable amount by redeemed wallet amount
    v_final_payable := GREATEST(0.00, v_final_payable - v_wallet_redeemed);
  END IF;

  -- 9. Check existing completed payments
  SELECT COALESCE(SUM(amount), 0) INTO v_existing_payments_total
  FROM public.payments
  WHERE order_id = v_order.id AND status = 'completed';

  v_balance := GREATEST(0.00, v_final_payable - v_existing_payments_total);

  SELECT * INTO v_pending_pay
  FROM public.payments
  WHERE order_id = v_order.id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  -- When remaining balance is 0 (e.g. 100% wallet redeemed)
  IF v_balance <= 0 THEN
    v_final_paid := v_existing_payments_total;
    v_pay_status := 'paid';
    v_total_pay_amt := 0;

    IF v_pending_pay.id IS NOT NULL THEN
      UPDATE public.payments
      SET status = 'completed',
          updated_at = NOW()
      WHERE id = v_pending_pay.id;
    END IF;
  ELSE
    -- Split payment support vs single payment
    IF p_split_payments IS NOT NULL AND jsonb_array_length(p_split_payments) > 0 THEN
      IF p_payment_received THEN
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
              v_split_ref,
              'Split payment via ' || v_split_method,
              NOW()
            );

            IF v_split_method = 'cash' THEN v_cash_inc := v_cash_inc + v_split_amt;
            ELSIF v_split_method = 'upi' THEN v_upi_inc := v_upi_inc + v_split_amt;
            ELSIF v_split_method = 'card' THEN v_card_inc := v_card_inc + v_split_amt;
            ELSE v_other_inc := v_other_inc + v_split_amt;
            END IF;

            v_total_pay_amt := v_total_pay_amt + v_split_amt;
          END IF;
        END LOOP;

        IF v_pending_pay.id IS NOT NULL THEN
          DELETE FROM public.payments WHERE id = v_pending_pay.id;
        END IF;

        v_final_paid := v_existing_payments_total + v_total_pay_amt;
        v_pay_status := CASE WHEN v_final_paid >= v_final_payable THEN 'paid' ELSE 'partially_paid' END;
        v_norm_method := 'split';
      ELSE
        v_final_paid := v_existing_payments_total;
        v_pay_status := CASE WHEN v_final_paid >= v_final_payable AND v_final_payable > 0 THEN 'paid' WHEN v_final_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END;
        v_total_pay_amt := 0;
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
  IF v_norm_mobile IS NOT NULL AND v_loyalty_enabled AND v_spend_amount > 0 AND v_reward_amount > 0 THEN
    v_eligible_spend := GREATEST(0.00, v_final_payable - v_wallet_redeemed);

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

  -- 16. Return JSON response
  RETURN jsonb_build_object(
    'success', true,
    'order', to_jsonb(v_order),
    'wallet_redeemed', v_wallet_redeemed,
    'reward_earned', v_earned_reward,
    'new_wallet_balance', v_new_wallet_balance
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_order(text, text, numeric, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, boolean, jsonb, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
