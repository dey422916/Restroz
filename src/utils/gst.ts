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

export interface GstSlabBreakdown {
  rate: number;
  halfRate: number;
  halfRateStr: string;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
}

export interface CalculationResult {
  subtotal: number;
  discountAmount: number;
  couponDiscount: number;
  taxableSubtotal: number;
  nilExemptSubtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  serviceCharge: number;
  deliveryCharge: number;
  rawTotal: number;
  roundOff: number;
  payableAmount: number;
  gstBreakdown: GstSlabBreakdown[];
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
  const netOrderValue = roundToTwoDecimals(Math.max(0, subtotal - totalDiscounts));

  const defaultRate = (customTaxRate !== undefined && customTaxRate !== null && !isNaN(Number(customTaxRate)) && Number(customTaxRate) > 0)
    ? Number(customTaxRate)
    : 0;

  const rateBuckets = new Map<number, number>();

  if (items.length > 0 && subtotal > 0) {
    const discountRatio = netOrderValue / subtotal;

    items.forEach((item) => {
      const itemGross = Number(item.unit_price) * Number(item.quantity);
      const itemNet = itemGross * discountRatio;
      const hasExplicitRate = item.tax_rate !== null && item.tax_rate !== undefined && !isNaN(Number(item.tax_rate));
      const rate = isGstEnabled
        ? (hasExplicitRate ? Number(item.tax_rate) : defaultRate)
        : 0;

      rateBuckets.set(rate, (rateBuckets.get(rate) || 0) + itemNet);
    });
  } else {
    // When no items array is provided (subtotal fallback only):
    rateBuckets.set(isGstEnabled ? defaultRate : 0, netOrderValue);
  }

  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let taxableValue = 0;
  let nilExemptValue = 0;
  const gstBreakdown: GstSlabBreakdown[] = [];

  // Sort rates descending (e.g. 28, 18, 12, 5)
  const sortedRates = Array.from(rateBuckets.keys()).sort((a, b) => b - a);

  sortedRates.forEach((rate) => {
    const bucketNet = rateBuckets.get(rate) || 0;
    const roundedBucketNet = roundToTwoDecimals(bucketNet);
    if (rate > 0) {
      taxableValue += roundedBucketNet;
      const halfRate = rate / 2;
      const halfRateStr = halfRate % 1 === 0 ? `${halfRate}` : `${halfRate.toFixed(1)}`;
      let slabCgst = 0;
      let slabSgst = 0;
      let slabIgst = 0;
      if (isInterState) {
        slabIgst = roundToTwoDecimals((roundedBucketNet * rate) / 100);
        totalIgst += slabIgst;
      } else {
        slabCgst = roundToTwoDecimals((roundedBucketNet * halfRate) / 100);
        slabSgst = roundToTwoDecimals((roundedBucketNet * halfRate) / 100);
        totalCgst += slabCgst;
        totalSgst += slabSgst;
      }
      const slabTotalTax = roundToTwoDecimals(slabCgst + slabSgst + slabIgst);
      gstBreakdown.push({
        rate,
        halfRate,
        halfRateStr,
        taxableValue: roundedBucketNet,
        cgstAmount: slabCgst,
        sgstAmount: slabSgst,
        igstAmount: slabIgst,
        totalTax: slabTotalTax,
      });
    } else {
      nilExemptValue += roundedBucketNet;
    }
  });

  const taxableSubtotal = roundToTwoDecimals(taxableValue);
  const nilExemptSubtotal = roundToTwoDecimals(nilExemptValue);
  const cgstAmount = roundToTwoDecimals(totalCgst);
  const sgstAmount = roundToTwoDecimals(totalSgst);
  const igstAmount = roundToTwoDecimals(totalIgst);
  const totalTax = roundToTwoDecimals(cgstAmount + sgstAmount + igstAmount);

  const serviceCharge = serviceChargeRate > 0
    ? roundToTwoDecimals((taxableSubtotal * serviceChargeRate) / 100)
    : 0;

  const rawTotal = roundToTwoDecimals(
    netOrderValue + totalTax + serviceCharge + Number(deliveryCharge)
  );

  const payableAmount = Math.round(rawTotal);
  const roundOff = roundToTwoDecimals(payableAmount - rawTotal);

  return {
    subtotal,
    discountAmount: roundToTwoDecimals(discountAmount),
    couponDiscount,
    taxableSubtotal,
    nilExemptSubtotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    serviceCharge,
    deliveryCharge: roundToTwoDecimals(deliveryCharge),
    rawTotal,
    roundOff,
    payableAmount,
    gstBreakdown,
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
      const unitPrice = Number(item.unit_price) || (item.subtotal && qty ? Number(item.subtotal) / qty : (item.total && qty ? Number(item.total) / qty : 0));
      return acc + (qty * unitPrice);
    }, 0);
    return roundToTwoDecimals(sum);
  }
  if (order.subtotal && Number(order.subtotal) > 0) {
    return roundToTwoDecimals(Number(order.subtotal));
  }
  return 0;
}

