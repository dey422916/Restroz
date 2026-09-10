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
  async getUserMemberships(userId: string): Promise<RestaurantMember[]> {
    try {
      const { data, error } = await supabase
        .from('restaurant_members')
        .select('*, restaurant:restaurants(*)')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        console.warn('getUserMemberships relational join error, trying plain select:', error.message);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('restaurant_members')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (!fallbackError && fallbackData) {
          return fallbackData as RestaurantMember[];
        }
        return [];
      }
      return (data || []) as RestaurantMember[];
    } catch (e) {
      console.warn('getUserMemberships exception:', e);
      return [];
    }
  },

  /**
   * Resolve active restaurant context for an authenticated user (Admin/Staff)
   */
  async getActiveRestaurantContext(userId: string, userRole?: string): Promise<{
    restaurantId: string;
    membership: RestaurantMember | null;
    restaurant: Restaurant | null;
  }> {
    if (userId) {
      const memberships = await this.getUserMemberships(userId);
      if (memberships.length > 0) {
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

      // STRICT MULTI-TENANCY: For authenticated ADMIN or STAFF users, do NOT fall back to another restaurant!
      throw new Error('No active restaurant membership found for this user account. Please contact your system administrator.');
    }

    // Public / anonymous marketplace fallback only
    const defaultRest = await this.getDefaultRestaurant();
    return {
      restaurantId: defaultRest?.id || '',
      membership: null,
      restaurant: defaultRest || null,
    };
  },
};
