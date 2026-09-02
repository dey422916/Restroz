function roundToTwoDecimals(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function calculateOrderTotals(input) {
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

console.log('================================================================');
console.log('🧪 TEST SUITE: POS TERMINAL DISCOUNTS & GST ACCURACY VERIFICATION');
console.log('================================================================\n');

// TEST CASE 1: Standard Order without discount (5% GST: 2.5% CGST + 2.5% SGST)
console.log('--- Test Case 1: Standard Order (No Discount) ---');
const items1 = [
  { product_id: 'p1', product_name: 'Special Biryani', unit_price: 300, quantity: 2, tax_rate: 5 },
  { product_id: 'p2', product_name: 'Butter Chicken', unit_price: 400, quantity: 1, tax_rate: 5 },
];
const result1 = calculateOrderTotals({ items: items1 });
console.log('Subtotal:', result1.subtotal, '(Expected: 1000.00)');
console.log('Discount:', result1.discountAmount, '(Expected: 0.00)');
console.log('Taxable Subtotal:', result1.taxableSubtotal, '(Expected: 1000.00)');
console.log('CGST (2.5%):', result1.cgstAmount, '(Expected: 25.00)');
console.log('SGST (2.5%):', result1.sgstAmount, '(Expected: 25.00)');
console.log('Total Tax:', result1.totalTax, '(Expected: 50.00)');
console.log('Grand Total:', result1.payableAmount, '(Expected: 1050)');

if (
  result1.subtotal !== 1000 ||
  result1.discountAmount !== 0 ||
  result1.taxableSubtotal !== 1000 ||
  result1.cgstAmount !== 25 ||
  result1.sgstAmount !== 25 ||
  result1.payableAmount !== 1050
) {
  throw new Error('Test Case 1 Failed');
}
console.log('[PASS] Test Case 1: Standard calculation 100% accurate.\n');

// TEST CASE 2: Percentage Discount (10% on ₹1000)
console.log('--- Test Case 2: Percentage Discount (10% on ₹1000) ---');
const result2 = calculateOrderTotals({
  items: items1,
  discountType: 'percentage',
  discountValue: 10,
});
console.log('Subtotal:', result2.subtotal, '(Expected: 1000.00)');
console.log('Discount (10%):', result2.discountAmount, '(Expected: 100.00)');
console.log('Taxable Subtotal:', result2.taxableSubtotal, '(Expected: 900.00)');
console.log('CGST (2.5% on 900):', result2.cgstAmount, '(Expected: 22.50)');
console.log('SGST (2.5% on 900):', result2.sgstAmount, '(Expected: 22.50)');
console.log('Total Tax:', result2.totalTax, '(Expected: 45.00)');
console.log('Grand Total:', result2.payableAmount, '(Expected: 945)');

if (
  result2.subtotal !== 1000 ||
  result2.discountAmount !== 100 ||
  result2.taxableSubtotal !== 900 ||
  result2.cgstAmount !== 22.5 ||
  result2.sgstAmount !== 22.5 ||
  result2.payableAmount !== 945
) {
  throw new Error('Test Case 2 Failed');
}
console.log('[PASS] Test Case 2: Percentage discount & GST calculation 100% accurate.\n');

// TEST CASE 3: Fixed Amount Discount (₹150 on ₹1000)
console.log('--- Test Case 3: Fixed Amount Discount (₹150 on ₹1000) ---');
const result3 = calculateOrderTotals({
  items: items1,
  discountType: 'fixed',
  discountValue: 150,
});
console.log('Subtotal:', result3.subtotal, '(Expected: 1000.00)');
console.log('Discount (₹150):', result3.discountAmount, '(Expected: 150.00)');
console.log('Taxable Subtotal:', result3.taxableSubtotal, '(Expected: 850.00)');
console.log('CGST (2.5% on 850):', result3.cgstAmount, '(Expected: 21.25)');
console.log('SGST (2.5% on 850):', result3.sgstAmount, '(Expected: 21.25)');
console.log('Total Tax:', result3.totalTax, '(Expected: 42.50)');
console.log('Raw Total:', result3.rawTotal, '(Expected: 892.50)');
console.log('Round Off:', result3.roundOff, '(Expected: 0.50)');
console.log('Payable Amount:', result3.payableAmount, '(Expected: 893)');

if (
  result3.subtotal !== 1000 ||
  result3.discountAmount !== 150 ||
  result3.taxableSubtotal !== 850 ||
  result3.cgstAmount !== 21.25 ||
  result3.sgstAmount !== 21.25 ||
  result3.payableAmount !== 893
) {
  throw new Error('Test Case 3 Failed');
}
console.log('[PASS] Test Case 3: Fixed amount discount & round off 100% accurate.\n');

// TEST CASE 4: Discount Safety Cap (Cannot exceed subtotal or 100%)
console.log('--- Test Case 4: Discount Overflow Protection ---');
const result4 = calculateOrderTotals({
  items: items1,
  discountType: 'fixed',
  discountValue: 2500, // exceeds ₹1000 subtotal
});
console.log('Subtotal:', result4.subtotal);
console.log('Capped Discount:', result4.discountAmount, '(Expected: 1000.00)');
console.log('Taxable Subtotal:', result4.taxableSubtotal, '(Expected: 0.00)');
console.log('Payable Amount:', result4.payableAmount, '(Expected: 0)');

if (result4.discountAmount !== 1000 || result4.taxableSubtotal !== 0 || result4.payableAmount !== 0) {
  throw new Error('Test Case 4 Failed');
}
console.log('[PASS] Test Case 4: Overflow discount safely clamped.\n');

console.log('================================================================');
console.log('🎉 ALL POS DISCOUNT & GST CALCULATION TESTS PASSED (100% ACCURATE)');
console.log('================================================================');
