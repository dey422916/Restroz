import { Order, OrderItem, Coupon } from '../types';
import { roundToTwoDecimals } from './currency';

export interface CalculationInput {
  items: OrderItem[];
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  coupon?: Partial<Coupon> | null;
  couponDiscount?: number;
  serviceChargeRate?: number;
  deliveryCharge?: number;
  isInterState?: boolean;
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
    discountType,
    discountValue = 0,
    coupon,
    couponDiscount: directCouponDiscount,
    serviceChargeRate = 0,
    deliveryCharge = 0,
    isInterState = false,
  } = input;

  const subtotal = roundToTwoDecimals(
    items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)), 0)
  );

  let discountAmount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountAmount = roundToTwoDecimals((subtotal * Math.min(discountValue, 100)) / 100);
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = roundToTwoDecimals(Math.min(discountValue, subtotal));
  }

  let couponDiscount = 0;
  if (directCouponDiscount !== undefined) {
    couponDiscount = roundToTwoDecimals(directCouponDiscount);
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
  const taxableSubtotal = roundToTwoDecimals(subtotal - totalDiscounts);

  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  if (subtotal > 0 && taxableSubtotal > 0) {
    const discountRatio = taxableSubtotal / subtotal;

    items.forEach((item) => {
      const itemGross = Number(item.unit_price) * Number(item.quantity);
      const itemTaxable = itemGross * discountRatio;
      const taxRate = Number(item.tax_rate) || 5;

      if (isInterState) {
        totalIgst += (itemTaxable * taxRate) / 100;
      } else {
        const halfRate = taxRate / 2;
        totalCgst += (itemTaxable * halfRate) / 100;
        totalSgst += (itemTaxable * halfRate) / 100;
      }
    });
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
  if (order.subtotal && Number(order.subtotal) > 0) {
    return roundToTwoDecimals(Number(order.subtotal));
  }
  if (order.items && order.items.length > 0) {
    const sum = order.items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || (item.total && qty ? Number(item.total) / qty : 0);
      return acc + (qty * unitPrice);
    }, 0);
    return roundToTwoDecimals(sum);
  }
  return 0;
}

