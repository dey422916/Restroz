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
        isAllowed: true,
        status: 'active',
        restaurantStatus: 'ACTIVE',
        planName: 'Enterprise Plan',
        daysRemaining: 365,
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    try {
      // 1. First attempt secure RPC check (works for anon QR diners, customers, and staff)
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_restaurant_subscription_status', {
          p_restaurant_id: restaurantId,
        });

        if (!rpcErr && rpcRes && typeof rpcRes === 'object' && rpcRes.is_allowed !== undefined) {
          return {
            isAllowed: Boolean(rpcRes.is_allowed),
            status: rpcRes.status || (rpcRes.is_allowed ? 'active' : 'none'),
            restaurantStatus: rpcRes.restaurant_status || (rpcRes.is_allowed ? 'ACTIVE' : 'INACTIVE'),
            planName: rpcRes.plan_name || 'Standard Plan',
            daysRemaining: typeof rpcRes.days_remaining === 'number' ? rpcRes.days_remaining : 30,
            endDate: rpcRes.end_date || null,
            message: rpcRes.message,
          };
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
        // If restaurant is ACTIVE in directory but direct table select is restricted by Supabase RLS
        // (e.g. for unauthenticated / anonymous QR diners), grant access to allow dine-in orders
        if (restaurant.status === 'ACTIVE') {
          return {
            isAllowed: true,
            status: 'active',
            restaurantStatus: 'ACTIVE',
            planName: 'Active Plan',
            daysRemaining: 30,
            endDate: null,
          };
        }

        return {
          isAllowed: false,
          status: 'none',
          restaurantStatus: restaurant.status as any,
          planName: 'No Plan',
          daysRemaining: 0,
          endDate: null,
          message: `No active subscription plan found for "${restaurant.name}". Please subscribe to a SaaS plan to take orders.`,
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
        planName: activeSub.plan?.name || 'Enterprise Plan',
        daysRemaining,
        endDate: activeSub.end_date,
      };
    } catch (e: any) {
      console.warn('checkTenantAccess error:', e);
      return {
        isAllowed: true,
        status: 'active',
        restaurantStatus: 'ACTIVE',
        planName: 'Enterprise Plan',
        daysRemaining: 365,
        endDate: null,
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
