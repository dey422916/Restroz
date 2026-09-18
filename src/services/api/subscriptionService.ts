import { supabase, isSupabaseConfigured } from '../supabase';
import { RestaurantSubscription, SubscriptionPlan } from '../../types';

export interface SubscriptionAccessStatus {
  isAllowed: boolean;
  status: 'active' | 'trial' | 'expired' | 'suspended' | 'cancelled' | 'none';
  restaurantStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  planName: string;
  daysRemaining: number;
  endDate: string | null;
  message?: string;
}

export const subscriptionService = {
  /**
   * Check tenant subscription access and operational status.
   * Decoupled architecture: Evaluates both restaurant.status and subscription.status.
   */
  async checkTenantAccess(restaurantId: string): Promise<SubscriptionAccessStatus> {
    if (!isSupabaseConfigured) {
      return {
        isAllowed: false,
        status: 'none',
        restaurantStatus: 'INACTIVE',
        planName: 'No Active Plan',
        daysRemaining: 0,
        endDate: null,
      };
    }

    try {
      // 1. First attempt secure RPC check (works for anon QR diners, customers, and staff)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_restaurant_subscription_status', {
          p_restaurant_id: restaurantId,
        });

        if (!rpcErr && rpcRes && typeof rpcRes === 'object') {
          const resObj = rpcRes as any;
          const isExplicitlyAllowed = resObj.is_allowed !== undefined ? Boolean(resObj.is_allowed) : (resObj.is_active !== undefined ? Boolean(resObj.is_active) : (resObj.has_subscription !== undefined ? Boolean(resObj.has_subscription) : undefined));
          const hasSub = resObj.has_subscription !== undefined ? Boolean(resObj.has_subscription) : (resObj.is_active !== undefined ? Boolean(resObj.is_active) : (resObj.is_allowed !== undefined ? Boolean(resObj.is_allowed) : undefined));
          const subStatus = resObj.status || (isExplicitlyAllowed ? 'active' : 'none');
          const restStatus = resObj.restaurant_status || (isExplicitlyAllowed ? 'ACTIVE' : 'INACTIVE');
          const daysRem = typeof resObj.days_remaining === 'number' ? resObj.days_remaining : (typeof resObj.days_left === 'number' ? resObj.days_left : (isExplicitlyAllowed ? 30 : 0));

          if (isExplicitlyAllowed !== undefined || hasSub !== undefined) {
            const isAllowed = isExplicitlyAllowed !== undefined ? isExplicitlyAllowed : Boolean(hasSub);
            if (!isAllowed || subStatus === 'none' || subStatus === 'suspended' || subStatus === 'cancelled' || subStatus === 'expired' || restStatus === 'SUSPENDED') {
              return {
                isAllowed: false,
                status: subStatus,
                restaurantStatus: restStatus,
                planName: resObj.plan_name || 'No Active Plan',
                daysRemaining: daysRem,
                endDate: resObj.end_date || null,
                message: resObj.message || (restStatus === 'SUSPENDED' ? 'Restaurant account is suspended.' : 'No active subscription plan assigned to this restaurant.'),
              };
            }

            return {
              isAllowed: true,
              status: subStatus,
              restaurantStatus: restStatus,
              planName: resObj.plan_name || 'Active Plan',
              daysRemaining: daysRem,
              endDate: resObj.end_date || null,
              message: resObj.message || 'Active subscription verified',
            };
          }
        }
      } catch (rpcErr) {
        // Fallback to table queries below
      }

      // 2. Fetch Restaurant Operational Status
      const { data: restaurant, error: restErr } = await supabase
        .from('restaurants')
        .select('id, name, status')
        .eq('id', restaurantId)
        .single();

      if (restErr || !restaurant) {
        return {
          isAllowed: false,
          status: 'none',
          restaurantStatus: 'INACTIVE',
          planName: 'Unknown',
          daysRemaining: 0,
          endDate: null,
          message: 'Restaurant tenant not found or inactive.',
        };
      }

      if (restaurant.status === 'SUSPENDED') {
        return {
          isAllowed: false,
          status: 'suspended',
          restaurantStatus: 'SUSPENDED',
          planName: 'Suspended',
          daysRemaining: 0,
          endDate: null,
          message: `The restaurant account for "${restaurant.name}" has been suspended by platform administration.`,
        };
      }

      // 3. Fetch Latest Active / Trial Subscription (Staff / Admin Direct Query)
      const { data: subs, error: subErr } = await supabase
        .from('restaurant_subscriptions')
        .select('*, plan:subscription_plans(name, code, max_staff, max_tables, max_products, features)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (subErr || !subs || subs.length === 0) {
        return {
          isAllowed: false,
          status: 'none',
          restaurantStatus: restaurant.status as any,
          planName: 'No Active Plan',
          daysRemaining: 0,
          endDate: null,
          message: `No active subscription plan assigned to "${restaurant.name}". Please assign a subscription plan from the Super Admin panel.`,
        };
      }

      const activeSub: RestaurantSubscription = subs[0];
      const now = new Date();
      const end = new Date(activeSub.end_date);
      const diffTime = end.getTime() - now.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      if (activeSub.status === 'suspended') {
        return {
          isAllowed: false,
          status: 'suspended',
          restaurantStatus: restaurant.status as any,
          planName: activeSub.plan?.name || 'Standard',
          daysRemaining: 0,
          endDate: activeSub.end_date,
          message: 'Subscription has been suspended. Please contact platform support.',
        };
      }

      if (activeSub.status === 'cancelled') {
        return {
          isAllowed: false,
          status: 'cancelled',
          restaurantStatus: restaurant.status as any,
          planName: activeSub.plan?.name || 'Standard',
          daysRemaining: 0,
          endDate: activeSub.end_date,
          message: 'Subscription plan has been cancelled.',
        };
      }

      if (end < now) {
        return {
          isAllowed: false,
          status: 'expired',
          restaurantStatus: restaurant.status as any,
          planName: activeSub.plan?.name || 'Standard',
          daysRemaining: 0,
          endDate: activeSub.end_date,
          message: `Subscription expired on ${end.toLocaleDateString()}. Please renew to resume POS operations.`,
        };
      }

      return {
        isAllowed: true,
        status: activeSub.status as any,
        restaurantStatus: restaurant.status as any,
        planName: activeSub.plan?.name || 'Active Plan',
        daysRemaining,
        endDate: activeSub.end_date,
      };
    } catch (e: any) {
      console.warn('checkTenantAccess error:', e);
      return {
        isAllowed: false,
        status: 'none',
        restaurantStatus: 'INACTIVE',
        planName: 'No Active Plan',
        daysRemaining: 0,
        endDate: null,
        message: 'Could not verify restaurant subscription status.',
      };
    }
  },

  async getActivePlans(): Promise<SubscriptionPlan[]> {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    return data || [];
  },
};
