import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevicePrinterBinding, DevicePrinterDefaults, RestaurantPrinter } from '../../types';

import { supabase } from '../supabase';

const STORAGE_KEY_DEVICE_BINDINGS = '@restroz_device_printer_bindings';
const STORAGE_KEY_DEVICE_DEFAULTS = '@restroz_device_printer_defaults';
const STORAGE_KEY_DEVICE_PRINT_MODE = '@restroz_device_print_mode';
const STORAGE_KEY_DEVICE_PRINTERS = '@restroz_device_direct_printers';

export type DevicePrintMode = 'DIRECT_DEVICE' | 'CENTRAL_PRINT_STATION';

export const devicePrinterBindingService = {
  /**
   * Retrieves the current device print routing mode.
   * On native Android / iOS:
   * 1. Checks explicit device-local override.
   * 2. If restaurantId is provided and restaurant has a paired Central Print Agent in Supabase
   *    and no local direct printers exist, defaults to CENTRAL_PRINT_STATION.
   * 3. Otherwise if any direct device printer or binding exists, defaults to DIRECT_DEVICE.
   * 4. Otherwise defaults to CENTRAL_PRINT_STATION.
   */
  async getDevicePrintMode(restaurantId?: string): Promise<DevicePrintMode> {
    if (Platform.OS === 'web') {
      return 'CENTRAL_PRINT_STATION';
    }
    try {
      const explicitMode = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_PRINT_MODE);
      if (explicitMode === 'DIRECT_DEVICE' || explicitMode === 'CENTRAL_PRINT_STATION') {
        return explicitMode as DevicePrintMode;
      }

      // Check restaurant-level paired Central Print Agent
      if (restaurantId) {
        try {
          const { data: agent } = await supabase
            .from('print_agents')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('is_paired', true)
            .limit(1)
            .maybeSingle();

          if (agent && agent.id) {
            const localPrinters = await this.getDevicePrinters();
            if (localPrinters.length === 0) {
              return 'CENTRAL_PRINT_STATION';
            }
          }
        } catch (_) {}
      }

      // Check if any device-local bindings or printers exist
      const localPrinters = await this.getDevicePrinters();
      if (localPrinters.length > 0) {
        return 'DIRECT_DEVICE';
      }

      const bindings = await this.getAllDeviceBindings();
      if (Object.keys(bindings).length > 0) {
        return 'DIRECT_DEVICE';
      }

      const defaults = await this.getDeviceDefaults();
      if (defaults.default_kot_printer_id || defaults.default_bill_printer_id) {
        return 'DIRECT_DEVICE';
      }
    } catch (err) {
      console.warn('[devicePrinterBindings] Error checking print mode:', err);
    }
    return 'CENTRAL_PRINT_STATION';
  },

  /**
   * Sets the print routing mode for this physical device.
   */
  async setDevicePrintMode(mode: DevicePrintMode): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_PRINT_MODE, mode);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error saving device print mode:', err);
    }
  },

  /**
   * Fast check whether this device is running in native DIRECT_DEVICE mode.
   */
  async isDirectDeviceMode(restaurantId?: string): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    const mode = await this.getDevicePrintMode(restaurantId);
    return mode === 'DIRECT_DEVICE';
  },

  /**
   * Retrieves all device-local physical printers stored on this device.
   */
  async getDevicePrinters(): Promise<RestaurantPrinter[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_DEVICE_PRINTERS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error loading device printers:', err);
      return [];
    }
  },

  /**
   * Persists a printer definition directly to device-local storage.
   */
  async saveDevicePrinter(printer: RestaurantPrinter): Promise<void> {
    if (!printer?.id) return;
    try {
      const list = await this.getDevicePrinters();
      const idx = list.findIndex((p) => p.id === printer.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...printer, updated_at: new Date().toISOString() };
      } else {
        list.push({ ...printer, updated_at: new Date().toISOString() });
      }
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_PRINTERS, JSON.stringify(list));
      await this.setDevicePrintMode('DIRECT_DEVICE');
    } catch (err) {
      console.warn('[devicePrinterBindings] Error saving device printer:', err);
    }
  },

  /**
   * Removes a printer definition from device-local storage.
   */
  async removeDevicePrinter(printerId: string): Promise<void> {
    if (!printerId) return;
    try {
      const list = await this.getDevicePrinters();
      const filtered = list.filter((p) => p.id !== printerId);
      await AsyncStorage.setItem(STORAGE_KEY_DEVICE_PRINTERS, JSON.stringify(filtered));
      await this.removeDeviceBinding(printerId);

      const defaults = await this.getDeviceDefaults();
      let updated = false;
      if (defaults.default_kot_printer_id === printerId) {
        defaults.default_kot_printer_id = undefined;
        updated = true;
      }
      if (defaults.default_bill_printer_id === printerId) {
        defaults.default_bill_printer_id = undefined;
        updated = true;
      }
      if (updated) {
        await this.saveDeviceDefaults(defaults);
      }
    } catch (err) {
      console.warn('[devicePrinterBindings] Error removing device printer:', err);
    }
  },

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
      await AsyncStorage.multiRemove([
        STORAGE_KEY_DEVICE_BINDINGS,
        STORAGE_KEY_DEVICE_DEFAULTS,
        STORAGE_KEY_DEVICE_PRINT_MODE,
        STORAGE_KEY_DEVICE_PRINTERS,
      ]);
    } catch (err) {
      console.warn('[devicePrinterBindings] Error clearing local bindings:', err);
    }
  },
};
