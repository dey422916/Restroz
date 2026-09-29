/**
 * Android & Windows ESC/POS Thermal Bill & Customer Receipt Renderer
 * Formats finalized restaurant orders using authoritative invoice totals from getOrderInvoiceTotals.
 * Strictly formatted for 58mm (32 chars) and 80mm (48 chars) thermal paper with standard Font A.
 */

import { Order, RestaurantSettings, RestaurantPrinter, PrinterCalibration, PrinterPaperWidth } from '../../../types';
import { formatOrderDateTime } from '../../../utils/dateUtils';
import { getOrderInvoiceTotals } from '../../../utils/gst';
import { EscPosDocument } from './encoder';
import { EscPosTextBuilder } from './escposBuilder';

export interface BillRenderOptions {
  printer?: RestaurantPrinter | { paper_width?: PrinterPaperWidth; name?: string; transport?: string; isBle?: boolean };
  customCalibration?: PrinterCalibration;
  billedBy?: string;
  isBle?: boolean;
  logoRasterBytes?: Uint8Array | null;
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
  const printerName = (options.printer as any)?.name || (paperSize === '58mm' ? 'POS58 Printer' : 'POS80 Printer');
  const isBle = Boolean(options.isBle || (options.printer as any)?.transport === 'bluetooth' || (options.printer as any)?.isBle || paperSize === '58mm');

  const builder = new EscPosTextBuilder(paperSize, printerName, { isBle });

  // 1. Restaurant Brand Logo (Centered monochrome raster bitmap, if provided)
  if (options.logoRasterBytes && options.logoRasterBytes.length > 0) {
    builder.addRawBytes(options.logoRasterBytes);
  }

  // Restaurant Brand Header (Centered, Bold, Normal Font A)
  const restaurantName = settings.name || (settings as any).restaurant_name || (order as any).restaurant?.name || 'RESTROZ RESTAURANT';
  builder.addLine(restaurantName.toUpperCase(), { align: 'center', bold: true });

  if (settings.address) {
    builder.addLine(settings.address, { align: 'center' });
  }

  const phone = settings.phone || (settings as any).contact_number || '';
  if (phone && String(phone).trim() && String(phone).trim() !== 'undefined' && String(phone).trim() !== 'null') {
    builder.addLine(`Phone: ${String(phone).trim()}`, { align: 'center' });
  }

  if (settings.gstin && settings.gstin.trim()) {
    builder.addLine(`GSTIN: ${settings.gstin.trim()}`, { align: 'center', bold: true });
  }

  const fssai = (settings as any).fssai_license_number || (settings as any).fssai_number;
  if (fssai && String(fssai).trim()) {
    builder.addLine(`FSSAI: ${String(fssai).trim()}`, { align: 'center' });
  }

  builder.addDivider('-');

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

  builder.addBanner(title);
  builder.addKeyValue('Bill No:', invoiceNumber, { bold: true });

  const formattedDateTime = formatOrderDateTime(order.created_at);
  const dateParts = formattedDateTime.split(',');
  if (dateParts.length >= 2) {
    builder.addKeyValue('Date:', dateParts[0].trim());
    builder.addKeyValue('Time:', dateParts.slice(1).join(',').trim());
  } else {
    builder.addKeyValue('Date/Time:', formattedDateTime);
  }

  // Table / Order Type
  const tableName = order.table_number || (order as any).dining_tables?.table_number || order.table_id || 'Quick Order';
  const orderType = order.order_type === 'dine_in' ? 'Dine In' : order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery';
  builder.addKeyValue('Table / Type:', `${tableName} (${orderType})`);

  // Billed by / Staff (Always current logged-in user at print time)
  const resolvedBilledBy = (billedBy && billedBy !== 'Staff' && billedBy !== 'Ratnadeep Dey')
    ? billedBy
    : (options.billedBy || billedBy || 'Staff');
  builder.addKeyValue('Billed By:', resolvedBilledBy);

  // Customer GSTIN if B2B
  if (order.customer_gstin && order.customer_gstin.trim()) {
    builder.addKeyValue('Cust GSTIN:', order.customer_gstin.trim(), { bold: true });
  }

  builder.addDivider('-');

  // 3. Item Table Header
  builder.addBillTableHeader();
  builder.addDivider('-');

