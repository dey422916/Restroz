-- ATOMIC COUPON USAGE INCREMENT FUNCTION
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_coupon_id TEXT, p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.coupons
    SET used_count = used_count + 1,
        updated_at = NOW()
    WHERE id = p_coupon_id
      AND (usage_limit IS NULL OR used_count < usage_limit)
      AND is_active = TRUE;
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN (v_updated > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(TEXT, UUID) TO authenticated, anon, service_role;
