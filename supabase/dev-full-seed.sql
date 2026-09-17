-- ============================================================================
-- RESTROZ SAAS — DEV COMPLETE SEED SCRIPT FOR PANCH PHORON RESTAURANT
-- Environment: DEVELOPMENT (restroz-dev ONLY)
-- Safe, Idempotent, Rerun-Ready Test Dataset
-- DO NOT EXECUTE AGAINST PRODUCTION
-- ============================================================================

DO $$
DECLARE
    -- Deterministic DEV UUIDs (Strict Hexadecimal 0-9, a-f ONLY)
    v_rest_id UUID := 'e0000000-0000-0000-0000-000000000001'::uuid;
    
    v_super_admin_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_rest_admin_id  UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
    v_staff_id       UUID := 'a0000000-0000-0000-0000-000000000003'::uuid;
    v_kitchen_id     UUID := 'a0000000-0000-0000-0000-000000000004'::uuid;
    v_customer_id    UUID := 'a0000000-0000-0000-0000-000000000005'::uuid;

    v_mem_admin_id   UUID := 'b0000000-0000-0000-0000-000000000002'::uuid;
    v_mem_staff_id   UUID := 'b0000000-0000-0000-0000-000000000003'::uuid;
    v_mem_kitchen_id UUID := 'b0000000-0000-0000-0000-000000000004'::uuid;

    v_sub_id         UUID := 'c0000000-0000-0000-0000-000000000001'::uuid;
    v_address_id     UUID := 'd0000000-0000-0000-0000-000000000001'::uuid;
    
    v_pw_hash TEXT;
    v_existing_id UUID;
    v_user_id UUID;
    v_u RECORD;