  // 4. Line Items
  const activeItems = (order.items || []).filter((i) => i.quantity > 0);
  for (const item of activeItems) {
    const qty = Number(item.quantity) || 1;
    const rateNum = Number(item.unit_price) || (item.subtotal ? Number(item.subtotal) / qty : 0);
    const lineAmount = (Number(item.unit_price) && Number(item.quantity))
      ? Number(item.unit_price) * Number(item.quantity)
      : (Number(item.subtotal) || Number(item.total) || 0);

    builder.addBillItem({
      name: item.product_name,
      quantity: qty,
      rate: rateNum,
      amount: lineAmount,
    });
  }

  builder.addDivider('-');

  // 5. Authoritative Financial Totals (from getOrderInvoiceTotals)
  const totalItemCount = activeItems.length;
  const totalQty = activeItems.reduce((sum, i) => sum + i.quantity, 0);
  builder.addKeyValue(`Items: ${totalItemCount}`, `Qty: ${totalQty}`, { bold: true });

  builder.addDivider('-');

  // Subtotal
  builder.addKeyValue('Sub Total:', calculatedTotals.subtotal.toFixed(2));

  // Discount
  const totalDiscount = (calculatedTotals.discountAmount || 0) + (calculatedTotals.couponDiscount || 0);
  if (totalDiscount > 0) {
    builder.addKeyValue('Discount:', `-${totalDiscount.toFixed(2)}`, { bold: true });
  }

  // Taxable amount if tax applicable
  if (calculatedTotals.totalTax > 0) {
    builder.addKeyValue('Taxable Amount:', calculatedTotals.taxableSubtotal.toFixed(2));

    const dynamicTaxRate =
      (order as any).tax_rate !== undefined && (order as any).tax_rate !== null && !isNaN(Number((order as any).tax_rate))
        ? Number((order as any).tax_rate)
        : (calculatedTotals.taxableSubtotal > 0 && calculatedTotals.totalTax > 0
            ? (calculatedTotals.totalTax / calculatedTotals.taxableSubtotal) * 100
            : (settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
                ? Number(settings.default_tax_rate)
                : 0));
    const halfTaxRate = calculatedTotals.taxableSubtotal > 0 && calculatedTotals.cgstAmount > 0
      ? (calculatedTotals.cgstAmount / calculatedTotals.taxableSubtotal) * 100
      : (dynamicTaxRate / 2);
    const halfTaxRateStr = halfTaxRate % 1 === 0 ? String(halfTaxRate) : halfTaxRate.toFixed(1);

    if (calculatedTotals.cgstAmount > 0) {
      builder.addKeyValue(`CGST (${halfTaxRateStr}%):`, calculatedTotals.cgstAmount.toFixed(2));
    }
    if (calculatedTotals.sgstAmount > 0) {
      builder.addKeyValue(`SGST (${halfTaxRateStr}%):`, calculatedTotals.sgstAmount.toFixed(2));
    }
    if (calculatedTotals.igstAmount > 0) {
      builder.addKeyValue(`IGST (${dynamicTaxRate}%):`, calculatedTotals.igstAmount.toFixed(2));
    }
  }

  // Round off
  if (calculatedTotals.roundOff !== 0) {
    const sign = calculatedTotals.roundOff > 0 ? '+' : '';
    builder.addKeyValue('Round Off:', `${sign}${calculatedTotals.roundOff.toFixed(2)}`);
  }

  builder.addDivider('=');

  // GRAND TOTAL / PAYABLE AMOUNT (Using INR to prevent corruption)
  builder.addKeyValue('TOTAL PAYABLE:', `INR ${calculatedTotals.payableAmount.toFixed(2)}`, {
    bold: true,
    scale: 'double_height',
  });

  builder.addDivider('=');

  // 6. Payment Information
  const isPaid = order.payment_status === 'paid';
  const paymentMethod =
    order.payments && order.payments.length > 0
      ? String(order.payments[0].payment_method).toUpperCase()
      : 'CASH';

  builder.addKeyValue('Payment Mode:', paymentMethod, { bold: true });
  builder.addKeyValue('Payment Status:', isPaid ? 'PAID' : 'PENDING', { bold: true });

  if (order.payments && order.payments.length > 0 && order.payments[0].reference_number) {
    builder.addKeyValue('Txn Ref:', order.payments[0].reference_number);
  }

  builder.addDivider('-');

  // 7. Footer
  const footerText = (settings as any).receipt_footer_text || 'Thank you! Visit Again.';
  builder.addLine(footerText, { align: 'center', bold: true });

  // 8. Feed and Cut
  builder.addFeedAndCut(4);

  return builder.build();
}
