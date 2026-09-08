import { Order, OrderItem, Coupon } from '../types';
import { roundToTwoDecimals } from './currency';

export interface CalculationInput {
  items?: OrderItem[];
  subtotal?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  coupon?: Partial<Coupon> | null;
  couponDiscount?: number;
  serviceChargeRate?: number;
  deliveryCharge?: number;
  isInterState?: boolean;
  isGstEnabled?: boolean;
  taxRate?: number;
}

export interface CalculationResult {
  subtotal: number;
  discountAmount: number;
  couponDiscount: number;
  taxableSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  serviceCharge: number;
  deliveryCharge: number;
  rawTotal: number;
  roundOff: number;
  payableAmount: number;
}

export function calculateOrderTotals(input: CalculationInput): CalculationResult {
  const {
    items = [],
    subtotal: customSubtotal,
    discountType,
    discountValue = 0,
    coupon,
    couponDiscount: directCouponDiscount,
    serviceChargeRate = 0,
    deliveryCharge = 0,
    isInterState = false,
    isGstEnabled = true,
    taxRate: customTaxRate,
  } = input;

  const itemsSubtotal = roundToTwoDecimals(
    items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0)
  );
  const subtotal = itemsSubtotal > 0 ? itemsSubtotal : roundToTwoDecimals(Number(customSubtotal || 0));

  let discountAmount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountAmount = roundToTwoDecimals((subtotal * Math.min(discountValue, 100)) / 100);
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = roundToTwoDecimals(Math.min(discountValue, subtotal));
  }

  let couponDiscount = 0;
  if (directCouponDiscount !== undefined && directCouponDiscount !== null) {
    couponDiscount = roundToTwoDecimals(Math.min(Number(directCouponDiscount), subtotal));
  } else if (coupon && subtotal >= (coupon.min_order_value || 0)) {
    if (coupon.discount_type === 'percentage') {
      const calcDiscount = (subtotal * (coupon.discount_value || 0)) / 100;
      couponDiscount = coupon.max_discount
        ? Math.min(calcDiscount, coupon.max_discount)
        : calcDiscount;
    } else {
      couponDiscount = Math.min(coupon.discount_value || 0, subtotal);
    }
    couponDiscount = roundToTwoDecimals(couponDiscount);
  }

  const totalDiscounts = Math.min(discountAmount + couponDiscount, subtotal);
  const taxableSubtotal = roundToTwoDecimals(Math.max(0, subtotal - totalDiscounts));

  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  // Calculate GST only if GST is enabled for the restaurant
  if (isGstEnabled && subtotal > 0 && taxableSubtotal > 0) {
    const defaultRate = customTaxRate !== undefined && !isNaN(Number(customTaxRate))
      ? Number(customTaxRate)
      : 5.0;

    if (items.length > 0) {
      const discountRatio = taxableSubtotal / subtotal;

      items.forEach((item) => {
        const itemGross = Number(item.unit_price) * Number(item.quantity);
        const itemTaxable = itemGross * discountRatio;
        const rate = customTaxRate !== undefined ? defaultRate : (Number(item.tax_rate) || defaultRate);

        if (isInterState) {
          totalIgst += (itemTaxable * rate) / 100;
        } else {
          const halfRate = rate / 2;
          totalCgst += (itemTaxable * halfRate) / 100;
          totalSgst += (itemTaxable * halfRate) / 100;
        }
      });
    } else {
      // Fallback if items array is missing/empty: compute GST from default rate directly
      if (isInterState) {
        totalIgst = (taxableSubtotal * defaultRate) / 100;
      } else {
        const halfRate = defaultRate / 2;
        totalCgst = (taxableSubtotal * halfRate) / 100;
        totalSgst = (taxableSubtotal * halfRate) / 100;
      }
    }
  }

  const cgstAmount = roundToTwoDecimals(totalCgst);
  const sgstAmount = roundToTwoDecimals(totalSgst);
  const igstAmount = roundToTwoDecimals(totalIgst);
  const totalTax = roundToTwoDecimals(cgstAmount + sgstAmount + igstAmount);

  const serviceCharge = serviceChargeRate > 0
    ? roundToTwoDecimals((taxableSubtotal * serviceChargeRate) / 100)
    : 0;

  const rawTotal = roundToTwoDecimals(
    taxableSubtotal + totalTax + serviceCharge + Number(deliveryCharge)
  );

  const payableAmount = Math.round(rawTotal);
  const roundOff = roundToTwoDecimals(payableAmount - rawTotal);

  return {
    subtotal,
    discountAmount: roundToTwoDecimals(discountAmount),
    couponDiscount,
    taxableSubtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    serviceCharge,
    deliveryCharge: roundToTwoDecimals(deliveryCharge),
    rawTotal,
    roundOff,
    payableAmount,
  };
}

/**
 * Ensures order subtotal is accurately resolved from persisted subtotal or order items.
 * Guaranteed never to return 0 if billable items exist.
 */
export function getOrderSubtotal(order: Partial<Order>): number {
  // Always compute from items when available — the stored subtotal may be stale after edits
  if (order.items && order.items.length > 0) {
    const sum = order.items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || (item.total && qty ? Number(item.total) / qty : 0);
      return acc + (qty * unitPrice);
    }, 0);
    return roundToTwoDecimals(sum);
  }
  if (order.subtotal && Number(order.subtotal) > 0) {
    return roundToTwoDecimals(Number(order.subtotal));
  }
  return 0;
}

