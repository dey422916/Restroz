-- ============================================================================
-- RESTROZ SAAS — DEV SEED CLEANUP SCRIPT
-- Environment: DEVELOPMENT (restroz-dev ONLY)
-- Surgically removes ONLY the test records created for Panch Phoron Restaurant
-- Leaves all other existing restaurants, users, and data completely untouched
-- ============================================================================

DO $$
DECLARE
    v_rest_id UUID := 'e0000000-0000-0000-0000-000000000001'::uuid;
    v_user_ids UUID[];
BEGIN
    -- Dynamically resolve all user IDs associated with the 5 test emails
    SELECT ARRAY_AGG(id) INTO v_user_ids
    FROM auth.users
    WHERE email IN (
        'rdsa@yopmail.com',
        'ppad@yopmail.com',
        'ppst@yopmail.com',
        'ppkt@yopmail.com',
        'ppcu@yopmail.com'
    );

    IF v_user_ids IS NULL THEN
        v_user_ids := ARRAY[
            'a0000000-0000-0000-0000-000000000001'::uuid,
            'a0000000-0000-0000-0000-000000000002'::uuid,
            'a0000000-0000-0000-0000-000000000003'::uuid,
            'a0000000-0000-0000-0000-000000000004'::uuid,
            'a0000000-0000-0000-0000-000000000005'::uuid
        ];
    END IF;

    -- 1. Remove Customer Notifications & Events associated with seeded customer/restaurant
    DELETE FROM public.customer_notifications WHERE user_id = ANY(v_user_ids) OR restaurant_id = v_rest_id;
    DELETE FROM public.order_status_events WHERE restaurant_id = v_rest_id;

    -- 2. Remove Payments for seeded orders
    DELETE FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = v_rest_id);

    -- 3. Remove KOT Items & KOTs for seeded restaurant
    DELETE FROM public.kot_items WHERE kot_id IN (SELECT id FROM public.kots WHERE restaurant_id = v_rest_id);
    DELETE FROM public.kots WHERE restaurant_id = v_rest_id;

    -- 4. Remove Order Items & Orders
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = v_rest_id);
    DELETE FROM public.orders WHERE restaurant_id = v_rest_id;

    -- 5. Remove Customer Addresses & Favorite Restaurants
    DELETE FROM public.customer_addresses WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.favorite_restaurants WHERE user_id = ANY(v_user_ids) OR restaurant_id = v_rest_id;

    -- 6. Remove Day Registers
    DELETE FROM public.day_registers WHERE restaurant_id = v_rest_id;

    -- 7. Remove Coupons
    DELETE FROM public.coupons WHERE restaurant_id = v_rest_id;

    -- 8. Remove Tables
    DELETE FROM public.tables WHERE restaurant_id = v_rest_id;

    -- 9. Remove Products & Categories
    DELETE FROM public.products WHERE restaurant_id = v_rest_id;
    DELETE FROM public.categories WHERE restaurant_id = v_rest_id;

    -- 10. Remove Subscriptions & Subscription Payments
    DELETE FROM public.subscription_payments WHERE restaurant_id = v_rest_id;
    DELETE FROM public.restaurant_subscriptions WHERE restaurant_id = v_rest_id;

    -- 11. Remove Restaurant Settings & Public Profiles
    DELETE FROM public.restaurant_public_profiles WHERE restaurant_id = v_rest_id;
    DELETE FROM public.restaurant_settings WHERE restaurant_id = v_rest_id;

    -- 12. Remove Restaurant Member Permissions & Members
    DELETE FROM public.restaurant_member_permissions 
    WHERE restaurant_member_id IN (SELECT id FROM public.restaurant_members WHERE restaurant_id = v_rest_id);
    DELETE FROM public.restaurant_members WHERE restaurant_id = v_rest_id;

    -- 13. Remove Audit Logs
    DELETE FROM public.audit_logs WHERE restaurant_id = v_rest_id OR user_id = ANY(v_user_ids);

    -- 14. Remove Restaurant Record
    DELETE FROM public.restaurants WHERE id = v_rest_id;

    -- 15. Remove Profiles & Auth Identities / Users
    DELETE FROM public.profiles WHERE id = ANY(v_user_ids);
    DELETE FROM auth.identities WHERE user_id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);

    RAISE NOTICE 'DEV Panch Phoron seed data successfully removed.';
END $$;
