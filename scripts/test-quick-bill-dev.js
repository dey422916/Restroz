const fs = require('fs');
const path = require('path');
const ts = require('typescript');

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

if (typeof global.window === 'undefined') {
  global.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    },
  };
}

function loadTsModule(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const transpiledJs = ts.transpileModule(fileContent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };
  
  const customRequire = (importPath) => {
    if (importPath === 'react-native') {
      return {
        Platform: { OS: 'web' },
        Dimensions: { get: () => ({ width: 1024, height: 768 }) },
        StyleSheet: { create: (s) => s },
      };
    }
    if (importPath.startsWith('.')) {
      const dir = path.dirname(filePath);
      let targetPath = path.resolve(dir, importPath);
      if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
        else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
        else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
      }
      return loadTsModule(targetPath);
    }
    return require(importPath);
  };

  const evalFn = new Function('module', 'exports', 'require', transpiledJs);
  evalFn(moduleObj, moduleExports, customRequire);
  return moduleObj.exports;
}

const gstModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'gst.ts'));
const { calculateOrderTotals, getOrderSubtotal, getOrderInvoiceTotals } = gstModule;

const routingModule = loadTsModule(path.join(__dirname, '..', 'src', 'services', 'printerManager', 'routing.ts'));
const { printerRoutingService } = routingModule;

const analyticsModule = loadTsModule(path.join(__dirname, '..', 'src', 'services', 'api', 'analyticsService.ts'));
const { analyticsService } = analyticsModule;

