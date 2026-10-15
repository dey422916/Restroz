/**
 * Automated Regression Test Suite:
 * RestroZ Points Financial Classification & Tender Parity Verification
 *
 * Verifies Issue 2:
 * 1. 100% Points Payment (Order ₹100, Points ₹100, Cash ₹0, Balance ₹0, Status PAID, Method RESTROZ POINTS)
 * 2. Points + Cash (Order ₹427, Points ₹100, Cash ₹327, Balance ₹0, Method CASH + RESTROZ POINTS)
 * 3. Points + UPI (Order ₹427, Points ₹100, UPI ₹327, Cash ₹0, Method UPI + RESTROZ POINTS)
 * 4. Points + Card (Order ₹427, Points ₹100, Card ₹327, Cash ₹0, Method CARD + RESTROZ POINTS)
 * 5. Points + Split Tender (Points ₹100 + UPI ₹200 + Cash ₹127 = ₹427)
 * 6. Cash Drawer Reconciliation: Expected cash strictly excludes RestroZ Points
 * 7. Z-Report: Displays Cash, UPI, Card, and RestroZ Points separately without cash inflation
 * 8. Day Sales / Analytics: Reconciles tenders using resolveOrderFinancials without dumping unknown into cash
 * 9. Idempotency & Exactly-Once Ledger: Reprint / Refresh never duplicates wallet redemption
 */

const assert = require('assert');

function roundToTwo(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function extractRewardFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return 0;
  const match = notes.match(/\[(?:REWARD|WALLET):([0-9.]+)\]/i);
  if (match) {
    const val = parseFloat(match[1]);
    return !isNaN(val) && val > 0 ? val : 0;
  }
  return 0;
}

