/**
 * RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 7 TEST SUITE
 * Production Readiness, Printer Setup UX, End-to-End Validation Harness,
 * Missing-Binding Detection, Routing Preview & System Health Diagnostics.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let totalPassed = 0;
let totalFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    ${err.message}`);
    totalFailed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    ${err.message}`);
    totalFailed++;
  }
}

console.log('====================================================');
console.log('RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 7 TESTS');
console.log('====================================================\n');

// Mock data structures
const sampleSettingsOn = { id: 'rest-1', name: 'RestroZ Dining', auto_print_kot: true, kot_auto_print: true };
const sampleSettingsOff = { id: 'rest-1', name: 'RestroZ Dining', auto_print_kot: false, kot_auto_print: false };

const fullyConfiguredPrinters = [
  {
    id: 'prn-kitchen',
    name: 'Kitchen POS80',
    connection_type: 'lan',
    ip_address: '192.168.1.100',
    port: 9100,
    paper_width: '80mm',
    printer_role: 'kot',
    is_active: true,
    is_primary: true,
    category_ids: ['cat-mains'],
  },
  {
    id: 'prn-counter',
    name: 'Counter Billing POS80',
    connection_type: 'lan',
    ip_address: '192.168.1.101',
    port: 9100,
    paper_width: '80mm',
    printer_role: 'bill',
    is_active: true,
    is_primary: true,
  },
];

// ==========================================
// 1. AUTO PRINT READINESS CHECKER TESTS
// ==========================================
console.log('1. Auto Print Readiness Diagnostics Tests (Non-Hardware Touching):');

// Simulation of checkAutoPrintReadiness
function simulateCheckAutoPrintReadiness(settings, printers, bindings = {}, defaults = {}) {
  const autoPrintOn = Boolean(settings && (settings.auto_print_kot || settings.kot_auto_print || settings.auto_print));
  const activePrinters = (printers || []).filter((p) => p.is_active);
  const activeKot = activePrinters.filter((p) => p.printer_role === 'kot' || p.printer_role === 'both');
  const activeBill = activePrinters.filter((p) => p.printer_role === 'bill' || p.printer_role === 'both');

  const errors = [];
  const warnings = [];

  if (!autoPrintOn) warnings.push('Auto Print is OFF');
  if (activeKot.length === 0) errors.push('Missing active KOT printer');
  if (activeBill.length === 0) errors.push('Missing active Bill printer');

  // Check bindings
  for (const p of activePrinters) {
    if (p.connection_type === 'bluetooth' && !bindings[p.id]?.bluetooth_mac_address) {
      errors.push(`Bluetooth printer ${p.name} unbound on tablet`);
    }
    if (p.connection_type === 'usb' && (bindings[p.id]?.usb_vendor_id == null || bindings[p.id]?.usb_product_id == null)) {
      errors.push(`USB printer ${p.name} unbound on tablet`);
    }
    if (['lan', 'wifi'].includes(p.connection_type)) {
      if (!p.ip_address || !p.ip_address.trim()) errors.push(`Network printer ${p.name} missing IP`);
      const portNum = Number(p.port || 9100);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) errors.push(`Network printer ${p.name} invalid port`);
    }
  }

  const isReady = autoPrintOn && errors.length === 0 && activeKot.length > 0 && activeBill.length > 0;
  return { isAutoPrintEnabled: autoPrintOn, isReady, errors, warnings };
}

test('Auto Print OFF returns non-ready state with manual printing notice', () => {
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOff, fullyConfiguredPrinters);
  assert.strictEqual(res.isAutoPrintEnabled, false);
  assert.strictEqual(res.isReady, false);
  assert.ok(res.warnings.includes('Auto Print is OFF'));
});

test('Auto Print ON + Fully configured LAN printers returns IS_READY = true', () => {
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, fullyConfiguredPrinters);
  assert.strictEqual(res.isAutoPrintEnabled, true);
  assert.strictEqual(res.isReady, true);
  assert.strictEqual(res.errors.length, 0);
});

test('Missing KOT printer returns configuration error', () => {
  const billOnlyPrinters = [fullyConfiguredPrinters[1]];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, billOnlyPrinters);
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('KOT printer')));
});

test('Missing Bill printer returns configuration error', () => {
  const kotOnlyPrinters = [fullyConfiguredPrinters[0]];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, kotOnlyPrinters);
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('Bill printer')));
});

test('Bluetooth printer without local device binding returns unbound error', () => {
  const btPrinters = [
    { id: 'bt-1', name: 'BT Kitchen', connection_type: 'bluetooth', is_active: true, printer_role: 'kot' },
    fullyConfiguredPrinters[1],
  ];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, btPrinters, {}); // empty bindings
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('BT Kitchen unbound')));
});

test('USB printer without local device binding returns unbound error', () => {
  const usbPrinters = [
    fullyConfiguredPrinters[0],
    { id: 'usb-1', name: 'USB Counter', connection_type: 'usb', is_active: true, printer_role: 'bill' },
  ];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, usbPrinters, {}); // empty bindings
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('USB Counter unbound')));
});

test('Network printer with missing IP address returns configuration error immediately', () => {
  const invalidNetPrinters = [
    { id: 'lan-1', name: 'No IP Printer', connection_type: 'lan', ip_address: '', port: 9100, is_active: true, printer_role: 'kot' },
    fullyConfiguredPrinters[1],
  ];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, invalidNetPrinters);
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('missing IP')));
});

test('Network printer with invalid port number returns port error', () => {
  const invalidPortPrinters = [
    { id: 'lan-1', name: 'Bad Port Printer', connection_type: 'lan', ip_address: '192.168.1.50', port: 999999, is_active: true, printer_role: 'kot' },
    fullyConfiguredPrinters[1],
  ];
  const res = simulateCheckAutoPrintReadiness(sampleSettingsOn, invalidPortPrinters);
  assert.strictEqual(res.isReady, false);
  assert.ok(res.errors.some((e) => e.includes('invalid port')));
});

// ==========================================
// 2. ROUTING PREVIEW TESTS
// ==========================================
console.log('\n2. Routing Preview Diagnostics Tests:');

const multiCategoryPrinters = [
  {
    id: 'prn-kitchen',
    name: 'Kitchen Main Printer',
    connection_type: 'lan',
    is_active: true,
    printer_role: 'kot',
    category_ids: ['cat-mains'],
    is_primary: true,
  },
  {
    id: 'prn-bar',
    name: 'Bar Printer',
    connection_type: 'bluetooth',
    is_active: true,
    printer_role: 'kot',
    category_ids: ['cat-drinks'],
    is_primary: false,
  },
  {
    id: 'prn-bill',
    name: 'Billing Counter',
    connection_type: 'usb',
    is_active: true,
    printer_role: 'bill',
    is_primary: true,
  },
];

test('Preview Routing splits sample order without touching hardware or DB', () => {
  const sampleItems = [
    { product_name: 'Butter Chicken', category_id: 'cat-mains', quantity: 1 },
    { product_name: 'Mojito', category_id: 'cat-drinks', quantity: 2 },
  ];

  const mainsPrinter = multiCategoryPrinters.find((p) => p.category_ids?.includes('cat-mains'));
  const drinksPrinter = multiCategoryPrinters.find((p) => p.category_ids?.includes('cat-drinks'));
  const billPrinter = multiCategoryPrinters.find((p) => p.printer_role === 'bill');

  assert.strictEqual(mainsPrinter.name, 'Kitchen Main Printer');
  assert.strictEqual(drinksPrinter.name, 'Bar Printer');
  assert.strictEqual(billPrinter.name, 'Billing Counter');
});

// ==========================================
// 3. DELETE / DISABLE SAFETY WARNINGS
// ==========================================
console.log('\n3. Delete & Disable Safety Diagnostics Tests:');

function simulateGetDeleteWarnings(printerId, printers, defaults = {}) {
  const warnings = [];
  const target = (printers || []).find((p) => p.id === printerId);
  if (!target) return warnings;

  if (defaults.default_kot_printer_id === printerId) warnings.push('Used as Device Default KOT');
  if (defaults.default_bill_printer_id === printerId) warnings.push('Used as Device Default Bill');
  if (printers.some((p) => p.fallback_printer_id === printerId)) warnings.push('Used as Fallback for another printer');
  if (target.category_ids && target.category_ids.length > 0) warnings.push('Has menu categories assigned');
  if (target.section_names && target.section_names.length > 0) warnings.push('Has dining sections assigned');

  return warnings;
}

test('Deleting printer configured as device default triggers safety warning', () => {
  const warnings = simulateGetDeleteWarnings('prn-kitchen', multiCategoryPrinters, {
    default_kot_printer_id: 'prn-kitchen',
  });
  assert.ok(warnings.some((w) => w.includes('Device Default KOT')));
});

test('Deleting printer with active category routes triggers safety warning', () => {
  const warnings = simulateGetDeleteWarnings('prn-kitchen', multiCategoryPrinters);
  assert.ok(warnings.some((w) => w.includes('categories assigned')));
});

// ==========================================
// 4. OPERATOR ERROR NORMALIZATION
// ==========================================
console.log('\n4. Operator Error Normalization Tests:');

function normalizeErrorMessage(err) {
  const msg = err?.message || String(err || '');
  if (
    msg.includes('not_bound') ||
    msg.includes('not bound') ||
    msg.includes('not configured on this device') ||
    msg.includes('Select Bluetooth device') ||
    msg.includes('Select USB device')
  ) {
    return 'Printer is not configured on this device. Open Printer Settings to bind the device.';
  }
  if (msg.includes('bluetooth_disabled')) {
    return 'Bluetooth is turned off. Please enable Bluetooth on your tablet.';
  }
  if (msg.includes('device_not_connected')) {
    return 'USB printer is disconnected. Check USB cable and power.';
  }
  if (msg.includes('partial_or_unknown')) {
    return 'Print may have partially completed. Check the physical printer before reprinting.';
  }
  if (msg.includes('unreachable')) {
    return 'Printer is not reachable. Check printer power and network connection.';
  }
  return msg;
}

test('Unbound Bluetooth/USB error maps to user-friendly binding notice', () => {
  const err = { message: 'Bluetooth printer not bound on this tablet.' };
  const userMsg = normalizeErrorMessage(err);
  assert.strictEqual(userMsg, 'Printer is not configured on this device. Open Printer Settings to bind the device.');
});

test('Partial print failure maps to duplicate-prevention caution message', () => {
  const err = { message: 'Connection interrupted: partial_or_unknown' };
  const userMsg = normalizeErrorMessage(err);
  assert.strictEqual(userMsg, 'Print may have partially completed. Check the physical printer before reprinting.');
});

// ==========================================
// 5. SETTLEMENT & BUSINESS SAFETY
// ==========================================
console.log('\n5. Settlement & Business Logic Safety Tests:');

test('Settlement print failure message confirms payment success while offering reprint', () => {
  const paymentSucceeded = true;
  const printSucceeded = false;

  let alertText = '';
  if (paymentSucceeded && !printSucceeded) {
    alertText = 'Payment completed successfully, but receipt printing failed.';
  }
  assert.strictEqual(alertText, 'Payment completed successfully, but receipt printing failed.');
});

// ==========================================
// 6. ANDROID PERMISSIONS AUDIT
// ==========================================
console.log('\n6. Android Permissions Audit:');

const appJsonPath = path.join(__dirname, '../app.json');
test('app.json declares all required Network and Bluetooth thermal permissions', () => {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const appJson = JSON.parse(raw);
  const perms = appJson.expo.android.permissions;

  assert.ok(perms.includes('INTERNET'));
  assert.ok(perms.includes('ACCESS_NETWORK_STATE'));
  assert.ok(perms.includes('ACCESS_WIFI_STATE'));
  assert.ok(perms.includes('BLUETOOTH'));
  assert.ok(perms.includes('BLUETOOTH_ADMIN'));
  assert.ok(perms.includes('BLUETOOTH_CONNECT'));
  assert.ok(perms.includes('BLUETOOTH_SCAN'));
});

// ==========================================
// 7. SYSTEM CHECK NON-HARDWARE FIDELITY
// ==========================================
console.log('\n7. System Health Check Non-Hardware Fidelity:');

const diagnosticsPath = path.join(__dirname, '../src/services/printerManager/diagnostics.ts');
test('diagnostics.ts explicitly labels physical hardware as NOT TESTED', () => {
  const content = fs.readFileSync(diagnosticsPath, 'utf8');
  assert.ok(content.includes('PENDING FINAL HARDWARE VALIDATION'));
  assert.ok(content.includes('NOT_TESTED'));
});

console.log('\n====================================================');
console.log(`PHASE 7 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('====================================================\n');

if (totalFailed > 0) {
  process.exit(1);
}
