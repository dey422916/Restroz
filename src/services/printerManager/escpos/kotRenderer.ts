/**
 * Android & Windows ESC/POS KOT Document Renderer
 * Generates authoritative, standard Font A ESC/POS documents for Kitchen Order Tickets.
 * Strictly formatted for 58mm (32 chars) and 80mm (48 chars) thermal paper.
 */

import { Order, KOT, RestaurantSettings, RestaurantPrinter, PrinterCalibration, PrinterPaperWidth } from '../../../types';
import { formatOrderDateTime } from '../../../utils/dateUtils';
import { EscPosDocument } from './encoder';
import { EscPosTextBuilder } from './escposBuilder';

export interface KotRenderOptions {
  printer?: RestaurantPrinter | { paper_width?: PrinterPaperWidth; name?: string; transport?: string; isBle?: boolean };
  customCalibration?: PrinterCalibration;
  isReprint?: boolean;
  isBle?: boolean;
}

/**
 * Renders an authoritative Order / KOT into an ESC/POS binary document.
 */
export function renderKotToEscPos(
  order: Order,
  settings: RestaurantSettings,
  kot?: KOT,
  options: KotRenderOptions = {}
): EscPosDocument {
  const activeKot = kot;
  let kotNum = activeKot?.kot_number;
  if (!kotNum) {
    if (order.kots && order.kots.length > 1) {
      kotNum = order.kots.map((k) => k.kot_number).filter(Boolean).join(', ');
    } else if (order.kots && order.kots.length === 1) {
      kotNum = order.kots[0]?.kot_number;
    }
    if (!kotNum) {
      kotNum = 'KOT-001';
    }
  }

  const rawPaperSize = options.printer?.paper_width || settings.kot_paper_size || '80mm';
  const paperSize: PrinterPaperWidth = rawPaperSize === '58mm' ? '58mm' : '80mm';
  const printerName = (options.printer as any)?.name || (paperSize === '58mm' ? 'POS58 Printer' : 'POS80 Printer');
  const transport = (options.printer as any)?.transport || (options.isBle ? 'bluetooth' : 'agent');
  const isBle = Boolean(options.isBle || transport === 'bluetooth' || (options.printer as any)?.isBle || paperSize === '58mm');

  const isReprint = options.isReprint || Boolean(activeKot?.kitchen_notes && activeKot.kitchen_notes.includes('[AUTO_PRINTED]'));
  const isSupplementary = activeKot
    ? Boolean(kotNum.includes('SUP')) ||
      Boolean(activeKot.kitchen_notes && activeKot.kitchen_notes.toUpperCase().includes('SUP')) ||
      Boolean(order.kots && order.kots.length > 1 && activeKot.id !== order.kots[0]?.id)
    : false;

  // Extract items for KOT
  const itemsToPrint: Array<{ name: string; quantity: number; notes?: string }> = [];
  if (activeKot && activeKot.items && activeKot.items.length > 0) {
    for (const item of activeKot.items) {
      itemsToPrint.push({
        name: item.product_name,
        quantity: item.quantity,
        notes: item.notes,
      });
    }
  } else if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      if (item.quantity > 0) {
        itemsToPrint.push({
          name: item.product_name,
          quantity: item.quantity,
          notes: item.item_notes || (item as any).notes,
        });
      }
    }
  }

  const builder = new EscPosTextBuilder(paperSize, printerName, { isBle, transport });

  // 1. Restaurant Name (Centered, Bold, Normal Font A)
  const restaurantName = settings.name || (settings as any).restaurant_name;
  if (restaurantName) {
    builder.addLine(restaurantName.toUpperCase(), { align: 'center', bold: true });
  }

  // 2. Reprint Banner
  if (isReprint) {
    builder.addBanner('*** REPRINT ***');
  }

  // 3. Supplementary Banner
  if (isSupplementary) {
    builder.addBanner('*** SUPPLEMENTARY KOT (SUP) ***');
  }

  // 4. KOT Title & Number (Centered, Bold, Double-Height)
  builder.addDivider('-');
  const kotTitle = kotNum.startsWith('KOT') ? kotNum : `KOT #${kotNum}`;
  const displayTitle = isSupplementary && !kotNum.toUpperCase().includes('SUP') ? `${kotTitle} (SUP)` : kotTitle;
  builder.addLine(displayTitle, { align: 'center', bold: true, scale: 'double_height' });
  builder.addDivider('-');

  // 5. Bill / Order Meta (Key-Value pairs strictly within 48 chars on 80mm / 32 chars on 58mm)
  builder.addKeyValue('Bill No:', order.order_number || 'N/A', { bold: true });

  const rawCreatedAt = activeKot?.created_at || order.updated_at || order.created_at;
  const fullDateTime = formatOrderDateTime(rawCreatedAt);
  // Split Date & Time for clean layout if possible
  const dateParts = fullDateTime.split(',');
  if (dateParts.length >= 2) {
    builder.addKeyValue('Date:', dateParts[0].trim());
    builder.addKeyValue('Time:', dateParts.slice(1).join(',').trim());
  } else {
    builder.addKeyValue('Date/Time:', fullDateTime);
  }

  // 6. Table / Section Info
  const tableName = order.table_number || (order as any).dining_tables?.table_number || order.table_id || 'Quick Order';
  const sectionName = (order as any).section || (order as any).dining_tables?.section || '';
  const tableDisplay = sectionName ? `${tableName} (${sectionName})` : tableName;
  builder.addKeyValue('Table:', tableDisplay, { bold: true });

  // 7. Order Type
  const orderType = order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
  builder.addKeyValue('Type:', orderType);

  // 8. Waiter / Server
  const serverName = (order as any).waiter_name || (order as any).server_name;
  if (serverName) {
    builder.addKeyValue('Server:', serverName);
  }

  // 9. Special Order Notes
  const generalNotes = activeKot?.kitchen_notes || order.notes;
  if (generalNotes && !generalNotes.includes('[AUTO_PRINTED]')) {
    builder.addDivider('-');
    builder.addLine(`Note: ${generalNotes.trim()}`, { bold: true });
  }

  builder.addDivider('-');

  // 10. Table Column Header
  builder.addKotTableHeader();
  builder.addDivider('-');

  // 11. Line Items (with guaranteed right-aligned QTY & item wrapping)
  for (const item of itemsToPrint) {
    builder.addKotItem({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    });
  }

  builder.addDivider('-');

  // 12. Total Items & Qty Count
  const totalItemCount = itemsToPrint.length;
  const totalQty = itemsToPrint.reduce((sum, i) => sum + i.quantity, 0);
  builder.addKeyValue(`Total Items: ${totalItemCount}`, `Qty: ${totalQty}`, { bold: true });

  builder.addDivider('-');

  // 13. Paper Feed & Partial Cut
  builder.addFeedAndCut(3);

  return builder.build();
}