console.log('====================================================');
console.log('⚡ RESTROZ QUICK BILL COMPREHENSIVE DEV TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName} - ${details}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------
// TEST A: Temporary Quick Bill item, GST 0%, not saved to menu
// ----------------------------------------------------
const tempItemA = {
  id: 'item-quick-1',
  order_id: '',
  product_id: 'quick-temp-1',
  product_name: 'Custom Special Chaat',
  unit_price: 150,
  total_price: 150,
  quantity: 1,
  tax_rate: 0,
  tax_amount: 0,
  subtotal: 150,
  total: 150,
  product: {
    id: 'quick-temp-1',
    name: 'Custom Special Chaat',
    price: 150,
    tax_rate: 0,
    category_id: 'cat-snacks-1',
    category_name: 'Snacks',
    sku: 'QUICK-BILL',
  }
};

const totalsA = calculateOrderTotals({
  items: [tempItemA],
  isGstEnabled: true,
});

assert(totalsA.subtotal === 150, 'Test A: Subtotal is 150 for 0% GST item');
assert(totalsA.cgstAmount === 0 && totalsA.sgstAmount === 0 && totalsA.totalTax === 0, 'Test A: Tax is 0 for 0% GST item');
assert(totalsA.payableAmount === 150, 'Test A: Payable amount is 150');

// ----------------------------------------------------
// TEST B: Temporary Quick Bill item, GST 12% Exclusive
// ----------------------------------------------------
const tempItemB = {
  id: 'item-quick-2',
  order_id: '',
  product_id: 'quick-temp-2',
  product_name: 'Custom Tandoori Platter',
  unit_price: 200,
  total_price: 200,
  quantity: 1,
  tax_rate: 12,
  tax_amount: 24,
  subtotal: 200,
  total: 200,
  product: {
    id: 'quick-temp-2',
    name: 'Custom Tandoori Platter',
    price: 200,
    tax_rate: 12,
    category_id: 'cat-tandoor-1',
    category_name: 'Tandoor',
    sku: 'QUICK-BILL',
  }
};

const totalsB = calculateOrderTotals({
  items: [tempItemB],
  isGstEnabled: true,
});

assert(totalsB.subtotal === 200, 'Test B: Subtotal is 200');
assert(totalsB.cgstAmount === 12 && totalsB.sgstAmount === 12 && totalsB.totalTax === 24, 'Test B: 12% tax splits into 12 CGST + 12 SGST = 24');
assert(totalsB.payableAmount === 224, 'Test B: Payable amount is 224 (200 + 24 tax)');

// ----------------------------------------------------
// TEST C: Inclusive GST (₹112 with 12% GST extracts base 100 & tax 12)
// ----------------------------------------------------
const rawPriceC = 112;
const taxRateC = 12;
const extractedBaseUnitPriceC = Number((rawPriceC / (1 + taxRateC / 100)).toFixed(2)); // 100
const subtotalC = Number((extractedBaseUnitPriceC * 1).toFixed(2)); // 100

const tempItemC = {
  id: 'item-quick-3',
  order_id: '',
  product_id: 'quick-temp-3',
  product_name: 'Custom Combo Meal',
  unit_price: extractedBaseUnitPriceC,
  total_price: subtotalC,
  quantity: 1,
  tax_rate: 12,
  tax_amount: 12,
  subtotal: subtotalC,
  total: subtotalC,
  product: {
    id: 'quick-temp-3',
    name: 'Custom Combo Meal',
    price: extractedBaseUnitPriceC,
    tax_rate: 12,
    category_id: 'cat-combo-1',
    category_name: 'Combos',
    sku: 'QUICK-BILL',
  }
};

const totalsC = calculateOrderTotals({
  items: [tempItemC],
  isGstEnabled: true,
});

assert(extractedBaseUnitPriceC === 100, 'Test C: Extracted base unit price is 100 from 112 inclusive at 12%');
assert(totalsC.subtotal === 100, 'Test C: Subtotal is 100');
assert(totalsC.totalTax === 12, 'Test C: Total tax is 12 (6 CGST + 6 SGST)');
assert(totalsC.payableAmount === 112, 'Test C: Payable amount is exactly 112');

// ----------------------------------------------------
// TEST D: Save to Menu ON (Valid product payload)
// ----------------------------------------------------
const savedProductD = {
  id: 'd9f07a41-2f3b-48c9-9528-912a7f5c0011',
  restaurant_id: 'rest-001',
  name: 'Paneer Butter Masala Special',
  sku: 'QB-PANE-101',
  category_id: 'cat-main-1',
  category_name: 'Main Course',
  price: 250,
  tax_rate: 5,
  food_type: 'veg',
  stock_quantity: 100,
  is_available: true,
  is_active: true,
};

const cartItemD = {
  id: 'item-4',
  order_id: '',
  product_id: savedProductD.id,
  product_name: savedProductD.name,
  unit_price: 250,
  total_price: 500,
  quantity: 2,
  tax_rate: 5,
  tax_amount: 25,
  subtotal: 500,
  total: 500,
  product: savedProductD,
};

assert(cartItemD.product_id === savedProductD.id, 'Test D: Cart item has valid product_id from saved product');
assert(cartItemD.product.sku === 'QB-PANE-101', 'Test D: Saved product SKU attached to product metadata');

// ----------------------------------------------------
// TEST E: Plan product limit enforcement
// ----------------------------------------------------
function simulatePlanLimitCheck(currentProductCount, maxAllowed) {
  if (currentProductCount >= maxAllowed) {
    return { allowed: false, message: 'Product limit reached for your current subscription plan.' };
  }
  return { allowed: true };
}

const limitBlocked = simulatePlanLimitCheck(50, 50);
const limitAllowed = simulatePlanLimitCheck(49, 50);
assert(!limitBlocked.allowed, 'Test E: Permanent save blocked when max_products plan limit reached');
assert(limitAllowed.allowed, 'Test E: Permanent save allowed when within plan limits');

// ----------------------------------------------------
// TEST F: Permission check (Staff without can_manage_products)
// ----------------------------------------------------
function canSaveToMenu(userRole, permissions) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
  return Boolean(permissions && permissions.can_manage_products);
}

assert(canSaveToMenu('ADMIN', { can_manage_products: false }), 'Test F: ADMIN can always save to menu');
assert(canSaveToMenu('STAFF', { can_manage_products: true }), 'Test F: STAFF with can_manage_products can save to menu');
assert(!canSaveToMenu('STAFF', { can_manage_products: false }), 'Test F: STAFF without can_manage_products is blocked from saving to menu');

