import { Order, RestaurantSettings } from '../../types';
import { getLocalRestaurantDate } from './dayRegisterService';
import { formatCurrency } from '../../utils/currency';
import { formatOrderDateTime, formatOrderDate, formatOrderTime } from '../../utils/dateUtils';
import { resolveOrderSource } from './orderService';

export type ReportType =
  | 'daily_sales'
  | 'daily_order'
  | 'daily_revenue'
  | 'monthly_revenue'
  | 'custom_sales'
  | 'gst_tax';

export interface ReportMeta {
  type: ReportType;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  restaurantSettings: RestaurantSettings;
}

const isWebEnvironment = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Helper to escape CSV cell contents per RFC 4180
 */
function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Format currency amount for clean Excel numbers (2 decimal places)
 */
function fmtNum(val?: number): string {
  const n = Number(val) || 0;
  return n.toFixed(2);
}

/**
 * Extract channel string representation from order
 */
function getOrderChannelName(ord: Order): string {
  const src = resolveOrderSource(ord);
  if (src === 'CUSTOMER_QR' || ord.notes?.includes('[QR_DINE_IN]') || ord.notes?.includes('QR')) {
    return 'QR Digital Menu';
  }
  if (src === 'CUSTOMER_APP' || ord.order_type === 'delivery' || Boolean(ord.delivery_address)) {
    return 'Online Delivery';
  }
  if (ord.order_type === 'takeaway') {
    return 'Takeaway';
  }
  return 'Dine-In';
}

