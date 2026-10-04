import { supabase } from '../supabase';
import { RestaurantPrinter, PrinterRole } from '../../types';
import { calibrationService } from './calibration';

export const printerRepository = {
  /**
   * Fetches all configured printers for a restaurant from Supabase.
   */
  async getRestaurantPrinters(restaurantId: string): Promise<RestaurantPrinter[]> {
    if (!restaurantId) return [];

    const { data, error } = await supabase
      .from('restaurant_printers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('restaurant_printers') || error.message?.includes('does not exist')) {
        // Table intentionally absent in Central Print Agent environment
        return [];
      }
      console.warn('[printerRepository] Error fetching printers:', error);
      throw new Error(`Failed to load printers: ${error.message}`);
    }

    return (data || []) as RestaurantPrinter[];
  },

  /**
   * Fetches a single printer by ID.
   */
  async getPrinterById(id: string): Promise<RestaurantPrinter | null> {
    if (!id) return null;

    const { data, error } = await supabase
      .from('restaurant_printers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.warn('[printerRepository] Error fetching printer by id:', error);
      throw new Error(`Failed to load printer: ${error.message}`);
    }

    return data as RestaurantPrinter;
  },

  /**
   * Creates a new printer definition with strict validation and primary exclusivity handling.
   */
  async createPrinter(
    printer: Omit<RestaurantPrinter, 'id' | 'created_at' | 'updated_at'>
  ): Promise<RestaurantPrinter> {
    // 1. Basic Field Validation
    if (!printer.restaurant_id) throw new Error('Restaurant ID is required.');
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
      await this.unsetExistingPrimary(printer.restaurant_id, printer.printer_role);
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

    const { data, error } = await supabase
      .from('restaurant_printers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.warn('[printerRepository] Error inserting printer:', error);
      throw new Error(`Failed to create printer: ${error.message}`);
    }

    return data as RestaurantPrinter;
  },

  /**
   * Updates an existing printer with validation and circular fallback prevention.
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
        if (fallbackTarget.restaurant_id !== existing.restaurant_id) {
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
      await this.unsetExistingPrimary(existing.restaurant_id, updates.printer_role || existing.printer_role, id);
    }

    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('restaurant_printers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.warn('[printerRepository] Error updating printer:', error);
      throw new Error(`Failed to update printer: ${error.message}`);
    }

    return data as RestaurantPrinter;
  },

  /**
   * Deletes a printer.
   */
  async deletePrinter(id: string): Promise<void> {
    if (!id) return;
    const { error } = await supabase
      .from('restaurant_printers')
      .delete()
      .eq('id', id);

    if (error) {
      console.warn('[printerRepository] Error deleting printer:', error);
      throw new Error(`Failed to delete printer: ${error.message}`);
    }
  },

  /**
   * Unsets previous primary printer for the given role to maintain single primary integrity.
   */
  async unsetExistingPrimary(
    restaurantId: string,
    role: PrinterRole,
    excludeId?: string
  ): Promise<void> {
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
