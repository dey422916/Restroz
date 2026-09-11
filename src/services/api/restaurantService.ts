import { supabase } from '../supabase';
import { Restaurant, RestaurantMember } from '../../types';

export const DEFAULT_RESTAURANT_SLUG = 'panch-phoron';

export const restaurantService = {
  /**
   * Get default restaurant tenant dynamically from database
   */
  async getDefaultRestaurant(): Promise<Restaurant | null> {
    try {
      // 1. Try finding first active restaurant in database
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data && !error) return data as Restaurant;
    } catch (e) {
      console.warn('restaurantService.getDefaultRestaurant query error:', e);
    }

    return null;
  },

  /**
   * Get restaurant by ID
   */
  async getRestaurantById(id: string): Promise<Restaurant | null> {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.warn('getRestaurantById error:', error.message);
        return null;
      }
      return data as Restaurant | null;
    } catch (e) {
      console.warn('getRestaurantById exception:', e);
      return null;
    }
  },

  /**
   * Get restaurant by Slug
   */
  async getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (error) {
        console.warn('getRestaurantBySlug error:', error.message);
        return null;
      }
      return data as Restaurant | null;
    } catch (e) {
      console.warn('getRestaurantBySlug exception:', e);
      return null;
    }
  },

  /**
   * Get all active restaurant memberships for a given user
   */
  async getUserMemberships(userId: string, seq?: number, eventName?: string): Promise<RestaurantMember[]> {
    const timestamp = new Date().toISOString();
    const seqStr = seq !== undefined ? `[seq:${seq}]` : '';
    const eventStr = eventName ? `[event:${eventName}]` : '';

    try {
      // 1. Obtain current session to ensure authentication context is active
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session;
      const currentAuthUid = currentSession?.user?.id;
      const sessionExists = Boolean(currentSession?.user);

      if (!sessionExists || !currentAuthUid) {
        if (__DEV__) {
          console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getUserMemberships - session exists: NO | query UID: ${userId} -> Skipping query to avoid unauthenticated RLS empty result.`);
        }
        return [];
      }

      const queryUid = currentAuthUid;

      if (__DEV__) {
        console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getUserMemberships - session exists: YES | session.user.id: ${currentAuthUid} | session.user.email: ${currentSession?.user?.email} | membership query UID: ${queryUid}`);
      }

      // Query restaurant_members exactly with user_id = current authenticated user id and is_active = true
      const { data, error } = await supabase
        .from('restaurant_members')
        .select('*, restaurant:restaurants(*)')
        .eq('user_id', queryUid)
        .eq('is_active', true);

      const resultCount = Array.isArray(data) ? data.length : data ? 1 : 0;

      if (__DEV__) {
        console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getUserMemberships - membership result count: ${resultCount} | membership query error: ${error ? error.message : 'null'}`);
      }

      if (error) {
        console.warn(`[AUTHCTX] ${seqStr} ${eventStr} getUserMemberships relational join error, trying plain select:`, error.message);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('restaurant_members')
          .select('*')
          .eq('user_id', queryUid)
          .eq('is_active', true);

        const fallbackCount = Array.isArray(fallbackData) ? fallbackData.length : fallbackData ? 1 : 0;
        if (__DEV__) {
          console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getUserMemberships fallback - count: ${fallbackCount} | error: ${fallbackError ? fallbackError.message : 'null'}`);
        }

        if (!fallbackError && fallbackData) {
          return (Array.isArray(fallbackData) ? fallbackData : [fallbackData]) as RestaurantMember[];
        }
        return [];
      }
      return (Array.isArray(data) ? data : data ? [data] : []) as RestaurantMember[];
    } catch (e) {
      console.warn(`[AUTHCTX] ${seqStr} ${eventStr} getUserMemberships exception:`, e);
      return [];
    }
  },

  /**
   * Resolve active restaurant context for an authenticated user (Admin/Staff)
   */
  async getActiveRestaurantContext(
    userId: string,
    userRole?: string,
    seq?: number,
    eventName?: string
  ): Promise<{
    restaurantId: string;
    membership: RestaurantMember | null;
    restaurant: Restaurant | null;
  }> {
    const timestamp = new Date().toISOString();
    const seqStr = seq !== undefined ? `[seq:${seq}]` : '';
    const eventStr = eventName ? `[event:${eventName}]` : '';

    // 1. Obtain current Supabase session first
    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData?.session;
    const currentAuthUid = currentSession?.user?.id;
    const sessionExists = Boolean(currentSession?.user);

    if (__DEV__) {
      console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getActiveRestaurantContext - session exists: ${sessionExists ? 'YES' : 'NO'} | session.user.id: ${currentAuthUid || 'null'} | session.user.email: ${currentSession?.user?.email || 'null'} | profile role: ${userRole || 'NONE'}`);
    }

    // If no active session exists yet (e.g. startup / restoring), do not throw false membership error
    if (!sessionExists || !currentAuthUid) {
      if (__DEV__) {
        console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getActiveRestaurantContext - No active session ready yet. Returning unauthenticated empty context.`);
      }
      return {
        restaurantId: '',
        membership: null,
        restaurant: null,
      };
    }

    // For CUSTOMER role, restaurant membership is not applicable
    if (userRole === 'CUSTOMER') {
      if (__DEV__) {
        console.log(`[AUTHCTX] [${timestamp}] ${seqStr} ${eventStr} getActiveRestaurantContext - CUSTOMER user role, bypassing membership requirement.`);
      }
      return {
        restaurantId: '',
        membership: null,
        restaurant: null,
      };
    }

    const memberships = await this.getUserMemberships(currentAuthUid, seq, eventName);
    if (memberships && memberships.length > 0) {
      const primary = memberships[0];
      let restaurantObj = primary.restaurant || null;
      if (!restaurantObj && primary.restaurant_id) {
        restaurantObj = await this.getRestaurantById(primary.restaurant_id);
      }
      return {
        restaurantId: primary.restaurant_id,
        membership: primary,
        restaurant: restaurantObj,
      };
    }

    // If user is SUPER_ADMIN without specific restaurant_members binding, allow fallback to first active restaurant
    if (userRole === 'SUPER_ADMIN') {
      const defaultRest = await this.getDefaultRestaurant();
      return {
        restaurantId: defaultRest?.id || '',
        membership: null,
        restaurant: defaultRest || null,
      };
    }

    // STRICT MULTI-TENANCY: For authenticated ADMIN or STAFF users with confirmed zero memberships in active session
    throw new Error('No active restaurant membership found for this user account. Please contact your system administrator.');
  },
};
