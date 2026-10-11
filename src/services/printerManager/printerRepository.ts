import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { RestaurantPrinter, PrinterRole } from '../../types';
import { calibrationService } from './calibration';
import { devicePrinterBindingService } from './devicePrinterBindings';

let hasPrintersTable = true;

export const printerRepository = {
  /**
   * Fetches all configured printers for a restaurant.
   * On native Android / DIRECT_DEVICE mode, returns device-local direct printers exclusively.
   * On Web / Central Print Station mode, merges device-local with Supabase.
   */
  async getRestaurantPrinters(restaurantId: string): Promise<RestaurantPrinter[]> {
    const localPrinters = await devicePrinterBindingService.getDevicePrinters();
    const localFiltered = localPrinters.filter(
      (p) =>
        !restaurantId ||
        !p.restaurant_id ||
        p.restaurant_id === restaurantId ||
        p.connection_type === 'bluetooth' ||
        p.connection_type === 'usb'
    );

    const isDirect = Platform.OS !== 'web' && (await devicePrinterBindingService.isDirectDeviceMode());
    if (isDirect) {
      // In native Android DIRECT_DEVICE mode, return AsyncStorage printers directly
      return localFiltered;
    }

    let cloudPrinters: RestaurantPrinter[] = [];
    if (restaurantId && hasPrintersTable) {
      try {
        const { data, error } = await supabase
          .from('restaurant_printers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: true });

        if (error) {
          if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
            hasPrintersTable = false;
          }
        } else if (data) {
          cloudPrinters = data as RestaurantPrinter[];
        }
      } catch (err: any) {
        console.warn('[printerRepository] Cloud fetch ignored, using local:', err?.message || err);
      }
    }

    // Merge: local direct printers take priority for this physical device
    const printerMap = new Map<string, RestaurantPrinter>();
    cloudPrinters.forEach((p) => printerMap.set(p.id, p));
    localFiltered.forEach((p) => printerMap.set(p.id, p));

    return Array.from(printerMap.values());
  },

  /**
   * Fetches a single printer by ID from local storage or Supabase.
   */
  async getPrinterById(id: string): Promise<RestaurantPrinter | null> {
    if (!id) return null;

    const localPrinters = await devicePrinterBindingService.getDevicePrinters();
    const localMatch = localPrinters.find((p) => p.id === id);
    if (localMatch) return localMatch;

    const isDirect = Platform.OS !== 'web' || (await devicePrinterBindingService.isDirectDeviceMode());
    if (isDirect || !hasPrintersTable) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('restaurant_printers')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && data) {
        return data as RestaurantPrinter;
      }
    } catch (_) {}

    return null;
  },

  /**
   * Creates a new printer definition with strict validation and primary exclusivity handling.
   * On native Android / DIRECT_DEVICE mode, saves to AsyncStorage only (zero Supabase calls).
   */
  async createPrinter(
    printer: Omit<RestaurantPrinter, 'id' | 'created_at' | 'updated_at'>
  ): Promise<RestaurantPrinter> {
    const isDirect = Platform.OS !== 'web' || (await devicePrinterBindingService.isDirectDeviceMode());

    // 1. Basic Field Validation
    if (!printer.restaurant_id && !isDirect) throw new Error('Restaurant ID is required.');
    if (!printer.name || !printer.name.trim()) throw new Error('Printer name is required.');
    if (!['bluetooth', 'usb', 'lan', 'wifi'].includes(printer.connection_type)) {
      throw new Error('Invalid connection type.');
    }
    if (!['58mm', '80mm'].includes(printer.paper_width)) {
      throw new Error("Paper width must be '58mm' or '80mm'.");
    }
    if (!['kot', 'bill', 'both'].includes(printer.printer_role)) {
      throw new Error("Printer role must be 'kot', 'bill', or 'both'.");
    }

    // 2. Network IP & Port Validation
    if (['lan', 'wifi'].includes(printer.connection_type)) {
      if (!printer.ip_address || !printer.ip_address.trim()) {
        throw new Error('IP Address is required for LAN / Wi-Fi printers.');
      }
      if (printer.port !== undefined && printer.port !== null) {
        const portNum = Number(printer.port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          throw new Error('Port must be between 1 and 65535.');
        }
      }
    }

    // 3. Calibration Validation
    const calValidation = calibrationService.validateCalibration(printer, printer.paper_width);
    if (!calValidation.isValid) {
      throw new Error(`Calibration Error: ${calValidation.errors.join(' ')}`);
    }

    // 4. Handle Primary Printer Exclusivity
    if (printer.is_primary) {
      await this.unsetExistingPrimary(printer.restaurant_id || '', printer.printer_role);
    }

    const payload = {
      ...printer,
      name: printer.name.trim(),
      ip_address: printer.ip_address ? printer.ip_address.trim() : null,
      port: printer.port ? Number(printer.port) : 9100,
      bluetooth_device_name: printer.bluetooth_device_name ? printer.bluetooth_device_name.trim() : null,
      alignment: printer.alignment || 'center',
      horizontal_shift_mm: Number(printer.horizontal_shift_mm ?? 0),
      margin_left_mm: Number(printer.margin_left_mm ?? 0),
      margin_right_mm: Number(printer.margin_right_mm ?? 0),
      margin_top_mm: Number(printer.margin_top_mm ?? 0),
      margin_bottom_mm: Number(printer.margin_bottom_mm ?? 0),
      category_ids: printer.category_ids || [],
      section_names: printer.section_names || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const localId = `local_prn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const localPrinterRecord: RestaurantPrinter = {
      id: localId,
      ...payload,
    };
    await devicePrinterBindingService.saveDevicePrinter(localPrinterRecord);

    if (isDirect || !hasPrintersTable) {
      // In DIRECT_DEVICE mode or when cloud table is not present, return local record immediately
      return localPrinterRecord;
    }

    try {
      const { data, error } = await supabase
        .from('restaurant_printers')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        await devicePrinterBindingService.saveDevicePrinter(data as RestaurantPrinter);
        return data as RestaurantPrinter;
      }
      if (error) {
        console.warn('[printerRepository] Cloud insert error, retained locally:', error.message);
      }
    } catch (insertErr: any) {
      console.warn('[printerRepository] Cloud insert exception, retained locally:', insertErr?.message || insertErr);
    }

    return localPrinterRecord;
  },

  /**
   * Updates an existing printer with validation and circular fallback prevention.
   * On native Android / DIRECT_DEVICE mode, updates AsyncStorage only (zero Supabase calls).
   */
  async updatePrinter(
    id: string,
    updates: Partial<RestaurantPrinter>
  ): Promise<RestaurantPrinter> {
    if (!id) throw new Error('Printer ID is required for update.');

    const existing = await this.getPrinterById(id);
    if (!existing) throw new Error('Printer not found.');

    // 1. Fallback self-reference & circular check
    if (updates.fallback_printer_id !== undefined) {
      if (updates.fallback_printer_id === id) {
        throw new Error('A printer cannot set itself as its fallback printer.');
      }
      if (updates.fallback_printer_id) {
        const fallbackTarget = await this.getPrinterById(updates.fallback_printer_id);
        if (!fallbackTarget) {
          throw new Error('Fallback printer does not exist.');
        }
        if (fallbackTarget.restaurant_id && existing.restaurant_id && fallbackTarget.restaurant_id !== existing.restaurant_id) {
          throw new Error('Fallback printer must belong to the same restaurant.');
        }
        if (fallbackTarget.fallback_printer_id === id) {
          throw new Error('Circular fallback detected: target printer already falls back to this printer.');
        }
      }
    }

    // 2. Calibration Validation if updated
    const merged = { ...existing, ...updates };
    const calValidation = calibrationService.validateCalibration(merged, merged.paper_width);
    if (!calValidation.isValid) {
      throw new Error(`Calibration Error: ${calValidation.errors.join(' ')}`);
    }

    // 3. Primary Exclusivity
    if (updates.is_primary && !existing.is_primary) {
      await this.unsetExistingPrimary(existing.restaurant_id || '', updates.printer_role || existing.printer_role, id);
    }

    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const updatedMerged = { ...existing, ...payload };
    await devicePrinterBindingService.saveDevicePrinter(updatedMerged);

    const isDirect = Platform.OS !== 'web' || (await devicePrinterBindingService.isDirectDeviceMode());
    if (isDirect || !hasPrintersTable) {
      // In DIRECT_DEVICE mode or when cloud table is not present, return updated record immediately
      return updatedMerged;
    }

    try {
      const { data, error } = await supabase
        .from('restaurant_printers')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        await devicePrinterBindingService.saveDevicePrinter(data as RestaurantPrinter);
        return data as RestaurantPrinter;
      }
      if (error) {
        console.warn('[printerRepository] Cloud update error, updated locally:', error.message);
      }
    } catch (updateErr: any) {
      console.warn('[printerRepository] Cloud update exception, updated locally:', updateErr?.message || updateErr);
    }

    return updatedMerged;
  },

  /**
   * Deletes a printer.
   * On native Android / DIRECT_DEVICE mode, deletes from AsyncStorage only (zero Supabase calls).
   */
  async deletePrinter(id: string): Promise<void> {
    if (!id) return;
    await devicePrinterBindingService.removeDevicePrinter(id);

    const isDirect = Platform.OS !== 'web' || (await devicePrinterBindingService.isDirectDeviceMode());
    if (isDirect || !hasPrintersTable) {
      return;
    }

    try {
      const { error } = await supabase
        .from('restaurant_printers')
        .delete()
        .eq('id', id);

      if (error) {
        console.warn('[printerRepository] Error deleting printer from cloud:', error);
      }
    } catch (e) {
      console.warn('[printerRepository] Cloud delete exception:', e);
    }
  },

  /**
   * Unsets previous primary printer for the given role to maintain single primary integrity.
   * In DIRECT_DEVICE mode, updates device-local printers in AsyncStorage only (zero Supabase calls).
   */
  async unsetExistingPrimary(
    restaurantId: string,
    role: PrinterRole,
    excludeId?: string
  ): Promise<void> {
    // 1. Unset existing primary in device-local storage
    const localPrinters = await devicePrinterBindingService.getDevicePrinters();
    for (const p of localPrinters) {
      if (p.id !== excludeId && p.is_primary) {
        const matchesRole = role === 'both' || p.printer_role === 'both' || p.printer_role === role;
        if (matchesRole) {
          p.is_primary = false;
          p.updated_at = new Date().toISOString();
          await devicePrinterBindingService.saveDevicePrinter(p);
        }
      }
    }

    const isDirect = Platform.OS !== 'web' || (await devicePrinterBindingService.isDirectDeviceMode());
    if (isDirect || !hasPrintersTable) {
      return;
    }

    try {
      let query = supabase
        .from('restaurant_printers')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('restaurant_id', restaurantId)
        .eq('is_primary', true);

      if (role === 'both') {
        // Both role overlaps with everything
      } else {
        query = query.or(`printer_role.eq.${role},printer_role.eq.both`);
      }

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { error } = await query;
      if (error) {
        console.warn('[printerRepository] Warning during primary unset:', error);
      }
    } catch (e) {
      console.warn('[printerRepository] Exception during primary unset:', e);
    }
  },
};
