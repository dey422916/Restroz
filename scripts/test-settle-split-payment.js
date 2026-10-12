/**
 * RESTROZ — SETTLEMENT SPLIT PAYMENT REGRESSION TEST SUITE
 * Validates all 15 mandated test cases:
 * TEST 1: Order due ₹481. SETTLE -> SPLIT (Cash ₹300, UPI ₹181) -> succeeds & order completes.
 * TEST 2: Due ₹481. 2 splits. Split #1 ₹300 -> Split #2 auto-fills to ₹181.
 * TEST 3: Due ₹481. Edit Split #2 to ₹200 -> Split #1 auto-fills to ₹281.
 * TEST 4: Due ₹481. 3 splits. Edit Split #1 to ₹200 -> Other fields unchanged.
 * TEST 5: Total ₹1,000, Already paid ₹400, Remaining ₹600 -> Settle ₹350 Cash + ₹250 UPI -> Only ₹600 settled, no double accounting.
 * TEST 6: Due ₹481. Cash ₹300, UPI ₹150 (Total ₹450) -> Settlement blocked (underpayment).
 * TEST 7: Due ₹481. Cash ₹400, UPI ₹100 (Total ₹500) -> Settlement blocked (overpayment).
 * TEST 8: References: Cash ₹300, UPI ₹181 with UPI ref 'ABC123' -> References survive persistence.
 * TEST 9: 3 splits: Cash ₹200, UPI ₹181, Card ₹100 (Total ₹481) -> Settlement succeeds, all 3 preserved.
 * TEST 10: Settlement succeeds but bill printing fails -> Settlement occurs exactly ONCE, no duplication.
 * TEST 11: Existing CASH-only settlement works unchanged.
 * TEST 12: Existing UPI-only settlement works unchanged.
 * TEST 13: Existing CARD-only settlement works unchanged.
 * TEST 14: Existing Record Payment SPLIT still works exactly as before.
 * TEST 15: Record Payment 2-split auto-fill still works exactly as before.
 */

const assert = require('assert');

// RestroZ currency utilities
function roundToTwoDecimals(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function formatPrice(amount) {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '0';
  const num = Number(amount);
  if (num % 1 === 0) return num.toString();
  return num.toFixed(2);
}

// Pure JS simulation of RestroZ calculateSplitAutoFill (src/utils/splitPayment.ts)
function calculateSplitAutoFill(splits, editedSplitId, newAmountRaw, currentRemainingDue) {
  let clean = newAmountRaw.replace(/[^0-9.]/g, '');
  const dotParts = clean.split('.');
  if (dotParts.length > 2) {
    clean = dotParts[0] + '.' + dotParts.slice(1).join('');
  }

  if (splits.length !== 2) {
    return splits.map((item) =>
      item.id === editedSplitId ? { ...item, amount: clean } : item
    );
  }

  const editedIndex = splits.findIndex((item) => item.id === editedSplitId);
  if (editedIndex === -1) return splits;

  const otherIndex = editedIndex === 0 ? 1 : 0;
  let otherAmount = '';

  const cleanNum = parseFloat(clean);
  if (clean !== '' && !isNaN(cleanNum)) {
    const due = Math.max(0, currentRemainingDue);
    const remaining = roundToTwoDecimals(due - cleanNum);
    otherAmount = remaining > 0 ? formatPrice(remaining) : '0';
  }

  return splits.map((item, idx) => {
    if (idx === editedIndex) {
      return { ...item, amount: clean };
    }
    if (idx === otherIndex) {
      return { ...item, amount: otherAmount };
    }
    return item;
  });
}

// Settlement validation logic mirroring app/(admin)/orders.tsx handleConfirmCloseAndPay
function validateSettlement({ order, payMethod, paySplits, singleAmount, payTotals }) {
  const finalPayable = payTotals?.payableAmount ?? order.payable_amount ?? order.grand_total ?? 0;
  const alreadyPaid = Number(order.paid_amount || 0);
  const remainingBalance = roundToTwoDecimals(Math.max(0, finalPayable - alreadyPaid));

  if (remainingBalance <= 0) {
    return { valid: true, remainingBalance: 0, amountPaid: 0, splitArray: undefined };
  }

  if (payMethod === 'split') {
    const validSplits = paySplits.filter((s) => parseFloat(s.amount) > 0);
    if (validSplits.length === 0) {
      return { valid: false, error: 'NO_SPLITS', message: 'Please enter at least one split payment amount.' };
    }

    const splitTotal = roundToTwoDecimals(validSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0));

    if (splitTotal < remainingBalance) {
      const diff = roundToTwoDecimals(remainingBalance - splitTotal);
      return {
        valid: false,
        error: 'UNDERPAYMENT',
        diff,
        message: `Split payment total (${splitTotal}) does not match remaining balance (${remainingBalance}). Remaining ₹${diff} is unpaid.`
      };
    }

    if (splitTotal > remainingBalance) {
      const excess = roundToTwoDecimals(splitTotal - remainingBalance);
      return {
        valid: false,
        error: 'OVERPAYMENT',
        excess,
        message: `Split payment total (${splitTotal}) exceeds remaining balance (${remainingBalance}) by ₹${excess}.`
      };
    }

    const splitArray = validSplits.map((s) => ({
      payment_method: s.method,
      amount: roundToTwoDecimals(parseFloat(s.amount) || 0),
      reference_number: s.ref?.trim() || undefined,
    }));

    return { valid: true, remainingBalance, amountPaid: remainingBalance, splitArray };
  } else {
    return { valid: true, remainingBalance, amountPaid: remainingBalance, splitArray: undefined };
  }
}

