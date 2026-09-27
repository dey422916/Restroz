/**
 * Android ESC/POS KOT Document Renderer
 * Generates printer-ready raster ESC/POS documents for Kitchen Order Tickets.
 */

import { Order, KOT, RestaurantSettings, RestaurantPrinter, PrinterCalibration, PrinterPaperWidth } from '../../../types';
import { formatOrderDateTime } from '../../../utils/dateUtils';
import { DEFAULT_PRINTER_CALIBRATION } from '../printerTypes';
import { ReceiptCanvas } from './documentRenderer';
import { encodeRasterToEscPos, EscPosDocument } from './encoder';

export interface KotRenderOptions {
  printer?: RestaurantPrinter;
  customCalibration?: PrinterCalibration;
  isReprint?: boolean;
}

/**
 * Renders an authoritative Order / KOT into an ESC/POS binary raster document.
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

  const formattedDateTime = formatOrderDateTime(activeKot?.created_at || order.updated_at || order.created_at);

  const rawPaperSize = options.printer?.paper_width || settings.kot_paper_size || '80mm';
  const paperSize: PrinterPaperWidth = rawPaperSize === '58mm' ? '58mm' : '80mm';

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

  const canvas = new ReceiptCanvas(paperSize);

  // 1. Restaurant Name / Header if configured
  const restaurantName = settings.name || (settings as any).restaurant_name;
  if (restaurantName) {
    canvas.drawTextLine(restaurantName.toUpperCase(), {
      align: 'center',
      bold: true,
      scaleX: 1,
      scaleY: 1,
    });
  }

  // 2. Reprint Banner
  if (isReprint) {
    canvas.drawBanner('*** REPRINT ***', { scaleX: 1, scaleY: 1 });
  }

  // 3. Supplementary Banner
  if (isSupplementary) {
    canvas.drawBanner('*** SUPPLEMENTARY KOT (SUP) ***', { scaleX: 1, scaleY: 1 });
  }

  // 4. KOT Title & Number
  const kotTitle = kotNum.startsWith('KOT') ? kotNum : `KOT #${kotNum}`;
  const displayTitle = isSupplementary && !kotNum.toUpperCase().includes('SUP') ? `${kotTitle} (SUP)` : kotTitle;
  canvas.drawTextLine(displayTitle, {
    align: 'center',
    bold: true,
    scaleX: 2,
    scaleY: 2,
  });

  canvas.drawDivider('dashed', 1);

  // 5. Bill / Order Meta
  canvas.drawKeyValue('Bill No:', order.order_number || 'N/A', { bold: true });
  canvas.drawKeyValue('Date & Time:', formattedDateTime);

  // 6. Table / Section Info
  const tableName = order.table_number || (order as any).dining_tables?.table_number || order.table_id || 'Quick Order';
  const sectionName = (order as any).section || (order as any).dining_tables?.section || '';
  const tableDisplay = sectionName ? `${tableName} (${sectionName})` : tableName;
  canvas.drawKeyValue('Table:', tableDisplay, { bold: true, scaleX: 1, scaleY: 1 });

  // 7. Order Type
  const orderType = order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
  canvas.drawKeyValue('Order Type:', orderType);

  // 8. Waiter / Server
  const serverName = (order as any).waiter_name || (order as any).server_name;
  if (serverName) {
    canvas.drawKeyValue('Server:', serverName);
  }

  // 9. Special Order Notes
  const generalNotes = activeKot?.kitchen_notes || order.notes;
  if (generalNotes && !generalNotes.includes('[AUTO_PRINTED]')) {
    canvas.drawDivider('dotted', 1);
    canvas.drawTextLine(`Note: ${generalNotes.trim()}`, { bold: true });
  }

  canvas.drawDivider('solid', 2);

  // 10. Table Column Header
  canvas.drawColumns([
    { text: 'ITEM', widthRatio: 0.78, align: 'left', bold: true },
    { text: 'QTY', widthRatio: 0.22, align: 'right', bold: true },
  ]);

  canvas.drawDivider('solid', 1);

  // 11. Line Items
  for (const item of itemsToPrint) {
    canvas.drawColumns([
      { text: item.name, widthRatio: 0.78, align: 'left', bold: true },
      { text: String(item.quantity), widthRatio: 0.22, align: 'right', bold: true, scaleX: 1, scaleY: 1 },
    ]);

    if (item.notes && item.notes.trim()) {
      canvas.drawTextLine(`  * ${item.notes.trim()}`, { bold: false });
    }
  }

  canvas.drawDivider('solid', 2);

  // 12. Total Items Count
  const totalItemCount = itemsToPrint.length;
  const totalQty = itemsToPrint.reduce((sum, i) => sum + i.quantity, 0);
  canvas.drawKeyValue(`Total Items: ${totalItemCount}`, `Total Qty: ${totalQty}`, { bold: true });

  canvas.drawDivider('dashed', 1);

  // Extract calibration
  const calibration: PrinterCalibration = options.customCalibration || (options.printer ? {
    alignment: options.printer.alignment,
    horizontal_shift_mm: options.printer.horizontal_shift_mm,
    margin_left_mm: options.printer.margin_left_mm,
    margin_right_mm: options.printer.margin_right_mm,
    margin_top_mm: options.printer.margin_top_mm,
    margin_bottom_mm: options.printer.margin_bottom_mm,
  } : DEFAULT_PRINTER_CALIBRATION);

  const finalBitmap = canvas.renderToBitmap(calibration);
  return encodeRasterToEscPos(finalBitmap, {
    cut: true,
    feedLines: 4,
    paperWidth: paperSize,
  });
}
