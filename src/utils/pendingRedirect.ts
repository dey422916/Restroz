import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_TABLE_ID_KEY = 'ratnadeep_pending_table_id';
const PENDING_REDIRECT_SLUG_KEY = 'ratnadeep_pending_redirect_slug';
const PENDING_REDIRECT_URL_KEY = 'ratnadeep_pending_redirect_url';

export const pendingRedirectUtil = {
  async setPendingTableId(tableId: string): Promise<void> {
    if (!tableId || tableId === 'general') return;
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(PENDING_TABLE_ID_KEY, tableId);
      }
      await AsyncStorage.setItem(PENDING_TABLE_ID_KEY, tableId);
    } catch (e) {
      console.warn('Failed to save pending table ID:', e);
    }
  },

  async getPendingTableId(): Promise<string | null> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        const val = window.sessionStorage.getItem(PENDING_TABLE_ID_KEY);
        if (val) return val;
      }
      return await AsyncStorage.getItem(PENDING_TABLE_ID_KEY);
    } catch (e) {
      console.warn('Failed to get pending table ID:', e);
      return null;
    }
  },

  async consumePendingTableId(): Promise<string | null> {
    try {
      let tableId: string | null = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        tableId = window.sessionStorage.getItem(PENDING_TABLE_ID_KEY);
        window.sessionStorage.removeItem(PENDING_TABLE_ID_KEY);
      }
      const asyncTableId = await AsyncStorage.getItem(PENDING_TABLE_ID_KEY);
      if (asyncTableId) {
        await AsyncStorage.removeItem(PENDING_TABLE_ID_KEY);
        if (!tableId) tableId = asyncTableId;
      }
      return tableId;
    } catch (e) {
      console.warn('Failed to consume pending table ID:', e);
      return null;
    }
  },

  async clearPendingTableId(): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(PENDING_TABLE_ID_KEY);
      }
      await AsyncStorage.removeItem(PENDING_TABLE_ID_KEY);
    } catch (e) {
      console.warn('Failed to clear pending table ID:', e);
    }
  },

  // Dedicated Restaurant Storefront Slug Preservation
  async setPendingRedirectSlug(slug: string): Promise<void> {
    if (!slug) return;
    const clean = slug.trim();
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(PENDING_REDIRECT_SLUG_KEY, clean);
      }
      await AsyncStorage.setItem(PENDING_REDIRECT_SLUG_KEY, clean);
    } catch (e) {
      console.warn('Failed to save pending redirect slug:', e);
    }
  },

  async getPendingRedirectSlug(): Promise<string | null> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        const val = window.sessionStorage.getItem(PENDING_REDIRECT_SLUG_KEY);
        if (val) return val;
      }
      return await AsyncStorage.getItem(PENDING_REDIRECT_SLUG_KEY);
    } catch (e) {
      console.warn('Failed to get pending redirect slug:', e);
      return null;
    }
  },

  async consumePendingRedirectSlug(): Promise<string | null> {
    try {
      let slug: string | null = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        slug = window.sessionStorage.getItem(PENDING_REDIRECT_SLUG_KEY);
        window.sessionStorage.removeItem(PENDING_REDIRECT_SLUG_KEY);
      }
      const asyncSlug = await AsyncStorage.getItem(PENDING_REDIRECT_SLUG_KEY);
      if (asyncSlug) {
        await AsyncStorage.removeItem(PENDING_REDIRECT_SLUG_KEY);
        if (!slug) slug = asyncSlug;
      }
      return slug;
    } catch (e) {
      console.warn('Failed to consume pending redirect slug:', e);
      return null;
    }
  },

  async clearPendingRedirectSlug(): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(PENDING_REDIRECT_SLUG_KEY);
      }
      await AsyncStorage.removeItem(PENDING_REDIRECT_SLUG_KEY);
    } catch (e) {
      console.warn('Failed to clear pending redirect slug:', e);
    }
  },

  // Dedicated Restaurant Return URL Preservation
  async setPendingRedirectUrl(url: string): Promise<void> {
    if (!url) return;
    const clean = url.trim();
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(PENDING_REDIRECT_URL_KEY, clean);
      }
      await AsyncStorage.setItem(PENDING_REDIRECT_URL_KEY, clean);
    } catch (e) {
      console.warn('Failed to save pending redirect URL:', e);
    }
  },

  async getPendingRedirectUrl(): Promise<string | null> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        const val = window.sessionStorage.getItem(PENDING_REDIRECT_URL_KEY);
        if (val) return val;
      }
      return await AsyncStorage.getItem(PENDING_REDIRECT_URL_KEY);
    } catch (e) {
      console.warn('Failed to get pending redirect URL:', e);
      return null;
    }
  },

  async consumePendingRedirectUrl(): Promise<string | null> {
    try {
      let url: string | null = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        url = window.sessionStorage.getItem(PENDING_REDIRECT_URL_KEY);
        window.sessionStorage.removeItem(PENDING_REDIRECT_URL_KEY);
      }
      const asyncUrl = await AsyncStorage.getItem(PENDING_REDIRECT_URL_KEY);
      if (asyncUrl) {
        await AsyncStorage.removeItem(PENDING_REDIRECT_URL_KEY);
        if (!url) url = asyncUrl;
      }
      return url;
    } catch (e) {
      console.warn('Failed to consume pending redirect URL:', e);
      return null;
    }
  },

  async clearPendingRedirectUrl(): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(PENDING_REDIRECT_URL_KEY);
      }
      await AsyncStorage.removeItem(PENDING_REDIRECT_URL_KEY);
    } catch (e) {
      console.warn('Failed to clear pending redirect URL:', e);
    }
  },
};