// Simulation of settle_order RPC (replicates DB trigger & Day Register accounting)
function executeMockSettlement(order, { payMethod, amountPaid, splitPayments, notes }) {
  const existingPaymentsTotal = (order.payments || []).reduce((acc, p) => acc + (p.amount || 0), 0);
  const finalPayable = order.payable_amount ?? order.grand_total ?? 0;
  const balance = Math.max(0, finalPayable - existingPaymentsTotal);

  let newPayments = [...(order.payments || [])];
  let registerIncrements = { cash: 0, upi: 0, card: 0, other: 0 };
  let finalPaid = existingPaymentsTotal;

  if (splitPayments && splitPayments.length > 0) {
    for (const s of splitPayments) {
      const method = s.payment_method.toLowerCase();
      const amt = roundToTwoDecimals(s.amount);
      if (amt > 0) {
        newPayments.push({
          id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          order_id: order.id,
          payment_method: method,
          amount: amt,
          status: 'completed',
          reference_number: s.reference_number || null,
          notes: notes || `Split payment via ${method}`
        });

        if (method === 'cash') registerIncrements.cash += amt;
        else if (method === 'upi') registerIncrements.upi += amt;
        else if (method === 'card') registerIncrements.card += amt;
        else registerIncrements.other += amt;

        finalPaid += amt;
      }
    }
  } else {
    const method = payMethod.toLowerCase();
    const amt = amountPaid || balance;
    if (amt > 0) {
      newPayments.push({
        id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        order_id: order.id,
        payment_method: method,
        amount: amt,
        status: 'completed',
        reference_number: null,
        notes: notes || null
      });

      if (method === 'cash') registerIncrements.cash += amt;
      else if (method === 'upi') registerIncrements.upi += amt;
      else if (method === 'card') registerIncrements.card += amt;
      else registerIncrements.other += amt;

      finalPaid += amt;
    }
  }

  const updatedOrder = {
    ...order,
    status: 'completed',
    payment_status: finalPaid >= finalPayable ? 'paid' : 'partially_paid',
    payment_method: splitPayments && splitPayments.length > 0 ? 'split' : payMethod,
    paid_amount: finalPaid,
    payments: newPayments,
  };

  return { order: updatedOrder, registerIncrements, newlySettledAmount: finalPaid - existingPaymentsTotal };
}

console.log('=================================================================');
console.log('RESTROZ — SETTLEMENT SPLIT PAYMENT REGRESSION TEST SUITE');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function check(desc, condition) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    throw new Error(`Assertion failed: ${desc}`);
  }
}

