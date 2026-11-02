-- ============================================================================
-- RESTROZ SAAS — COMPLETE DASHBOARD ANALYTICS SERVER-SIDE AGGREGATE FUNCTION
-- Provides lightweight, high-performance scalar analytics summary (< 400 bytes)
-- Includes true split payment reconciliation from payments table
-- Scoped strictly to restaurant_id and requested date bounds
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_analytics_summary(
  p_restaurant_id uuid,
  p_start_date text,
  p_end_date text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $func$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_order_totals record;
  v_cash numeric := 0;
  v_upi numeric := 0;
  v_card numeric := 0;
  v_wallet numeric := 0;
  v_other numeric := 0;
BEGIN
  -- Parse local dates as ISO bounds
  v_start := (p_start_date || ' 00:00:00')::timestamptz;
  v_end := (p_end_date || ' 23:59:59.999')::timestamptz;

  -- 1. Orders Aggregate Summary
  SELECT
    count(*) AS total_orders,
    COALESCE(sum(CASE WHEN status != 'cancelled' THEN payable_amount ELSE 0 END), 0) AS gross_sales,
    COALESCE(sum(CASE WHEN status != 'cancelled' THEN payable_amount ELSE 0 END), 0) AS net_sales,
    COALESCE(sum(CASE WHEN status != 'cancelled' THEN COALESCE(cgst_amount,0) + COALESCE(sgst_amount,0) + COALESCE(igst_amount,0) ELSE 0 END), 0) AS tax_collected,
    COALESCE(sum(CASE WHEN status != 'cancelled' THEN COALESCE(discount_amount,0) + COALESCE(coupon_discount,0) ELSE 0 END), 0) AS discount_amount,
    count(*) FILTER (WHERE status != 'cancelled' AND payment_status = 'paid') AS paid_orders_count,
    count(*) FILTER (WHERE status = 'cancelled') AS cancelled_orders_count,
    COALESCE(sum(CASE WHEN status != 'cancelled' AND order_type = 'dine_in' THEN payable_amount ELSE 0 END), 0) AS dine_in_sales,
    COALESCE(sum(CASE WHEN status != 'cancelled' AND order_type = 'takeaway' THEN payable_amount ELSE 0 END), 0) AS takeaway_sales,
    COALESCE(sum(CASE WHEN status != 'cancelled' AND order_type = 'delivery' THEN payable_amount ELSE 0 END), 0) AS delivery_sales,
    COALESCE(sum(CASE WHEN status != 'cancelled' AND (notes ILIKE '%[QR%' OR notes ILIKE '%QR%') THEN payable_amount ELSE 0 END), 0) AS qr_sales
  INTO v_order_totals
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
    AND created_at >= v_start
    AND created_at <= v_end;

  -- 2. Accurate Payment Methods Breakdown (supports split payments & wallet redemptions)
  SELECT
    COALESCE(sum(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN p.payment_method = 'upi' THEN p.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN p.payment_method = 'card' THEN p.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN p.payment_method = 'wallet' THEN p.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN p.payment_method NOT IN ('cash', 'upi', 'card', 'wallet') THEN p.amount ELSE 0 END), 0)
  INTO v_cash, v_upi, v_card, v_wallet, v_other
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_start
    AND o.created_at <= v_end
    AND o.status != 'cancelled';

  -- If payments table had no rows for legacy/cash orders, fallback to order.payment_method
  IF v_cash = 0 AND v_upi = 0 AND v_card = 0 AND v_order_totals.paid_orders_count > 0 THEN
    SELECT
      COALESCE(sum(CASE WHEN payment_method ILIKE 'cash%' THEN paid_amount ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN payment_method ILIKE 'upi%' OR payment_method ILIKE 'qr%' THEN paid_amount ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN payment_method ILIKE 'card%' THEN paid_amount ELSE 0 END), 0)
    INTO v_cash, v_upi, v_card
    FROM public.orders
    WHERE restaurant_id = p_restaurant_id
      AND created_at >= v_start
      AND created_at <= v_end
      AND status != 'cancelled';
  END IF;

  RETURN jsonb_build_object(
    'total_orders', COALESCE(v_order_totals.total_orders, 0),
    'gross_sales', COALESCE(v_order_totals.gross_sales, 0),
    'net_sales', COALESCE(v_order_totals.net_sales, 0),
    'tax_collected', COALESCE(v_order_totals.tax_collected, 0),
    'discount_amount', COALESCE(v_order_totals.discount_amount, 0),
    'paid_orders_count', COALESCE(v_order_totals.paid_orders_count, 0),
    'cancelled_orders_count', COALESCE(v_order_totals.cancelled_orders_count, 0),
    'average_order_value', CASE 
      WHEN COALESCE(v_order_totals.paid_orders_count, 0) > 0 
      THEN round(COALESCE(v_order_totals.net_sales, 0) / v_order_totals.paid_orders_count)
      ELSE 0 
    END,
    'cash_sales', v_cash,
    'upi_sales', v_upi,
    'card_sales', v_card,
    'points_sales', v_wallet,
    'other_sales', v_other,
    'dine_in_sales', COALESCE(v_order_totals.dine_in_sales, 0),
    'takeaway_sales', COALESCE(v_order_totals.takeaway_sales, 0),
    'delivery_sales', COALESCE(v_order_totals.delivery_sales, 0),
    'qr_sales', COALESCE(v_order_totals.qr_sales, 0)
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_summary(uuid, text, text) TO authenticated, anon, service_role;
