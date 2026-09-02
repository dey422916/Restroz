import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedAddress } from '../../types';

const ADDRESS_STORAGE_PREFIX = 'customer_saved_addresses_';

export const addressService = {
  async getSavedAddresses(userId: string): Promise<SavedAddress[]> {
    if (!userId) return [];
    try {
      const raw = await AsyncStorage.getItem(`${ADDRESS_STORAGE_PREFIX}${userId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to load saved addresses:', e);
    }
    return [];
  },

  async saveAddresses(userId: string, addresses: SavedAddress[]): Promise<void> {
    if (!userId) return;
    try {
      await AsyncStorage.setItem(`${ADDRESS_STORAGE_PREFIX}${userId}`, JSON.stringify(addresses));
    } catch (e) {
      console.warn('Failed to save addresses:', e);
    }
  },

  async addAddress(
    userId: string,
    newAddr: { label: string; address: string; landmark?: string; is_default?: boolean }
  ): Promise<SavedAddress[]> {
    if (!userId) return [];
    const list = await this.getSavedAddresses(userId);
    const id = 'addr-' + Date.now() + Math.random().toString(36).substr(2, 4);

    const isFirst = list.length === 0;
    const isDefault = Boolean(newAddr.is_default || isFirst);

    // If marked default, unset previous default
    const updatedList = list.map((a) => (isDefault ? { ...a, is_default: false } : a));

    const item: SavedAddress = {
      id,
      user_id: userId,
      label: newAddr.label || 'Home',
      address: newAddr.address.trim(),
      landmark: newAddr.landmark ? newAddr.landmark.trim() : undefined,
      is_default: isDefault,
      created_at: new Date().toISOString(),
    };

    updatedList.unshift(item);
    await this.saveAddresses(userId, updatedList);
    return updatedList;
  },

  async deleteAddress(userId: string, addressId: string): Promise<SavedAddress[]> {
    if (!userId) return [];
    const list = await this.getSavedAddresses(userId);
    const filtered = list.filter((a) => a.id !== addressId);
    if (filtered.length > 0 && !filtered.some((a) => a.is_default)) {
      filtered[0].is_default = true;
    }
    await this.saveAddresses(userId, filtered);
    return filtered;
  },

  async setDefaultAddress(userId: string, addressId: string): Promise<SavedAddress[]> {
    if (!userId) return [];
    const list = await this.getSavedAddresses(userId);
    const updated = list.map((a) => ({
      ...a,
      is_default: a.id === addressId,
    }));
    await this.saveAddresses(userId, updated);
    return updated;
  },
};
