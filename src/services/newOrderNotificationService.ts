import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order } from '../types';
import { resolveOrderSource } from './api/orderService';

const SEEN_ORDERS_PREFIX = '@restroz_seen_orders_';

// In-memory cache for fast, synchronous lookups
const inMemorySeenOrders: Record<string, Set<string>> = {};
const listeners: Array<(restaurantId: string) => void> = [];

export interface NewOrderCounts {
  onlineNewCount: number;
  qrNewCount: number;
  totalNewCount: number;
}

export const newOrderNotificationService = {
  /**
   * Subscribe to seen order changes
   */
  subscribe(listener: (restaurantId: string) => void): () => void {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  },

  notifyListeners(restaurantId: string) {
    listeners.forEach((l) => {
      try {
        l(restaurantId);
      } catch (e) {
        console.warn('Listener notification error:', e);
      }
    });
  },

  /**
   * Retrieve the set of order IDs that have already been opened/seen by the admin
   */
  async getSeenOrderIds(restaurantId: string): Promise<Set<string>> {
    if (!restaurantId) return new Set();
    if (inMemorySeenOrders[restaurantId]) {
      return inMemorySeenOrders[restaurantId];
    }

    try {
      const raw = await AsyncStorage.getItem(`${SEEN_ORDERS_PREFIX}${restaurantId}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          inMemorySeenOrders[restaurantId] = new Set(arr);
          return inMemorySeenOrders[restaurantId];
        }
      }
    } catch (e) {
      console.warn('[newOrderNotificationService] Failed to load seen orders:', e);
    }

    inMemorySeenOrders[restaurantId] = new Set();
    return inMemorySeenOrders[restaurantId];
  },

  /**
   * Synchronous getter for in-memory seen IDs (returns empty set if not yet loaded)
   */
  getSeenOrderIdsSync(restaurantId: string): Set<string> {
    if (!restaurantId) return new Set();
    return inMemorySeenOrders[restaurantId] || new Set();
  },

  /**
   * Mark an incoming online/QR order as seen / acknowledged
   */
  async markOrderAsSeen(restaurantId: string, orderId: string): Promise<void> {
    if (!restaurantId || !orderId) return;
    const current = await this.getSeenOrderIds(restaurantId);
    if (current.has(orderId)) return;

    current.add(orderId);
    inMemorySeenOrders[restaurantId] = current;

    try {
      // Keep storage bounded to latest 500 seen IDs to avoid memory bloat
      const arr = Array.from(current).slice(-500);
      await AsyncStorage.setItem(`${SEEN_ORDERS_PREFIX}${restaurantId}`, JSON.stringify(arr));
    } catch (e) {
      console.warn('[newOrderNotificationService] Failed to persist seen order:', e);
    }

    this.notifyListeners(restaurantId);
  },

  /**
   * Mark multiple orders as seen
   */
  async markOrdersAsSeen(restaurantId: string, orderIds: string[]): Promise<void> {
    if (!restaurantId || !orderIds || orderIds.length === 0) return;
    const current = await this.getSeenOrderIds(restaurantId);
    let changed = false;

    for (const id of orderIds) {
      if (!current.has(id)) {
        current.add(id);
        changed = true;
      }
    }

    if (changed) {
      inMemorySeenOrders[restaurantId] = current;
      try {
        const arr = Array.from(current).slice(-500);
        await AsyncStorage.setItem(`${SEEN_ORDERS_PREFIX}${restaurantId}`, JSON.stringify(arr));
      } catch (e) {
        console.warn('[newOrderNotificationService] Failed to persist seen orders:', e);
      }
      this.notifyListeners(restaurantId);
    }
  },

  /**
   * Check if an order is genuinely new and unread
   * Applies ONLY to Online Marketplace and QR Digital Menu orders
   */
  isOrderNew(order: Order, seenIds: Set<string>): boolean {
    if (!order || !order.id) return false;

    // Exclude completed or cancelled orders
    if (order.status === 'completed' || order.status === 'cancelled') {
      return false;
    }

    const source = resolveOrderSource(order);
    const isApplicable = source === 'CUSTOMER_APP' || source === 'CUSTOMER_QR';
    if (!isApplicable) return false;

    return !seenIds.has(order.id);
  },

  /**
   * Compute new unread order counts for Online Delivery and QR Digital Menu
   */
  computeNewCounts(orders: Order[], seenIds: Set<string>): NewOrderCounts {
    let onlineNewCount = 0;
    let qrNewCount = 0;

    for (const order of orders) {
      if (this.isOrderNew(order, seenIds)) {
        const source = resolveOrderSource(order);
        if (source === 'CUSTOMER_APP') {
          onlineNewCount++;
        } else if (source === 'CUSTOMER_QR') {
          qrNewCount++;
        }
      }
    }

    return {
      onlineNewCount,
      qrNewCount,
      totalNewCount: onlineNewCount + qrNewCount,
    };
  },
};
