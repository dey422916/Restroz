import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase';
import {
  Restaurant,
  RestaurantMember,
  UserProfile,
  SubscriptionPlan,
  RestaurantSubscription,
  SubscriptionPayment,
  SuperAdminDashboardMetrics,
  RestaurantDetailStats,
  CreateRestaurantPayload,
  CreateRestaurantAdminPayload,
} from '../../types';

export const superAdminService = {
  // --------------------------------------------------------------------------
  // 1. DASHBOARD PLATFORM METRICS
  // --------------------------------------------------------------------------
  async getDashboardMetrics(): Promise<SuperAdminDashboardMetrics> {
    if (!isSupabaseConfigured) {
      return {
        totalRestaurants: 1,
        activeRestaurants: 1,
        suspendedRestaurants: 0,
        totalAdmins: 1,
        activeSubscriptions: 1,
        expiringSoonSubscriptions: 0,
        expiredSubscriptions: 0,
        monthlyRevenue: 19999,
      };
    }

    try {
      const [restRes, membersRes, subsRes, payRes] = await Promise.all([
        supabase.from('restaurants').select('id, status'),
        supabase.from('restaurant_members').select('id, role').eq('role', 'ADMIN'),
        supabase.from('restaurant_subscriptions').select('id, status, end_date'),
        supabase.from('subscription_payments').select('amount, paid_at, payment_status').eq('payment_status', 'paid'),
      ]);

      const restaurants = restRes.data || [];
      const totalRestaurants = restaurants.length;
      const activeRestaurants = restaurants.filter((r) => r.status === 'ACTIVE').length;
      const suspendedRestaurants = restaurants.filter((r) => r.status === 'SUSPENDED').length;

      const totalAdmins = (membersRes.data || []).length;

      const subs = subsRes.data || [];
      const activeSubscriptions = subs.filter((s) => s.status === 'active').length;
      const expiredSubscriptions = subs.filter((s) => s.status === 'expired').length;

      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const expiringSoonSubscriptions = subs.filter((s) => {
        if (s.status !== 'active') return false;
        const end = new Date(s.end_date);
        return end >= now && end <= sevenDaysFromNow;
      }).length;

      // Calculate monthly subscription revenue (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const payments = payRes.data || [];
      const monthlyRevenue = payments
        .filter((p) => new Date(p.paid_at) >= thirtyDaysAgo)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return {
        totalRestaurants,
        activeRestaurants,
        suspendedRestaurants,
        totalAdmins,
        activeSubscriptions,
        expiringSoonSubscriptions,
        expiredSubscriptions,
        monthlyRevenue,
      };
    } catch (err) {
      console.warn('getDashboardMetrics error, fallback to defaults:', err);
      return {
        totalRestaurants: 1,
        activeRestaurants: 1,
        suspendedRestaurants: 0,
        totalAdmins: 1,
        activeSubscriptions: 1,
        expiringSoonSubscriptions: 0,
        expiredSubscriptions: 0,
        monthlyRevenue: 0,
      };
    }
  },

  // --------------------------------------------------------------------------
  // 2. RESTAURANTS DIRECTORY & MANAGEMENT
  // --------------------------------------------------------------------------
  async getAllRestaurants(): Promise<Restaurant[]> {
    if (!isSupabaseConfigured) {
      return [
        {
          id: 'a0000000-0000-0000-0000-000000000001',
          name: 'Ratnadeep Restaurant',
          slug: 'ratnadeep',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        },
      ];
    }

    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getRestaurantById(id: string): Promise<Restaurant | null> {
    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.warn('getRestaurantById error:', error);
      return null;
    }
    return data;
  },

  async createRestaurant(payload: CreateRestaurantPayload): Promise<Restaurant> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    // Required address validation
    if (!payload.address?.trim()) {
      throw new Error('Street address is required for restaurant onboarding.');
    }
    if (!payload.city?.trim()) {
      throw new Error('City is required for restaurant onboarding.');
    }
    if (!payload.state?.trim()) {
      throw new Error('State is required for restaurant onboarding.');
    }
    if (!payload.postal_code?.trim()) {
      throw new Error('Postal code / PIN is required for restaurant onboarding.');
    }

    const cleanSlug = payload.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const defaultBanner = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';
    const bannerUrl = payload.banner_url?.trim() || defaultBanner;

    // Direct insertion for Super Admin
    const { data: newRest, error: restErr } = await supabase
      .from('restaurants')
      .insert({
        name: payload.name.trim(),
        slug: cleanSlug,
        legal_name: payload.legal_name || payload.name.trim(),
        logo_url: payload.logo_url?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        address: payload.address.trim(),
        city: payload.city.trim(),
        state: payload.state.trim(),
        postal_code: payload.postal_code.trim(),
        country: payload.country?.trim() || 'India',
        timezone: payload.timezone || 'Asia/Kolkata',
        status: payload.status || 'ACTIVE',
      })
      .select()
      .single();

    if (restErr || !newRest) throw restErr || new Error('Failed to create restaurant.');

    // Initialize exactly one isolated restaurant_settings row
    await supabase.from('restaurant_settings').insert({
      id: 'set-' + newRest.id,
      restaurant_id: newRest.id,
      name: newRest.name,
      legal_name: newRest.legal_name || newRest.name,
      address: newRest.address || '',
      phone: newRest.phone || '',
      email: newRest.email || '',
      gstin: '',
      state: newRest.state || '',
      logo_url: newRest.logo_url,
      invoice_prefix: 'INV-',
      kot_prefix: 'KOT-',
      default_tax_rate: 5.0,
      currency: 'INR',
      currency_symbol: '₹',
      service_charge_rate: 0.0,
      next_order_seq: 1,
    });

    // Also initialize public profile with banner_url for marketplace discovery
    await supabase.from('restaurant_public_profiles').upsert({
      restaurant_id: newRest.id,
      marketplace_enabled: true,
      accepts_delivery: true,
      accepts_takeaway: true,
      is_open: true,
      delivery_radius_km: 15,
      minimum_order_value: 0,
      estimated_delivery_minutes: 35,
      cuisine_tags: ['Multi-Cuisine', 'Fast Food', 'North Indian'],
      banner_url: bannerUrl,
      public_description: `${newRest.name} - Fresh delicious food prepared and delivered hot.`,
      opening_time: '09:00 AM',
      closing_time: '11:00 PM',
    }, { onConflict: 'restaurant_id' });

    // Seed 4 demo tables, categories, and foods for immediate POS & ordering use
    try {
      await superAdminService.seedDemoRestaurantData(newRest.id, newRest.name, cleanSlug);
    } catch (seedErr) {
      console.warn('Demo data seeding error:', seedErr);
    }

    return newRest;
  },

  async seedDemoRestaurantData(restaurantId: string, restaurantName: string, slug: string): Promise<void> {
    if (!isSupabaseConfigured) return;
    const shortId = restaurantId.replace(/-/g, '').slice(0, 8);

    // 1. Seed 4 Fully Editable/Deletable Tables
    const tables = [
      {
        id: 'tbl-' + shortId + '-1',
        restaurant_id: restaurantId,
        table_number: 'Table 1',
        seating_capacity: 4,
        section: 'Main Dining Hall',
        is_active: true,
        status: 'available',
        qr_code_hash: slug + '-tbl-1',
      },
      {
        id: 'tbl-' + shortId + '-2',
        restaurant_id: restaurantId,
        table_number: 'Table 2',
        seating_capacity: 2,
        section: 'Window View',
        is_active: true,
        status: 'available',
        qr_code_hash: slug + '-tbl-2',
      },
      {
        id: 'tbl-' + shortId + '-3',
        restaurant_id: restaurantId,
        table_number: 'Table 3',
        seating_capacity: 6,
        section: 'Family Corner',
        is_active: true,
        status: 'available',
        qr_code_hash: slug + '-tbl-3',
      },
      {
        id: 'tbl-' + shortId + '-4',
        restaurant_id: restaurantId,
        table_number: 'Table 4',
        seating_capacity: 4,
        section: 'Outdoor Patio',
        is_active: true,
        status: 'available',
        qr_code_hash: slug + '-tbl-4',
      },
    ];

    await supabase.from('tables').upsert(tables, { onConflict: 'id' });

    // 2. Seed Demo Categories
    const categories = [
      {
        id: 'cat-' + shortId + '-starters',
        restaurant_id: restaurantId,
        name: 'Starters & Appetizers',
        slug: 'starters',
        description: 'Crispy and savory starters to begin your feast',
        display_order: 1,
        is_active: true,
      },
      {
        id: 'cat-' + shortId + '-mains',
        restaurant_id: restaurantId,
        name: 'Main Course & Curries',
        slug: 'main-course',
        description: 'Rich, flavorful main dishes and fresh breads',
        display_order: 2,
        is_active: true,
      },
      {
        id: 'cat-' + shortId + '-beverages',
        restaurant_id: restaurantId,
        name: 'Beverages & Refreshers',
        slug: 'beverages',
        description: 'Refreshing cold drinks, sodas, and hot teas',
        display_order: 3,
        is_active: true,
      },
      {
        id: 'cat-' + shortId + '-desserts',
        restaurant_id: restaurantId,
        name: 'Desserts & Sweets',
        slug: 'desserts',
        description: 'Decadent traditional and modern sweet treats',
        display_order: 4,
        is_active: true,
      },
    ];

    await supabase.from('categories').upsert(categories, { onConflict: 'id' });

    // 3. Seed Demo Food Items (100% Deletable & Editable in POS)
    const products = [
      {
        id: 'prod-' + shortId + '-1',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-001',
        name: 'Paneer Butter Masala',
        category_id: 'cat-' + shortId + '-mains',
        category_name: 'Main Course & Curries',
        description: 'Soft cottage cheese cubes simmered in a rich tomato, butter, and cashew gravy.',
        food_type: 'veg',
        price: 240,
        discounted_price: 220,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 50,
        unit: 'portion',
        preparation_time_mins: 15,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-2',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-002',
        name: 'Butter Garlic Naan',
        category_id: 'cat-' + shortId + '-mains',
        category_name: 'Main Course & Curries',
        description: 'Clay-oven baked refined flour bread topped with minced garlic and melted butter.',
        food_type: 'veg',
        price: 55,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 100,
        unit: 'piece',
        preparation_time_mins: 10,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-3',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-003',
        name: 'Crispy Veg Spring Rolls',
        category_id: 'cat-' + shortId + '-starters',
        category_name: 'Starters & Appetizers',
        description: 'Golden fried rolls filled with julienned vegetables and Asian seasoning.',
        food_type: 'veg',
        price: 160,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 35,
        unit: 'portion',
        preparation_time_mins: 12,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-4',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-004',
        name: 'Special Dum Biryani',
        category_id: 'cat-' + shortId + '-mains',
        category_name: 'Main Course & Curries',
        description: 'Aromatic aged basmati rice cooked on slow dum with royal whole spices and saffron.',
        food_type: 'veg',
        price: 220,
        discounted_price: 199,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 40,
        unit: 'portion',
        preparation_time_mins: 20,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-5',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-005',
        name: 'Special Masala Chai',
        category_id: 'cat-' + shortId + '-beverages',
        category_name: 'Beverages & Refreshers',
        description: 'Freshly brewed aromatic tea infused with ginger, cardamom, and whole cloves.',
        food_type: 'veg',
        price: 40,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 200,
        unit: 'cup',
        preparation_time_mins: 5,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-6',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-006',
        name: 'Cold Coffee with Ice Cream',
        category_id: 'cat-' + shortId + '-beverages',
        category_name: 'Beverages & Refreshers',
        description: 'Creamy blended iced coffee topped with a rich scoop of vanilla ice cream.',
        food_type: 'veg',
        price: 120,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 50,
        unit: 'glass',
        preparation_time_mins: 8,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80',
      },
      {
        id: 'prod-' + shortId + '-7',
        restaurant_id: restaurantId,
        sku: 'SKU-' + shortId.toUpperCase() + '-007',
        name: 'Warm Gulab Jamun (2 Pcs)',
        category_id: 'cat-' + shortId + '-desserts',
        category_name: 'Desserts & Sweets',
        description: 'Golden fried milk dumplings soaked in cardamom and rose water sugar syrup.',
        food_type: 'veg',
        price: 80,
        tax_rate: 5,
        is_available: true,
        stock_quantity: 60,
        unit: 'portion',
        preparation_time_mins: 5,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1593701461250-d7b22dfd3a77?auto=format&fit=crop&w=600&q=80',
      },
    ];

    await supabase.from('products').upsert(products, { onConflict: 'id' });
  },

  async updateRestaurant(id: string, updates: Partial<Restaurant> & { banner_url?: string }): Promise<Restaurant> {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');

    const restUpdates: any = { ...updates };
    const bannerUrl = updates.banner_url;
    delete restUpdates.banner_url;

    const { data, error } = await supabase
      .from('restaurants')
      .update({ ...restUpdates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to update restaurant.');

    if (bannerUrl !== undefined) {
      await supabase
        .from('restaurant_public_profiles')
        .update({ banner_url: bannerUrl || null, updated_at: new Date().toISOString() })
        .eq('restaurant_id', id);
    }

    return { ...data, banner_url: bannerUrl };
  },

  async updateRestaurantStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'): Promise<void> {
    if (!isSupabaseConfigured) return;

    const { error } = await supabase
      .from('restaurants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  // --------------------------------------------------------------------------
  // 3. RESTAURANT ADMIN USER PROVISIONING & MANAGEMENT
  // --------------------------------------------------------------------------
  async createRestaurantAdmin(payload: CreateRestaurantAdminPayload): Promise<{ user_id: string; membership_id: string }> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanName = payload.full_name.trim();

    // Check if profile exists for email and link membership safely
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', cleanEmail)
      .maybeSingle();

    let targetUserId = existingProfile?.id;

    if (!targetUserId) {
      // Attempt client-side signup with user-friendly rate limit mapping
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
      const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

      const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
        email: cleanEmail,
        password: payload.password || 'Ratnadeep1@',
        options: {
          data: {
            full_name: cleanName,
            phone: payload.phone,
            role: 'ADMIN',
          },
        },
      });

      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes('rate limit') || signUpErr.message.toLowerCase().includes('over_email_send_rate_limit')) {
          throw new Error(
            'Email provisioning limit reached. The account could not be sent a verification email. ' +
            'Please assign an existing registered account or run the provisioning SQL script in Supabase.'
          );
        }
        if (!signUpErr.message.toLowerCase().includes('already registered') && !signUpErr.message.toLowerCase().includes('already exists')) {
          throw new Error(signUpErr.message || 'Failed to create admin user account.');
        }
      }

      targetUserId = signUpData?.user?.id;
    }

    if (!targetUserId) {
      const { data: retryProf } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();
      targetUserId = retryProf?.id;
    }

    if (!targetUserId) {
      throw new Error(`Could not resolve user account for email: ${payload.email}`);
    }

    // Ensure profile has ADMIN role
    await supabase.from('profiles').upsert({
      id: targetUserId,
      email: cleanEmail,
      full_name: cleanName,
      phone: payload.phone,
      role: 'ADMIN',
      updated_at: new Date().toISOString(),
    });

    // Create restaurant_members row (Source of truth)
    const { data: member, error: memErr } = await supabase
      .from('restaurant_members')
      .upsert(
        {
          restaurant_id: payload.restaurant_id,
          user_id: targetUserId,
          role: 'ADMIN',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,user_id' }
      )
      .select()
      .single();

    if (memErr || !member) throw memErr || new Error('Failed to create restaurant member.');

    return { user_id: targetUserId, membership_id: member.id };
  },

  async updateRestaurantAdmin(payload: {
    membership_id: string;
    user_id: string;
    restaurant_id: string;
    full_name: string;
    phone?: string;
    is_active: boolean;
  }): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    // 1. Update profiles table
    await supabase
      .from('profiles')
      .update({
        full_name: payload.full_name.trim(),
        phone: payload.phone?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.user_id);

    // 2. Update restaurant_members table
    const { error: memErr } = await supabase
      .from('restaurant_members')
      .update({
        restaurant_id: payload.restaurant_id,
        is_active: payload.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.membership_id);

    if (memErr) throw memErr;
  },

  async deleteRestaurantAdmin(membership_id: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { error } = await supabase
      .from('restaurant_members')
      .delete()
      .eq('id', membership_id);

    if (error) throw error;
  },

  async changeAdminPassword(user_id: string, newPassword: string, restaurantId?: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');
    if (!user_id) throw new Error('Target user ID is required.');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-reset-password', {
      body: {
        targetUserId: user_id,
        newPassword: newPassword,
        restaurantId: restaurantId || undefined,
      },
    });

    if (edgeErr) {
      let detailMsg = edgeErr.message || 'Failed to update password.';
      if (edgeData?.error) {
        detailMsg = edgeData.error;
      }
      throw new Error(detailMsg);
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }

    if (!edgeData?.success) {
      throw new Error('Password update request could not be completed by Edge Function.');
    }
  },

  async getRestaurantMembers(restaurantId: string): Promise<RestaurantMember[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data: members, error } = await supabase
        .from('restaurant_members')
        .select('*')
        .eq('restaurant_id', restaurantId);

      if (error) {
        console.warn('getRestaurantMembers query error:', error);
        return [];
      }

      if (!members || members.length === 0) return [];

      const userIds = members.map((m) => m.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name, phone, role')
          .in('id', userIds);

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p) => {
          profileMap[p.id] = p;
        });

        return members.map((m) => ({
          ...m,
          profile: profileMap[m.user_id] || {
            id: m.user_id,
            email: 'user@restaurant.com',
            full_name: 'Member',
          },
        }));
      }

      return members;
    } catch (err) {
      console.warn('getRestaurantMembers catch error:', err);
      return [];
    }
  },

  // --------------------------------------------------------------------------
  // 4. RESTAURANT DETAIL STATS
  // --------------------------------------------------------------------------
  async getRestaurantStats(restaurantId: string): Promise<RestaurantDetailStats> {
    if (!isSupabaseConfigured) {
      return { productCount: 22, tableCount: 11, orderCount: 73, staffCount: 2 };
    }

    try {
      const [prodRes, tableRes, orderRes, staffRes] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('restaurant_members').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('is_active', true),
      ]);

      return {
        productCount: prodRes.count || 0,
        tableCount: tableRes.count || 0,
        orderCount: orderRes.count || 0,
        staffCount: staffRes.count || 0,
      };
    } catch (err) {
      console.warn('getRestaurantStats error:', err);
      return { productCount: 0, tableCount: 0, orderCount: 0, staffCount: 0 };
    }
  },

  // --------------------------------------------------------------------------
  // 5. SUBSCRIPTION PLANS CRUD
  // --------------------------------------------------------------------------
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    if (!isSupabaseConfigured) {
      return [
        {
          id: 'plan-starter',
          name: 'Starter Plan',
          code: 'STARTER_MONTHLY',
          billing_cycle: 'monthly',
          price: 999,
          currency: 'INR',
          max_staff: 5,
          max_tables: 10,
          max_products: 50,
          features: { qr_ordering: true, inventory: false, reports: true, analytics: false },
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: 'plan-enterprise',
          name: 'Enterprise Plan',
          code: 'ENTERPRISE_YEARLY',
          billing_cycle: 'yearly',
          price: 19999,
          currency: 'INR',
          max_staff: 999,
          max_tables: 999,
          max_products: 9999,
          features: { qr_ordering: true, inventory: true, reports: true, analytics: true, multi_terminal: true },
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ];
    }

    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) {
      console.warn('getSubscriptionPlans error:', error);
      return [];
    }
    return data || [];
  },

  async createSubscriptionPlan(plan: Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>): Promise<SubscriptionPlan> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase
      .from('subscription_plans')
      .insert(plan)
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to create plan.');
    return data;
  },

  async updateSubscriptionPlan(id: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase
      .from('subscription_plans')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to update plan.');
    return data;
  },

  // --------------------------------------------------------------------------
  // 6. RESTAURANT SUBSCRIPTIONS
  // --------------------------------------------------------------------------
  async getRestaurantSubscriptions(restaurantId?: string): Promise<RestaurantSubscription[]> {
    if (!isSupabaseConfigured) return [];

    let query = supabase
      .from('restaurant_subscriptions')
      .select('*, plan:subscription_plans(*), restaurant:restaurants(id, name, slug)')
      .order('created_at', { ascending: false });

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('getRestaurantSubscriptions error:', error);
      return [];
    }
    return data || [];
  },

  async assignSubscription(payload: {
    restaurant_id: string;
    plan_id: string;
    duration_days: number;
    amount?: number;
    payment_method?: string;
    payment_reference?: string;
    notes?: string;
  }): Promise<RestaurantSubscription> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    // 1. Try atomic RPC assign_restaurant_subscription
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('assign_restaurant_subscription', {
        p_restaurant_id: payload.restaurant_id,
        p_plan_id: payload.plan_id,
        p_status: 'active',
        p_duration_days: payload.duration_days,
        p_amount: payload.amount,
        p_payment_method: payload.payment_method || 'upi',
        p_payment_reference: payload.payment_reference || null,
        p_notes: payload.notes || null,
      });

      if (!rpcError && rpcData) {
        return rpcData as RestaurantSubscription;
      }
    } catch (rpcEx) {
      console.warn('assign_restaurant_subscription RPC fallback:', rpcEx);
    }

    // Direct fallback
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', payload.plan_id)
      .single();

    const amount = payload.amount !== undefined ? payload.amount : plan?.price || 0;
    const endDate = new Date(Date.now() + payload.duration_days * 24 * 60 * 60 * 1000).toISOString();

    // Cancel existing active subscriptions
    await supabase
      .from('restaurant_subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('restaurant_id', payload.restaurant_id)
      .eq('status', 'active');

    const { data: newSub, error: subErr } = await supabase
      .from('restaurant_subscriptions')
      .insert({
        restaurant_id: payload.restaurant_id,
        plan_id: payload.plan_id,
        status: 'active',
        start_date: new Date().toISOString(),
        end_date: endDate,
        amount,
        currency: plan?.currency || 'INR',
        notes: payload.notes,
      })
      .select('*, plan:plan_id(*)')
      .single();

    if (subErr || !newSub) throw subErr || new Error('Failed to assign subscription.');

    // Record payment
    if (amount > 0) {
      await supabase.from('subscription_payments').insert({
        restaurant_id: payload.restaurant_id,
        subscription_id: newSub.id,
        amount,
        currency: plan?.currency || 'INR',
        payment_method: payload.payment_method || 'upi',
        payment_reference: payload.payment_reference || null,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        notes: payload.notes,
      });
    }

    return newSub;
  },

  async updateSubscriptionStatus(subscriptionId: string, status: 'active' | 'suspended' | 'cancelled' | 'expired'): Promise<void> {
    if (!isSupabaseConfigured) return;

    const { error } = await supabase
      .from('restaurant_subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId);

    if (error) throw error;
  },

  // --------------------------------------------------------------------------
  // 7. SUBSCRIPTION PAYMENTS
  // --------------------------------------------------------------------------
  async getAllPayments(restaurantId?: string): Promise<SubscriptionPayment[]> {
    if (!isSupabaseConfigured) return [];

    let query = supabase
      .from('subscription_payments')
      .select('*, restaurant:restaurants(id, name, slug)')
      .order('paid_at', { ascending: false });

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('getAllPayments error:', error);
      return [];
    }
    return data || [];
  },

  async recordPayment(payload: {
    restaurant_id: string;
    subscription_id?: string;
    amount: number;
    currency?: string;
    payment_method: string;
    payment_reference?: string;
    notes?: string;
  }): Promise<SubscriptionPayment> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

    const { data, error } = await supabase
      .from('subscription_payments')
      .insert({
        restaurant_id: payload.restaurant_id,
        subscription_id: payload.subscription_id || null,
        amount: payload.amount,
        currency: payload.currency || 'INR',
        payment_method: payload.payment_method,
        payment_reference: payload.payment_reference || null,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        notes: payload.notes || null,
      })
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to record payment.');
    return data;
  },

  // --------------------------------------------------------------------------
  // 8. AUDIT LOGS
  // --------------------------------------------------------------------------
  async getAuditLogs(limit: number = 50): Promise<any[]> {
    if (!isSupabaseConfigured) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, restaurant:restaurants(id, name, slug)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('getAuditLogs error:', error);
      return [];
    }
    return data || [];
  },
};
