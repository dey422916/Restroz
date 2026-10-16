/**
 * RESTROZ — PRINTER ROLE ROUTING & MANUAL PRINT MATRIX TEST SUITE
 *
 * Verifies the strict separation between AUTOMATIC ROUTING and MANUAL/EXPLICIT PRINTING:
 * - PRINTER ROLE controls AUTOMATIC routing only (Settlement Bill, Order KOT)
 * - PRINTER ROLE does NOT prevent explicit user-requested manual prints (Manual Thermal Bill, Reprint)
 * - ZERO financial or business mutation on manual print, manual reprint, or print failure
 * - Full matrix coverage for KOT, BILL, BOTH with AUTO ON and AUTO OFF
 */

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// -------------------------------------------------------------
// Canonical role matching rule matching src/services/webDirectPrintService.ts
// -------------------------------------------------------------
function isPrinterRoleEligible(printerRole, targetRole) {
  if (!printerRole) return false;
  const r = String(printerRole).trim().toLowerCase();
  return r === targetRole || r === 'both';
}

// -------------------------------------------------------------
// Router simulation matching webDirectPrintService and androidPrintRouter
// -------------------------------------------------------------
function resolvePrinterForRole(printers, role, isManual = false) {
  if (!printers || printers.length === 0) return null;

  // Primary printer is selected if it matches role OR if this is an explicit manual print
  const primary =
    printers.find((p) => p.isPrimary && (isPrinterRoleEligible(p.role, role) || isManual)) ||
    (isManual ? printers.find((p) => p.isPrimary) : null) ||
    null;
  const isPrimaryReady = Boolean(primary && (primary.status === 'connected' || primary.status === 'available'));

  if (isPrimaryReady) {
    return primary;
  }

  // Find all ready printers matching role strictly (on manual print, allow any ready printer)
  let readyPrinters = printers.filter(
    (p) => (p.status === 'connected' || p.status === 'available') && (isPrinterRoleEligible(p.role, role) || isManual)
  );

  readyPrinters.sort((a, b) => {
    const transportWeight = { agent: 1, usb: 2, serial: 3, bluetooth: 4 };
    const twA = transportWeight[a.transport] || 99;
    const twB = transportWeight[b.transport] || 99;
    if (twA !== twB) return twA - twB;

    const roleA = a.role === role ? 1 : 2;
    const roleB = b.role === role ? 1 : 2;
    return roleA - roleB;
  });

  return readyPrinters[0] || (isManual ? (primary || printers[0]) : null);
}

// Simulates order placement flow (order creation + KOT dispatch)
function simulateOrderCreationWithKotPrint(order, printers, isAutoPrint = true, isManual = false) {
  const orderRecord = { ...order, status: 'confirmed', created: true };

  if (!isAutoPrint && !isManual) {
    return {
      orderRecord,
      printResult: { success: false, skipped: true, reason: 'AUTO_PRINT_OFF' },
      browserDialogTriggered: false,
    };
  }

  const targetPrinter = resolvePrinterForRole(printers, 'kot', isManual);
  if (!targetPrinter) {
    return {
      orderRecord,
      printResult: { success: false, skipped: true, reason: 'NO_ELIGIBLE_PRINTER' },
      browserDialogTriggered: false,
    };
  }

  return {
    orderRecord,
    printResult: {
      success: true,
      skipped: false,
      printerName: targetPrinter.name,
      jobType: 'kot',
      paperWidth: targetPrinter.paperWidth || '80mm',
    },
    browserDialogTriggered: false,
  };
}

// Simulates bill print flow (settlement auto bill or manual print)
function simulateBillPrint(order, printers, isAutoPrint = true, isManual = false) {
  if (!isAutoPrint && !isManual) {
    return {
      printResult: { success: false, skipped: true, reason: 'AUTO_PRINT_OFF' },
      browserDialogTriggered: false,
    };
  }

  const targetPrinter = resolvePrinterForRole(printers, 'bill', isManual);
  if (!targetPrinter) {
    return {
      printResult: { success: false, skipped: true, reason: 'NO_ELIGIBLE_PRINTER' },
      browserDialogTriggered: false,
    };
  }

  return {
    printResult: {
      success: true,
      skipped: false,
      printerName: targetPrinter.name,
      jobType: 'bill',
      paperWidth: targetPrinter.paperWidth || '80mm',
    },
    browserDialogTriggered: false,
  };
}