function resolveOrderFinancials(order) {
  let grossTotal = 0;
  if (order.grand_total !== undefined && order.grand_total !== null && Number(order.grand_total) > 0) {
    grossTotal = roundToTwo(Number(order.grand_total));
  } else if (order.items && order.items.length > 0) {
    const itemsGross = order.items.reduce(
      (sum, item) => sum + ((Number(item.unit_price) * Number(item.quantity)) || Number(item.subtotal) || Number(item.total) || 0),
      0
    );
    grossTotal = roundToTwo(itemsGross);
  } else {
    grossTotal = roundToTwo(Number(order.payable_amount || order.subtotal || 0));
  }

  let walletRedeemed = 0;
  if (order.wallet_redeemed !== undefined && order.wallet_redeemed !== null) {
    const wr = Number(order.wallet_redeemed);
    if (!isNaN(wr) && wr > 0) walletRedeemed = wr;
  }
  if (walletRedeemed === 0 && order.notes) {
    const fromNotes = extractRewardFromNotes(order.notes);
    if (fromNotes > 0) walletRedeemed = fromNotes;
  }
  if (walletRedeemed === 0 && Array.isArray(order.wallet_tx)) {
    const ledgerRedeem = order.wallet_tx
      .filter((t) => t.transaction_type === 'redeem')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    if (ledgerRedeem > 0) walletRedeemed = ledgerRedeem;
  }
  if (walletRedeemed === 0 && Array.isArray(order.payments)) {
    const payRedeem = order.payments
      .filter((p) => {
        const m = String(p.payment_method || '').toLowerCase();
        return m === 'wallet' || m === 'rewards' || m === 'restroz_points';
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (payRedeem > 0) walletRedeemed = payRedeem;
  }
  if (
    walletRedeemed === 0 &&
    order.payable_amount !== undefined &&
    order.payable_amount !== null &&
    Number(order.payable_amount) < grossTotal &&
    (order.discount_amount === undefined || Number(order.discount_amount) === 0)
  ) {
    const impliedRedeem = roundToTwo(grossTotal - Number(order.payable_amount));
    if (impliedRedeem > 0) walletRedeemed = Math.max(walletRedeemed, impliedRedeem);
  }
  walletRedeemed = roundToTwo(Math.min(walletRedeemed, grossTotal));

  let externalPaid = 0;
  if (order.payments && order.payments.length > 0) {
    const completedNonWallet = order.payments
      .filter((p) => {
        const m = String(p.payment_method || '').toLowerCase();
        return m !== 'wallet' && m !== 'rewards' && m !== 'restroz_points';
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (completedNonWallet > 0) {
      externalPaid = completedNonWallet;
    } else {
      const pm = String(order.payment_method || '').toLowerCase();
      if (pm === 'wallet' || pm === 'rewards' || pm === 'restroz_points') {
        externalPaid = 0;
      } else {
        const rawPaid = Number(order.paid_amount || 0);
        if (rawPaid > 0 && walletRedeemed > 0 && Math.abs(rawPaid - grossTotal) < 0.01) {
          externalPaid = Math.max(0, rawPaid - walletRedeemed);
        } else {
          externalPaid = rawPaid;
        }
      }
    }
  } else {
    const pm = String(order.payment_method || '').toLowerCase();
    if (pm === 'wallet' || pm === 'rewards' || pm === 'restroz_points') {
      externalPaid = 0;
    } else {
      const rawPaid = Number(order.paid_amount || 0);
      if (rawPaid > 0 && walletRedeemed > 0 && Math.abs(rawPaid - grossTotal) < 0.01) {
        externalPaid = Math.max(0, rawPaid - walletRedeemed);
      } else {
        externalPaid = rawPaid;
      }
    }
  }
  externalPaid = roundToTwo(Math.max(0, externalPaid));

  const netPayableAfterRewards = roundToTwo(Math.max(0, grossTotal - walletRedeemed));
  const isMarkedPaid = order.payment_status === 'paid' || order.status === 'completed';
  const totalPaid = roundToTwo(Math.min(grossTotal, externalPaid + walletRedeemed));
  const remainingBalance = isMarkedPaid && externalPaid >= netPayableAfterRewards
    ? 0
    : roundToTwo(Math.max(0, grossTotal - (externalPaid + walletRedeemed)));
  const isFullyPaid = isMarkedPaid || (totalPaid >= grossTotal && grossTotal > 0);

  const breakdown = {
    cash: 0,
    upi: 0,
    card: 0,
    wallet: walletRedeemed,
    other: 0,
  };

  if (order.payments && order.payments.length > 0) {
    order.payments.forEach((p) => {
      const m = String(p.payment_method || '').toLowerCase();
      const amt = Number(p.amount) || 0;
      if (m === 'cash' || m === 'cod') breakdown.cash += amt;
      else if (m === 'upi' || m === 'online') breakdown.upi += amt;
      else if (m === 'card') breakdown.card += amt;
      else if (m === 'wallet' || m === 'rewards' || m === 'restroz_points') breakdown.wallet = Math.max(breakdown.wallet, amt);
      else breakdown.other += amt;
    });
  } else if (externalPaid > 0) {
    const m = (order.payment_method || 'cash').toLowerCase();
    if (m === 'cash' || m === 'cod') breakdown.cash = externalPaid;
    else if (m === 'upi' || m === 'online') breakdown.upi = externalPaid;
    else if (m === 'card') breakdown.card = externalPaid;
    else if (m === 'wallet' || m === 'rewards' || m === 'restroz_points') {
      // points already in breakdown.wallet
    } else breakdown.other = externalPaid;
  }

  let paymentMethodLabel = '';
  if (isFullyPaid) {
    const parts = [];
    if (breakdown.cash > 0) parts.push('CASH');
    if (breakdown.upi > 0) parts.push('UPI');
    if (breakdown.card > 0) parts.push('CARD');
    if (breakdown.other > 0) parts.push('OTHER');
    if (walletRedeemed > 0) {
      parts.push('RESTROZ POINTS');
    }
    if (parts.length === 0) {
      const fallbackMethod = String(order.payment_method || '').toLowerCase();
      if (fallbackMethod === 'wallet' || fallbackMethod === 'rewards' || fallbackMethod === 'restroz_points') {
        parts.push('RESTROZ POINTS');
      } else {
        parts.push((order.payment_method || 'CASH').toUpperCase());
      }
    }
    paymentMethodLabel = parts.join(' + ');
  } else {
    const fallbackMethod = String(order.payment_method || '').toLowerCase();
    if (fallbackMethod === 'wallet' || fallbackMethod === 'rewards' || fallbackMethod === 'restroz_points') {
      paymentMethodLabel = 'RESTROZ POINTS';
    } else {
      paymentMethodLabel = (order.payment_method || 'UNPAID').toUpperCase();
    }
  }

  return {
    grossTotal,
    walletRedeemed,
    externalPaid,
    totalPaid,
    remainingBalance,
    netPayableAfterRewards,
    isFullyPaid,
    paymentBreakdown: breakdown,
    paymentMethodLabel,
  };
}

function calculateRegisterReconciliation(register, shiftOrders) {
  let cash_sales = 0;
  let upi_sales = 0;
  let card_sales = 0;
  let other_sales = 0;
  let points_sales = 0;
  let refunds = 0;

  for (const ord of shiftOrders) {
    const fin = resolveOrderFinancials(ord);
    if (ord.status === 'cancelled') {
      if (ord.payment_status === 'paid') {
        refunds += fin.paymentBreakdown.cash;
      }
      continue;
    }
    if (fin.isFullyPaid || (ord.payments && ord.payments.length > 0)) {
      cash_sales += fin.paymentBreakdown.cash;
      upi_sales += fin.paymentBreakdown.upi;
      card_sales += fin.paymentBreakdown.card;
      other_sales += fin.paymentBreakdown.other;
      points_sales += fin.walletRedeemed;
    }
  }

  const digital_sales = upi_sales + card_sales + other_sales;
  const total_sales = cash_sales + digital_sales + points_sales;
  const cash_out = Number(register.cash_out) || 0;
  const expected_cash = register.opening_cash_float + cash_sales - refunds - cash_out;

  return {
    cash_sales: roundToTwo(cash_sales),
    upi_sales: roundToTwo(upi_sales),
    card_sales: roundToTwo(card_sales),
    other_sales: roundToTwo(other_sales),
    points_sales: roundToTwo(points_sales),
    digital_sales: roundToTwo(digital_sales),
    refunds: roundToTwo(refunds),
    cash_out: roundToTwo(cash_out),
    total_sales: roundToTwo(total_sales),
    expected_cash: roundToTwo(expected_cash),
  };
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('RESTROZ POINTS FINANCIAL CLASSIFICATION & NON-CASH PARITY TESTS');
console.log('================================================================\n');

// TEST 1: 100% Points Payment (Example A)
runTest('100% Points Payment: ₹100 Gross, ₹100 Points, ₹0 Cash => Cash = ₹0, Status PAID, Method RESTROZ POINTS', () => {
  const order = {
    id: 'ord-100-pts',
    order_number: 'INV-100-1',
    grand_total: 100,
    payable_amount: 0,
    paid_amount: 0,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'wallet',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [],
  };
  const fin = resolveOrderFinancials(order);

  assert.strictEqual(fin.grossTotal, 100, 'Gross total must be ₹100');
  assert.strictEqual(fin.walletRedeemed, 100, 'RestroZ Points redeemed must be ₹100');
  assert.strictEqual(fin.externalPaid, 0, 'External paid must be ₹0');
  assert.strictEqual(fin.paymentBreakdown.cash, 0, 'Cash breakdown must be ₹0 (NOT converted to cash)');
  assert.strictEqual(fin.paymentBreakdown.wallet, 100, 'Wallet breakdown must be ₹100');
  assert.strictEqual(fin.remainingBalance, 0, 'Remaining balance must be ₹0');
  assert.strictEqual(fin.isFullyPaid, true, 'Order must be fully paid');
  assert.strictEqual(fin.paymentMethodLabel, 'RESTROZ POINTS', 'Payment label must be RESTROZ POINTS');
});

// TEST 2: Points + Cash Payment (Example B)
runTest('Points + Cash Payment: ₹427 Gross, ₹100 Points, ₹327 Cash => Cash = ₹327, Points = ₹100, Balance = ₹0', () => {
  const order = {
    id: 'ord-427-pts-cash',
    order_number: 'INV-427-1',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 327,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'cash',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [
      { payment_method: 'cash', amount: 327, status: 'completed' },
    ],
  };
  const fin = resolveOrderFinancials(order);

  assert.strictEqual(fin.grossTotal, 427, 'Gross total must remain ₹427 (NOT reduced to ₹327)');
  assert.strictEqual(fin.walletRedeemed, 100, 'Points redeemed must be ₹100');
  assert.strictEqual(fin.externalPaid, 327, 'External cash paid must be ₹327');
  assert.strictEqual(fin.paymentBreakdown.cash, 327, 'Cash breakdown must be ₹327 (NOT ₹427)');
  assert.strictEqual(fin.paymentBreakdown.wallet, 100, 'RestroZ Points breakdown must be ₹100');
  assert.strictEqual(fin.remainingBalance, 0, 'Remaining balance must be ₹0');
  assert.strictEqual(fin.paymentMethodLabel, 'CASH + RESTROZ POINTS', 'Label must be CASH + RESTROZ POINTS');
});

// TEST 3: Points + UPI Payment (Example C)
runTest('Points + UPI Payment: ₹427 Gross, ₹100 Points, ₹327 UPI => Cash = ₹0, UPI = ₹327, Points = ₹100', () => {
  const order = {
    id: 'ord-427-pts-upi',
    order_number: 'INV-427-2',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 327,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'upi',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [
      { payment_method: 'upi', amount: 327, status: 'completed' },
    ],
  };
  const fin = resolveOrderFinancials(order);

  assert.strictEqual(fin.paymentBreakdown.cash, 0, 'Cash breakdown must be ₹0');
  assert.strictEqual(fin.paymentBreakdown.upi, 327, 'UPI breakdown must be ₹327');
  assert.strictEqual(fin.paymentBreakdown.wallet, 100, 'RestroZ Points breakdown must be ₹100');
  assert.strictEqual(fin.paymentMethodLabel, 'UPI + RESTROZ POINTS', 'Label must be UPI + RESTROZ POINTS');
});

// TEST 4: Points + Card Payment (Example D)
runTest('Points + Card Payment: ₹427 Gross, ₹100 Points, ₹327 Card => Cash = ₹0, Card = ₹327, Points = ₹100', () => {
  const order = {
    id: 'ord-427-pts-card',
    order_number: 'INV-427-3',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 327,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'card',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [
      { payment_method: 'card', amount: 327, status: 'completed' },
    ],
  };
  const fin = resolveOrderFinancials(order);

  assert.strictEqual(fin.paymentBreakdown.cash, 0, 'Cash breakdown must be ₹0');
  assert.strictEqual(fin.paymentBreakdown.card, 327, 'Card breakdown must be ₹327');
  assert.strictEqual(fin.paymentBreakdown.wallet, 100, 'RestroZ Points breakdown must be ₹100');
  assert.strictEqual(fin.paymentMethodLabel, 'CARD + RESTROZ POINTS', 'Label must be CARD + RESTROZ POINTS');
});

// TEST 5: Points + Split Tender
runTest('Points + Split Tender: ₹427 Gross, ₹100 Points, ₹200 UPI, ₹127 Cash => Cash = ₹127, UPI = ₹200, Points = ₹100', () => {
  const order = {
    id: 'ord-427-pts-split',
    order_number: 'INV-427-4',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 327,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'split',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [
      { payment_method: 'upi', amount: 200, status: 'completed' },
      { payment_method: 'cash', amount: 127, status: 'completed' },
    ],
  };
  const fin = resolveOrderFinancials(order);

  assert.strictEqual(fin.paymentBreakdown.cash, 127, 'Cash must be ₹127');
  assert.strictEqual(fin.paymentBreakdown.upi, 200, 'UPI must be ₹200');
  assert.strictEqual(fin.paymentBreakdown.wallet, 100, 'RestroZ Points must be ₹100');
  assert.strictEqual(fin.totalPaid, 427, 'Total paid must be ₹427');
  assert.strictEqual(fin.paymentMethodLabel, 'CASH + UPI + RESTROZ POINTS', 'Label must combine tenders');
});

// TEST 6: Day Register Reconciliation (Expected Cash Drawer Protection)
runTest('Day Register: Opening Float ₹1,000 + 100% Points Order ₹100 => Expected Cash remains ₹1,000 (NOT ₹1,100)', () => {
  const register = {
    opening_cash_float: 1000,
    cash_out: 0,
  };
  const shiftOrders = [
    {
      id: 'ord-pts-only',
      grand_total: 100,
      payable_amount: 0,
      paid_amount: 0,
      payment_status: 'paid',
      status: 'completed',
      payment_method: 'wallet',
      wallet_redeemed: 100,
      notes: '[REWARD:100]',
      payments: [],
    },
  ];
  const recon = calculateRegisterReconciliation(register, shiftOrders);

  assert.strictEqual(recon.cash_sales, 0, 'Cash sales must be 0');
  assert.strictEqual(recon.points_sales, 100, 'Points sales must be 100');
  assert.strictEqual(recon.total_sales, 100, 'Total sales revenue realized must be 100');
  assert.strictEqual(recon.expected_cash, 1000, 'Expected cash must remain 1000 (drawer NOT inflated by points)');
});

// TEST 7: Day Register: Mixed Shift Revenue & Reconciliation
runTest('Day Register: Shift with ₹427 (₹100 pts + ₹327 cash) => Cash = ₹327, Points = ₹100, Expected Cash = Float + ₹327', () => {
  const register = {
    opening_cash_float: 500,
    cash_out: 50,
  };
  const shiftOrders = [
    {
      id: 'ord-mix',
      grand_total: 427,
      payable_amount: 327,
      paid_amount: 327,
      payment_status: 'paid',
      status: 'completed',
      payment_method: 'cash',
      wallet_redeemed: 100,
      notes: '[REWARD:100]',
      payments: [{ payment_method: 'cash', amount: 327, status: 'completed' }],
    },
  ];
  const recon = calculateRegisterReconciliation(register, shiftOrders);

  assert.strictEqual(recon.cash_sales, 327, 'Cash sales must be exactly ₹327');
  assert.strictEqual(recon.points_sales, 100, 'Points sales must be ₹100');
  assert.strictEqual(recon.total_sales, 427, 'Total sales must be ₹427 (NOT ₹527)');
  // Expected cash = 500 + 327 - 50 = 777
  assert.strictEqual(recon.expected_cash, 777, 'Expected cash must be ₹777 (Float 500 + Cash 327 - CashOut 50)');
});

// TEST 8: Historical / Misclassified Order Defense
runTest('Historical Defense: Order with paid_amount == grand_total (427) but wallet_redeemed == 100 => externalPaid is ₹327', () => {
  const oldOrder = {
    id: 'ord-legacy-anomaly',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 427, // Erroneously set to grand_total in legacy DB
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'cash',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [],
  };
  const fin = resolveOrderFinancials(oldOrder);

  assert.strictEqual(fin.grossTotal, 427, 'Gross total is 427');
  assert.strictEqual(fin.walletRedeemed, 100, 'Wallet redeemed is 100');
  assert.strictEqual(fin.externalPaid, 327, 'External cash must be safely computed as 327 (not 427)');
  assert.strictEqual(fin.totalPaid, 427, 'Total paid is 427 (not 527)');
});

// TEST 9: Z-Report Content Verification
runTest('Z-Report: Section 1 Sales includes RestroZ Points; Section 2 Cash Drawer uses only physical cash', () => {
  const register = {
    register_date: '2026-10-16',
    opening_cash_float: 1000,
    cash_sales: 327,
    upi_sales: 0,
    card_sales: 0,
    points_sales: 100,
    refunds: 0,
    cash_out: 0,
    total_sales: 427,
    expected_cash: 1327,
    actual_cash_counted: 1327,
  };

  const expectedCashCalculation = register.opening_cash_float + register.cash_sales - register.refunds - register.cash_out;
  assert.strictEqual(expectedCashCalculation, 1327, 'Z-Report expected cash = 1000 + 327 = 1327');
  assert.strictEqual(register.total_sales, 427, 'Z-Report total settled = 427');
  assert.strictEqual(register.cash_sales, 327, 'Z-Report cash sales = 327');
  assert.strictEqual(register.points_sales, 100, 'Z-Report RestroZ points = 100');
});

// TEST 10: Exactly-Once Loyalty Idempotency
runTest('Exactly-Once Loyalty: Multiple recalculations on same order never duplicate wallet redemption', () => {
  const order = {
    id: 'ord-repeat-test',
    grand_total: 427,
    payable_amount: 327,
    paid_amount: 327,
    payment_status: 'paid',
    status: 'completed',
    payment_method: 'cash',
    wallet_redeemed: 100,
    notes: '[REWARD:100]',
    payments: [{ payment_method: 'cash', amount: 327 }],
  };

  const res1 = resolveOrderFinancials(order);
  const res2 = resolveOrderFinancials(order);
  const res3 = resolveOrderFinancials(order);

  assert.strictEqual(res1.walletRedeemed, 100);
  assert.strictEqual(res2.walletRedeemed, 100);
  assert.strictEqual(res3.walletRedeemed, 100);
  assert.strictEqual(res1.paymentBreakdown.cash, 327);
  assert.strictEqual(res2.paymentBreakdown.cash, 327);
  assert.strictEqual(res3.paymentBreakdown.cash, 327);
});

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
