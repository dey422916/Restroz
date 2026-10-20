import { Order } from '../../types';

// High-performance in-memory cache for operational orders per tenant (15s TTL)
export const inMemoryOrdersCache: Record<string, { timestamp: number; data: Order[] }> = {};
export const inFlightOrdersRequests: Record<string, Promise<Order[]> | undefined> = {};
export const ORDERS_CACHE_TTL = 15 * 1000;

export function clearOrdersCache(restaurantId?: string) {
  if (restaurantId) {
    delete inMemoryOrdersCache[restaurantId];
    delete inFlightOrdersRequests[restaurantId];
  } else {
    Object.keys(inMemoryOrdersCache).forEach((k) => delete inMemoryOrdersCache[k]);
    Object.keys(inFlightOrdersRequests).forEach((k) => delete inFlightOrdersRequests[k]);
  }
}

/**
 * Optimistically patch or add a single order to the in-memory cache in 0ms,
 * preventing expensive full-table network re-fetching on status changes or settlements.
 */
export function patchCachedOrder(restaurantId: string, order: Order) {
  if (!restaurantId || !order?.id) return;
  const cached = inMemoryOrdersCache[restaurantId];
  if (cached && Array.isArray(cached.data)) {
    const idx = cached.data.findIndex((o) => o.id === order.id);
    if (idx !== -1) {
      const updatedList = [...cached.data];
      updatedList[idx] = { ...updatedList[idx], ...order };
      inMemoryOrdersCache[restaurantId] = {
        timestamp: Date.now(),
        data: updatedList,
      };
    } else {
      inMemoryOrdersCache[restaurantId] = {
        timestamp: Date.now(),
        data: [order, ...cached.data],
      };
    }
  }
}

/**
 * Remove an order from in-memory cache
 */
export function removeCachedOrder(restaurantId: string, orderId: string) {
  if (!restaurantId || !orderId) return;
  const cached = inMemoryOrdersCache[restaurantId];
  if (cached && Array.isArray(cached.data)) {
    inMemoryOrdersCache[restaurantId] = {
      timestamp: Date.now(),
      data: cached.data.filter((o) => o.id !== orderId),
    };
  }
}