/**
 * Resolves the effective GST rate belonging to an order snapshot.
 * Never falls back to current restaurant settings if the order has its own stored tax snapshot.
 */
export function getOrderTaxRate(order: Partial<Order>, defaultTaxRateFallback: number = 0): number {
  if ((order as any)?.tax_rate !== undefined && (order as any)?.tax_rate !== null && !isNaN(Number((order as any).tax_rate))) {
    return Number((order as any).tax_rate);
  }

  if (order.items && order.items.length > 0) {
    const itemWithRate = order.items.find(
      (i) => i.tax_rate !== null && i.tax_rate !== undefined && !isNaN(Number(i.tax_rate)) && Number(i.tax_rate) > 0
    );
    if (itemWithRate) {
      return Number(itemWithRate.tax_rate);
    }
  }

  const storedTax = (Number(order.cgst_amount) || 0) + (Number(order.sgst_amount) || 0) + (Number(order.igst_amount) || 0);
  if (storedTax > 0) {
    const subtotal = getOrderSubtotal(order);
    const disc = (Number(order.discount_amount) || 0) + (Number(order.coupon_discount) || 0);
    const taxableBase = Number(order.taxable_amount) || Math.max(1, subtotal - disc);
    const inferred = roundToTwoDecimals((storedTax / taxableBase) * 100);
    if (inferred > 0) return inferred;
  }

  // If order was created and explicitly stored 0 tax or has items with 0 tax rate:
  if (order.id && (order.cgst_amount !== undefined || order.taxable_amount !== undefined || (order.items && order.items.length > 0))) {
    return 0;
  }

  return defaultTaxRateFallback > 0 ? defaultTaxRateFallback : 0;
}

/**
 * Helper to check whether GST was applicable on this order snapshot.
 */
export function isOrderGstApplicable(order: Partial<Order>, isSettingsGstEnabled?: boolean): boolean {
  // If order explicitly stored positive tax amounts:
  const storedTax = (Number(order.cgst_amount) || 0) + (Number(order.sgst_amount) || 0) + (Number(order.igst_amount) || 0);
  if (storedTax > 0) return true;

  // If order has items with tax_rate > 0:
  if (order.items && order.items.some((i) => Number(i.tax_rate) > 0 || Number((i as any).tax_amount) > 0 || Number((i as any).cgst_amount) > 0)) {
    return true;
  }

  // If order explicitly stored tax_rate > 0:
  if ((order as any)?.tax_rate !== undefined && Number((order as any).tax_rate) > 0) {
    return true;
  }

  // If this is a historical persisted order with 0 tax, GST is NOT applicable (0% / Nil-Exempt):
  if (order.id && (order.cgst_amount !== undefined || order.payable_amount !== undefined)) {
    return false;
  }

  // Brand new draft order fallback:
  return Boolean(isSettingsGstEnabled);
}

/**
 * Helper to compute taxable breakdown (taxable value vs nil/exempt value) from an order or its items.
 */
export function getOrderTaxableBreakdown(order: Partial<Order>, defaultTaxRate: number = 0): {
  taxableAmount: number;
  nilExemptAmount: number;
} {
  const subtotal = getOrderSubtotal(order);
  const discount = (order.discount_amount || 0) + (order.coupon_discount || 0);
  const netOrderValue = roundToTwoDecimals(Math.max(0, subtotal - discount));

  // 1. If order explicitly stored taxable_amount:
  if (order.taxable_amount !== undefined && order.taxable_amount !== null) {
    const storedTaxable = Number(order.taxable_amount);
    const nilExempt = order.nil_exempt_amount !== undefined && order.nil_exempt_amount !== null
      ? Number(order.nil_exempt_amount)
      : Math.max(0, netOrderValue - storedTaxable);
    return {
      taxableAmount: roundToTwoDecimals(storedTaxable),
      nilExemptAmount: roundToTwoDecimals(nilExempt),
    };
  }

  // 2. If order has items with item-level tax_rate:
  if (order.items && order.items.length > 0 && subtotal > 0) {
    const discountRatio = netOrderValue / subtotal;
    let taxable = 0;
    let nilExempt = 0;

    order.items.forEach((item) => {
      const itemGross = Number(item.unit_price) * Number(item.quantity);
      const itemNet = itemGross * discountRatio;
      const hasExplicitRate = item.tax_rate !== null && item.tax_rate !== undefined && !isNaN(Number(item.tax_rate));
      const rate = hasExplicitRate
        ? Number(item.tax_rate)
        : defaultTaxRate;

      if (rate > 0) {
        taxable += itemNet;
      } else {
        nilExempt += itemNet;
      }
    });

    return {
      taxableAmount: roundToTwoDecimals(taxable),
      nilExemptAmount: roundToTwoDecimals(nilExempt),
    };
  }

  // 3. Fallback from stored taxes:
  const taxSum = (order.cgst_amount || 0) + (order.sgst_amount || 0) + (order.igst_amount || 0);
  if (taxSum === 0) {
    return {
      taxableAmount: 0,
      nilExemptAmount: roundToTwoDecimals(netOrderValue),
    };
  }

  return {
    taxableAmount: roundToTwoDecimals(netOrderValue),
    nilExemptAmount: 0,
  };
}

