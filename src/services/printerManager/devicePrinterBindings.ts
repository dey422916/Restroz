import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevicePrinterBinding, DevicePrinterDefaults } from '../../types';

const STORAGE_KEY_DEVICE_BINDINGS = '@restroz_device_printer_bindings';
const STORAGE_KEY_DEVICE_DEFAULTS = '@restroz_device_printer_defaults';

export const devicePrinterBindingService = {
  /**
   * Retrieves all device-local physical printer bindings.
   */
  async getAllDeviceBindings(): Promise<Record<string, DevicePrinterBinding>> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_BINDINGS);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error loading bindings from AsyncStorage:', err);
      return {};
    }
  },

  /**
   * Retrieves the physical device binding for a specific restaurant printer.
   */
  async getDeviceBinding(printerId: string): Promise<DevicePrinterBinding | null> {
    if (!printerId) return null;
    const all = await this.getAllDeviceBindings();
    return all[printerId] || null;
  },

  /**
   * Saves or updates a device-local physical binding.
   */
  async saveDeviceBinding(binding: DevicePrinterBinding): Promise<void> {
    if (!binding?.restaurant_printer_id) return;
    try {
      const all = await this.getAllDeviceBindings();
      all[binding.restaurant_printer_id] = {
        ...binding,
        last_used_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_BINDINGS, JSON.stringify(all));
    } catch (err) {
      console.warn('[devicePrinterBindings] Error saving binding to AsyncStorage:', err);
      throw err;
    }
  },

  /**
   * Removes a device-local physical binding.
   */
  async removeDeviceBinding(printerId: string): Promise<void> {
    if (!printerId) return;
    try {
      const all = await this.getAllDeviceBindings();
      delete all[printerId];
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_BINDINGS, JSON.stringify(all));
    } catch (err) {
      console.warn('[devicePrinterBindings] Error removing binding from AsyncStorage:', err);
    }
  },

  /**
   * Retrieves default KOT and Bill printer IDs configured for this specific physical tablet/device.
   */
  async getDeviceDefaults(): Promise<DevicePrinterDefaults> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_DEFAULTS);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error loading defaults from AsyncStorage:', err);
      return {};
    }
  },

  /**
   * Saves default KOT and Bill printer selections for this tablet/device.
   */
  async saveDeviceDefaults(defaults: DevicePrinterDefaults): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_DEFAULTS, JSON.stringify(defaults));
    } catch (err) {
      console.warn('[devicePrinterBindings] Error saving defaults to AsyncStorage:', err);
      throw err;
    }
  },

  /**
   * Clears all local printer bindings and device defaults.
   */
  async clearAllLocalBindings(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY_DEVICE_BINDINGS, STORAGE_KEY_DEVICE_DEFAULTS]);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error clearing local bindings:', err);
    }
  },
};