export const reportExportService = {
  /**
   * Filter orders by date range and optional order channel using local restaurant date
   */
  filterOrdersByDateRange(
    orders: Order[],
    startDateStr: string,
    endDateStr: string,
    orderTypeFilter: 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'qr' = 'all'
  ): Order[] {
    const start = new Date(`${startDateStr}T00:00:00`);
    const end = new Date(`${endDateStr}T23:59:59.999`);

    return orders.filter((ord) => {
      const ordDate = new Date(ord.created_at);
      if (ordDate < start || ordDate > end) return false;

      if (orderTypeFilter !== 'all') {
        const ch = getOrderChannelName(ord);
        if (orderTypeFilter === 'qr' && ch !== 'QR Digital Menu') return false;
        if (orderTypeFilter === 'delivery' && ch !== 'Online Delivery') return false;
        if (orderTypeFilter === 'takeaway' && ch !== 'Takeaway') return false;
        if (orderTypeFilter === 'dine_in' && ch !== 'Dine-In') return false;
      }
      return true;
    });
  },

  /**
   * Generate CSV content for the requested report type
   */
  generateReportCsv(
    type: ReportType,
    orders: Order[],
    startDateStr: string,
    endDateStr: string,
    settings: RestaurantSettings,
    orderTypeFilter: 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'qr' = 'all'
  ): { csvContent: string; fileName: string; title: string } {
    const filteredOrders = this.filterOrdersByDateRange(orders, startDateStr, endDateStr, orderTypeFilter);
    let headers: string[] = [];
    let rows: string[][] = [];
    let title = '';
    const dateSuffix = startDateStr === endDateStr ? startDateStr : `${startDateStr}_to_${endDateStr}`;

    switch (type) {
      // 1. Daily Sales Report
      // Columns: Date, Total Orders, Dine-In Orders, Takeaway Orders, Delivery Orders, QR Orders, Gross Sales, Discount, Coupon Discount, Taxable Amount, CGST, SGST, Other/Delivery Charges, Net Sales
      case 'daily_sales': {
        title = 'Daily Sales Report';
        headers = [
          'Date',
          'Total Orders',
          'Dine-In Orders',
          'Takeaway Orders',
          'Delivery Orders',
          'QR Orders',
          'Gross Sales',
          'Discount',
          'Coupon Discount',
          'Taxable Amount',
          'CGST',
          'SGST',
          'Other/Delivery Charges',
          'Net Sales',
        ];

        const dayMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          if (!dayMap[d]) dayMap[d] = [];
          dayMap[d].push(o);
        });

        const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
        let sumOrders = 0,
          sumDine = 0,
          sumTake = 0,
          sumDel = 0,
          sumQr = 0,
          sumGross = 0,
          sumDisc = 0,
          sumCoupon = 0,
          sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumCharges = 0,
          sumNet = 0;

        sortedDays.forEach((dayKey) => {
          const dayOrds = dayMap[dayKey];
          let dine = 0,
            take = 0,
            del = 0,
            qr = 0,
            gross = 0,
            disc = 0,
            coupon = 0,
            taxable = 0,
            cgst = 0,
            sgst = 0,
            charges = 0,
            net = 0;

          dayOrds.forEach((o) => {
            if (o.status === 'cancelled') return;
            const ch = getOrderChannelName(o);
            if (ch === 'QR Digital Menu') qr++;
            else if (ch === 'Online Delivery') del++;
            else if (ch === 'Takeaway') take++;
            else dine++;

            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          const totalActiveOrders = dine + take + del + qr;
          sumOrders += totalActiveOrders;
          sumDine += dine;
          sumTake += take;
          sumDel += del;
          sumQr += qr;
          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;

          rows.push([
            dayKey,
            String(totalActiveOrders),
            String(dine),
            String(take),
            String(del),
            String(qr),
            fmtNum(gross),
            fmtNum(disc),
            fmtNum(coupon),
            fmtNum(taxable),
            fmtNum(cgst),
            fmtNum(sgst),
            fmtNum(charges),
            fmtNum(net),
          ]);
        });

        // Totals row
        rows.push([
          'TOTAL',
          String(sumOrders),
          String(sumDine),
          String(sumTake),
          String(sumDel),
          String(sumQr),
          fmtNum(sumGross),
          fmtNum(sumDisc),
          fmtNum(sumCoupon),
          fmtNum(sumTaxable),
          fmtNum(sumCgst),
          fmtNum(sumSgst),
          fmtNum(sumCharges),
          fmtNum(sumNet),
        ]);
        break;
      }

      // 2. Daily Order Report
      // Columns: Date, Order Time, Order ID, Order Type, Table No./Customer, Item Qty, Subtotal, Discount, Coupon Discount, Taxable Amount, CGST, SGST, Charges, Grand Total, Order Status
      case 'daily_order': {
        title = 'Daily Order Report';
        headers = [
          'Date',
          'Order Time',
          'Order ID',
          'Order Type',
          'Table No./Customer',
          'Item Qty',
          'Subtotal',
          'Discount',
          'Coupon Discount',
          'Taxable Amount',
          'CGST',
          'SGST',
          'Charges',
          'Grand Total',
          'Order Status',
        ];

        let sumQty = 0,
          sumSub = 0,
          sumDisc = 0,
          sumCoupon = 0,
          sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumCharges = 0,
          sumGrand = 0;

        filteredOrders.forEach((o) => {
          const d = formatOrderDate(o.created_at);
          const t = formatOrderTime(o.created_at);
          const ch = getOrderChannelName(o);
          const custOrTable = o.table_number ? `Table ${o.table_number}` : (o.customer_name || 'Walk-in Guest');
          const totalQty = (o.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
          const oGrand = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

          if (o.status !== 'cancelled') {
            sumQty += totalQty;
            sumSub += oSub;
            sumDisc += oDisc;
            sumCoupon += oCoupon;
            sumTaxable += oTaxable;
            sumCgst += oCgst;
            sumSgst += oSgst;
            sumCharges += oCharge;
            sumGrand += oGrand;
          }

          rows.push([
            d,
            t,
            o.order_number,
            ch,
            custOrTable,
            String(totalQty),
            fmtNum(oSub),
            fmtNum(oDisc),
            fmtNum(oCoupon),
            fmtNum(oTaxable),
            fmtNum(oCgst),
            fmtNum(oSgst),
            fmtNum(oCharge),
            fmtNum(oGrand),
            o.status.toUpperCase(),
          ]);
        });

        // Totals Row
        rows.push([
          'TOTAL',
          '',
          `${filteredOrders.length} Orders`,
          '',
          '',
          String(sumQty),
          fmtNum(sumSub),
          fmtNum(sumDisc),
          fmtNum(sumCoupon),
          fmtNum(sumTaxable),
          fmtNum(sumCgst),
          fmtNum(sumSgst),
          fmtNum(sumCharges),
          fmtNum(sumGrand),
          '',
        ]);
        break;
      }

      // 3. Daily Revenue Report
      // Columns: Date, Gross Revenue, Discount, Coupon Discount, Taxable Revenue, CGST, SGST, Delivery/Other Charges, Net Revenue, Total Orders
      case 'daily_revenue': {
        title = 'Daily Revenue Report';
        headers = [
          'Date',
          'Gross Revenue',
          'Discount',
          'Coupon Discount',
          'Taxable Revenue',
          'CGST',
          'SGST',
          'Delivery/Other Charges',
          'Net Revenue',
          'Total Orders',
        ];

        const dayMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          if (!dayMap[d]) dayMap[d] = [];
          dayMap[d].push(o);
        });

        const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
        let sumGross = 0,
          sumDisc = 0,
          sumCoupon = 0,
          sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumCharges = 0,
          sumNet = 0,
          sumOrders = 0;

        sortedDays.forEach((dayKey) => {
          const dayOrds = dayMap[dayKey].filter((o) => o.status !== 'cancelled');
          let gross = 0,
            disc = 0,
            coupon = 0,
            taxable = 0,
            cgst = 0,
            sgst = 0,
            charges = 0,
            net = 0;

          dayOrds.forEach((o) => {
            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;
          sumOrders += dayOrds.length;

          rows.push([
            dayKey,
            fmtNum(gross),
            fmtNum(disc),
            fmtNum(coupon),
            fmtNum(taxable),
            fmtNum(cgst),
            fmtNum(sgst),
            fmtNum(charges),
            fmtNum(net),
            String(dayOrds.length),
          ]);
        });

        // Totals Row
        rows.push([
          'TOTAL',
          fmtNum(sumGross),
          fmtNum(sumDisc),
          fmtNum(sumCoupon),
          fmtNum(sumTaxable),
          fmtNum(sumCgst),
          fmtNum(sumSgst),
          fmtNum(sumCharges),
          fmtNum(sumNet),
          String(sumOrders),
        ]);
        break;
      }

      // 4. Monthly Revenue Report
      // Columns: Date (Month), Total Orders, Gross Revenue, Discount, Coupon Discount, Taxable Revenue, CGST, SGST, Other Charges, Net Revenue
      case 'monthly_revenue': {
        title = 'Monthly Revenue Report';
        headers = [
          'Month',
          'Total Orders',
          'Gross Revenue',
          'Discount',
          'Coupon Discount',
          'Taxable Revenue',
          'CGST',
          'SGST',
          'Other Charges',
          'Net Revenue',
        ];

        const monthMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          const mKey = d.substring(0, 7); // YYYY-MM
          if (!monthMap[mKey]) monthMap[mKey] = [];
          monthMap[mKey].push(o);
        });

        const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
        let sumOrders = 0,
          sumGross = 0,
          sumDisc = 0,
          sumCoupon = 0,
          sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumCharges = 0,
          sumNet = 0;

        sortedMonths.forEach((mKey) => {
          const mOrds = monthMap[mKey].filter((o) => o.status !== 'cancelled');
          let gross = 0,
            disc = 0,
            coupon = 0,
            taxable = 0,
            cgst = 0,
            sgst = 0,
            charges = 0,
            net = 0;

          mOrds.forEach((o) => {
            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          sumOrders += mOrds.length;
          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;

          let formattedMonth = mKey;
          try {
            const [y, m] = mKey.split('-');
            const mDate = new Date(Number(y), Number(m) - 1, 1);
            formattedMonth = mDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
          } catch {
            formattedMonth = mKey;
          }

          rows.push([
            formattedMonth,
            String(mOrds.length),
            fmtNum(gross),
            fmtNum(disc),
            fmtNum(coupon),
            fmtNum(taxable),
            fmtNum(cgst),
            fmtNum(sgst),
            fmtNum(charges),
            fmtNum(net),
          ]);
        });

        // Totals Row
        rows.push([
          'TOTAL',
          String(sumOrders),
          fmtNum(sumGross),
          fmtNum(sumDisc),
          fmtNum(sumCoupon),
          fmtNum(sumTaxable),
          fmtNum(sumCgst),
          fmtNum(sumSgst),
          fmtNum(sumCharges),
          fmtNum(sumNet),
        ]);
        break;
      }

      // 5. Custom Date Range Sales Report
      // Columns: Date & Time, Order ID, Order Type, Subtotal, Discount, Coupon Discount, Taxable Amount, CGST, SGST, Other Charges, Grand Total, Status
      case 'custom_sales': {
        title = 'Custom Date Range Sales Report';
        headers = [
          'Date & Time',
          'Order ID',
          'Order Type',
          'Subtotal',
          'Discount',
          'Coupon Discount',
          'Taxable Amount',
          'CGST',
          'SGST',
          'Other Charges',
          'Grand Total',
          'Status',
        ];

        let sumSub = 0,
          sumDisc = 0,
          sumCoupon = 0,
          sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumCharges = 0,
          sumGrand = 0;

        filteredOrders.forEach((o) => {
          const d = formatOrderDateTime(o.created_at);
          const ch = getOrderChannelName(o);
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
          const oGrand = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

          if (o.status !== 'cancelled') {
            sumSub += oSub;
            sumDisc += oDisc;
            sumCoupon += oCoupon;
            sumTaxable += oTaxable;
            sumCgst += oCgst;
            sumSgst += oSgst;
            sumCharges += oCharge;
            sumGrand += oGrand;
          }

          rows.push([
            d,
            o.order_number,
            ch,
            fmtNum(oSub),
            fmtNum(oDisc),
            fmtNum(oCoupon),
            fmtNum(oTaxable),
            fmtNum(oCgst),
            fmtNum(oSgst),
            fmtNum(oCharge),
            fmtNum(oGrand),
            o.status.toUpperCase(),
          ]);
        });

        // Totals Row
        rows.push([
          'TOTAL',
          `${filteredOrders.length} Orders`,
          '',
          fmtNum(sumSub),
          fmtNum(sumDisc),
          fmtNum(sumCoupon),
          fmtNum(sumTaxable),
          fmtNum(sumCgst),
          fmtNum(sumSgst),
          fmtNum(sumCharges),
          fmtNum(sumGrand),
          '',
        ]);
        break;
      }

      // 6. GST / Tax Report
      // Columns: Invoice Date & Time, Invoice No., Order ID, Order Type, Customer Name, Customer GSTIN, Restaurant GSTIN, Taxable Amount, GST Rate, CGST Rate, CGST Amount, SGST Rate, SGST Amount, IGST Rate, IGST Amount, Total GST, Invoice Grand Total, Payment Mode
      case 'gst_tax': {
        title = 'GST / Tax Report';
        headers = [
          'Invoice Date & Time',
          'Invoice No.',
          'Order ID',
          'Order Type',
          'Customer Name',
          'Customer GSTIN',
          'Restaurant GSTIN',
          'Taxable Amount',
          'GST Rate',
          'CGST Rate',
          'CGST Amount',
          'SGST Rate',
          'SGST Amount',
          'IGST Rate',
          'IGST Amount',
          'Total GST',
          'Invoice Grand Total',
          'Payment Mode',
        ];

        let sumTaxable = 0,
          sumCgst = 0,
          sumSgst = 0,
          sumIgst = 0,
          sumTotalGst = 0,
          sumInvoiceTotal = 0;

        filteredOrders.forEach((o) => {
          if (o.status === 'cancelled') return;

          const d = formatOrderDateTime(o.created_at);
          const invNum = o.invoice_number || o.order_number;
          const ch = getOrderChannelName(o);
          const custName = o.customer_name || 'Walk-in Guest';
          const custGstin = o.customer_gstin || 'N/A';
          const restGstin = settings.gstin || 'N/A';
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oIgst = Number(o.igst_amount) || 0;
          const oTotalGst = oCgst + oSgst + oIgst;
          const oInvoiceTotal = Number(o.payable_amount) || Number(o.grand_total) || 0;
          const paymentMode = (o.payment_method || (o.payment_status === 'paid' ? 'PAID' : 'PENDING')).toUpperCase();

          const cgstRate = oCgst > 0 ? '2.5%' : '0%';
          const sgstRate = oSgst > 0 ? '2.5%' : '0%';
          const igstRate = oIgst > 0 ? '5%' : '0%';
          const overallGstRate = oTotalGst > 0 ? (oIgst > 0 ? '5%' : '5%') : '0%';

          sumTaxable += oTaxable;
          sumCgst += oCgst;
          sumSgst += oSgst;
          sumIgst += oIgst;
          sumTotalGst += oTotalGst;
          sumInvoiceTotal += oInvoiceTotal;

          rows.push([
            d,
            invNum,
            o.order_number,
            ch,
            custName,
            custGstin,
            restGstin,
            fmtNum(oTaxable),
            overallGstRate,
            cgstRate,
            fmtNum(oCgst),
            sgstRate,
            fmtNum(oSgst),
            igstRate,
            fmtNum(oIgst),
            fmtNum(oTotalGst),
            fmtNum(oInvoiceTotal),
            paymentMode,
          ]);
        });

        // Totals Row
        rows.push([
          'TOTAL',
          `${filteredOrders.filter((o) => o.status !== 'cancelled').length} Invoices`,
          '',
          '',
          '',
          '',
          '',
          fmtNum(sumTaxable),
          '',
          '',
          fmtNum(sumCgst),
          '',
          fmtNum(sumSgst),
          '',
          fmtNum(sumIgst),
          fmtNum(sumTotalGst),
          fmtNum(sumInvoiceTotal),
          '',
        ]);
        break;
      }
    }

    // Build CSV with Header comments & UTF-8 BOM for flawless Excel opening
    const csvLines = [
      `"${settings.name || 'Restaurant'} - ${title}"`,
      `"GSTIN: ${settings.gstin || 'N/A'}"`,
      `"Period: ${startDateStr} to ${endDateStr}"`,
      `"Generated At: ${new Date().toLocaleString('en-IN')}"`,
      '',
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const fileName = `${type}_${dateSuffix}`;

    return { csvContent, fileName, title };
  },

  /**
   * Download / Share Report as CSV / Excel
   */
  async downloadReportCsv(
    type: ReportType,
    orders: Order[],
    startDateStr: string,
    endDateStr: string,
    settings: RestaurantSettings,
    orderTypeFilter: 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'qr' = 'all'
  ): Promise<void> {
    const { csvContent, fileName, title } = this.generateReportCsv(
      type,
      orders,
      startDateStr,
      endDateStr,
      settings,
      orderTypeFilter
    );

    if (isWebEnvironment) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      try {
        const Sharing = await import('expo-sharing');
        const csvFileName = `${fileName}.csv`;
        let fileUri = '';

        try {
          const { File, Paths } = await import('expo-file-system');
          if (typeof File === 'function' && Paths && (Paths as any).cache) {
            const file = new File((Paths as any).cache, csvFileName);
            file.create();
            file.write(csvContent);
            fileUri = file.uri;
          }
        } catch (_) {
          // fallback to legacy
        }

        if (!fileUri) {
          try {
            const LegacyFS: any = await import('expo-file-system/legacy');
            const targetPath = `${LegacyFS.cacheDirectory || ''}${csvFileName}`;
            await LegacyFS.writeAsStringAsync(targetPath, csvContent, {
              encoding: LegacyFS.EncodingType?.UTF8 || 'utf8',
            });
            fileUri = targetPath;
          } catch (_) {
            // ignore
          }
        }

        if (fileUri && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: `${title} (${startDateStr} to ${endDateStr})`,
            UTI: 'public.comma-separated-values-text',
          });
        }
      } catch (err: any) {
        console.error('Failed to export CSV on mobile:', err);
        throw new Error(err.message || 'Failed to export CSV file.');
      }
    }
  },

  /**
   * Generate Clean HTML for PDF Export & Print
   */
  generateReportHtml(
    type: ReportType,
    orders: Order[],
    startDateStr: string,
    endDateStr: string,
    settings: RestaurantSettings,
    orderTypeFilter: 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'qr' = 'all'
  ): { html: string; title: string; fileName: string } {
    const { fileName, title } = this.generateReportCsv(
      type,
      orders,
      startDateStr,
      endDateStr,
      settings,
      orderTypeFilter
    );

    const filteredOrders = this.filterOrdersByDateRange(orders, startDateStr, endDateStr, orderTypeFilter);
    const dateSuffix = startDateStr === endDateStr ? startDateStr : `${startDateStr} to ${endDateStr}`;

    let tableHeaderHtml = '';
    let tableBodyHtml = '';
    let summaryCardsHtml = '';

    switch (type) {
      case 'daily_sales': {
        tableHeaderHtml = `
          <tr>
            <th>Date</th>
            <th style="text-align: center;">Orders</th>
            <th style="text-align: center;">Dine-In</th>
            <th style="text-align: center;">Takeaway</th>
            <th style="text-align: center;">Delivery</th>
            <th style="text-align: center;">QR</th>
            <th style="text-align: right;">Gross Sales</th>
            <th style="text-align: right;">Discount</th>
            <th style="text-align: right;">Coupon</th>
            <th style="text-align: right;">Taxable Amount</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">Charges</th>
            <th style="text-align: right;">Net Sales</th>
          </tr>
        `;

        const dayMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          if (!dayMap[d]) dayMap[d] = [];
          dayMap[d].push(o);
        });

        const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
        let sumOrders = 0, sumDine = 0, sumTake = 0, sumDel = 0, sumQr = 0, sumGross = 0, sumDisc = 0, sumCoupon = 0, sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumCharges = 0, sumNet = 0;

        sortedDays.forEach((dayKey) => {
          const dayOrds = dayMap[dayKey];
          let dine = 0, take = 0, del = 0, qr = 0, gross = 0, disc = 0, coupon = 0, taxable = 0, cgst = 0, sgst = 0, charges = 0, net = 0;

          dayOrds.forEach((o) => {
            if (o.status === 'cancelled') return;
            const ch = getOrderChannelName(o);
            if (ch === 'QR Digital Menu') qr++;
            else if (ch === 'Online Delivery') del++;
            else if (ch === 'Takeaway') take++;
            else dine++;

            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          const totalActiveOrders = dine + take + del + qr;
          sumOrders += totalActiveOrders;
          sumDine += dine;
          sumTake += take;
          sumDel += del;
          sumQr += qr;
          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;

          tableBodyHtml += `
            <tr>
              <td><b>${dayKey}</b></td>
              <td style="text-align: center;">${totalActiveOrders}</td>
              <td style="text-align: center;">${dine}</td>
              <td style="text-align: center;">${take}</td>
              <td style="text-align: center;">${del}</td>
              <td style="text-align: center;">${qr}</td>
              <td style="text-align: right;">${formatCurrency(gross)}</td>
              <td style="text-align: right; color: #16a34a;">${disc > 0 ? `-${formatCurrency(disc)}` : '₹0'}</td>
              <td style="text-align: right; color: #16a34a;">${coupon > 0 ? `-${formatCurrency(coupon)}` : '₹0'}</td>
              <td style="text-align: right;">${formatCurrency(taxable)}</td>
              <td style="text-align: right;">${formatCurrency(cgst)}</td>
              <td style="text-align: right;">${formatCurrency(sgst)}</td>
              <td style="text-align: right;">${formatCurrency(charges)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(net)}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td>TOTAL</td>
            <td style="text-align: center;">${sumOrders}</td>
            <td style="text-align: center;">${sumDine}</td>
            <td style="text-align: center;">${sumTake}</td>
            <td style="text-align: center;">${sumDel}</td>
            <td style="text-align: center;">${sumQr}</td>
            <td style="text-align: right;">${formatCurrency(sumGross)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumDisc)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumCoupon)}</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumCharges)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumNet)}</td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Total Orders</div><div class="kpi-val">${sumOrders}</div></div>
          <div class="kpi-box"><div class="kpi-label">Gross Revenue</div><div class="kpi-val">${formatCurrency(sumGross)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total Discounts</div><div class="kpi-val" style="color:#dc2626;">-${formatCurrency(sumDisc + sumCoupon)}</div></div>
          <div class="kpi-box"><div class="kpi-label">GST Collected (CGST+SGST)</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumCgst + sumSgst)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Net Sales Realized</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumNet)}</div></div>
        `;
        break;
      }

      case 'daily_order': {
        tableHeaderHtml = `
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Order ID</th>
            <th>Order Type</th>
            <th>Customer / Table</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Subtotal</th>
            <th style="text-align: right;">Discount</th>
            <th style="text-align: right;">Coupon</th>
            <th style="text-align: right;">Taxable Amount</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">Charges</th>
            <th style="text-align: right;">Grand Total</th>
            <th style="text-align: center;">Status</th>
          </tr>
        `;

        let sumQty = 0, sumSub = 0, sumDisc = 0, sumCoupon = 0, sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumCharges = 0, sumGrand = 0;

        filteredOrders.forEach((o) => {
          const d = formatOrderDate(o.created_at);
          const t = formatOrderTime(o.created_at);
          const ch = getOrderChannelName(o);
          const custOrTable = o.table_number ? `Table ${o.table_number}` : (o.customer_name || 'Walk-in Guest');
          const totalQty = (o.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
          const oGrand = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

          if (o.status !== 'cancelled') {
            sumQty += totalQty;
            sumSub += oSub;
            sumDisc += oDisc;
            sumCoupon += oCoupon;
            sumTaxable += oTaxable;
            sumCgst += oCgst;
            sumSgst += oSgst;
            sumCharges += oCharge;
            sumGrand += oGrand;
          }

          tableBodyHtml += `
            <tr>
              <td>${d}</td>
              <td>${t}</td>
              <td><b>${o.order_number}</b></td>
              <td>${ch}</td>
              <td>${custOrTable}</td>
              <td style="text-align: center;">${totalQty}</td>
              <td style="text-align: right;">${formatCurrency(oSub)}</td>
              <td style="text-align: right; color: #16a34a;">${oDisc > 0 ? `-${formatCurrency(oDisc)}` : '₹0'}</td>
              <td style="text-align: right; color: #16a34a;">${oCoupon > 0 ? `-${formatCurrency(oCoupon)}` : '₹0'}</td>
              <td style="text-align: right;">${formatCurrency(oTaxable)}</td>
              <td style="text-align: right;">${formatCurrency(oCgst)}</td>
              <td style="text-align: right;">${formatCurrency(oSgst)}</td>
              <td style="text-align: right;">${formatCurrency(oCharge)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(oGrand)}</td>
              <td style="text-align: center;"><span class="badge ${o.status === 'completed' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : 'badge-info'}">${o.status.toUpperCase()}</span></td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td colspan="5">TOTAL (${filteredOrders.length} Orders)</td>
            <td style="text-align: center;">${sumQty}</td>
            <td style="text-align: right;">${formatCurrency(sumSub)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumDisc)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumCoupon)}</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumCharges)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumGrand)}</td>
            <td></td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Total Orders Placed</div><div class="kpi-val">${filteredOrders.length}</div></div>
          <div class="kpi-box"><div class="kpi-label">Active Items Sold</div><div class="kpi-val">${sumQty}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total Billed Revenue</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumGrand)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total GST Collected</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumCgst + sumSgst)}</div></div>
        `;
        break;
      }

      case 'daily_revenue': {
        tableHeaderHtml = `
          <tr>
            <th>Date</th>
            <th style="text-align: right;">Gross Revenue</th>
            <th style="text-align: right;">Discount</th>
            <th style="text-align: right;">Coupon Discount</th>
            <th style="text-align: right;">Taxable Revenue</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">Charges</th>
            <th style="text-align: right;">Net Revenue</th>
            <th style="text-align: center;">Orders</th>
          </tr>
        `;

        const dayMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          if (!dayMap[d]) dayMap[d] = [];
          dayMap[d].push(o);
        });

        const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
        let sumGross = 0, sumDisc = 0, sumCoupon = 0, sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumCharges = 0, sumNet = 0, sumOrders = 0;

        sortedDays.forEach((dayKey) => {
          const dayOrds = dayMap[dayKey].filter((o) => o.status !== 'cancelled');
          let gross = 0, disc = 0, coupon = 0, taxable = 0, cgst = 0, sgst = 0, charges = 0, net = 0;

          dayOrds.forEach((o) => {
            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;
          sumOrders += dayOrds.length;

          tableBodyHtml += `
            <tr>
              <td><b>${dayKey}</b></td>
              <td style="text-align: right;">${formatCurrency(gross)}</td>
              <td style="text-align: right; color: #16a34a;">${disc > 0 ? `-${formatCurrency(disc)}` : '₹0'}</td>
              <td style="text-align: right; color: #16a34a;">${coupon > 0 ? `-${formatCurrency(coupon)}` : '₹0'}</td>
              <td style="text-align: right;">${formatCurrency(taxable)}</td>
              <td style="text-align: right;">${formatCurrency(cgst)}</td>
              <td style="text-align: right;">${formatCurrency(sgst)}</td>
              <td style="text-align: right;">${formatCurrency(charges)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(net)}</td>
              <td style="text-align: center;">${dayOrds.length}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td>TOTAL</td>
            <td style="text-align: right;">${formatCurrency(sumGross)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumDisc)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumCoupon)}</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumCharges)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumNet)}</td>
            <td style="text-align: center;">${sumOrders}</td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Total Realized Revenue</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumNet)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total Taxable Turnover</div><div class="kpi-val">${formatCurrency(sumTaxable)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total GST Collected</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumCgst + sumSgst)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Completed Orders</div><div class="kpi-val">${sumOrders}</div></div>
        `;
        break;
      }

      case 'monthly_revenue': {
        tableHeaderHtml = `
          <tr>
            <th>Month</th>
            <th style="text-align: center;">Orders</th>
            <th style="text-align: right;">Gross Revenue</th>
            <th style="text-align: right;">Discount</th>
            <th style="text-align: right;">Coupon Discount</th>
            <th style="text-align: right;">Taxable Revenue</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">Charges</th>
            <th style="text-align: right;">Net Revenue</th>
          </tr>
        `;

        const monthMap: Record<string, Order[]> = {};
        filteredOrders.forEach((o) => {
          const d = getLocalRestaurantDate(new Date(o.created_at));
          const mKey = d.substring(0, 7);
          if (!monthMap[mKey]) monthMap[mKey] = [];
          monthMap[mKey].push(o);
        });

        const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
        let sumOrders = 0, sumGross = 0, sumDisc = 0, sumCoupon = 0, sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumCharges = 0, sumNet = 0;

        sortedMonths.forEach((mKey) => {
          const mOrds = monthMap[mKey].filter((o) => o.status !== 'cancelled');
          let gross = 0, disc = 0, coupon = 0, taxable = 0, cgst = 0, sgst = 0, charges = 0, net = 0;

          mOrds.forEach((o) => {
            const oSub = Number(o.subtotal) || 0;
            const oDisc = Number(o.discount_amount) || 0;
            const oCoupon = Number(o.coupon_discount) || 0;
            const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
            const oCgst = Number(o.cgst_amount) || 0;
            const oSgst = Number(o.sgst_amount) || 0;
            const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
            const oNet = Number(o.payable_amount) || Number(o.grand_total) || (oTaxable + oCgst + oSgst + oCharge);

            gross += Number(o.grand_total) || (oSub + oCgst + oSgst + oCharge);
            disc += oDisc;
            coupon += oCoupon;
            taxable += oTaxable;
            cgst += oCgst;
            sgst += oSgst;
            charges += oCharge;
            net += oNet;
          });

          sumOrders += mOrds.length;
          sumGross += gross;
          sumDisc += disc;
          sumCoupon += coupon;
          sumTaxable += taxable;
          sumCgst += cgst;
          sumSgst += sgst;
          sumCharges += charges;
          sumNet += net;

          let formattedMonth = mKey;
          try {
            const [y, m] = mKey.split('-');
            const mDate = new Date(Number(y), Number(m) - 1, 1);
            formattedMonth = mDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
          } catch {
            formattedMonth = mKey;
          }

          tableBodyHtml += `
            <tr>
              <td><b>${formattedMonth}</b></td>
              <td style="text-align: center;">${mOrds.length}</td>
              <td style="text-align: right;">${formatCurrency(gross)}</td>
              <td style="text-align: right; color: #16a34a;">${disc > 0 ? `-${formatCurrency(disc)}` : '₹0'}</td>
              <td style="text-align: right; color: #16a34a;">${coupon > 0 ? `-${formatCurrency(coupon)}` : '₹0'}</td>
              <td style="text-align: right;">${formatCurrency(taxable)}</td>
              <td style="text-align: right;">${formatCurrency(cgst)}</td>
              <td style="text-align: right;">${formatCurrency(sgst)}</td>
              <td style="text-align: right;">${formatCurrency(charges)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(net)}</td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td>TOTAL</td>
            <td style="text-align: center;">${sumOrders}</td>
            <td style="text-align: right;">${formatCurrency(sumGross)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumDisc)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumCoupon)}</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumCharges)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumNet)}</td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Cumulative Turnover</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumNet)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Taxable Base</div><div class="kpi-val">${formatCurrency(sumTaxable)}</div></div>
          <div class="kpi-box"><div class="kpi-label">GST Liability</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumCgst + sumSgst)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Order Volume</div><div class="kpi-val">${sumOrders}</div></div>
        `;
        break;
      }

      case 'custom_sales': {
        tableHeaderHtml = `
          <tr>
            <th>Date & Time</th>
            <th>Order ID</th>
            <th>Order Type</th>
            <th style="text-align: right;">Subtotal</th>
            <th style="text-align: right;">Discount</th>
            <th style="text-align: right;">Coupon</th>
            <th style="text-align: right;">Taxable Amount</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">Other Charges</th>
            <th style="text-align: right;">Grand Total</th>
            <th style="text-align: center;">Status</th>
          </tr>
        `;

        let sumSub = 0, sumDisc = 0, sumCoupon = 0, sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumCharges = 0, sumGrand = 0;

        filteredOrders.forEach((o) => {
          const d = formatOrderDateTime(o.created_at);
          const ch = getOrderChannelName(o);
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oCharge = (Number(o.delivery_charge) || 0) + (Number(o.service_charge) || 0);
          const oGrand = Number(o.payable_amount) || Number(o.grand_total) || 0;

          if (o.status !== 'cancelled') {
            sumSub += oSub;
            sumDisc += oDisc;
            sumCoupon += oCoupon;
            sumTaxable += oTaxable;
            sumCgst += oCgst;
            sumSgst += oSgst;
            sumCharges += oCharge;
            sumGrand += oGrand;
          }

          tableBodyHtml += `
            <tr>
              <td>${d}</td>
              <td><b>${o.order_number}</b></td>
              <td>${ch}</td>
              <td style="text-align: right;">${formatCurrency(oSub)}</td>
              <td style="text-align: right; color: #16a34a;">${oDisc > 0 ? `-${formatCurrency(oDisc)}` : '₹0'}</td>
              <td style="text-align: right; color: #16a34a;">${oCoupon > 0 ? `-${formatCurrency(oCoupon)}` : '₹0'}</td>
              <td style="text-align: right;">${formatCurrency(oTaxable)}</td>
              <td style="text-align: right;">${formatCurrency(oCgst)}</td>
              <td style="text-align: right;">${formatCurrency(oSgst)}</td>
              <td style="text-align: right;">${formatCurrency(oCharge)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(oGrand)}</td>
              <td style="text-align: center;"><span class="badge ${o.status === 'completed' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : 'badge-info'}">${o.status.toUpperCase()}</span></td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td colspan="3">TOTAL (${filteredOrders.length} Orders)</td>
            <td style="text-align: right;">${formatCurrency(sumSub)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumDisc)}</td>
            <td style="text-align: right; color: #16a34a;">-${formatCurrency(sumCoupon)}</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumCharges)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumGrand)}</td>
            <td></td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Grand Total Sales</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumGrand)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Taxable Value</div><div class="kpi-val">${formatCurrency(sumTaxable)}</div></div>
          <div class="kpi-box"><div class="kpi-label">GST Collected</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumCgst + sumSgst)}</div></div>
        `;
        break;
      }

      case 'gst_tax': {
        tableHeaderHtml = `
          <tr>
            <th>Date & Time</th>
            <th>Invoice No.</th>
            <th>Order ID</th>
            <th>Order Type</th>
            <th>Customer</th>
            <th>Customer GSTIN</th>
            <th style="text-align: right;">Taxable Amt</th>
            <th style="text-align: center;">Rate</th>
            <th style="text-align: right;">CGST</th>
            <th style="text-align: right;">SGST</th>
            <th style="text-align: right;">IGST</th>
            <th style="text-align: right;">Total GST</th>
            <th style="text-align: right;">Grand Total</th>
            <th style="text-align: center;">Payment</th>
          </tr>
        `;

        let sumTaxable = 0, sumCgst = 0, sumSgst = 0, sumIgst = 0, sumTotalGst = 0, sumInvoiceTotal = 0;

        filteredOrders.forEach((o) => {
          if (o.status === 'cancelled') return;

          const d = formatOrderDateTime(o.created_at);
          const invNum = o.invoice_number || o.order_number;
          const ch = getOrderChannelName(o);
          const custName = o.customer_name || 'Walk-in';
          const custGstin = o.customer_gstin ? `<span class="badge badge-info" style="font-size:8px;">${o.customer_gstin}</span>` : '<span style="color:#94a3b8;">-</span>';
          const oSub = Number(o.subtotal) || 0;
          const oDisc = Number(o.discount_amount) || 0;
          const oCoupon = Number(o.coupon_discount) || 0;
          const oTaxable = o.taxable_amount !== undefined && o.taxable_amount > 0 ? Number(o.taxable_amount) : Math.max(0, oSub - oDisc - oCoupon);
          const oCgst = Number(o.cgst_amount) || 0;
          const oSgst = Number(o.sgst_amount) || 0;
          const oIgst = Number(o.igst_amount) || 0;
          const oTotalGst = oCgst + oSgst + oIgst;
          const oInvoiceTotal = Number(o.payable_amount) || Number(o.grand_total) || 0;
          const paymentMode = (o.payment_method || (o.payment_status === 'paid' ? 'PAID' : 'PENDING')).toUpperCase();

          sumTaxable += oTaxable;
          sumCgst += oCgst;
          sumSgst += oSgst;
          sumIgst += oIgst;
          sumTotalGst += oTotalGst;
          sumInvoiceTotal += oInvoiceTotal;

          tableBodyHtml += `
            <tr>
              <td>${d}</td>
              <td><b>${invNum}</b></td>
              <td style="color:#64748b;">${o.order_number}</td>
              <td>${ch}</td>
              <td>${custName}</td>
              <td>${custGstin}</td>
              <td style="text-align: right;">${formatCurrency(oTaxable)}</td>
              <td style="text-align: center;">5%</td>
              <td style="text-align: right;">${formatCurrency(oCgst)}</td>
              <td style="text-align: right;">${formatCurrency(oSgst)}</td>
              <td style="text-align: right;">${formatCurrency(oIgst)}</td>
              <td style="text-align: right; font-weight: bold; color: #7c3aed;">${formatCurrency(oTotalGst)}</td>
              <td style="text-align: right; font-weight: bold; color: #0f172a;">${formatCurrency(oInvoiceTotal)}</td>
              <td style="text-align: center;"><span class="badge badge-info">${paymentMode}</span></td>
            </tr>
          `;
        });

        tableBodyHtml += `
          <tr class="total-row">
            <td colspan="6">TOTAL (${filteredOrders.filter((o) => o.status !== 'cancelled').length} Invoices)</td>
            <td style="text-align: right;">${formatCurrency(sumTaxable)}</td>
            <td></td>
            <td style="text-align: right;">${formatCurrency(sumCgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumSgst)}</td>
            <td style="text-align: right;">${formatCurrency(sumIgst)}</td>
            <td style="text-align: right; font-weight: bold; color: #7c3aed;">${formatCurrency(sumTotalGst)}</td>
            <td style="text-align: right; font-size: 13px; color: #16a34a;">${formatCurrency(sumInvoiceTotal)}</td>
            <td></td>
          </tr>
        `;

        summaryCardsHtml = `
          <div class="kpi-box"><div class="kpi-label">Total Taxable Turnover</div><div class="kpi-val">${formatCurrency(sumTaxable)}</div></div>
          <div class="kpi-box"><div class="kpi-label">CGST + SGST + IGST Total</div><div class="kpi-val" style="color:#7c3aed;">${formatCurrency(sumTotalGst)}</div></div>
          <div class="kpi-box"><div class="kpi-label">Total Invoiced Amount</div><div class="kpi-val" style="color:#16a34a;">${formatCurrency(sumInvoiceTotal)}</div></div>
        `;
        break;
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${settings.name || 'Restaurant'} — ${title}</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #0f172a; padding: 0; margin: 0; line-height: 1.3; }
            .header-bar { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
            .brand-name { font-size: 20px; font-weight: 900; color: #0f172a; }
            .meta-text { font-size: 11px; color: #475569; }
            .report-title-box { text-align: right; }
            .report-title { font-size: 18px; font-weight: 900; color: #1e40af; margin: 0; }
            .report-period { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px; }
            .kpi-row { display: flex; gap: 12px; margin-bottom: 12px; }
            .kpi-box { flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; }
            .kpi-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .kpi-val { font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; }
            th { background: #f1f5f9; color: #0f172a; font-weight: 800; font-size: 10.5px; padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left; }
            td { padding: 5px 8px; border: 1px solid #e2e8f0; font-size: 10.5px; }
            tr:nth-child(even) td { background-color: #fafafa; }
            .total-row td { font-weight: 900; background-color: #f1f5f9; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; }
            .badge-success { background: #dcfce7; color: #16a34a; }
            .badge-danger { background: #fee2e2; color: #dc2626; }
            .badge-info { background: #eff6ff; color: #2563eb; }
            .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div>
              <div class="brand-name">${settings.name || 'Restaurant'}</div>
              ${settings.legal_name ? `<div class="meta-text">${settings.legal_name}</div>` : ''}
              <div class="meta-text">${settings.address || ''} • Phone: ${settings.phone || 'N/A'}</div>
              <div class="meta-text">GSTIN: <b>${settings.gstin || 'N/A'}</b></div>
            </div>
            <div class="report-title-box">
              <h1 class="report-title">${title}</h1>
              <div class="report-period">Period: ${dateSuffix}</div>
              <div class="meta-text">Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')}</div>
            </div>
          </div>

          <div class="kpi-row">
            ${summaryCardsHtml}
          </div>

          <table>
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${tableBodyHtml}
            </tbody>
          </table>

          <div class="footer">
            Generated by Ratnadeep POS • Official Accounting & Operational Report • Confidential
          </div>
        </body>
      </html>
    `;

    return { html, title, fileName };
  },

  /**
   * Print or Export Report as PDF
   */
  async printOrExportReportPdf(
    type: ReportType,
    orders: Order[],
    startDateStr: string,
    endDateStr: string,
    settings: RestaurantSettings,
    orderTypeFilter: 'all' | 'dine_in' | 'takeaway' | 'delivery' | 'qr' = 'all'
  ): Promise<void> {
    const { html, title } = this.generateReportHtml(
      type,
      orders,
      startDateStr,
      endDateStr,
      settings,
      orderTypeFilter
    );

    if (isWebEnvironment) {
      const existing = document.getElementById('ratnadeep-report-print-frame');
      if (existing) {
        try { existing.remove(); } catch (_) {}
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'ratnadeep-report-print-frame';
      iframe.name = 'ratnadeep-report-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0.01';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print failed:', err);
            window.print();
          } finally {
            setTimeout(() => {
              try { iframe.remove(); } catch (_) {}
            }, 500);
          }
        }, 200);
      }
    } else {
      try {
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');
        const { uri } = await Print.printToFileAsync({ html });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${title} PDF (${startDateStr} to ${endDateStr})`,
            UTI: '.pdf',
          });
        } else {
          await Print.printAsync({ uri });
        }
      } catch (err: any) {
        console.error('Failed to export PDF on mobile:', err);
        throw new Error(err.message || 'Failed to export PDF.');
      }
    }
  },
};
