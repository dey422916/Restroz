/**
 * Android ESC/POS Thermal Bill & Customer Receipt Renderer
 * Formats finalized restaurant orders using authoritative invoice totals from getOrderInvoiceTotals.
 */

import { Order, RestaurantSettings, RestaurantPrinter, PrinterCalibration, PrinterPaperWidth } from '../../../types';
import { formatOrderDateTime } from '../../../utils/dateUtils';
import { getOrderInvoiceTotals } from '../../../utils/gst';
import { DEFAULT_PRINTER_CALIBRATION } from '../printerTypes';
import { ReceiptCanvas } from './documentRenderer';
import { encodeRasterToEscPos, EscPosDocument } from './encoder';

export interface BillRenderOptions {
  printer?: RestaurantPrinter;
  customCalibration?: PrinterCalibration;
  billedBy?: string;
}

/**
 * Renders an authoritative Order into a final Thermal Bill / Receipt ESC/POS binary document.
 */
export function renderBillToEscPos(
  order: Order,
  settings: RestaurantSettings,
  billedBy: string = 'Staff',
  options: BillRenderOptions = {}
): EscPosDocument {
  const rawPaperSize = options.printer?.paper_width || settings.bill_paper_size || settings.kot_paper_size || '80mm';
  const paperSize: PrinterPaperWidth = rawPaperSize === '58mm' ? '58mm' : '80mm';
  const canvas = new ReceiptCanvas(paperSize);

  // 1. Restaurant Brand Header
  const restaurantName = settings.name || (settings as any).restaurant_name || (order as any).restaurant?.name || 'RESTROZ RESTAURANT';
  canvas.drawTextLine(restaurantName.toUpperCase(), {
    align: 'center',
    bold: true,
    scaleX: 2,
    scaleY: 2,
  });

  if (settings.address) {
    canvas.drawTextLine(settings.address, { align: 'center' });
  }

  const phone = settings.phone || (settings as any).contact_number;
  if (phone) {
    canvas.drawTextLine(`Phone: ${phone}`, { align: 'center' });
  }

  if (settings.gstin && settings.gstin.trim()) {
    canvas.drawTextLine(`GSTIN: ${settings.gstin.trim()}`, { align: 'center', bold: true });
  }

  const fssai = (settings as any).fssai_license_number || (settings as any).fssai_number;
  if (fssai && String(fssai).trim()) {
    canvas.drawTextLine(`FSSAI: ${String(fssai).trim()}`, { align: 'center' });
  }

  canvas.drawDivider('dashed', 1);

  // 2. Invoice Meta
  const calculatedTotals = getOrderInvoiceTotals(order, settings);
  const effectiveGstRegistered =
    settings.is_gst_enabled !== false &&
    (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()));
  const isTaxInvoice =
    calculatedTotals.totalTax > 0 ||
    (effectiveGstRegistered && settings.tax_invoice_enabled !== false && Boolean(settings.gstin?.trim()));

  const invoiceNumber = order.invoice_number || order.order_number;
  const title = isTaxInvoice ? 'TAX INVOICE' : 'RETAIL BILL';

  canvas.drawBanner(title, { scaleX: 1, scaleY: 1 });
  canvas.drawKeyValue('Bill No:', invoiceNumber, { bold: true });

  const formattedDateTime = formatOrderDateTime(order.created_at);
  canvas.drawKeyValue('Date & Time:', formattedDateTime);

  // Table / Order Type
  const tableName = order.table_number || (order as any).dining_tables?.table_number || order.table_id || 'Quick Order';
  const orderType = order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
  canvas.drawKeyValue('Table / Type:', `${tableName} (${orderType})`);

  // Billed by / Staff
  const server = (order as any).waiter_name || billedBy || options.billedBy || 'Cashier';
  canvas.drawKeyValue('Billed By:', server);

  // Customer GSTIN if B2B
  if (order.customer_gstin && order.customer_gstin.trim()) {
    canvas.drawKeyValue('Cust GSTIN:', order.customer_gstin.trim(), { bold: true });
  }

  canvas.drawDivider('solid', 2);

  // 3. Item Table Header
  canvas.drawColumns([
    { text: 'ITEM', widthRatio: 0.50, align: 'left', bold: true },
    { text: 'QTY', widthRatio: 0.14, align: 'center', bold: true },
    { text: 'RATE', widthRatio: 0.18, align: 'right', bold: true },
    { text: 'AMOUNT', widthRatio: 0.18, align: 'right', bold: true },
  ]);

  canvas.drawDivider('solid', 1);

  // 4. Line Items
  const activeItems = (order.items || []).filter((i) => i.quantity > 0);
  for (const item of activeItems) {
    const qty = Number(item.quantity) || 1;
    const rateNum = Number(item.unit_price) || (item.subtotal ? Number(item.subtotal) / qty : 0);
    const lineAmount = (Number(item.unit_price) && Number(item.quantity))
      ? Number(item.unit_price) * Number(item.quantity)
      : (Number(item.subtotal) || Number(item.total) || 0);

    canvas.drawColumns([
      { text: item.product_name, widthRatio: 0.50, align: 'left', bold: true },
      { text: String(qty), widthRatio: 0.14, align: 'center' },
      { text: rateNum.toFixed(2), widthRatio: 0.18, align: 'right' },
      { text: lineAmount.toFixed(2), widthRatio: 0.18, align: 'right', bold: true },
    ]);
  }

  canvas.drawDivider('solid', 2);

  // 5. Authoritative Financial Totals (from getOrderInvoiceTotals)
  const totalItemCount = activeItems.length;
  const totalQty = activeItems.reduce((sum, i) => sum + i.quantity, 0);
  canvas.drawKeyValue(`Items: ${totalItemCount}`, `Qty: ${totalQty}`, { bold: true });

  canvas.drawDivider('dashed', 1);

  // Subtotal
  canvas.drawKeyValue('Sub Total:', calculatedTotals.subtotal.toFixed(2));

  // Discount
  const totalDiscount = (calculatedTotals.discountAmount || 0) + (calculatedTotals.couponDiscount || 0);
  if (totalDiscount > 0) {
    canvas.drawKeyValue('Discount:', `-${totalDiscount.toFixed(2)}`, { bold: true });
  }

  // Taxable amount if tax applicable
  if (calculatedTotals.totalTax > 0) {
    canvas.drawKeyValue('Taxable Amount:', calculatedTotals.taxableSubtotal.toFixed(2));

    const dynamicTaxRate =
      (order as any).tax_rate !== undefined && (order as any).tax_rate !== null
        ? Number((order as any).tax_rate)
        : (settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
            ? Number(settings.default_tax_rate)
            : 5.0);
    const halfTaxRate = dynamicTaxRate / 2;
    const halfTaxRateStr = halfTaxRate % 1 === 0 ? String(halfTaxRate) : halfTaxRate.toFixed(1);

    if (calculatedTotals.cgstAmount > 0) {
      canvas.drawKeyValue(`CGST (${halfTaxRateStr}%):`, calculatedTotals.cgstAmount.toFixed(2));
    }
    if (calculatedTotals.sgstAmount > 0) {
      canvas.drawKeyValue(`SGST (${halfTaxRateStr}%):`, calculatedTotals.sgstAmount.toFixed(2));
    }
    if (calculatedTotals.igstAmount > 0) {
      canvas.drawKeyValue(`IGST (${dynamicTaxRate}%):`, calculatedTotals.igstAmount.toFixed(2));
    }
  }

  // Round off
  if (calculatedTotals.roundOff !== 0) {
    const sign = calculatedTotals.roundOff > 0 ? '+' : '';
    canvas.drawKeyValue('Round Off:', `${sign}${calculatedTotals.roundOff.toFixed(2)}`);
  }

  canvas.drawDivider('solid', 2);

  // GRAND TOTAL / PAYABLE AMOUNT
  canvas.drawKeyValue('TOTAL PAYABLE:', `INR ${calculatedTotals.payableAmount.toFixed(2)}`, {
    bold: true,
    scaleX: 2,
    scaleY: 2,
  });

  canvas.drawDivider('solid', 2);

  // 6. Payment Information
  const isPaid = order.payment_status === 'paid';
  const paymentMethod =
    order.payments && order.payments.length > 0
      ? String(order.payments[0].payment_method).toUpperCase()
      : 'CASH';

  canvas.drawKeyValue('Payment Mode:', paymentMethod, { bold: true });
  canvas.drawKeyValue('Payment Status:', isPaid ? 'PAID' : 'PENDING', { bold: true });

  if (order.payments && order.payments.length > 0 && order.payments[0].reference_number) {
    canvas.drawKeyValue('Txn Ref:', order.payments[0].reference_number);
  }

  canvas.drawDivider('dashed', 1);

  // 7. Footer
  const footerText = (settings as any).receipt_footer_text || 'Thank you! Visit Again.';
  canvas.drawTextLine(footerText, { align: 'center', bold: true });

  // Calibration application
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
