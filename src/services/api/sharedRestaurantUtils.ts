import { Category, Product, Restaurant, RestaurantPublicProfile } from '../../types';

// In-memory cache for ultra-fast instant marketplace restaurants & distance sorting
export let cachedMarketplaceRestaurants: {
  timestamp: number;
  data: Array<Restaurant & { public_profile?: RestaurantPublicProfile; is_active_sub?: boolean }>;
} | null = null;
export const RESTAURANT_CACHE_TTL = 30 * 1000; // 30 seconds

export function setCachedMarketplaceRestaurants(
  data: Array<Restaurant & { public_profile?: RestaurantPublicProfile; is_active_sub?: boolean }> | null,
  timestamp: number = Date.now()
) {
  cachedMarketplaceRestaurants = data ? { timestamp, data } : null;
}

export function clearMarketplaceRestaurantCache() {
  cachedMarketplaceRestaurants = null;
}

// In-memory cache for restaurant menus (30s TTL)
export const cachedRestaurantMenus: Record<
  string,
  { timestamp: number; data: { categories: Category[]; products: Product[] } }
> = {};
export const MENU_CACHE_TTL = 30 * 1000; // 30 seconds

export function clearRestaurantMenuCache(restaurantId?: string) {
  if (restaurantId) {
    delete cachedRestaurantMenus[restaurantId];
  } else {
    Object.keys(cachedRestaurantMenus).forEach((k) => delete cachedRestaurantMenus[k]);
  }
}

// Distance helper (Haversine formula in KM)
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
