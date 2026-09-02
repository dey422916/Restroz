import { supabase } from '../supabase';
import { Restaurant, RestaurantMember } from '../../types';

export const DEFAULT_RESTAURANT_ID = 'c0000000-0000-0000-0000-000000000001';
export const DEFAULT_RESTAURANT_SLUG = 'ratnadeep';

export const restaurantService = {
  /**
   * Get default Ratnadeep tenant
   */
  async getDefaultRestaurant(): Promise<Restaurant> {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', DEFAULT_RESTAURANT_SLUG)
        .maybeSingle();

      if (data) return data as Restaurant;
    } catch (e) {
      console.warn('restaurantService.getDefaultRestaurant query error:', e);
    }

    return {
      id: DEFAULT_RESTAURANT_ID,
      name: 'Ratnadeep Restaurant',
      slug: DEFAULT_RESTAURANT_SLUG,
      legal_name: 'Ratnadeep Foods Pvt Ltd',
      phone: '+91 9876543210',
      email: 'info@ratnadeep.com',
      address: '123 Main Road, Jubilee Hills',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      timezone: 'Asia/Kolkata',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
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
        console.warn('getUserMemberships error:', error.message);
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
  async getActiveRestaurantContext(userId: string): Promise<{
    restaurantId: string;
    membership: RestaurantMember | null;
    restaurant: Restaurant | null;
  }> {
    const memberships = await this.getUserMemberships(userId);
    if (memberships.length > 0) {
      const primary = memberships[0];
      return {
        restaurantId: primary.restaurant_id,
        membership: primary,
        restaurant: primary.restaurant || null,
      };
    }

    const defaultRest = await this.getDefaultRestaurant();
    return {
      restaurantId: defaultRest.id,
      membership: null,
      restaurant: defaultRest,
    };
  },
};
