import { Order } from '../../types';

// High-performance in-memory cache for operational orders per tenant (10s TTL)
export const inMemoryOrdersCache: Record<string, { timestamp: number; data: Order[] }> = {};
export const ORDERS_CACHE_TTL = 10 * 1000;

export function clearOrdersCache(restaurantId?: string) {
  if (restaurantId) {
    delete inMemoryOrdersCache[restaurantId];
  } else {
    Object.keys(inMemoryOrdersCache).forEach((k) => delete inMemoryOrdersCache[k]);
  }
}
