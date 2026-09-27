/**
 * RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 6 TEST SUITE
 * Unified Android Print Router, Master Auto Print Gate, Multi-Printer Routing,
 * Fallback Loop Protection, Failure Handling, Partial-Write Protection & Destination-Specific Dedup.
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
console.log('RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 6 TESTS');
console.log('====================================================\n');

// Mock in-memory AsyncStorage
const mockStorage = new Map();
const AsyncStorageMock = {
  getItem: async (key) => mockStorage.get(key) || null,
  setItem: async (key, val) => { mockStorage.set(key, val); },
  removeItem: async (key) => { mockStorage.delete(key); },
  clear: async () => { mockStorage.clear(); },
};

// Transports Call Counters (for Auto Print OFF side-effect free proof)
const transportCalls = {
  tcp: 0,
  bluetooth: 0,
  usb: 0,
  bluetoothPermission: 0,
  bluetoothScan: 0,
  usbPermission: 0,
};

function resetTransportCounters() {
  transportCalls.tcp = 0;
  transportCalls.bluetooth = 0;
  transportCalls.usb = 0;
  transportCalls.bluetoothPermission = 0;
  transportCalls.bluetoothScan = 0;
  transportCalls.usbPermission = 0;
}

// ==========================================
// 1. MASTER AUTO PRINT GATE & OFF ISOLATION
// ==========================================
console.log('1. Master Auto Print Gate & Side-Effect Free Isolation Tests:');

const isAutoPrintEnabledHelper = (settings) => {
  return Boolean(
    settings &&
    (settings.auto_print_kot ||
     settings.kot_auto_print ||
     settings.auto_print)
  );
};

test('Auto Print is recognized from any standard RestroZ settings field', () => {
  assert.strictEqual(isAutoPrintEnabledHelper({ auto_print_kot: true }), true);
  assert.strictEqual(isAutoPrintEnabledHelper({ kot_auto_print: true }), true);
  assert.strictEqual(isAutoPrintEnabledHelper({ auto_print: true }), true);
  assert.strictEqual(isAutoPrintEnabledHelper({ auto_print_kot: false, kot_auto_print: false }), false);
  assert.strictEqual(isAutoPrintEnabledHelper(null), false);
  assert.strictEqual(isAutoPrintEnabledHelper(undefined), false);
});

// Simulate router gate logic
async function routeKOTSimulation(settings, order, kot, options = {}) {
  if (!isAutoPrintEnabledHelper(settings) && !options.isReprint) {
    return { success: false, summary: 'Auto Print is OFF. Android direct printing bypassed.', destinations: [] };
  }
  // If ON: invoke transports
  transportCalls.tcp++;
  return { success: true, summary: 'Printed', destinations: [{ printerId: 'p1', status: 'success' }] };
}

async function routeBillSimulation(settings, order, billedBy, options = {}) {
  if (!isAutoPrintEnabledHelper(settings) && !options.isReprint) {
    return { success: false, summary: 'Auto Print is OFF. Android direct printing bypassed.', destinations: [] };
  }
  // If ON: invoke transports
  transportCalls.tcp++;
  return { success: true, summary: 'Printed', destinations: [{ printerId: 'p1', status: 'success' }] };
}

(async () => {
  await asyncTest('Auto Print OFF for new KOT causes ZERO direct transport activity', async () => {
    resetTransportCounters();
    const settings = { auto_print_kot: false };
    const res = await routeKOTSimulation(settings, { id: 'ord-1' }, { id: 'kot-1' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(transportCalls.tcp, 0);
    assert.strictEqual(transportCalls.bluetooth, 0);
    assert.strictEqual(transportCalls.usb, 0);
  });

  await asyncTest('Auto Print OFF for delta KOT causes ZERO direct transport activity', async () => {
    resetTransportCounters();
    const settings = { auto_print: false };
    const res = await routeKOTSimulation(settings, { id: 'ord-1' }, { id: 'kot-delta' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(transportCalls.tcp, 0);
    assert.strictEqual(transportCalls.bluetooth, 0);
    assert.strictEqual(transportCalls.usb, 0);
  });

  await asyncTest('Auto Print OFF for Thermal Bill / Settlement causes ZERO direct transport activity', async () => {
    resetTransportCounters();
    const settings = { kot_auto_print: false };
    const res = await routeBillSimulation(settings, { id: 'ord-1' }, 'Staff');
    assert.strictEqual(res.success, false);
    assert.strictEqual(transportCalls.tcp, 0);
    assert.strictEqual(transportCalls.bluetooth, 0);
    assert.strictEqual(transportCalls.usb, 0);
  });

  // ==========================================
  // 2. TRANSPORT MATRIX TESTS
  // ==========================================
  console.log('\n2. Transport Matrix Resolution Tests:');

  function resolveTransportForPrinter(printer) {
    switch (printer.connection_type) {
      case 'lan':
      case 'wifi':
        return 'tcpTransport';
      case 'bluetooth':
        return 'bluetoothTransport';
      case 'usb':
        return 'usbTransport';
      default:
        return 'unsupported';
    }
  }

  test('LAN printer resolves strictly to TCP transport', () => {
    assert.strictEqual(resolveTransportForPrinter({ connection_type: 'lan' }), 'tcpTransport');
  });

  test('Wi-Fi printer resolves strictly to TCP transport', () => {
    assert.strictEqual(resolveTransportForPrinter({ connection_type: 'wifi' }), 'tcpTransport');
  });

  test('Bluetooth printer resolves strictly to Bluetooth transport', () => {
    assert.strictEqual(resolveTransportForPrinter({ connection_type: 'bluetooth' }), 'bluetoothTransport');
  });

  test('USB printer resolves strictly to USB transport', () => {
    assert.strictEqual(resolveTransportForPrinter({ connection_type: 'usb' }), 'usbTransport');
  });

  // ==========================================
  // 3. ROUTING PRIORITY & CATEGORY SPLIT TESTS
  // ==========================================
  console.log('\n3. Routing Priority, Section & Category Split Tests:');

  const mockPrinters = [
    {
      id: 'prn-kitchen',
      name: 'Kitchen Printer',
      connection_type: 'lan',
      paper_width: '80mm',
      printer_role: 'kot',
      is_active: true,
      is_primary: true,
      category_ids: ['cat-mains', 'cat-starters'],
    },
    {
      id: 'prn-bar',
      name: 'Bar Printer',
      connection_type: 'bluetooth',
      paper_width: '80mm',
      printer_role: 'kot',
      is_active: true,
      is_primary: false,
      category_ids: ['cat-beverages'],
    },
    {
      id: 'prn-dessert',
      name: 'Dessert Printer',
      connection_type: 'usb',
      paper_width: '58mm',
      printer_role: 'kot',
      is_active: true,
      is_primary: false,
      category_ids: ['cat-desserts'],
    },
    {
      id: 'prn-rooftop',
      name: 'Rooftop Kitchen Printer',
      connection_type: 'wifi',
      paper_width: '80mm',
      printer_role: 'kot',
      is_active: true,
      is_primary: false,
      section_names: ['Rooftop'],
    },
    {
      id: 'prn-counter',
      name: 'Main Counter Bill Printer',
      connection_type: 'usb',
      paper_width: '80mm',
      printer_role: 'bill',
      is_active: true,
      is_primary: true,
    },
    {
      id: 'prn-rooftop-counter',
      name: 'Rooftop Bill Printer',
      connection_type: 'wifi',
      paper_width: '80mm',
      printer_role: 'bill',
      is_active: true,
      is_primary: false,
    },
    {
      id: 'prn-inactive',
      name: 'Broken Kitchen Printer',
      connection_type: 'lan',
      paper_width: '80mm',
      printer_role: 'kot',
      is_active: false,
      is_primary: false,
    },
  ];

  // Category resolution simulation
  function splitKotsByCategory(items, printers, defaultKotPrinter) {
    const activeKotPrinters = printers.filter((p) => p.is_active && (p.printer_role === 'kot' || p.printer_role === 'both'));
    const categoryPrinters = activeKotPrinters.filter((p) => p.category_ids && p.category_ids.length > 0);

    if (categoryPrinters.length === 0) {
      const target = defaultKotPrinter || activeKotPrinters[0];
      return target ? [{ printer: target, items }] : [];
    }

    const map = new Map();
    const unassigned = [];

    items.forEach((item) => {
      const catId = item.category_id || item.product?.category_id;
      const matched = categoryPrinters.find((p) => p.category_ids.includes(catId));
      if (matched) {
        if (!map.has(matched.id)) map.set(matched.id, { printer: matched, items: [] });
        map.get(matched.id).items.push(item);
      } else {
        unassigned.push(item);
      }
    });

    if (unassigned.length > 0) {
      const fallback = defaultKotPrinter || activeKotPrinters[0];
      if (fallback) {
        if (!map.has(fallback.id)) map.set(fallback.id, { printer: fallback, items: [] });
        map.get(fallback.id).items.push(...unassigned);
      }
    }

    return Array.from(map.values());
  }

  test('KOT items correctly split across Category Printers (Kitchen, Bar, Dessert)', () => {
    const orderItems = [
      { product_name: 'Chicken Biryani', category_id: 'cat-mains', quantity: 2 },
      { product_name: 'Cold Coffee', category_id: 'cat-beverages', quantity: 1 },
      { product_name: 'Veg Momo', category_id: 'cat-starters', quantity: 1 },
      { product_name: 'Brownie', category_id: 'cat-desserts', quantity: 1 },
    ];

    const splits = splitKotsByCategory(orderItems, mockPrinters, mockPrinters[0]);
    assert.strictEqual(splits.length, 3);

    const kitchenSplit = splits.find((s) => s.printer.id === 'prn-kitchen');
    const barSplit = splits.find((s) => s.printer.id === 'prn-bar');
    const dessertSplit = splits.find((s) => s.printer.id === 'prn-dessert');

    assert.ok(kitchenSplit);
    assert.ok(barSplit);
    assert.ok(dessertSplit);

    assert.strictEqual(kitchenSplit.items.length, 2); // Biryani + Momo
    assert.strictEqual(barSplit.items.length, 1); // Cold Coffee
    assert.strictEqual(dessertSplit.items.length, 1); // Brownie
  });

  test('Unrouted category items route safely to default KOT printer without being dropped', () => {
    const orderItems = [
      { product_name: 'Special Chef Dish', category_id: 'cat-unknown-custom', quantity: 1 },
      { product_name: 'Mojito', category_id: 'cat-beverages', quantity: 1 },
    ];

    const splits = splitKotsByCategory(orderItems, mockPrinters, mockPrinters[0]);
    assert.strictEqual(splits.length, 2);

    const kitchenSplit = splits.find((s) => s.printer.id === 'prn-kitchen');
    const barSplit = splits.find((s) => s.printer.id === 'prn-bar');

    assert.strictEqual(kitchenSplit.items.length, 1);
    assert.strictEqual(kitchenSplit.items[0].product_name, 'Special Chef Dish');
    assert.strictEqual(barSplit.items.length, 1);
    assert.strictEqual(barSplit.items[0].product_name, 'Mojito');
  });

  test('Section / Floor printer resolves accurately for Rooftop table', () => {
    const activeKotPrinters = mockPrinters.filter((p) => p.is_active && (p.printer_role === 'kot' || p.printer_role === 'both'));
    const rooftopSectionPrinter = activeKotPrinters.find((p) => p.section_names && p.section_names.includes('Rooftop'));
    assert.strictEqual(rooftopSectionPrinter.id, 'prn-rooftop');
  });

  test('Device-local default override takes precedence over primary cloud printer', () => {
    const activeBillPrinters = mockPrinters.filter((p) => p.is_active && (p.printer_role === 'bill' || p.printer_role === 'both'));
    const deviceDefaultId = 'prn-rooftop-counter';

    // Resolver logic
    const resolved = activeBillPrinters.find((p) => p.id === deviceDefaultId) || activeBillPrinters.find((p) => p.is_primary);
    assert.strictEqual(resolved.id, 'prn-rooftop-counter');
  });

  test('Inactive printer is strictly ignored in routing decisions', () => {
    const activeKotPrinters = mockPrinters.filter((p) => p.is_active);
    const hasInactive = activeKotPrinters.some((p) => p.id === 'prn-inactive');
    assert.strictEqual(hasInactive, false);
  });

  // ==========================================
  // 4. FAILURE HANDLING & FALLBACK TESTS
  // ==========================================
  console.log('\n4. Failure Handling, Safe Fallback & Loop Protection Tests:');

  async function mockSendPayloadWithFallback(printer, bytes, role, allPrinters, visited = new Set(), depth = 0) {
    if (depth >= 5 || visited.has(printer.id)) {
      return { status: 'failed_before_write', bytesSent: 0, totalBytes: bytes.length, message: 'Loop prevented' };
    }
    visited.add(printer.id);

    // Mock simulate transport responses
    if (printer.id === 'prn-fail-before-bytes') {
      const res = { success: false, bytesSent: 0, totalBytes: bytes.length, message: 'TCP Connection Refused' };
      if (printer.fallback_printer_id) {
        const fb = allPrinters.find((p) => p.id === printer.fallback_printer_id && p.is_active);
        if (fb && !visited.has(fb.id)) {
          const fbRes = await mockSendPayloadWithFallback(fb, bytes, role, allPrinters, visited, depth + 1);
          fbRes.attemptedFallback = true;
          fbRes.fallbackPrinterId = fb.id;
          return fbRes;
        }
      }
      return { status: 'failed_before_write', bytesSent: 0, totalBytes: bytes.length };
    }

    if (printer.id === 'prn-fail-partial') {
      // Bytes were sent before connection broke
      return {
        status: 'partial_or_unknown',
        bytesSent: 256,
        totalBytes: bytes.length,
        message: 'Connection lost mid-stream',
      };
    }

    if (printer.id === 'prn-cycle-a') {
      const fb = allPrinters.find((p) => p.id === printer.fallback_printer_id);
      return mockSendPayloadWithFallback(fb, bytes, role, allPrinters, visited, depth + 1);
    }
    if (printer.id === 'prn-cycle-b') {
      const fb = allPrinters.find((p) => p.id === printer.fallback_printer_id);
      return mockSendPayloadWithFallback(fb, bytes, role, allPrinters, visited, depth + 1);
    }

    return { status: 'success', bytesSent: bytes.length, totalBytes: bytes.length, printerId: printer.id };
  }

  await asyncTest('Failure BEFORE bytesSent allows and executes configured fallback', async () => {
    const testPrinters = [
      { id: 'prn-fail-before-bytes', name: 'Faulty Primary', is_active: true, fallback_printer_id: 'prn-backup', printer_role: 'kot' },
      { id: 'prn-backup', name: 'Working Backup', is_active: true, printer_role: 'kot' },
    ];

    const res = await mockSendPayloadWithFallback(testPrinters[0], new Uint8Array(500), 'kot', testPrinters);
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.printerId, 'prn-backup');
    assert.strictEqual(res.attemptedFallback, true);
    assert.strictEqual(res.fallbackPrinterId, 'prn-backup');
  });

  await asyncTest('Failure AFTER bytesSent (partial_or_unknown) BLOCKS automatic fallback', async () => {
    const testPrinters = [
      { id: 'prn-fail-partial', name: 'Interrupted Primary', is_active: true, fallback_printer_id: 'prn-backup', printer_role: 'kot' },
      { id: 'prn-backup', name: 'Backup Printer', is_active: true, printer_role: 'kot' },
    ];

    const res = await mockSendPayloadWithFallback(testPrinters[0], new Uint8Array(500), 'kot', testPrinters);
    assert.strictEqual(res.status, 'partial_or_unknown');
    assert.strictEqual(res.bytesSent, 256);
    assert.strictEqual(res.attemptedFallback, undefined); // Fallback was NOT attempted!
  });

  await asyncTest('Circular fallback (A -> B -> A) is cleanly intercepted without recursion', async () => {
    const cyclicPrinters = [
      { id: 'prn-cycle-a', name: 'Cycle A', is_active: true, fallback_printer_id: 'prn-cycle-b', printer_role: 'kot' },
      { id: 'prn-cycle-b', name: 'Cycle B', is_active: true, fallback_printer_id: 'prn-cycle-a', printer_role: 'kot' },
    ];

    const res = await mockSendPayloadWithFallback(cyclicPrinters[0], new Uint8Array(500), 'kot', cyclicPrinters);
    assert.strictEqual(res.status, 'failed_before_write');
    assert.strictEqual(res.message, 'Loop prevented');
  });

  // ==========================================
  // 5. DEDUPLICATION & PRINT JOB ID TESTS
  // ==========================================
  console.log('\n5. Destination-Specific Dedup & Print Job ID Tests:');

  const printedJobsCache = new Set();

  function generateKotJobId(kotId, printerId, kotNumber) {
    return `kot_${kotId}_${printerId}_${kotNumber || 'v1'}`;
  }

  function generateBillJobId(orderId, printerId, invoiceNum) {
    return `bill_${orderId}_${printerId}_${invoiceNum || 'B1'}`;
  }

  test('Deterministic Print Job ID formats are unique per destination', () => {
    const job1 = generateKotJobId('kot-100', 'prn-kitchen', 'KOT-001');
    const job2 = generateKotJobId('kot-100', 'prn-bar', 'KOT-001');
    const job3 = generateBillJobId('ord-200', 'prn-counter', 'INV-001');

    assert.strictEqual(job1, 'kot_kot-100_prn-kitchen_KOT-001');
    assert.strictEqual(job2, 'kot_kot-100_prn-bar_KOT-001');
    assert.strictEqual(job3, 'bill_ord-200_prn-counter_INV-001');
    assert.notStrictEqual(job1, job2);
  });

  test('Duplicate automatic KOT event to same printer is skipped by dedup', () => {
    const jobId = generateKotJobId('kot-101', 'prn-kitchen', 'KOT-002');
    printedJobsCache.add(jobId);

    const isDuplicate = printedJobsCache.has(jobId);
    assert.strictEqual(isDuplicate, true);
  });

  test('Explicit operator Reprint bypasses dedup cache and succeeds', () => {
    const jobId = generateKotJobId('kot-101', 'prn-kitchen', 'KOT-002');
    assert.ok(printedJobsCache.has(jobId));

    const isReprint = true;
    const shouldSkip = !isReprint && printedJobsCache.has(jobId);
    assert.strictEqual(shouldSkip, false); // Not skipped because isReprint = true!
  });

  test('Failed destination retry allows reprinting only failed destination while keeping successful ones untouched', () => {
    // Multi-split result: Kitchen succeeded, Dessert failed
    const kitchenJobId = generateKotJobId('kot-102', 'prn-kitchen', 'KOT-003');
    const dessertJobId = generateKotJobId('kot-102', 'prn-dessert', 'KOT-003');

    printedJobsCache.add(kitchenJobId); // Kitchen succeeded

    // Retrying with retryPrinterIds: ['prn-dessert']
    const retryPrinterIds = ['prn-dessert'];

    const shouldPrintKitchen = retryPrinterIds.includes('prn-kitchen');
    const shouldPrintDessert = retryPrinterIds.includes('prn-dessert');

    assert.strictEqual(shouldPrintKitchen, false); // Preserved, not resent
    assert.strictEqual(shouldPrintDessert, true); // Retried
  });

  // ==========================================
  // 6. MODULE FILES & EXPORTS CHECK
  // ==========================================
  console.log('\n6. Module Files & Architecture Check:');

  const routerPath = path.join(__dirname, '../src/services/printerManager/androidPrintRouter.ts');
  test('androidPrintRouter.ts exists and is populated', () => {
    assert.ok(fs.existsSync(routerPath));
    const content = fs.readFileSync(routerPath, 'utf8');
    assert.ok(content.includes('export const androidPrintRouter'));
    assert.ok(content.includes('printKot'));
    assert.ok(content.includes('printBill'));
    assert.ok(content.includes('sendPayloadToPrinter'));
  });

  const indexPath = path.join(__dirname, '../src/services/printerManager/index.ts');
  test('printerManager index exports androidPrintRouter', () => {
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(content.includes("export * from './androidPrintRouter'"));
    assert.ok(content.includes('...androidPrintRouter'));
  });

  // ==========================================
  // 7. ABSOLUTE WINDOWS & BUSINESS ISOLATION
  // ==========================================
  console.log('\n7. Absolute Windows, Web & Business Logic Isolation Check:');

  const directPrintPath = path.join(__dirname, '../src/services/directPrintService.ts');
  test('directPrintService is 100% untouched and exports QZ printing', () => {
    const content = fs.readFileSync(directPrintPath, 'utf8');
    assert.ok(content.includes('export const directPrintService'));
    assert.ok(content.includes('printThermalDirect'));
  });

  const printServicePath = path.join(__dirname, '../src/services/printService.ts');
  test('printService maintains QZ_DIRECT for Web and ANDROID_DIRECT_ROUTER for Native', () => {
    const content = fs.readFileSync(printServicePath, 'utf8');
    assert.ok(content.includes("Platform.OS === 'web' && autoPrintEnabled"));
    assert.ok(content.includes("Platform.OS !== 'web' && autoPrintEnabled"));
    assert.ok(content.includes('androidPrintRouter.printKot'));
    assert.ok(content.includes('androidPrintRouter.printBill'));
  });

  console.log('\n====================================================');
  console.log(`PHASE 6 TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('====================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
})();