BEGIN
    -- Password hash for 'Password123!'
    v_pw_hash := extensions.crypt('Password123!', extensions.gen_salt('bf', 10));

    -- ------------------------------------------------------------------------
    -- 1. SUBSCRIPTION PLANS (DEV Tiers: Starter, Growth, Pro, Enterprise)
    -- ------------------------------------------------------------------------
    INSERT INTO public.subscription_plans (id, name, code, billing_cycle, price, currency, max_staff, max_tables, max_products, features, is_active)
    VALUES
        ('plan-starter', 'Starter Plan', 'STARTER_MONTHLY', 'monthly', 500.00, 'INR', 5, 10, 50, '{"qr_ordering": true, "inventory": false, "reports": true, "analytics": false}'::JSONB, TRUE),
        ('plan-growth', 'Growth Business', 'GROWTH_MONTHLY', 'monthly', 999.00, 'INR', 10, 20, 150, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": false}'::JSONB, TRUE),
        ('plan-pro', 'Pro Business', 'PRO_MONTHLY', 'monthly', 1999.00, 'INR', 25, 50, 500, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true, "custom_domain": false}'::JSONB, TRUE),
        ('plan-enterprise', 'Enterprise Yearly', 'ENTERPRISE_YEARLY', 'yearly', 14999.00, 'INR', 999, 999, 9999, '{"qr_ordering": true, "inventory": true, "reports": true, "analytics": true, "multi_terminal": true, "custom_domain": true}'::JSONB, TRUE)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        code = EXCLUDED.code,
        price = EXCLUDED.price,
        max_staff = EXCLUDED.max_staff,
        max_tables = EXCLUDED.max_tables,
        max_products = EXCLUDED.max_products,
        features = EXCLUDED.features,
        is_active = TRUE;

    -- ------------------------------------------------------------------------
    -- 2. PANCH PHORON RESTAURANT
    -- ------------------------------------------------------------------------
    INSERT INTO public.restaurants (
        id, name, slug, legal_name, logo_url, banner_url, phone, email,
        address, city, state, postal_code, country, timezone, latitude, longitude, status
    ) VALUES (
        v_rest_id,
        'Panch Phoron Restaurant',
        'panch-phoron',
        'Panch Phoron Foods LLP',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        '+91 98765 43210',
        'contact@panchphoron.dev',
        'Budbud Bypass, Burdwan, West Bengal 713403',
        'Burdwan',
        'West Bengal',
        '713403',
        'India',
        'Asia/Kolkata',
        23.4000000,
        87.5500000,
        'ACTIVE'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        postal_code = EXCLUDED.postal_code,
        phone = EXCLUDED.phone,
        status = 'ACTIVE';

    -- ------------------------------------------------------------------------
    -- 3. RESTAURANT SETTINGS
    -- ------------------------------------------------------------------------
    INSERT INTO public.restaurant_settings (
        id, restaurant_id, name, legal_name, address, city, state, postal_code, country,
        phone, email, gstin, fssai, currency, currency_symbol, tax_rate, cgst_rate, sgst_rate,
        service_charge_rate, packaging_charge_rate, delivery_charge_base, delivery_charge_per_km,
        delivery_radius_km, free_delivery_above, theme_color, primary_color, header_color,
        kot_auto_print, kot_item_grouping, auto_generate_kot, allow_partial_payment,
        allow_credit_orders, enable_table_qr, enable_delivery, enable_takeaway,
        receipt_header, receipt_footer, is_open, opening_time, closing_time,
        banner_url, invoice_sequence_prefix, invoice_next_number
    ) VALUES (
        'rest-' || v_rest_id::text,
        v_rest_id,
        'Panch Phoron Restaurant',
        'Panch Phoron Foods LLP',
        'Budbud Bypass, Burdwan, West Bengal 713403',
        'Burdwan',
        'West Bengal',
        '713403',
        'India',
        '+91 98765 43210',
        'contact@panchphoron.dev',
        '19AAAAA0000A1Z5',
        '12823019000123',
        'INR',
        '₹',
        5.0,
        2.5,
        2.5,
        0.0,
        10.0,
        30.0,
        5.0,
        15.0,
        500.0,
        '#E11D48',
        '#E11D48',
        '#0F172A',
        FALSE,
        TRUE,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        TRUE,
        TRUE,
        'Welcome to Panch Phoron Restaurant! Authentic taste of Bengal & North India.',
        'Thank you for dining with Panch Phoron. Visit us again!',
        TRUE,
        '09:00',
        '23:00',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        'PP',
        10
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        is_open = TRUE,
        enable_delivery = TRUE,
        enable_takeaway = TRUE,
        enable_table_qr = TRUE;

    -- ------------------------------------------------------------------------
    -- 4. RESTAURANT PUBLIC PROFILE (Marketplace Discovery)
    -- ------------------------------------------------------------------------
    INSERT INTO public.restaurant_public_profiles (
        restaurant_id, display_name, marketplace_enabled, accepts_delivery, accepts_takeaway, is_open,
        delivery_radius_km, minimum_order_value, estimated_delivery_minutes, cuisine_tags,
        banner_url, banner_urls, gallery_urls, public_description, opening_time, closing_time,
        latitude, longitude
    ) VALUES (
        v_rest_id,
        'Panch Phoron Restaurant',
        TRUE,
        TRUE,
        TRUE,
        TRUE,
        15.0,
        149.00,
        30,
        ARRAY['Bengali', 'North Indian', 'Biryani', 'Desserts', 'Beverages'],
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
        ARRAY['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'],
        ARRAY['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'],
        'Panch Phoron Restaurant brings authentic culinary traditions with exquisite Bengali, North Indian and Biryani delicacies prepared fresh daily.',
        '09:00 AM',
        '11:00 PM',
        23.4000000,
        87.5500000
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        marketplace_enabled = TRUE,
        accepts_delivery = TRUE,
        accepts_takeaway = TRUE,
        is_open = TRUE,
        delivery_radius_km = 15.0,
        minimum_order_value = 149.00,
        estimated_delivery_minutes = 30,
        cuisine_tags = EXCLUDED.cuisine_tags,
        banner_url = EXCLUDED.banner_url,
        banner_urls = EXCLUDED.banner_urls,
        gallery_urls = EXCLUDED.gallery_urls,
        public_description = EXCLUDED.public_description;

    -- ------------------------------------------------------------------------
    -- 5. ACTIVE RESTAURANT SUBSCRIPTION & PAYMENT
    -- ------------------------------------------------------------------------
    INSERT INTO public.restaurant_subscriptions (
        id, restaurant_id, plan_id, status, start_date, end_date, trial_end, cancel_at_period_end, notes
    ) VALUES (
        v_sub_id,
        v_rest_id,
        'plan-pro',
        'active',
        NOW() - INTERVAL '5 days',
        NOW() + INTERVAL '360 days',
        NOW() + INTERVAL '14 days',
        FALSE,
        'DEV testing active Pro plan subscription for Panch Phoron Restaurant'
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
        plan_id = 'plan-pro',
        status = 'active',
        end_date = NOW() + INTERVAL '360 days';

    INSERT INTO public.subscription_payments (
        subscription_id, restaurant_id, plan_id, amount, currency, payment_method, payment_status, transaction_reference, paid_at, notes
    ) VALUES (
        v_sub_id,
        v_rest_id,
        'plan-pro',
        1999.00,
        'INR',
        'upi',
        'paid',
        'DEV-TXN-SUB-0001',
        NOW() - INTERVAL '5 days',
        'DEV test subscription fee payment'
    )
    ON CONFLICT DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 6. AUTH USERS PROVISIONING (Password: Password123!)
    -- ------------------------------------------------------------------------
    FOR v_u IN 
        SELECT * FROM (VALUES
            (v_super_admin_id, 'rdsa@yopmail.com', 'Ratnadeep Dey', 'SUPER_ADMIN', '+91 99999 00001'),
            (v_rest_admin_id, 'ppad@yopmail.com', 'Panch Phoron Admin', 'ADMIN', '+91 98765 43210'),
            (v_staff_id, 'ppst@yopmail.com', 'Panch Phoron Staff', 'STAFF', '+91 98765 43211'),
            (v_kitchen_id, 'ppkt@yopmail.com', 'Panch Phoron Kitchen', 'STAFF', '+91 98765 43212'),
            (v_customer_id, 'ppcu@yopmail.com', 'Panch Phoron Customer', 'CUSTOMER', '+91 98765 43213')
        ) AS t(target_id, email, full_name, role, phone)
    LOOP
        SELECT id INTO v_existing_id FROM auth.users WHERE LOWER(email) = LOWER(v_u.email);

        IF v_existing_id IS NOT NULL THEN
            v_user_id := v_existing_id;
            UPDATE auth.users
            SET encrypted_password = v_pw_hash,
                email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
                last_sign_in_at = NOW(),
                raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
                raw_user_meta_data = jsonb_build_object('full_name', v_u.full_name, 'role', v_u.role, 'phone', v_u.phone),
                is_super_admin = FALSE,
                is_sso_user = FALSE,
                banned_until = NULL,
                deleted_at = NULL,
                aud = 'authenticated',
                role = 'authenticated',
                updated_at = NOW()
            WHERE id = v_user_id;
        ELSE
            v_user_id := v_u.target_id;
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
                created_at, updated_at, confirmation_token, email_change, email_change_token_new,
                recovery_token, is_sso_user
            ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                v_user_id,
                'authenticated',
                'authenticated',
                v_u.email,
                v_pw_hash,
                NOW(),
                NOW(),
                '{"provider":"email","providers":["email"]}'::jsonb,
                jsonb_build_object('full_name', v_u.full_name, 'role', v_u.role, 'phone', v_u.phone),
                FALSE,
                NOW(),
                NOW(),
                '',
                '',
                '',
                '',
                FALSE
            );
        END IF;

        -- Ensure matching auth.identities
        DELETE FROM auth.identities 
        WHERE user_id = v_user_id 
           OR (provider = 'email' AND provider_id = v_user_id::text)
           OR (provider = 'email' AND provider_id = v_u.email);

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_u.email, 'email_verified', true, 'phone_verified', false),
            'email',
            v_user_id::text,
            NOW(),
            NOW(),
            NOW()
        );
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 7. PROFILES (RBAC Enforced)
    -- ------------------------------------------------------------------------
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES
        (v_super_admin_id, 'rdsa@yopmail.com', 'Ratnadeep Dey', '+91 99999 00001', 'SUPER_ADMIN'),
        (v_rest_admin_id,  'ppad@yopmail.com', 'Panch Phoron Admin', '+91 99999 00002', 'ADMIN'),
        (v_staff_id,       'ppst@yopmail.com', 'Panch Phoron Staff', '+91 99999 00003', 'STAFF'),
        (v_kitchen_id,     'ppkt@yopmail.com', 'Panch Phoron Kitchen', '+91 99999 00004', 'STAFF'),
        (v_customer_id,    'ppcu@yopmail.com', 'Panch Phoron Customer', '+91 98765 43210', 'CUSTOMER')
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role;

    -- ------------------------------------------------------------------------
    -- 8. RESTAURANT MEMBERS & GRANULAR PERMISSIONS
    -- ------------------------------------------------------------------------
    
    -- Admin Member
    INSERT INTO public.restaurant_members (id, restaurant_id, user_id, role, is_active)
    VALUES (v_mem_admin_id, v_rest_id, v_rest_admin_id, 'ADMIN', TRUE)
    ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = 'ADMIN', is_active = TRUE;

    SELECT id INTO v_mem_admin_id FROM public.restaurant_members WHERE restaurant_id = v_rest_id AND user_id = v_rest_admin_id;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
        can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
    ) VALUES (
        v_mem_admin_id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
    )
    ON CONFLICT (restaurant_member_id) DO UPDATE SET
        can_use_pos = TRUE, can_view_orders = TRUE, can_edit_orders = TRUE, can_cancel_orders = TRUE,
        can_manage_products = TRUE, can_manage_categories = TRUE, can_manage_tables = TRUE, can_manage_coupons = TRUE,
        can_view_reports = TRUE, can_manage_register = TRUE, can_view_settings = TRUE, can_manage_settings = TRUE, can_manage_staff = TRUE;

    -- Staff / Cashier Member (Cashier Preset)
    INSERT INTO public.restaurant_members (id, restaurant_id, user_id, role, is_active)
    VALUES (v_mem_staff_id, v_rest_id, v_staff_id, 'STAFF', TRUE)
    ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = 'STAFF', is_active = TRUE;

    SELECT id INTO v_mem_staff_id FROM public.restaurant_members WHERE restaurant_id = v_rest_id AND user_id = v_staff_id;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
        can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
    ) VALUES (
        v_mem_staff_id, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE
    )
    ON CONFLICT (restaurant_member_id) DO UPDATE SET
        can_use_pos = TRUE, can_view_orders = TRUE, can_manage_register = TRUE;

    -- Kitchen Staff Member (Kitchen Preset)
    INSERT INTO public.restaurant_members (id, restaurant_id, user_id, role, is_active)
    VALUES (v_mem_kitchen_id, v_rest_id, v_kitchen_id, 'STAFF', TRUE)
    ON CONFLICT (restaurant_id, user_id) DO UPDATE SET role = 'STAFF', is_active = TRUE;

    SELECT id INTO v_mem_kitchen_id FROM public.restaurant_members WHERE restaurant_id = v_rest_id AND user_id = v_kitchen_id;

    INSERT INTO public.restaurant_member_permissions (
        restaurant_member_id, can_use_pos, can_view_orders, can_edit_orders, can_cancel_orders,
        can_manage_products, can_manage_categories, can_manage_tables, can_manage_coupons,
        can_view_reports, can_manage_register, can_view_settings, can_manage_settings, can_manage_staff
    ) VALUES (
        v_mem_kitchen_id, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE
    )
    ON CONFLICT (restaurant_member_id) DO UPDATE SET
        can_use_pos = FALSE, can_view_orders = TRUE;

    -- ------------------------------------------------------------------------
    -- 9. CUSTOMER ADDRESS & FAVORITE RESTAURANT
    -- ------------------------------------------------------------------------
    INSERT INTO public.customer_addresses (
        id, user_id, label, full_name, phone, address_line1, landmark, city, state, postal_code, is_default
    ) VALUES (
        v_address_id,
        v_customer_id,
        'Home',
        'Panch Phoron Customer',
        '+91 98765 43210',
        'Budbud Bypass, House 42',
        'Near Budbud Bus Terminus',
        'Burdwan',
        'West Bengal',
        '713403',
        TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
        user_id = v_customer_id,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        address_line1 = EXCLUDED.address_line1,
        is_default = TRUE;

    INSERT INTO public.favorite_restaurants (user_id, restaurant_id)
    VALUES (v_customer_id, v_rest_id)
    ON CONFLICT (user_id, restaurant_id) DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 10. MENU CATEGORIES (5 Categories)
    -- ------------------------------------------------------------------------
    INSERT INTO public.categories (id, restaurant_id, name, slug, description, image_url, display_order, sort_order, is_active)
    VALUES
        ('cat-panch-starters', v_rest_id, 'Starters', 'starters', 'Crispy, crunchy & flavorful appetizers to kickstart your meal', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80', 1, 1, TRUE),
        ('cat-panch-main',     v_rest_id, 'Main Course', 'main-course', 'Rich aromatic curries and gravies slow-cooked to perfection', 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80', 2, 2, TRUE),
        ('cat-panch-rice',     v_rest_id, 'Rice & Biryani', 'rice-biryani', 'Fragrant Basmati rice specialties and classic Dum Biryanis', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80', 3, 3, TRUE),
        ('cat-panch-beverages',v_rest_id, 'Beverages', 'beverages', 'Refreshing hot teas, cold coffee, and chilled drinks', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80', 4, 4, TRUE),
        ('cat-panch-desserts', v_rest_id, 'Desserts', 'desserts', 'Traditional Indian sweets to complete your dining experience', 'https://images.unsplash.com/photo-1589119908995-c6837fa14d48?auto=format&fit=crop&w=600&q=80', 5, 5, TRUE)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        display_order = EXCLUDED.display_order,
        sort_order = EXCLUDED.sort_order,
        is_active = TRUE;

    -- ------------------------------------------------------------------------
    -- 11. 10 TEST FOOD PRODUCTS (With Public Demo Images & Complete Fields)
    -- ------------------------------------------------------------------------
    INSERT INTO public.products (
        id, restaurant_id, category_id, category_name, name, description, price, discounted_price, tax_rate,
        food_type, unit, preparation_time_mins, is_veg, image_url,
        is_available, is_active, sort_order, preparation_time, hsn_code, sku, is_inventory_tracked, stock_quantity
    ) VALUES
        (
            'prod-panch-001', v_rest_id, 'cat-panch-starters', 'Starters',
            'Veg Spring Roll', 'Crispy golden rolls packed with julienned vegetables and sweet chili dip.',
            140.00, 129.00, 5.0, 'veg', 'portion', 12, TRUE, 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 1, 12, '996331', 'PP001', TRUE, 45
        ),
        (
            'prod-panch-002', v_rest_id, 'cat-panch-starters', 'Starters',
            'Chicken Pakora', 'Juicy batter-fried spiced chicken fritters sprinkled with chaat masala.',
            190.00, 179.00, 5.0, 'non-veg', 'portion', 15, FALSE, 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 2, 15, '996331', 'PP002', TRUE, 30
        ),
        (
            'prod-panch-003', v_rest_id, 'cat-panch-main', 'Main Course',
            'Paneer Butter Masala', 'Tender cottage cheese cubes simmered in a velvety buttery tomato-cashew gravy.',
            240.00, 219.00, 5.0, 'veg', 'portion', 20, TRUE, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 3, 20, '996331', 'PP003', TRUE, 25
        ),
        (
            'prod-panch-004', v_rest_id, 'cat-panch-main', 'Main Course',
            'Chicken Kasha', 'Signature Bengali-style slow-roasted spicy chicken curry infused with whole spices.',
            280.00, 259.00, 5.0, 'non-veg', 'portion', 25, FALSE, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 4, 25, '996331', 'PP004', TRUE, 20
        ),
        (
            'prod-panch-005', v_rest_id, 'cat-panch-rice', 'Rice & Biryani',
            'Veg Fried Rice', 'Aromatic long-grain rice wok-tossed with fresh crunchy garden veggies and herbs.',
            180.00, 159.00, 5.0, 'veg', 'portion', 15, TRUE, 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 5, 15, '996331', 'PP005', TRUE, 50
        ),
        (
            'prod-panch-006', v_rest_id, 'cat-panch-rice', 'Rice & Biryani',
            'Chicken Biryani', 'Kolkata-style fragrant basmati biryani with succulent chicken, spiced egg and potato.',
            290.00, 269.00, 5.0, 'non-veg', 'portion', 20, FALSE, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 6, 20, '996331', 'PP006', TRUE, 40
        ),
        (
            'prod-panch-007', v_rest_id, 'cat-panch-beverages', 'Beverages',
            'Masala Chai', 'Traditional freshly brewed milk tea with crushed ginger, cardamom and cinnamon.',
            40.00, 35.00, 5.0, 'veg', 'cup', 5, TRUE, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 7, 5, '996331', 'PP007', FALSE, 0
        ),
        (
            'prod-panch-008', v_rest_id, 'cat-panch-beverages', 'Beverages',
            'Cold Coffee', 'Rich blended iced coffee topped with chocolate drizzle and vanilla froth.',
            110.00, 99.00, 5.0, 'veg', 'glass', 8, TRUE, 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 8, 8, '996331', 'PP008', FALSE, 0
        ),
        (
            'prod-panch-009', v_rest_id, 'cat-panch-desserts', 'Desserts',
            'Gulab Jamun (2 pcs)', 'Warm, soft khoya dumplings soaked in fragrant rose-cardamom sugar syrup.',
            80.00, 69.00, 5.0, 'veg', 'portion', 5, TRUE, 'https://images.unsplash.com/photo-1589119908995-c6837fa14d48?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 9, 5, '996331', 'PP009', TRUE, 60
        ),
        (
            'prod-panch-010', v_rest_id, 'cat-panch-desserts', 'Desserts',
            'Rasmalai (2 pcs)', 'Spongy cottage cheese patties bathed in saffron-infused sweetened clotted milk.',
            100.00, 89.00, 5.0, 'veg', 'portion', 5, TRUE, 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=600&q=80',
            TRUE, TRUE, 10, 5, '996331', 'PP010', TRUE, 40
        )
    ON CONFLICT (id) DO UPDATE SET
        category_name = EXCLUDED.category_name,
        name = EXCLUDED.name,
        price = EXCLUDED.price,
        discounted_price = EXCLUDED.discounted_price,
        tax_rate = EXCLUDED.tax_rate,
        food_type = EXCLUDED.food_type,
        unit = EXCLUDED.unit,
        preparation_time_mins = EXCLUDED.preparation_time_mins,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_available = TRUE,
        is_active = TRUE;

    -- ------------------------------------------------------------------------
    -- 12. 10 DINING TABLES (Dine-In / QR Ready)
    -- ------------------------------------------------------------------------
    INSERT INTO public.tables (id, restaurant_id, table_number, capacity, seating_capacity, status, floor, section, qr_code_url, qr_code_hash, is_active)
    VALUES
        ('tbl-panch-001', v_rest_id, 'Table 1', 2, 2, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-001', 'panch-phoron:tbl-panch-001', TRUE),
        ('tbl-panch-002', v_rest_id, 'Table 2', 2, 2, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-002', 'panch-phoron:tbl-panch-002', TRUE),
        ('tbl-panch-003', v_rest_id, 'Table 3', 4, 4, 'occupied',  'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-003', 'panch-phoron:tbl-panch-003', TRUE),
        ('tbl-panch-004', v_rest_id, 'Table 4', 4, 4, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-004', 'panch-phoron:tbl-panch-004', TRUE),
        ('tbl-panch-005', v_rest_id, 'Table 5', 4, 4, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-005', 'panch-phoron:tbl-panch-005', TRUE),
        ('tbl-panch-006', v_rest_id, 'Table 6', 6, 6, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-006', 'panch-phoron:tbl-panch-006', TRUE),
        ('tbl-panch-007', v_rest_id, 'Table 7', 6, 6, 'available', 'Ground Floor', 'Ground Floor', 'panch-phoron:tbl-panch-007', 'panch-phoron:tbl-panch-007', TRUE),
        ('tbl-panch-008', v_rest_id, 'Table 8', 8, 8, 'available', 'First Floor (AC)', 'First Floor (AC)', 'panch-phoron:tbl-panch-008', 'panch-phoron:tbl-panch-008', TRUE),
        ('tbl-panch-009', v_rest_id, 'Table 9', 8, 8, 'available', 'First Floor (AC)', 'First Floor (AC)', 'panch-phoron:tbl-panch-009', 'panch-phoron:tbl-panch-009', TRUE),
        ('tbl-panch-010', v_rest_id, 'Table 10', 10, 10, 'available', 'VIP Lounge', 'VIP Lounge', 'panch-phoron:tbl-panch-010', 'panch-phoron:tbl-panch-010', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        table_number = EXCLUDED.table_number,
        capacity = EXCLUDED.capacity,
        seating_capacity = EXCLUDED.seating_capacity,
        floor = EXCLUDED.floor,
        section = EXCLUDED.section,
        qr_code_url = EXCLUDED.qr_code_url,
        qr_code_hash = EXCLUDED.qr_code_hash,
        is_active = TRUE;

    -- ------------------------------------------------------------------------
    -- 13. PROMOTIONAL COUPONS
    -- ------------------------------------------------------------------------
    INSERT INTO public.coupons (
        id, restaurant_id, code, description, discount_type, discount_value,
        max_discount, min_order_amount, min_order_value, start_date, end_date, expiry_date,
        per_user_limit, usage_limit, used_count, is_active
    ) VALUES
        (
            'cpn-panch-001', v_rest_id, 'WELCOME10', '10% instant discount on orders above ₹200',
            'percentage', 10.00, 100.00, 200.00, 200.00, NOW() - INTERVAL '30 days', NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days',
            1, 1000, 12, TRUE
        ),
        (
            'cpn-panch-002', v_rest_id, 'SAVE50', 'Flat ₹50 discount on orders above ₹299',
            'fixed', 50.00, 50.00, 299.00, 299.00, NOW() - INTERVAL '30 days', NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days',
            1, 500, 5, TRUE
        ),
        (
            'cpn-panch-003', v_rest_id, 'DEV20', '20% special discount on orders above ₹400',
            'percentage', 20.00, 150.00, 400.00, 400.00, NOW() - INTERVAL '30 days', NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days',
            1, 200, 2, TRUE
        )
    ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        discount_value = EXCLUDED.discount_value,
        min_order_value = EXCLUDED.min_order_value,
        expiry_date = EXCLUDED.expiry_date,
        is_active = TRUE;

    -- ------------------------------------------------------------------------
    -- 14. DAY REGISTER (Today's Open Register for Cashier Testing)
    -- ------------------------------------------------------------------------
    INSERT INTO public.day_registers (
        id, restaurant_id, opened_by, opened_at, opening_cash, status, total_sales, total_orders
    ) VALUES (
        'reg-panch-today',
        v_rest_id,
        'Panch Phoron Staff',
        NOW() - INTERVAL '4 hours',
        2000.00,
        'open',
        1850.00,
        4
    )
    ON CONFLICT (id) DO UPDATE SET status = 'open';

    -- ------------------------------------------------------------------------
    -- 15. SAMPLE ORDERS & ORDER ITEMS (Dine-In, Takeaway, Delivery)
    -- ------------------------------------------------------------------------

    -- Order 1: Active Dine-In at Table 3 (Status: preparing, KOT in progress)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_name, customer_phone, status, subtotal, cgst_amount, sgst_amount,
        grand_total, payable_amount, paid_amount, payment_status, notes, created_by, created_at
    ) VALUES (
        'ord-panch-001', v_rest_id, 'DEV001', 'dine_in', 'tbl-panch-003', 'Table 3',
        'Walk-in Guest', '+91 98310 11223', 'preparing',
        800.00, 20.00, 20.00, 840.00, 840.00, 0.00, 'unpaid', 'Extra spicy chicken biryani', 'POS_STAFF', NOW() - INTERVAL '25 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'preparing';

    UPDATE public.tables SET current_order_id = 'ord-panch-001', status = 'occupied' WHERE id = 'tbl-panch-003';

    INSERT INTO public.order_items (id, order_id, product_id, product_name, unit_price, quantity, tax_rate, tax_amount, cgst_amount, sgst_amount, total_price)
    VALUES
        ('item-panch-001', 'ord-panch-001', 'prod-panch-006', 'Chicken Biryani', 290.00, 2, 5.0, 29.00, 14.50, 14.50, 580.00),
        ('item-panch-002', 'ord-panch-001', 'prod-panch-008', 'Cold Coffee', 110.00, 2, 5.0, 11.00, 5.50, 5.50, 220.00)
    ON CONFLICT (id) DO NOTHING;

    -- Order 2: Completed Dine-In at Table 6 (Status: completed, Cash Paid)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, table_id, table_number,
        customer_name, customer_phone, status, subtotal, cgst_amount, sgst_amount,
        grand_total, payable_amount, paid_amount, payment_status, notes, created_by, created_at
    ) VALUES (
        'ord-panch-002', v_rest_id, 'DEV002', 'dine_in', 'tbl-panch-006', 'Table 6',
        'Amit Sen', '+91 98300 44556', 'completed',
        760.00, 19.00, 19.00, 798.00, 798.00, 798.00, 'paid', 'Quick lunch', 'POS_STAFF', NOW() - INTERVAL '2 hours'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'completed', payment_status = 'paid';

    INSERT INTO public.order_items (id, order_id, product_id, product_name, unit_price, quantity, tax_rate, tax_amount, cgst_amount, sgst_amount, total_price)
    VALUES
        ('item-panch-003', 'ord-panch-002', 'prod-panch-003', 'Paneer Butter Masala', 240.00, 1, 5.0, 12.00, 6.00, 6.00, 240.00),
        ('item-panch-004', 'ord-panch-002', 'prod-panch-005', 'Veg Fried Rice', 180.00, 2, 5.0, 18.00, 9.00, 9.00, 360.00),
        ('item-panch-005', 'ord-panch-002', 'prod-panch-009', 'Gulab Jamun (2 pcs)', 80.00, 2, 5.0, 8.00, 4.00, 4.00, 160.00)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.payments (id, order_id, payment_method, amount, status, transaction_reference, notes, created_at)
    VALUES ('pay-panch-001', 'ord-panch-002', 'cash', 798.00, 'completed', 'DEV-CASH-0002', 'Cash paid at counter', NOW() - INTERVAL '1 hour 45 minutes')
    ON CONFLICT (id) DO NOTHING;

    -- Order 3: Completed Takeaway Order (Status: ready, UPI Paid)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type,
        customer_name, customer_phone, status, subtotal, cgst_amount, sgst_amount,
        grand_total, payable_amount, paid_amount, payment_status, notes, created_by, created_at
    ) VALUES (
        'ord-panch-003', v_rest_id, 'DEV003', 'takeaway',
        'Priya Mukherjee', '+91 97480 99887', 'ready',
        660.00, 16.50, 16.50, 693.00, 693.00, 693.00, 'paid', 'Pack with cutlery', 'POS_STAFF', NOW() - INTERVAL '40 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'ready', payment_status = 'paid';

    INSERT INTO public.order_items (id, order_id, product_id, product_name, unit_price, quantity, tax_rate, tax_amount, cgst_amount, sgst_amount, total_price)
    VALUES
        ('item-panch-006', 'ord-panch-003', 'prod-panch-001', 'Veg Spring Roll', 140.00, 2, 5.0, 14.00, 7.00, 7.00, 280.00),
        ('item-panch-007', 'ord-panch-003', 'prod-panch-002', 'Chicken Pakora', 190.00, 2, 5.0, 19.00, 9.50, 9.50, 380.00)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.payments (id, order_id, payment_method, amount, status, transaction_reference, notes, created_at)
    VALUES ('pay-panch-002', 'ord-panch-003', 'upi', 693.00, 'completed', 'UPI/2026/DEV998877', 'Paid via GooglePay', NOW() - INTERVAL '35 minutes')
    ON CONFLICT (id) DO NOTHING;

    -- Order 4: Online Delivery Order for DEV Customer (Status: out_for_delivery, COD)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, customer_id, customer_name, customer_phone,
        delivery_address, delivery_landmark, delivery_charge, status, subtotal, coupon_code, coupon_discount,
        cgst_amount, sgst_amount, grand_total, payable_amount, paid_amount, payment_status, notes, created_by, created_at
    ) VALUES (
        'ord-panch-004', v_rest_id, 'DEV004', 'delivery', v_customer_id,
        'Panch Phoron Customer', '+91 98765 43210',
        'Budbud Bypass, House 42, Burdwan, West Bengal 713403', 'Near Budbud Bus Terminus',
        30.00, 'out_for_delivery', 560.00, 'WELCOME10', 56.00,
        13.35, 13.35, 560.70, 561.00, 0.00, 'unpaid', 'Please ring the bell upon arrival', 'MARKETPLACE', NOW() - INTERVAL '18 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'out_for_delivery';

    INSERT INTO public.order_items (id, order_id, product_id, product_name, unit_price, quantity, tax_rate, tax_amount, cgst_amount, sgst_amount, total_price)
    VALUES
        ('item-panch-008', 'ord-panch-004', 'prod-panch-004', 'Chicken Kasha', 280.00, 1, 5.0, 14.00, 7.00, 7.00, 280.00),
        ('item-panch-009', 'ord-panch-004', 'prod-panch-005', 'Veg Fried Rice', 180.00, 1, 5.0, 9.00, 4.50, 4.50, 180.00),
        ('item-panch-010', 'ord-panch-004', 'prod-panch-010', 'Rasmalai (2 pcs)', 100.00, 1, 5.0, 5.00, 2.50, 2.50, 100.00)
    ON CONFLICT (id) DO NOTHING;

    -- Order 5: Past Completed Delivery Order for DEV Customer (Status: delivered, Card Paid)
    INSERT INTO public.orders (
        id, restaurant_id, order_number, order_type, customer_id, customer_name, customer_phone,
        delivery_address, delivery_landmark, delivery_charge, status, subtotal,
        cgst_amount, sgst_amount, grand_total, payable_amount, paid_amount, payment_status, notes, created_by, created_at
    ) VALUES (
        'ord-panch-005', v_rest_id, 'DEV005', 'delivery', v_customer_id,
        'Panch Phoron Customer', '+91 98765 43210',
        'Budbud Bypass, House 42, Burdwan, West Bengal 713403', 'Near Budbud Bus Terminus',
        30.00, 'delivered', 500.00,
        12.50, 12.50, 555.00, 555.00, 555.00, 'paid', 'Delivered safely', 'MARKETPLACE', NOW() - INTERVAL '1 day'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'delivered', payment_status = 'paid';

    INSERT INTO public.order_items (id, order_id, product_id, product_name, unit_price, quantity, tax_rate, tax_amount, cgst_amount, sgst_amount, total_price)
    VALUES
        ('item-panch-011', 'ord-panch-005', 'prod-panch-003', 'Paneer Butter Masala', 240.00, 1, 5.0, 12.00, 6.00, 6.00, 240.00),
        ('item-panch-012', 'ord-panch-005', 'prod-panch-005', 'Veg Fried Rice', 180.00, 1, 5.0, 9.00, 4.50, 4.50, 180.00),
        ('item-panch-013', 'ord-panch-005', 'prod-panch-009', 'Gulab Jamun (2 pcs)', 80.00, 1, 5.0, 4.00, 2.00, 2.00, 80.00)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.payments (id, order_id, payment_method, amount, status, transaction_reference, payment_gateway, notes, created_at)
    VALUES ('pay-panch-003', 'ord-panch-005', 'card', 555.00, 'completed', 'DEV-CARD-443322', 'Razorpay', 'Online Card Payment', NOW() - INTERVAL '1 day')
    ON CONFLICT (id) DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 16. KITCHEN ORDER TICKETS (KOTs)
    -- ------------------------------------------------------------------------
    
    -- KOT 1 for Active Order DEV001 (Status: in_progress)
    INSERT INTO public.kots (
        id, restaurant_id, kot_number, order_id, order_number, order_type, table_number, customer_name, kitchen_notes, status, created_at
    ) VALUES (
        'kot-panch-001', v_rest_id, 'KOT001', 'ord-panch-001', 'DEV001', 'dine_in', 'Table 3', 'Walk-in Guest', 'Extra spicy biryani', 'in_progress', NOW() - INTERVAL '24 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'in_progress';

    INSERT INTO public.kot_items (id, kot_id, product_id, product_name, quantity, notes, status)
    VALUES
        ('kitem-panch-001', 'kot-panch-001', 'prod-panch-006', 'Chicken Biryani', 2, 'Spicy, hot raita', 'in_progress'),
        ('kitem-panch-002', 'kot-panch-001', 'prod-panch-008', 'Cold Coffee', 2, 'Extra froth', 'ready')
    ON CONFLICT (id) DO NOTHING;

    -- KOT 2 for Completed Order DEV002 (Status: served)
    INSERT INTO public.kots (
        id, restaurant_id, kot_number, order_id, order_number, order_type, table_number, customer_name, status, created_at
    ) VALUES (
        'kot-panch-002', v_rest_id, 'KOT002', 'ord-panch-002', 'DEV002', 'dine_in', 'Table 6', 'Amit Sen', 'served', NOW() - INTERVAL '1 hour 55 minutes'
    )
    ON CONFLICT (id) DO UPDATE SET status = 'served';

    INSERT INTO public.kot_items (id, kot_id, product_id, product_name, quantity, status)
    VALUES
        ('kitem-panch-003', 'kot-panch-002', 'prod-panch-003', 'Paneer Butter Masala', 1, 'served'),
        ('kitem-panch-004', 'kot-panch-002', 'prod-panch-005', 'Veg Fried Rice', 2, 'served'),
        ('kitem-panch-005', 'kot-panch-002', 'prod-panch-009', 'Gulab Jamun (2 pcs)', 2, 'served')
    ON CONFLICT (id) DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 17. ORDER STATUS EVENTS & CUSTOMER NOTIFICATIONS
    -- ------------------------------------------------------------------------
    
    -- Status Events for Delivery Order 4
    INSERT INTO public.order_status_events (order_id, restaurant_id, old_status, new_status, actor_type, changed_by, note, created_at)
    VALUES
        ('ord-panch-004', v_rest_id, NULL, 'confirmed', 'CUSTOMER', v_customer_id, 'Order placed via Customer Marketplace', NOW() - INTERVAL '18 minutes'),
        ('ord-panch-004', v_rest_id, 'confirmed', 'preparing', 'STAFF', v_staff_id, 'Kitchen started food preparation', NOW() - INTERVAL '14 minutes'),
        ('ord-panch-004', v_rest_id, 'preparing', 'out_for_delivery', 'STAFF', v_staff_id, 'Delivery partner picked up parcel', NOW() - INTERVAL '5 minutes')
    ON CONFLICT DO NOTHING;

    -- Customer Notification for Delivery Order 4
    INSERT INTO public.customer_notifications (
        user_id, order_id, restaurant_id, title, message, type, is_read, created_at
    ) VALUES
        (
            v_customer_id,
            'ord-panch-004',
            v_rest_id,
            'Order Out for Delivery 🛵',
            'Your order #DEV004 from Panch Phoron Restaurant is on its way to you!',
            'ORDER_STATUS',
            FALSE,
            NOW() - INTERVAL '5 minutes'
        ),
        (
            v_customer_id,
            'ord-panch-005',
            v_rest_id,
            'Order Delivered Successfully 🎉',
            'Your order #DEV005 has been delivered. Thank you for dining with Panch Phoron!',
            'ORDER_STATUS',
            TRUE,
            NOW() - INTERVAL '1 day'
        )
    ON CONFLICT DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 18. AUDIT LOG INITIALIZATION
    -- ------------------------------------------------------------------------
    INSERT INTO public.audit_logs (
        restaurant_id, user_id, action, entity_type, entity_id, new_values
    ) VALUES (
        v_rest_id,
        v_super_admin_id,
        'DEV_SEED_INITIALIZATION',
        'RESTAURANT',
        v_rest_id::text,
        jsonb_build_object('restaurant', 'Panch Phoron Restaurant', 'env', 'DEVELOPMENT', 'seeded_at', NOW())
    );

END $$;

-- ============================================================================
-- VERIFICATION CONFIRMATION QUERY (Run to verify counts)
-- ============================================================================
SELECT 
    'Panch Phoron Restaurant' AS entity,
    (SELECT COUNT(*) FROM public.restaurants WHERE slug = 'panch-phoron') AS restaurants_count,
    (SELECT COUNT(*) FROM public.categories WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS categories_count,
    (SELECT COUNT(*) FROM public.products WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS products_count,
    (SELECT COUNT(*) FROM public.tables WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS tables_count,
    (SELECT COUNT(*) FROM public.coupons WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS coupons_count,
    (SELECT COUNT(*) FROM public.orders WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS orders_count,
    (SELECT COUNT(*) FROM public.kots WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid) AS kots_count,
    (SELECT COUNT(*) FROM public.payments WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = 'e0000000-0000-0000-0000-000000000001'::uuid)) AS payments_count,
    (SELECT COUNT(*) FROM public.profiles WHERE email IN ('rdsa@yopmail.com', 'ppad@yopmail.com', 'ppst@yopmail.com', 'ppkt@yopmail.com', 'ppcu@yopmail.com')) AS dev_users_count;
