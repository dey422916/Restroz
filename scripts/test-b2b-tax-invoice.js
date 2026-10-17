const fs = require('fs');
const path = require('path');
const ts = require('typescript');

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';

const moduleCache = {};

function loadTsModule(filePath) {
  if (moduleCache[filePath]) return moduleCache[filePath];

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const transpiledJs = ts.transpileModule(fileContent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };
  moduleCache[filePath] = moduleObj.exports;
  
  const customRequire = (importPath) => {
    if (importPath.includes('printerManager')) {
      return {
        androidPrintRouter: { printKot: async () => {}, printReceipt: async () => {} },
        devicePrinterBindingService: { getEffectiveRolePrinter: async () => null }
      };
    }
    if (importPath.startsWith('expo-') || importPath.startsWith('@react-native-')) {
      return {};
    }
    if (importPath.includes('supabase')) {
      return { supabase: { from: () => ({ select: () => ({}) }) } };
    }
    if (importPath === 'react-native') {
      return { Platform: { OS: 'web' }, Alert: { alert: () => {} } };
    }
    if (importPath === 'expo-print') {
      return { printAsync: async () => {} };
    }
    if (importPath.startsWith('.')) {
      const dir = path.dirname(filePath);
      let targetPath = path.resolve(dir, importPath);
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        if (fs.existsSync(path.join(targetPath, 'index.ts'))) targetPath = path.join(targetPath, 'index.ts');
        else if (fs.existsSync(path.join(targetPath, 'index.tsx'))) targetPath = path.join(targetPath, 'index.tsx');
        else if (fs.existsSync(path.join(targetPath, 'index.js'))) targetPath = path.join(targetPath, 'index.js');
      } else if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
        else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
        else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
      }
      return loadTsModule(targetPath);
    }
    // Mock native/react modules if required
    if (importPath === 'react-native') {
      return { Platform: { OS: 'web' }, Alert: { alert: () => {} } };
    }
    if (importPath === 'expo-print') {
      return { printAsync: async () => {} };
    }
    if (importPath.includes('supabase')) {
      return { supabase: {} };
    }
    return require(importPath);
  };

  const evalFn = new Function('module', 'exports', 'require', transpiledJs);
  evalFn(moduleObj, moduleExports, customRequire);
  return moduleObj.exports;
}

const validatorsModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'validators.ts'));
const { validateGSTIN, isValidGSTIN, getStateFromGSTIN } = validatorsModule;

const orderNotesModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'orderNotes.ts'));
const { attachB2bToNotes, extractB2bFromNotes, cleanCustomerOrderNotes } = orderNotesModule;

const gstModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'gst.ts'));
const { calculateOrderTotals, getOrderInvoiceTotals } = gstModule;

const printServiceModule = loadTsModule(path.join(__dirname, '..', 'src', 'services', 'printService.ts'));
const { printService } = printServiceModule;

console.log('====================================================');
console.log('RESTROZ B2B GST TAX INVOICE VERIFICATION SUITE');
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

const mockSettings = {
  name: 'RestroZ Gourmet Dine',
  legal_name: 'RestroZ Hospitality Pvt Ltd',
  address: '12 Park Street, Kolkata, WB 700016',
  phone: '9876543210',
  email: 'billing@restroz.shop',
  gstin: '19AAACR1234M1Z1', // Supplier GSTIN (West Bengal)
  state: 'West Bengal',
  state_code: '19',
  is_gst_enabled: true,
  gst_registered: true,
  default_tax_rate: 5,
  fssai_number: '12345678901234'
};

// ----------------------------------------------------
// TEST A: B2C Invoice (No customer GSTIN)
// ----------------------------------------------------
console.log('--- TEST A: B2C Invoice Behavior ---');
const orderB2C = {
  id: 'ord-b2c-001',
  order_number: 'RZ-101',
  invoice_number: 'INV-2026-001',
  customer_name: 'Rahul Sharma',
  customer_phone: '9830012345',
  order_type: 'dine_in',
  table_number: 'T4',
  created_at: new Date().toISOString(),
  items: [
    { item_name: 'Paneer Butter Masala', unit_price: 250, quantity: 2, tax_rate: 5 },
    { item_name: 'Butter Naan', unit_price: 50, quantity: 4, tax_rate: 5 }
  ],
  tax_rate: 5,
  payment_status: 'paid',
  payment_method: 'card'
};

const htmlB2C = printService.getTaxInvoiceA4Html(orderB2C, mockSettings);
assert(htmlB2C.includes('Customer / Billed To Details'), 'Test A: Header is "Customer / Billed To Details" for B2C');
assert(htmlB2C.includes('Rahul Sharma'), 'Test A: Shows Customer Name');
assert(htmlB2C.includes('9830012345'), 'Test A: Shows Customer Phone');
assert(!htmlB2C.includes('GSTIN (Recipient):'), 'Test A: Does NOT show Recipient GSTIN in B2C');
assert(htmlB2C.includes('GSTIN (Supplier): <b>19AAACR1234M1Z1</b>'), 'Test A: Shows Supplier GSTIN');

