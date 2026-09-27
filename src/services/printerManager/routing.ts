import { RestaurantPrinter, OrderItem, TableSection } from '../../types';

export interface CategoryPrintSplit {
  printer: RestaurantPrinter;
  items: OrderItem[];
}

export const printerRoutingService = {
  /**
   * Resolves the target printer for a given role (KOT or Bill) taking into account:
   * 1. Device-local default override
   * 2. Primary cloud printer for that role
   * 3. First active matching printer fallback
   */
  resolvePrinterForRole(
    printers: RestaurantPrinter[],
    role: 'kot' | 'bill',
    deviceDefaultId?: string | null
  ): RestaurantPrinter | null {
    const activePrinters = (printers || []).filter((p) => p.is_active);
    if (activePrinters.length === 0) return null;

    // 1. Device-local override if valid and active
    if (deviceDefaultId) {
      const devicePref = activePrinters.find(
        (p) => p.id === deviceDefaultId && (p.printer_role === role || p.printer_role === 'both')
      );
      if (devicePref) return devicePref;
    }

    // 2. Primary Cloud Printer for role
    const primary = activePrinters.find(
      (p) => p.is_primary && (p.printer_role === role || p.printer_role === 'both')
    );
    if (primary) return primary;

    // 3. First active printer matching role
    const matching = activePrinters.find(
      (p) => p.printer_role === role || p.printer_role === 'both'
    );
    return matching || null;
  },

  /**
   * Splits an array of order items across category-specific KOT printers.
   * NOTE: This is for PRINT OUTPUT SPLITTING ONLY. It never creates multiple database KOT records.
   */
  resolveKotsByCategory(
    items: OrderItem[],
    printers: RestaurantPrinter[],
    defaultKotPrinter?: RestaurantPrinter | null
  ): CategoryPrintSplit[] {
    const activeKotPrinters = (printers || []).filter(
      (p) => p.is_active && (p.printer_role === 'kot' || p.printer_role === 'both')
    );

    if (activeKotPrinters.length === 0) return [];

    const categoryPrinters = activeKotPrinters.filter(
      (p) => p.category_ids && p.category_ids.length > 0
    );

    // If no category routing is configured, send all items to the primary/default KOT printer
    if (categoryPrinters.length === 0) {
      const target = defaultKotPrinter || activeKotPrinters[0];
      return target ? [{ printer: target, items }] : [];
    }

    const map = new Map<string, { printer: RestaurantPrinter; items: OrderItem[] }>();
    const unassignedItems: OrderItem[] = [];

    items.forEach((item) => {
      const catId = item.product?.category_id;
      let matchedPrinter: RestaurantPrinter | null = null;

      if (catId) {
        matchedPrinter =
          categoryPrinters.find((p) => p.category_ids?.includes(catId)) || null;
      }

      if (matchedPrinter) {
        if (!map.has(matchedPrinter.id)) {
          map.set(matchedPrinter.id, { printer: matchedPrinter, items: [] });
        }
        map.get(matchedPrinter.id)!.items.push(item);
      } else {
        unassignedItems.push(item);
      }
    });

    // Unassigned items route to the main/default KOT printer
    if (unassignedItems.length > 0) {
      const fallback = defaultKotPrinter || activeKotPrinters[0];
      if (fallback) {
        if (!map.has(fallback.id)) {
          map.set(fallback.id, { printer: fallback, items: [] });
        }
        map.get(fallback.id)!.items.push(...unassignedItems);
      }
    }

    return Array.from(map.values());
  },

  /**
   * Resolves a KOT printer configured for a specific dining table section / floor.
   */
  resolveKotPrinterBySection(
    section: TableSection,
    printers: RestaurantPrinter[]
  ): RestaurantPrinter | null {
    if (!section) return null;
    const activeKotPrinters = (printers || []).filter(
      (p) => p.is_active && (p.printer_role === 'kot' || p.printer_role === 'both')
    );

    const sectionPrinter = activeKotPrinters.find(
      (p) => p.section_names && p.section_names.includes(section)
    );

    return sectionPrinter || null;
  },
};