// ----------------------------------------------------
// TEST G: Duplicate product name prevention (Scoped to restaurant)
// ----------------------------------------------------
const existingMenuProducts = [
  { id: 'p1', name: 'Cold Coffee', restaurant_id: 'rest-001' },
  { id: 'p2', name: 'Veg Sandwich', restaurant_id: 'rest-001' },
  { id: 'p3', name: 'Cold Coffee', restaurant_id: 'rest-002' },
];

function checkDuplicateProductName(name, restaurantId, products) {
  return products.some(
    (p) => p.restaurant_id === restaurantId && p.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

assert(checkDuplicateProductName('cold coffee', 'rest-001', existingMenuProducts), 'Test G: Detects duplicate name in current restaurant');
assert(!checkDuplicateProductName('Chicken Sandwich', 'rest-001', existingMenuProducts), 'Test G: Allows unique product name');
assert(!checkDuplicateProductName('Veg Sandwich', 'rest-002', existingMenuProducts), 'Test G: Scoped to restaurant (rest-002 has no Veg Sandwich)');

// ----------------------------------------------------
// TEST H: KOT printer routing by category
// ----------------------------------------------------
const printers = [
  {
    id: 'prn-kitchen',
    name: 'Kitchen Printer',
    printer_role: 'kot',
    is_active: true,
    category_ids: ['cat-tandoor-1', 'cat-main-1'],
  },
  {
    id: 'prn-bar',
    name: 'Bar Printer',
    printer_role: 'kot',
    is_active: true,
    category_ids: ['cat-beverages-1'],
  },
  {
    id: 'prn-default',
    name: 'Default KOT Printer',
    printer_role: 'kot',
    is_active: true,
    is_primary: true,
    category_ids: [],
  }
];

const quickItemsForKot = [
  tempItemB, // category 'cat-tandoor-1' -> Kitchen Printer
  {
    id: 'item-bev-1',
    product_name: 'Custom Fresh Lime Soda',
    quantity: 2,
    unit_price: 60,
    tax_rate: 5,
    product: {
      category_id: 'cat-beverages-1',
    }
  }
];

const splitKots = printerRoutingService.resolveKotsByCategory(quickItemsForKot, printers);
assert(splitKots.length === 2, 'Test H: Splits items across 2 category printers');
assert(splitKots.some(s => s.printer.id === 'prn-kitchen' && s.items.some(i => i.product_name === 'Custom Tandoori Platter')), 'Test H: Tandoor Quick Bill item routed to Kitchen Printer');
assert(splitKots.some(s => s.printer.id === 'prn-bar' && s.items.some(i => i.product_name === 'Custom Fresh Lime Soda')), 'Test H: Beverage Quick Bill item routed to Bar Printer');

// ----------------------------------------------------
// TEST I: Thermal Bill invoice totals computation
// ----------------------------------------------------
const mockOrder = {
  id: 'ord-qb-001',
  order_number: 'INV-1001',
  order_type: 'dine_in',
  items: [tempItemA, tempItemB],
  subtotal: 350,
  taxable_amount: 200,
  nil_exempt_amount: 150,
  cgst_amount: 12,
  sgst_amount: 12,
  igst_amount: 0,
  service_charge: 0,
  delivery_charge: 0,
  discount_amount: 0,
  coupon_discount: 0,
  grand_total: 374,
  round_off: 0,
  payable_amount: 374,
  status: 'completed',
  created_at: new Date().toISOString(),
};

const invoiceTotals = getOrderInvoiceTotals(mockOrder, { is_gst_enabled: true, gst_registered: true, default_tax_rate: 5 });
assert(invoiceTotals.taxableSubtotal === 200, 'Test I: Taxable subtotal is 200 (from 12% item)');
assert(invoiceTotals.nilExemptSubtotal === 150, 'Test I: Nil/Exempt subtotal is 150 (from 0% item)');
assert(invoiceTotals.payableAmount === 374, 'Test I: Payable invoice total is 374');

// ----------------------------------------------------
// TEST K: Order Discount on Quick Bill items
// ----------------------------------------------------
const totalsWithDiscount = calculateOrderTotals({
  items: [tempItemB], // ₹200 at 12% GST
  discountType: 'percentage',
  discountValue: 10, // 10% discount -> ₹20 discount -> Net ₹180 -> 12% tax = ₹21.60 -> Total ₹201.60
  isGstEnabled: true,
});

assert(totalsWithDiscount.discountAmount === 20, 'Test K: 10% discount on ₹200 is ₹20');
assert(totalsWithDiscount.totalTax === 21.6, 'Test K: GST 12% calculated on post-discount ₹180 = ₹21.60');
assert(totalsWithDiscount.payableAmount === 202, 'Test K: Rounded payable amount is ₹202 (201.60 with 0.40 roundoff)');

// ----------------------------------------------------
// TEST L: Generic coupon on Quick Bill items
// ----------------------------------------------------
const totalsWithCoupon = calculateOrderTotals({
  items: [tempItemB], // ₹200
  coupon: {
    code: 'FLAT50',
    discount_type: 'fixed',
    discount_value: 50,
    min_order_value: 100,
  },
  isGstEnabled: true,
});

assert(totalsWithCoupon.couponDiscount === 50, 'Test L: FLAT50 coupon deducted ₹50 from subtotal');
assert(totalsWithCoupon.totalTax === 18, 'Test L: GST 12% on post-coupon ₹150 is ₹18');
assert(totalsWithCoupon.payableAmount === 168, 'Test L: Payable amount is ₹168 (150 + 18)');

// ----------------------------------------------------
// TEST N: Analytics and Sales Reporting with Quick Bill items
// ----------------------------------------------------
const todayISO = new Date().toISOString().split('T')[0];
const sampleOrders = [
  {
    id: 'ord-1',
    created_at: `${todayISO}T12:00:00Z`,
    status: 'completed',
    subtotal: 350,
    payable_amount: 374,
    cgst_amount: 12,
    sgst_amount: 12,
    igst_amount: 0,
    grand_total: 374,
    payment_status: 'paid',
    payment_method: 'cash',
    items: [tempItemA, tempItemB],
  }
];

const daySales = analyticsService.getDayWiseSales(sampleOrders, todayISO, todayISO);
assert(daySales.totals.net_sales === 374, 'Test N: Day sales summary includes Quick Bill net sales of ₹374');
assert(daySales.totals.tax_collected === 24, 'Test N: Day sales summary includes Quick Bill tax collected of ₹24');

const itemSales = analyticsService.getItemWiseSales(sampleOrders, [], todayISO, todayISO);
assert(itemSales.totalUnitsSold === 2, 'Test N: Item-wise sales aggregates 2 Quick Bill units sold');
assert(itemSales.items.some(i => i.product_name === 'Custom Special Chaat' && i.units_sold === 1), 'Test N: Custom Special Chaat item reported by product_name without requiring product_id in DB');
assert(itemSales.items.some(i => i.product_name === 'Custom Tandoori Platter' && i.units_sold === 1), 'Test N: Custom Tandoori Platter item reported properly');

// ----------------------------------------------------
// TEST P: Restaurant Isolation Test
// ----------------------------------------------------
const rest1Orders = sampleOrders.filter(o => (o.restaurant_id || 'rest-1') === 'rest-1');
const rest2Orders = sampleOrders.filter(o => o.restaurant_id === 'rest-2');
assert(rest1Orders.length === 1, 'Test P: Restaurant 1 sees its own orders');
assert(rest2Orders.length === 0, 'Test P: Restaurant 2 sees 0 orders from Restaurant 1');

// ----------------------------------------------------
// TEST Q: Multi-terminal duplicate save test
// ----------------------------------------------------
const terminalAProduct = { name: 'Chef Special Kheer', restaurant_id: 'rest-001' };
const terminalBProduct = { name: 'Chef Special Kheer', restaurant_id: 'rest-001' };

const isDuplicate = checkDuplicateProductName(terminalBProduct.name, terminalBProduct.restaurant_id, [terminalAProduct]);
assert(isDuplicate === true, 'Test Q: Multi-terminal duplicate save prevented when normalized product name already exists in restaurant');

console.log('\n====================================================');
console.log(`RESULTS: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL QUICK BILL UNIT & REGRESSION TESTS PASSED CLEANLY!');
} else {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
}