// ----------------------------------------------------
// TEST B: B2B Invoice (Valid GSTIN + Business Details)
// ----------------------------------------------------
console.log('\n--- TEST B: B2B Invoice with Full Recipient Details ---');
const orderB2B = {
  id: 'ord-b2b-001',
  order_number: 'RZ-102',
  invoice_number: 'INV-2026-002',
  customer_name: 'Amit Patel',
  customer_phone: '9820098200',
  customer_gstin: '24AAACA1234A1Z5', // Gujarat state 24
  customer_business_name: 'Patel Infotech Solutions LLP',
  billing_address: '402 Cyber Heights, SG Highway, Ahmedabad',
  billing_state: 'Gujarat',
  billing_state_code: '24',
  order_type: 'dine_in',
  table_number: 'VIP-1',
  created_at: new Date().toISOString(),
  items: [
    { item_name: 'Executive Lunch Buffet', unit_price: 800, quantity: 5, tax_rate: 5 }
  ],
  tax_rate: 5,
  payment_status: 'paid',
  payment_method: 'upi'
};

const htmlB2B = printService.getTaxInvoiceA4Html(orderB2B, mockSettings);
assert(htmlB2B.includes('Billed To / Recipient Details (B2B)'), 'Test B: Header indicates B2B Recipient Details');
assert(htmlB2B.includes('Patel Infotech Solutions LLP'), 'Test B: Shows Registered Business Name');
assert(htmlB2B.includes('Attention / Contact: <b>Amit Patel</b>'), 'Test B: Shows Attention / Contact Person');
assert(htmlB2B.includes('GSTIN (Recipient): <b style="color: #1e40af; font-family: monospace; font-size: 12px; letter-spacing: 0.5px;">24AAACA1234A1Z5</b>'), 'Test B: Shows Recipient GSTIN in distinct blue monospace style');
assert(htmlB2B.includes('402 Cyber Heights, SG Highway, Ahmedabad'), 'Test B: Shows Complete Billing Address');
assert(htmlB2B.includes('Gujarat (24)'), 'Test B: Shows Recipient State & State Code');
assert(htmlB2B.includes('Phone: <b>9820098200</b>'), 'Test B: Shows Customer Phone');

// ----------------------------------------------------
// TEST C: B2B with Phone Missing
// ----------------------------------------------------
console.log('\n--- TEST C: B2B Invoice with Missing Phone ---');
const orderB2BNoPhone = {
  ...orderB2B,
  customer_phone: undefined
};
const htmlB2BNoPhone = printService.getTaxInvoiceA4Html(orderB2BNoPhone, mockSettings);
assert(htmlB2BNoPhone.includes('Patel Infotech Solutions LLP'), 'Test C: Business name rendered');
assert(!htmlB2BNoPhone.includes('Phone: <b>undefined</b>') && !htmlB2BNoPhone.includes('Phone: <b>N/A</b>'), 'Test C: Cleanly omits phone when missing in B2B');

// ----------------------------------------------------
// TEST D: Long Legal Business Name Wrapping
// ----------------------------------------------------
console.log('\n--- TEST D: Long Legal Business Name Wrapping & Escaping ---');
const orderLongName = {
  ...orderB2B,
  customer_business_name: 'International Consortium of Advanced Cybernetic Technology & Automated Infrastructure Solutions Private Limited & Sons'
};
const htmlLongName = printService.getTaxInvoiceA4Html(orderLongName, mockSettings);
assert(htmlLongName.includes('word-break: break-word'), 'Test D: Contains word-break: break-word styling');
assert(htmlLongName.includes('&amp; Sons'), 'Test D: HTML-escapes special characters such as &');

// ----------------------------------------------------
// TEST E: Multi-line Long Billing Address
// ----------------------------------------------------
console.log('\n--- TEST E: Multi-line Long Billing Address Wrapping ---');
const orderLongAddress = {
  ...orderB2B,
  billing_address: 'Suite #1402-1405, 14th Floor, Tower B, Galaxy Business Park, Sector 62, Near Electronic City Metro Station, Gautam Buddha Nagar'
};
const htmlLongAddress = printService.getTaxInvoiceA4Html(orderLongAddress, mockSettings);
assert(htmlLongAddress.includes('word-break: break-word; line-height: 1.35;'), 'Test E: Billing address styled with word-break and comfortable line-height');
assert(htmlLongAddress.includes('Gautam Buddha Nagar'), 'Test E: Full long address rendered without truncation');