/**
 * Single source of truth to compute all invoice financial totals for any order (live or historical).
 * Uses stored order values / item tax rates and preserves historical snapshots.
 */
export function getOrderInvoiceTotals(
  order: Partial<Order>,
  settings?: { is_gst_enabled?: boolean; default_tax_rate?: number; service_charge_rate?: number; gst_registered?: boolean; gstin?: string }
): CalculationResult {
  const isGstRegistered = settings?.gst_registered !== undefined
    ? Boolean(settings.gst_registered)
    : Boolean((settings?.gstin || '').trim());

  // Check if order has an existing persisted tax snapshot
  const hasExistingTaxSnapshot = (
    (order.cgst_amount !== undefined && Number(order.cgst_amount) > 0) ||
    (order.sgst_amount !== undefined && Number(order.sgst_amount) > 0) ||
    ((order as any)?.tax_rate !== undefined && (order as any)?.tax_rate !== null && Number((order as any).tax_rate) > 0)
  );

  const hasExplicitZeroSnapshot = (
    ((order as any)?.tax_rate !== undefined && (order as any)?.tax_rate !== null && Number((order as any).tax_rate) === 0) ||
    (order.cgst_amount === 0 && order.sgst_amount === 0 && ((order as any).tax_amount === 0 || (order as any).total_tax === 0) && Boolean(order.id))
  );

  let rawTaxRate = 0;
  let isGstEnabled = false;

  if (hasExistingTaxSnapshot) {
    rawTaxRate = Number((order as any)?.tax_rate || 0);
    // If tax_rate was not saved directly on order, resolve from cgst_amount / taxable_amount
    if (rawTaxRate === 0 && order.taxable_amount && Number(order.taxable_amount) > 0 && order.cgst_amount) {
      rawTaxRate = (Number(order.cgst_amount) * 2 / Number(order.taxable_amount)) * 100;
    } else if (rawTaxRate === 0) {
      rawTaxRate = 5.0; // Historical default when tax amount was positive
    }
    isGstEnabled = true;
  } else if (hasExplicitZeroSnapshot) {
    rawTaxRate = 0;
    isGstEnabled = false;
  } else {
    // New draft order / live cart: resolve from restaurant settings
    const settingsTaxRate = settings?.default_tax_rate !== undefined && settings?.default_tax_rate !== null && !isNaN(Number(settings.default_tax_rate))
      ? Number(settings.default_tax_rate)
      : 0;
    rawTaxRate = settingsTaxRate;
    isGstEnabled = Boolean(
      settings?.is_gst_enabled &&
      isGstRegistered &&
      rawTaxRate > 0
    );
  }

  const dynamicTaxRate = rawTaxRate > 0 ? rawTaxRate : 0;

  return calculateOrderTotals({
    items: order.items || [],
    subtotal: getOrderSubtotal(order),
    discountType: order.discount_type as any,
    discountValue: order.discount_value,
    couponDiscount: order.coupon_discount || 0,
    deliveryCharge: order.delivery_charge || 0,
    serviceChargeRate: order.service_charge !== undefined && order.service_charge > 0 && order.taxable_amount
      ? roundToTwoDecimals((Number(order.service_charge) / Number(order.taxable_amount)) * 100)
      : settings?.service_charge_rate,
    isGstEnabled,
    taxRate: dynamicTaxRate,
  });
}

/**
 * Single source of truth for retrieving slab-wise GST breakdown for any order (live or historical).
 */
export function getOrderGstBreakdown(
  order: Partial<Order>,
  settings?: { is_gst_enabled?: boolean; default_tax_rate?: number; service_charge_rate?: number; gst_registered?: boolean; gstin?: string }
): GstSlabBreakdown[] {
  const totals = getOrderInvoiceTotals(order, settings);
  return totals.gstBreakdown || [];
}