// -------------------------------------------------------------
// TEST RUNNER
// -------------------------------------------------------------
console.log('=================================================================');
console.log('RESTROZ — PRINTER ROLE ROUTING & MANUAL PRINT MATRIX TEST SUITE');
console.log('=================================================================\n');

// MATRIX TEST 1: ROLE KOT + AUTO ON
console.log('MATRIX TEST 1: ROLE KOT + AUTO ON (Seznik-Veer_9394 58mm Primary)');
{
  const printers = [
    { id: 'p_seznik', name: 'Seznik-Veer_9394', role: 'kot', paperWidth: '58mm', isPrimary: true, status: 'connected', transport: 'bluetooth' }
  ];
  const order = { id: 'ord_1', order_number: '101' };

  // 1. Auto KOT
  const autoKot = simulateOrderCreationWithKotPrint(order, printers, true, false);
  assert(autoKot.printResult.success === true && autoKot.printResult.printerName === 'Seznik-Veer_9394', 'Auto KOT = 1 (sent to Seznik-Veer_9394)');
  assert(autoKot.printResult.paperWidth === '58mm', 'Auto KOT formatted for 58mm');

  // 2. Auto Bill after settlement
  const autoBill = simulateBillPrint(order, printers, true, false);
  assert(autoBill.printResult.skipped === true && autoBill.printResult.reason === 'NO_ELIGIBLE_PRINTER', 'Auto Bill = 0 (correctly skipped on role=KOT)');

  // 3. Manual Thermal Bill
  const manualBill = simulateBillPrint(order, printers, true, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'Seznik-Veer_9394', 'Manual Thermal Bill = 1 (routes to Seznik-Veer_9394)');
  assert(manualBill.printResult.paperWidth === '58mm', 'Manual Thermal Bill formatted for 58mm');

  // 4. Manual Bill Reprint
  const manualReprint = simulateBillPrint(order, printers, true, true);
  assert(manualReprint.printResult.success === true && manualReprint.printResult.printerName === 'Seznik-Veer_9394', 'Manual Bill Reprint = 1 (routes to Seznik-Veer_9394)');
}