// ----------------------------------------------------
// TEST F: Supplier GSTIN vs Recipient GSTIN Separation
// ----------------------------------------------------
console.log('\n--- TEST F: Separate and Non-confusing Supplier vs Recipient GSTIN ---');
assert(htmlB2B.includes('GSTIN (Supplier): <b>19AAACR1234M1Z1</b>'), 'Test F: Supplier GSTIN clearly labeled');
assert(htmlB2B.includes('GSTIN (Recipient): <b style="color: #1e40af;'), 'Test F: Recipient GSTIN clearly labeled in recipient box');
assert(!htmlB2B.includes('GSTIN (Supplier): <b>24AAACA1234A1Z5</b>'), 'Test F: Recipient GSTIN is never assigned to Supplier');
assert(!htmlB2B.includes('GSTIN (Recipient): <b style="color: #1e40af; font-family: monospace; font-size: 12px; letter-spacing: 0.5px;">19AAACR1234M1Z1</b>'), 'Test F: Supplier GSTIN is never assigned to Recipient');

// ----------------------------------------------------
// TEST G: Existing Mixed/Single GST Order Calculations
// ----------------------------------------------------
console.log('\n--- TEST G: GST Calculation Engine Preservation ---');
const totalsCalculated = getOrderInvoiceTotals(orderB2B, mockSettings);
assert(totalsCalculated.subtotal === 4000, 'Test G: Subtotal is ₹4000');
assert(totalsCalculated.taxableSubtotal === 4000, 'Test G: Taxable value is ₹4000', `Got ${totalsCalculated.taxableSubtotal}`);
assert(totalsCalculated.cgstAmount === 100 && totalsCalculated.sgstAmount === 100, 'Test G: CGST ₹100 & SGST ₹100', `CGST: ${totalsCalculated.cgstAmount}, SGST: ${totalsCalculated.sgstAmount}`);
assert(totalsCalculated.totalTax === 200, 'Test G: Total Tax is ₹200', `Got ${totalsCalculated.totalTax}`);
assert(totalsCalculated.payableAmount === 4200, 'Test G: Payable amount is ₹4200', `Got ${totalsCalculated.payableAmount}`);

// ----------------------------------------------------
// TEST H: Discounted Order Calculation Preservation
// ----------------------------------------------------
console.log('\n--- TEST H: Discounted Order Calculation Integrity ---');
const orderDiscounted = {
  ...orderB2B,
  discount_type: 'percentage',
  discount_value: 10, // 10% discount
};
const totalsDiscounted = getOrderInvoiceTotals(orderDiscounted, mockSettings);
assert(totalsDiscounted.subtotal === 4000, 'Test H: Subtotal ₹4000');
assert(totalsDiscounted.discountAmount === 400, 'Test H: 10% Discount ₹400');
assert(totalsDiscounted.taxableSubtotal === 3600, 'Test H: Discounted Taxable subtotal ₹3600');
assert(totalsDiscounted.totalTax === 180, 'Test H: 5% Tax on discounted ₹3600 is ₹180');
assert(totalsDiscounted.payableAmount === 3780, 'Test H: Discounted Net Payable ₹3780', `Got ${totalsDiscounted.payableAmount}`);

// ----------------------------------------------------
// TEST I: Round-off Reconciliation
// ----------------------------------------------------
console.log('\n--- TEST I: Round-Off Reconciliation ---');
const orderFractional = {
  ...orderB2C,
  items: [
    { item_name: 'Cold Drink', unit_price: 33.33, quantity: 1, tax_rate: 5 }
  ]
};
const totalsFractional = getOrderInvoiceTotals(orderFractional, mockSettings);
assert(typeof totalsFractional.roundOff === 'number', 'Test I: Round off is defined as number');
assert(totalsFractional.payableAmount === Math.round(totalsFractional.subtotal - (totalsFractional.discountAmount || 0) + totalsFractional.totalTax + (totalsFractional.roundOff || 0)), 'Test I: Round off reconciles exactly with payable amount', `Payable: ${totalsFractional.payableAmount}, Calc: ${totalsFractional.subtotal + totalsFractional.totalTax + totalsFractional.roundOff}`);

// ----------------------------------------------------
// TEST J: Historical Invoice Safety (No B2B metadata -> standard B2C)
// ----------------------------------------------------
console.log('\n--- TEST J: Historical Invoice Immutability ---');
const historicalOrder = {
  id: 'hist-001',
  order_number: 'RZ-HIST-99',
  invoice_number: 'INV-2025-099',
  customer_name: 'Dine-in Guest',
  customer_phone: null,
  notes: 'Table near window',
  created_at: '2025-05-10T12:00:00Z',
  items: [{ item_name: 'Fried Rice', unit_price: 180, quantity: 1, tax_rate: 5 }]
};
const htmlHist = printService.getTaxInvoiceA4Html(historicalOrder, mockSettings);
assert(htmlHist.includes('Customer / Billed To Details'), 'Test J: Historical invoice keeps standard B2C format');
assert(htmlHist.includes('Dine-in Guest'), 'Test J: Preserves historical guest name');
assert(!htmlHist.includes('Billed To / Recipient Details (B2B)'), 'Test J: Historical invoice does not inject B2B fields');

