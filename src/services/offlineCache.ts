import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order, Product, Category, DiningTable, RestaurantSettings } from '../types';

const KEYS = {
  PRODUCTS: 'ratnadeep_cache_products',
  CATEGORIES: 'ratnadeep_cache_categories',
  TABLES: 'ratnadeep_cache_tables',
  SETTINGS: 'ratnadeep_cache_settings',
  SYNC_QUEUE: 'ratnadeep_pending_sync_queue',
};

export const offlineCache = {
  async getCached<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to read AsyncCache', e);
      return null;
    }
  },

  async setCache<T>(key: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save AsyncCache', e);
    }
  },

  async getSyncQueue(): Promise<any[]> {
    const queue = await this.getCached<any[]>(KEYS.SYNC_QUEUE);
    return queue || [];
  },

  async addToSyncQueue(operation: { type: string; payload: any; timestamp: string }): Promise<void> {
    const queue = await this.getSyncQueue();
    queue.push(operation);
    await this.setCache(KEYS.SYNC_QUEUE, queue);
  },

  async clearSyncQueue(): Promise<void> {
    await this.setCache(KEYS.SYNC_QUEUE, []);
  },
};
