import { supabase, isSupabaseConfigured } from '../supabase';
import { RestaurantPlanUsage } from '../../types';

export const subscriptionGuardService = {
  // 1. Get Live Resource Usage and Plan Limits
  async getPlanUsage(restaurantId: string): Promise<RestaurantPlanUsage> {
    if (isSupabaseConfigured) {
      try {
        const { data: subData } = await supabase
          .from('restaurant_subscriptions')
          .select('*, plan:subscription_plans(*)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const [staffRes, tablesRes, prodsRes] = await Promise.all([
          supabase.from('restaurant_members').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('is_active', true),
          supabase.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('is_active', true),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('is_active', true),
        ]);

        const staffCount = staffRes.count !== null && staffRes.count !== undefined ? staffRes.count : 0;
        const tablesCount = tablesRes.count !== null && tablesRes.count !== undefined ? tablesRes.count : 0;
        const prodsCount = prodsRes.count !== null && prodsRes.count !== undefined ? prodsRes.count : 0;

        if (!subData || !subData.plan) {
          return {
            restaurant_id: restaurantId,
            plan: {
              id: 'none',
              name: 'No Active Subscription',
              code: 'NONE',
              status: 'NO_SUBSCRIPTION' as any,
              start_date: undefined,
              end_date: undefined,
              price: 0,
              billing_cycle: 'none',
            },
            staff: {
              current: staffCount,
              max: 0,
              is_unlimited: false,
              percentage: 0,
            },
            tables: {
              current: tablesCount,
              max: 0,
              is_unlimited: false,
              percentage: 0,
            },
            products: {
              current: prodsCount,
              max: 0,
              is_unlimited: false,
              percentage: 0,
            },
            features: {
              qr_ordering: false,
              inventory: false,
              reports: false,
              advanced_analytics: false,
              coupons: false,
              delivery_marketplace: false,
              split_bill: false,
              csv_import: false,
            },
          };
        }

        const plan = subData.plan;
        const now = new Date();
        const isExpired = subData.end_date ? new Date(subData.end_date) < now : false;
        const isSuspended = subData.status === 'suspended';
        const isCancelled = subData.status === 'cancelled';
        const effectiveStatus = isSuspended
          ? 'SUSPENDED'
          : isCancelled
          ? 'CANCELLED'
          : isExpired
          ? 'EXPIRED'
          : (subData.status || 'ACTIVE').toUpperCase();

        const maxStaff = plan.max_staff !== null && plan.max_staff !== undefined && plan.max_staff > 0 ? plan.max_staff : null;
        const maxTables = plan.max_tables !== null && plan.max_tables !== undefined && plan.max_tables > 0 ? plan.max_tables : null;
        const maxProducts = plan.max_products !== null && plan.max_products !== undefined && plan.max_products > 0 ? plan.max_products : null;

        return {
          restaurant_id: restaurantId,
          plan: {
            id: plan.id,
            name: plan.name,
            code: plan.code || 'PLAN',
            status: effectiveStatus as any,
            start_date: subData.start_date,
            end_date: subData.end_date,
            price: plan.price ?? subData.amount ?? 0,
            billing_cycle: plan.billing_cycle || 'monthly',
          },
          staff: {
            current: staffCount,
            max: maxStaff,
            is_unlimited: !maxStaff,
            percentage: maxStaff ? Math.round((staffCount / maxStaff) * 100) : 0,
          },
          tables: {
            current: tablesCount,
            max: maxTables,
            is_unlimited: !maxTables,
            percentage: maxTables ? Math.round((tablesCount / maxTables) * 100) : 0,
          },
          products: {
            current: prodsCount,
            max: maxProducts,
            is_unlimited: !maxProducts,
            percentage: maxProducts ? Math.round((prodsCount / maxProducts) * 100) : 0,
          },
          features: plan.features || {
            qr_ordering: true,
            inventory: true,
            reports: true,
            advanced_analytics: true,
            coupons: true,
            delivery_marketplace: true,
            split_bill: true,
            csv_import: true,
          },
        };
      } catch (err: any) {
        console.warn('getPlanUsage error:', err.message);
      }
    }

    // Default Fallback
    return {
      restaurant_id: restaurantId,
      plan: {
        id: 'none',
        name: 'No Active Subscription',
        code: 'NONE',
        status: 'NO_SUBSCRIPTION' as any,
        price: 0,
        billing_cycle: 'none',
      },
      staff: { current: 0, max: 0, is_unlimited: false, percentage: 0 },
      tables: { current: 0, max: 0, is_unlimited: false, percentage: 0 },
      products: { current: 0, max: 0, is_unlimited: false, percentage: 0 },
      features: {
        qr_ordering: false,
        inventory: false,
        reports: false,
        advanced_analytics: false,
        coupons: false,
        delivery_marketplace: false,
        split_bill: false,
        csv_import: false,
      },
    };
  },

  // 2. Check if a requested count will exceed plan limits
  async checkPlanLimit(
    restaurantId: string,
    resourceType: 'STAFF' | 'TABLES' | 'PRODUCTS',
    requestedCount: number = 1
  ): Promise<{ allowed: boolean; message?: string }> {
    if (isSupabaseConfigured) {
      try {
        const { data: subData } = await supabase
          .from('restaurant_subscriptions')
          .select('*, plan:subscription_plans(*)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const plan = subData?.plan;

        if (resourceType === 'STAFF') {
          const maxStaff = plan?.max_staff !== null && plan?.max_staff !== undefined && plan.max_staff > 0 ? plan.max_staff : null;
          if (maxStaff !== null) {
            const { count } = await supabase
              .from('restaurant_members')
              .select('*', { count: 'exact', head: true })
              .eq('restaurant_id', restaurantId)
              .eq('is_active', true);

            if ((count || 0) + requestedCount > maxStaff) {
              return {
                allowed: false,
                message: 'Plan limit reached. Please upgrade or contact Super Admin.',
              };
            }
          }
        } else if (resourceType === 'TABLES') {
          const maxTables = plan?.max_tables !== null && plan?.max_tables !== undefined && plan.max_tables > 0 ? plan.max_tables : null;
          if (maxTables !== null) {
            const { count } = await supabase
              .from('tables')
              .select('*', { count: 'exact', head: true })
              .eq('restaurant_id', restaurantId)
              .eq('is_active', true);

            if ((count || 0) + requestedCount > maxTables) {
              return {
                allowed: false,
                message: 'Plan limit reached. Please upgrade or contact Super Admin.',
              };
            }
          }
        } else if (resourceType === 'PRODUCTS') {
          const maxProducts = plan?.max_products !== null && plan?.max_products !== undefined && plan.max_products > 0 ? plan.max_products : null;
          if (maxProducts !== null) {
            const { count } = await supabase
              .from('products')
              .select('*', { count: 'exact', head: true })
              .eq('restaurant_id', restaurantId)
              .eq('is_active', true);

            if ((count || 0) + requestedCount > maxProducts) {
              return {
                allowed: false,
                message: 'Plan limit reached. Please upgrade or contact Super Admin.',
              };
            }
          }
        }

        return { allowed: true };
      } catch (err: any) {
        console.warn('checkPlanLimit warning:', err?.message);
        return { allowed: true };
      }
    }

    return { allowed: true };
  },

  // 3. Centralized Feature Check
  async hasFeature(restaurantId: string, featureKey: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('check_restaurant_feature_access', {
          p_restaurant_id: restaurantId,
          p_feature_key: featureKey,
        });

        if (!error && data !== null && data !== false) {
          return Boolean(data);
        }

        // Direct query
        const { data: subData } = await supabase
          .from('restaurant_subscriptions')
          .select('*, plan:subscription_plans(features)')
          .eq('restaurant_id', restaurantId)
          .limit(1)
          .single();

        if (subData?.plan?.features && subData.plan.features[featureKey] !== undefined) {
          return Boolean(subData.plan.features[featureKey]);
        }
      } catch (err: any) {
        console.warn('hasFeature error:', err.message);
      }
    }

    return true;
  },

  // 4. Check if restaurant has an active subscription
  async hasActiveSubscription(restaurantId: string): Promise<boolean> {
    if (!isSupabaseConfigured || !restaurantId) return true;
    try {
      const { data: subData } = await supabase
        .from('restaurant_subscriptions')
        .select('*, plan:subscription_plans(*)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!subData || !subData.plan) return false;

      const rawStatus = (subData.status || '').toLowerCase().trim();
      const isExpired = subData.end_date ? new Date(subData.end_date) < new Date() : false;

      return ['active', 'trial', 'trialing'].includes(rawStatus) && !isExpired;
    } catch (err: any) {
      console.warn('hasActiveSubscription check error:', err?.message);
      return false;
    }
  },
};