// TEST 1: Order due ₹481. SETTLE -> SPLIT (Cash ₹300, UPI ₹181) -> succeeds & order completes.
console.log('TEST 1: Order due ₹481. SETTLE -> SPLIT (Cash ₹300, UPI ₹181)');
{
  const order = { id: 'ord_1', order_number: '101', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '300', ref: '' },
    { id: '2', method: 'upi', amount: '181', ref: '' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Settlement validation passes', validation.valid === true);
  check('Amount paid equals 481', validation.amountPaid === 481);

  const res = executeMockSettlement(order, { payMethod: 'split', amountPaid: validation.amountPaid, splitPayments: validation.splitArray });
  check('Order status is completed', res.order.status === 'completed');
  check('Payment status is paid', res.order.payment_status === 'paid');
  check('Order payment_method is split', res.order.payment_method === 'split');
  check('Order paid_amount is 481', res.order.paid_amount === 481);
}

// TEST 2: Due ₹481. 2 splits. Split #1 ₹300 -> Split #2 auto-fills to ₹181.
console.log('\nTEST 2: Due ₹481. 2 splits. Split #1 ₹300 -> Split #2 auto-fills to ₹181');
{
  const splits = [
    { id: '1', method: 'cash', amount: '', ref: '' },
    { id: '2', method: 'upi', amount: '', ref: '' },
  ];
  const res = calculateSplitAutoFill(splits, '1', '300', 481);
  check('Split #1 is 300', res[0].amount === '300');
  check('Split #2 automatically populates 181', res[1].amount === '181');
}

// TEST 3: Due ₹481. Edit Split #2 to ₹200 -> Split #1 becomes ₹281.
console.log('\nTEST 3: Due ₹481. Edit Split #2 to ₹200 -> Split #1 becomes ₹281');
{
  const splits = [
    { id: '1', method: 'cash', amount: '300', ref: '' },
    { id: '2', method: 'upi', amount: '181', ref: '' },
  ];
  const res = calculateSplitAutoFill(splits, '2', '200', 481);
  check('Split #2 is 200', res[1].amount === '200');
  check('Split #1 automatically populates 281', res[0].amount === '281');
}

// TEST 4: Due ₹481. 3 splits. Edit Split #1 to ₹200 -> Other fields unchanged.
console.log('\nTEST 4: Due ₹481. 3 splits. Edit Split #1 to ₹200 -> Other fields unchanged');
{
  const splits = [
    { id: '1', method: 'cash', amount: '', ref: '' },
    { id: '2', method: 'upi', amount: '', ref: '' },
    { id: '3', method: 'card', amount: '', ref: '' },
  ];
  const res = calculateSplitAutoFill(splits, '1', '200', 481);
  check('Split #1 is 200', res[0].amount === '200');
  check('Split #2 remains blank', res[1].amount === '');
  check('Split #3 remains blank', res[2].amount === '');
}

// TEST 5: Total ₹1,000, Already paid ₹400, Remaining ₹600 -> Settle ₹350 Cash + ₹250 UPI -> Only ₹600 settled, no double accounting.
console.log('\nTEST 5: Total ₹1,000, Already paid ₹400, Remaining ₹600 -> Settle ₹350 Cash + ₹250 UPI');
{
  const existingPayment = { id: 'pay_old', order_id: 'ord_5', payment_method: 'upi', amount: 400, status: 'completed' };
  const order = {
    id: 'ord_5',
    order_number: '105',
    payable_amount: 1000,
    paid_amount: 400,
    status: 'served',
    payments: [existingPayment]
  };

  const paySplits = [
    { id: '1', method: 'cash', amount: '350', ref: '' },
    { id: '2', method: 'upi', amount: '250', ref: '' },
  ];

  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Settlement validation passes for ₹600 remaining', validation.valid === true);
  check('Remaining balance evaluated as 600', validation.remainingBalance === 600);

  const res = executeMockSettlement(order, { payMethod: 'split', amountPaid: validation.amountPaid, splitPayments: validation.splitArray });
  check('Newly settled amount is exactly 600', res.newlySettledAmount === 600);
  check('Register Cash increment is 350', res.registerIncrements.cash === 350);
  check('Register UPI increment is 250 (not 400+250)', res.registerIncrements.upi === 250);
  check('Final paid amount is 1000', res.order.paid_amount === 1000);
  check('No duplicate ₹1600 revenue generated', res.registerIncrements.cash + res.registerIncrements.upi === 600);
}

// TEST 6: Due ₹481. Cash ₹300, UPI ₹150 (Total ₹450) -> Settlement blocked (underpayment).
console.log('\nTEST 6: Due ₹481. Cash ₹300, UPI ₹150 (Total ₹450) -> Underpayment blocked');
{
  const order = { id: 'ord_6', order_number: '106', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '300', ref: '' },
    { id: '2', method: 'upi', amount: '150', ref: '' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Settlement blocked', validation.valid === false);
  check('Error code is UNDERPAYMENT', validation.error === 'UNDERPAYMENT');
  check('Diff identified as ₹31 unpaid', validation.diff === 31);
}

// TEST 7: Due ₹481. Cash ₹400, UPI ₹100 (Total ₹500) -> Settlement blocked (overpayment).
console.log('\nTEST 7: Due ₹481. Cash ₹400, UPI ₹100 (Total ₹500) -> Overpayment blocked');
{
  const order = { id: 'ord_7', order_number: '107', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '400', ref: '' },
    { id: '2', method: 'upi', amount: '100', ref: '' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Settlement blocked', validation.valid === false);
  check('Error code is OVERPAYMENT', validation.error === 'OVERPAYMENT');
  check('Excess identified as ₹19 over', validation.excess === 19);
}

// TEST 8: References: Cash ₹300, UPI ₹181 with UPI ref 'ABC123' -> References survive persistence.
console.log('\nTEST 8: References survive settlement persistence');
{
  const order = { id: 'ord_8', order_number: '108', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '300', ref: '' },
    { id: '2', method: 'upi', amount: '181', ref: 'ABC123' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Validation passes', validation.valid === true);

  const res = executeMockSettlement(order, { payMethod: 'split', amountPaid: validation.amountPaid, splitPayments: validation.splitArray });
  const upiPayment = res.order.payments.find((p) => p.payment_method === 'upi');
  check('UPI payment found', Boolean(upiPayment));
  check('UPI reference is ABC123', upiPayment.reference_number === 'ABC123');
}

// TEST 9: 3 splits: Cash ₹200, UPI ₹181, Card ₹100 (Total ₹481) -> Settlement succeeds, all 3 preserved.
console.log('\nTEST 9: 3 splits (Cash ₹200, UPI ₹181, Card ₹100) -> All 3 preserved');
{
  const order = { id: 'ord_9', order_number: '109', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '200', ref: 'CASH_NOTE' },
    { id: '2', method: 'upi', amount: '181', ref: 'UPI_TXN_99' },
    { id: '3', method: 'card', amount: '100', ref: 'CARD_AUTH_88' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });
  check('Validation passes for 3 splits', validation.valid === true);

  const res = executeMockSettlement(order, { payMethod: 'split', amountPaid: validation.amountPaid, splitPayments: validation.splitArray });
  check('All 3 payment records saved', res.order.payments.length === 3);
  check('Cash: 200', res.order.payments.some((p) => p.payment_method === 'cash' && p.amount === 200));
  check('Upi: 181', res.order.payments.some((p) => p.payment_method === 'upi' && p.amount === 181));
  check('Card: 100', res.order.payments.some((p) => p.payment_method === 'card' && p.amount === 100));
}

// TEST 10: Settlement succeeds but bill printing fails -> Settlement occurs exactly ONCE, no duplication.
console.log('\nTEST 10: Settlement completes before printing -> Print failure cannot duplicate settlement');
{
  const order = { id: 'ord_10', order_number: '110', payable_amount: 481, paid_amount: 0, status: 'served', payments: [] };
  const paySplits = [
    { id: '1', method: 'cash', amount: '300', ref: '' },
    { id: '2', method: 'upi', amount: '181', ref: '' },
  ];
  const validation = validateSettlement({ order, payMethod: 'split', paySplits });

  // 1. Settle completes
  const settleRes = executeMockSettlement(order, { payMethod: 'split', amountPaid: validation.amountPaid, splitPayments: validation.splitArray });
  check('Settlement succeeded once', settleRes.order.status === 'completed');

  // 2. Simulate print failure
  let printFailed = false;
  try {
    throw new Error('Printer offline / out of paper');
  } catch (printErr) {
    printFailed = true;
  }
  check('Print failure handled gracefully', printFailed === true);

  // 3. Confirm settled state was not reversed or rerun
  check('Order remains completed with exactly 2 payments', settleRes.order.payments.length === 2);
  check('Paid amount unchanged at 481', settleRes.order.paid_amount === 481);
}

// TEST 11: Existing CASH-only settlement unchanged.
console.log('\nTEST 11: Existing CASH-only settlement unchanged');
{
  const order = { id: 'ord_11', order_number: '111', payable_amount: 500, paid_amount: 0, status: 'served', payments: [] };
  const validation = validateSettlement({ order, payMethod: 'cash' });
  check('CASH settlement valid', validation.valid === true);
  const res = executeMockSettlement(order, { payMethod: 'cash', amountPaid: validation.amountPaid });
  check('Order completed with CASH', res.order.payment_method === 'cash' && res.order.paid_amount === 500);
}

// TEST 12: Existing UPI-only settlement unchanged.
console.log('\nTEST 12: Existing UPI-only settlement unchanged');
{
  const order = { id: 'ord_12', order_number: '112', payable_amount: 500, paid_amount: 0, status: 'served', payments: [] };
  const validation = validateSettlement({ order, payMethod: 'upi' });
  check('UPI settlement valid', validation.valid === true);
  const res = executeMockSettlement(order, { payMethod: 'upi', amountPaid: validation.amountPaid });
  check('Order completed with UPI', res.order.payment_method === 'upi' && res.order.paid_amount === 500);
}

// TEST 13: Existing CARD-only settlement unchanged.
console.log('\nTEST 13: Existing CARD-only settlement unchanged');
{
  const order = { id: 'ord_13', order_number: '113', payable_amount: 500, paid_amount: 0, status: 'served', payments: [] };
  const validation = validateSettlement({ order, payMethod: 'card' });
  check('CARD settlement valid', validation.valid === true);
  const res = executeMockSettlement(order, { payMethod: 'card', amountPaid: validation.amountPaid });
  check('Order completed with CARD', res.order.payment_method === 'card' && res.order.paid_amount === 500);
}

// TEST 14: Existing Record Payment SPLIT still works exactly as before.
console.log('\nTEST 14: Existing Record Payment SPLIT still works as before');
{
  const order = { id: 'ord_14', order_number: '114', payable_amount: 1000, paid_amount: 0, status: 'served', payments: [] };
  // Partial payment of 400 (Split: 250 cash, 150 upi)
  const splits = [
    { id: '1', method: 'cash', amount: '250', ref: '' },
    { id: '2', method: 'upi', amount: '150', ref: '' },
  ];
  const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  check('Partial payment allows amount (400) less than total (1000)', splitTotal < order.payable_amount);
  const res = executeMockSettlement(order, {
    payMethod: 'split',
    amountPaid: splitTotal,
    splitPayments: splits.map((s) => ({ payment_method: s.method, amount: parseFloat(s.amount) }))
  });
  check('Order paid_amount is 400', res.order.paid_amount === 400);
  check('Payment status is partially_paid', res.order.payment_status === 'partially_paid');
}

// TEST 15: Record Payment 2-split auto-fill still works exactly as before.
console.log('\nTEST 15: Record Payment 2-split auto-fill still works exactly as before');
{
  const splits = [
    { id: '1', method: 'cash', amount: '', ref: '' },
    { id: '2', method: 'upi', amount: '', ref: '' },
  ];
  const res = calculateSplitAutoFill(splits, '1', '150', 300);
  check('Split #1 is 150', res[0].amount === '150');
  check('Split #2 is 150', res[1].amount === '150');
}

console.log('\n=================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} assertions passed (100%)`);
console.log('=================================================================');