// ----------------------------------------------------
// TEST K & L: Print Preview and PDF Generation Structure
// ----------------------------------------------------
console.log('\n--- TEST K & L: Print Preview and A4 PDF Layout Standards ---');
assert(htmlB2B.includes('size: A4 portrait;'), 'Test K & L: Contains A4 standard page size');
assert(htmlB2B.includes('@media print'), 'Test K & L: Contains dedicated @media print CSS styles');
assert(htmlB2B.includes('.invoice-container'), 'Test K & L: Clean invoice container structure present');

// ----------------------------------------------------
// TEST M: Order Notes B2B Serialization & Deserialization
// ----------------------------------------------------
console.log('\n--- TEST M: Order Notes B2B Snapshot Lifecycle ---');
const b2bPayload = {
  customerBusinessName: 'Apex Logistics Pvt Ltd',
  billingAddress: 'Plot 45, Sector 18, Gurugram, Haryana',
  billingState: 'Haryana',
  billingStateCode: '06'
};
const serializedNotes = attachB2bToNotes('Customer requested extra spicy [GSTIN:06AAACA9876B1Z2]', b2bPayload);
assert(serializedNotes.includes('[B2B_BIZ:Apex Logistics Pvt Ltd]'), 'Test M: Serialized business name into notes');
assert(serializedNotes.includes('[B2B_ADDR:Plot 45, Sector 18, Gurugram, Haryana]'), 'Test M: Serialized billing address into notes');
assert(serializedNotes.includes('[B2B_STATE:Haryana]'), 'Test M: Serialized billing state into notes');
assert(serializedNotes.includes('[B2B_CODE:06]'), 'Test M: Serialized billing state code into notes');

const deserialized = extractB2bFromNotes(serializedNotes);
assert(deserialized.customerBusinessName === 'Apex Logistics Pvt Ltd', 'Test M: Deserialized business name matches exactly');
assert(deserialized.billingAddress === 'Plot 45, Sector 18, Gurugram, Haryana', 'Test M: Deserialized address matches exactly');
assert(deserialized.billingState === 'Haryana', 'Test M: Deserialized state matches exactly');
assert(deserialized.billingStateCode === '06', 'Test M: Deserialized state code matches exactly');

// ----------------------------------------------------
// TEST N: Thermal Receipt & KOT Regression Protection
// ----------------------------------------------------
console.log('\n--- TEST N: Thermal Receipt & KOT Regression Protection ---');
const cleanedNotes = cleanCustomerOrderNotes(serializedNotes);
assert(!cleanedNotes.includes('[B2B_BIZ:'), 'Test N: Clean notes strips B2B_BIZ tag completely');
assert(!cleanedNotes.includes('[B2B_ADDR:'), 'Test N: Clean notes strips B2B_ADDR tag completely');
assert(!cleanedNotes.includes('[B2B_STATE:'), 'Test N: Clean notes strips B2B_STATE tag completely');
assert(!cleanedNotes.includes('[B2B_CODE:'), 'Test N: Clean notes strips B2B_CODE tag completely');
assert(cleanedNotes.trim() === 'Customer requested extra spicy', 'Test N: Preserves legitimate customer instruction for kitchen/KOT', `Got: "${cleanedNotes}"`);

// ----------------------------------------------------
// GSTIN VALIDATION INTEGRITY
// ----------------------------------------------------
console.log('\n--- GSTIN Validation Tests ---');
const vValid = validateGSTIN('24AAACA1234A1Z5', '24');
assert(vValid.isValid === true && vValid.message === 'GSTIN format valid', 'Valid GSTIN with matching state code passes');
assert(vValid.stateName === 'Gujarat', 'Valid GSTIN resolves state Gujarat');

const vMismatch = validateGSTIN('24AAACA1234A1Z5', '19');
assert(vMismatch.isValid === false && vMismatch.error.includes('does not match'), 'State code mismatch properly caught');

const vInvalidFormat = validateGSTIN('INVALID12345');
assert(vInvalidFormat.isValid === false, 'Invalid format caught');

console.log('\n====================================================');
console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('====================================================');

if (totalTests === passedTests) {
  console.log('🎉 ALL B2B GST TAX INVOICE SUITE TESTS PASSED PERFECTLY!\n');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED!\n');
  process.exit(1);
}