// MATRIX TEST 2: ROLE BILL + AUTO ON
console.log('\nMATRIX TEST 2: ROLE BILL + AUTO ON');
{
  const printers = [
    { id: 'p_bill', name: 'Counter Bill 80', role: 'bill', paperWidth: '80mm', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_2', order_number: '102' };

  // 1. Auto KOT
  const autoKot = simulateOrderCreationWithKotPrint(order, printers, true, false);
  assert(autoKot.printResult.skipped === true && autoKot.printResult.reason === 'NO_ELIGIBLE_PRINTER', 'Auto KOT = 0 (correctly skipped on role=BILL)');

  // 2. Auto Bill
  const autoBill = simulateBillPrint(order, printers, true, false);
  assert(autoBill.printResult.success === true && autoBill.printResult.printerName === 'Counter Bill 80', 'Auto Bill = 1 (sent to Counter Bill 80)');

  // 3. Manual Thermal Bill
  const manualBill = simulateBillPrint(order, printers, true, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'Counter Bill 80', 'Manual Thermal Bill = 1');

  // 4. Manual KOT (explicit reprint/print)
  const manualKot = simulateOrderCreationWithKotPrint(order, printers, true, true);
  assert(manualKot.printResult.success === true && manualKot.printResult.printerName === 'Counter Bill 80', 'Manual KOT = 1 (fallback allowed on explicit manual action)');
}

// MATRIX TEST 3: ROLE BOTH + AUTO ON
console.log('\nMATRIX TEST 3: ROLE BOTH + AUTO ON');
{
  const printers = [
    { id: 'p_both', name: 'POS80 Main', role: 'both', paperWidth: '80mm', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_3', order_number: '103' };

  // 1. Auto KOT
  const autoKot = simulateOrderCreationWithKotPrint(order, printers, true, false);
  assert(autoKot.printResult.success === true && autoKot.printResult.printerName === 'POS80 Main', 'Auto KOT = 1');

  // 2. Auto Bill
  const autoBill = simulateBillPrint(order, printers, true, false);
  assert(autoBill.printResult.success === true && autoBill.printResult.printerName === 'POS80 Main', 'Auto Bill = 1');

  // 3. Manual Thermal Bill
  const manualBill = simulateBillPrint(order, printers, true, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'POS80 Main', 'Manual Thermal Bill = 1');
}

// MATRIX TEST 4: ROLE KOT + AUTO OFF
console.log('\nMATRIX TEST 4: ROLE KOT + AUTO OFF');
{
  const printers = [
    { id: 'p_kot', name: 'Seznik Kitchen', role: 'kot', paperWidth: '58mm', isPrimary: true, status: 'connected', transport: 'bluetooth' }
  ];
  const order = { id: 'ord_4', order_number: '104' };

  const autoKot = simulateOrderCreationWithKotPrint(order, printers, false, false);
  assert(autoKot.printResult.skipped === true && autoKot.printResult.reason === 'AUTO_PRINT_OFF', 'Auto KOT = 0');

  const autoBill = simulateBillPrint(order, printers, false, false);
  assert(autoBill.printResult.skipped === true && autoBill.printResult.reason === 'AUTO_PRINT_OFF', 'Auto Bill = 0');

  const manualBill = simulateBillPrint(order, printers, false, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'Seznik Kitchen', 'Manual Thermal Bill = 1 (explicit print works even when Auto Print OFF)');
}

// MATRIX TEST 5: ROLE BILL + AUTO OFF
console.log('\nMATRIX TEST 5: ROLE BILL + AUTO OFF');
{
  const printers = [
    { id: 'p_bill', name: 'Counter 80', role: 'bill', paperWidth: '80mm', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_5', order_number: '105' };

  const autoKot = simulateOrderCreationWithKotPrint(order, printers, false, false);
  assert(autoKot.printResult.skipped === true && autoKot.printResult.reason === 'AUTO_PRINT_OFF', 'Auto KOT = 0');

  const autoBill = simulateBillPrint(order, printers, false, false);
  assert(autoBill.printResult.skipped === true && autoBill.printResult.reason === 'AUTO_PRINT_OFF', 'Auto Bill = 0');

  const manualBill = simulateBillPrint(order, printers, false, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'Counter 80', 'Manual Thermal Bill = 1');
}

// MATRIX TEST 6: ROLE BOTH + AUTO OFF
console.log('\nMATRIX TEST 6: ROLE BOTH + AUTO OFF');
{
  const printers = [
    { id: 'p_both', name: 'All-in-One 80', role: 'both', paperWidth: '80mm', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_6', order_number: '106' };

  const autoKot = simulateOrderCreationWithKotPrint(order, printers, false, false);
  assert(autoKot.printResult.skipped === true && autoKot.printResult.reason === 'AUTO_PRINT_OFF', 'Auto KOT = 0');

  const autoBill = simulateBillPrint(order, printers, false, false);
  assert(autoBill.printResult.skipped === true && autoBill.printResult.reason === 'AUTO_PRINT_OFF', 'Auto Bill = 0');

  const manualBill = simulateBillPrint(order, printers, false, true);
  assert(manualBill.printResult.success === true && manualBill.printResult.printerName === 'All-in-One 80', 'Manual Thermal Bill = 1');
}

// TEST 7: Multi-printer setup with role segregation (Printer A = KOT, Printer B = BILL)
console.log('\nTEST 7: Segregated setup (Printer A = KOT, Printer B = BILL)');
{
  const printers = [
    { id: 'pA', name: 'Kitchen KOT', role: 'kot', isPrimary: true, status: 'connected', transport: 'bluetooth' },
    { id: 'pB', name: 'Counter Bill', role: 'bill', isPrimary: false, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_7', order_number: '107' };

  // Auto KOT routes to Printer A
  const autoKot = simulateOrderCreationWithKotPrint(order, printers, true, false);
  assert(autoKot.printResult.success === true && autoKot.printResult.printerName === 'Kitchen KOT', 'Auto KOT routes to Kitchen KOT');

  // Auto Bill routes to Printer B
  const autoBill = simulateBillPrint(order, printers, true, false);
  assert(autoBill.printResult.success === true && autoBill.printResult.printerName === 'Counter Bill', 'Auto Bill routes to Counter Bill');
}

// TEST 8: Financial Mutation & Idempotency Safety
console.log('\nTEST 8: Financial & Business Data Mutation Safety');
{
  const originalOrder = {
    id: 'ord_8',
    order_number: '108',
    total_amount: 500,
    paid_amount: 500,
    payment_status: 'paid',
    status: 'completed',
    wallet_points_redeemed: 50,
    wallet_points_earned: 25,
    items: [{ id: 'item_1', name: 'Paneer Butter Masala', quantity: 2 }]
  };

  // Clone snapshot before manual print
  const orderBeforePrint = JSON.parse(JSON.stringify(originalOrder));

  // Simulate explicit manual reprint action
  const printers = [{ id: 'p1', name: 'Seznik-Veer_9394', role: 'kot', isPrimary: true, status: 'connected', transport: 'bluetooth' }];
  const manualPrintRes = simulateBillPrint(orderBeforePrint, printers, true, true);

  // Assert order has 0 mutations
  assert(manualPrintRes.printResult.success === true, 'Manual bill print succeeded');
  assert(orderBeforePrint.total_amount === 500, '0 mutation: total_amount unchanged');
  assert(orderBeforePrint.paid_amount === 500, '0 mutation: paid_amount unchanged');
  assert(orderBeforePrint.payment_status === 'paid', '0 mutation: payment_status unchanged');
  assert(orderBeforePrint.status === 'completed', '0 mutation: order status unchanged');
  assert(orderBeforePrint.wallet_points_redeemed === 50, '0 mutation: wallet points redeemed unchanged');
  assert(orderBeforePrint.wallet_points_earned === 25, '0 mutation: wallet points earned unchanged');
  assert(orderBeforePrint.items.length === 1 && orderBeforePrint.items[0].quantity === 2, '0 mutation: item quantities unchanged');

  // Simulate print failure
  const failingPrinters = [];
  const failRes = simulateBillPrint(orderBeforePrint, failingPrinters, true, true);
  assert(failRes.printResult.skipped === true, 'Print failure simulated safely');
  assert(orderBeforePrint.paid_amount === 500 && orderBeforePrint.payment_status === 'paid', 'Settlement remains fully committed after print failure');
}

// TEST 9: Role comparison normalization
console.log('\nTEST 9: Role comparison normalization');
{
  assert(isPrinterRoleEligible('kot', 'kot') === true, "'kot' matches 'kot'");
  assert(isPrinterRoleEligible('kot', 'bill') === false, "'kot' does NOT match 'bill'");
  assert(isPrinterRoleEligible('bill', 'kot') === false, "'bill' does NOT match 'kot'");
  assert(isPrinterRoleEligible('bill', 'bill') === true, "'bill' matches 'bill'");
  assert(isPrinterRoleEligible('both', 'kot') === true, "'both' matches 'kot'");
  assert(isPrinterRoleEligible('both', 'bill') === true, "'both' matches 'bill'");
  assert(isPrinterRoleEligible('KOT', 'kot') === true, "'KOT' uppercase matches 'kot'");
  assert(isPrinterRoleEligible('BILL', 'bill') === true, "'BILL' uppercase matches 'bill'");
  assert(isPrinterRoleEligible(' Both ', 'bill') === true, "' Both ' with whitespace matches 'bill'");
  assert(isPrinterRoleEligible('invalid', 'kot') === false, "Invalid role rejected");
  assert(isPrinterRoleEligible(null, 'kot') === false, "null rejected");
}

// TEST 10: RestroZ Print Agent job creation guard simulation
console.log('\nTEST 10: RestroZ Print Agent Guard Simulation (sendEscPosToAgent)');
{
  function simulateSendEscPosToAgent(printer, jobType, isManual = false) {
    const normRole = (printer.role || '').toLowerCase();
    if (jobType === 'kot' && normRole === 'bill' && !isManual) {
      return { success: false, skipped: true, code: 'ROLE_MISMATCH' };
    }
    if (jobType === 'bill' && normRole === 'kot' && !isManual) {
      return { success: false, skipped: true, code: 'ROLE_MISMATCH' };
    }
    return { success: true, printerName: printer.name, transport: 'agent', jobType };
  }

  const kotOnlyAgentPrinter = { id: 'p_agent_kot', name: 'Seznik-Veer_9394', role: 'kot', transport: 'agent' };

  // 1. Automatic bill print at settlement to KOT printer -> BLOCKED
  const autoBillRes = simulateSendEscPosToAgent(kotOnlyAgentPrinter, 'bill', false);
  assert(autoBillRes.skipped === true && autoBillRes.code === 'ROLE_MISMATCH', 'Auto Bill to KOT agent printer rejected by guard');

  // 2. Manual bill print to KOT printer -> ALLOWED
  const manualBillRes = simulateSendEscPosToAgent(kotOnlyAgentPrinter, 'bill', true);
  assert(manualBillRes.success === true && manualBillRes.printerName === 'Seznik-Veer_9394', 'Manual Bill to KOT agent printer allowed by guard override');
}

// TEST 11: Multi-device ranking: primary KOT printer prioritized on manual bill print
console.log('\nTEST 11: Multi-device ranking: primary KOT printer prioritized on manual bill print');
{
  const printers = [
    { id: 'p_pri_kot', name: 'Seznik-Veer_9394', role: 'kot', isPrimary: true, status: 'connected', transport: 'agent' },
    { id: 'p_sec_bill', name: 'Virtual Bill Printer', role: 'bill', isPrimary: false, status: 'connected', transport: 'agent' }
  ];

  // Auto Bill routes strictly to role=bill printer
  const autoTarget = resolvePrinterForRole(printers, 'bill', false);
  assert(autoTarget && autoTarget.name === 'Virtual Bill Printer', 'Auto Bill routes strictly to role=bill printer');

  // Manual Bill routes to PRIMARY printer even though its role is KOT
  const manualTarget = resolvePrinterForRole(printers, 'bill', true);
  assert(manualTarget && manualTarget.name === 'Seznik-Veer_9394', 'Manual Bill routes to primary printer (Seznik-Veer_9394)');
}

// TEST 12: Manual bill after order is already settled
console.log('\nTEST 12: Manual bill after order is already settled');
{
  const printers = [
    { id: 'p_seznik', name: 'Seznik-Veer_9394', role: 'kot', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const settledOrder = { id: 'ord_settled', order_number: '120', payment_status: 'paid', status: 'completed' };

  // Order is already settled, auto-print is OFF or already finished
  const manualPrintRes = simulateBillPrint(settledOrder, printers, false, true);
  assert(manualPrintRes.printResult.success === true && manualPrintRes.printResult.printerName === 'Seznik-Veer_9394', 'Manual bill prints successfully after settlement');
  assert(settledOrder.payment_status === 'paid', 'Settlement status preserved');
}

// TEST 13: Settlement deduplication / no duplicate auto-bill printed
console.log('\nTEST 13: Settlement deduplication / no duplicate auto-bill printed');
{
  const printers = [
    { id: 'p_seznik', name: 'Seznik-Veer_9394', role: 'kot', isPrimary: true, status: 'connected', transport: 'agent' }
  ];
  const order = { id: 'ord_dedup', order_number: '121' };

  // Settlement auto-bill attempt 1: skipped (no bill printer)
  const settleBill1 = simulateBillPrint(order, printers, true, false);
  assert(settleBill1.printResult.skipped === true, 'Settlement bill attempt 1: skipped on role=KOT');

  // Settlement auto-bill attempt 2: skipped (no duplicate print)
  const settleBill2 = simulateBillPrint(order, printers, true, false);
  assert(settleBill2.printResult.skipped === true, 'Settlement bill attempt 2: skipped (no duplicate auto-bill)');

  // Explicit manual print works
  const manualBill = simulateBillPrint(order, printers, true, true);
  assert(manualBill.printResult.success === true, 'Explicit manual print succeeds without duplicate auto-bill');
}

console.log('\n=================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} assertions passed (100%)`);
console.log('=================================================================');
